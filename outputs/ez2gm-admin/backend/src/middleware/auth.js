import crypto from "node:crypto";
import { config } from "../config.js";
import { db } from "../data/mock-db.js";
import { hasDatabaseUrl, query } from "../db/client.js";
import {
  createSessionToken,
  hashPassword,
  passwordNeedsUpgrade,
  redactSensitiveMeta,
  tokenDigest,
  verifyLegacyPassword,
  verifyPassword
} from "../lib/security.js";
import { publicRolePolicy } from "./permissions.js";

const sessions = new Map();
const maxFailedLogins = 5;
const lockMs = 10 * 60 * 1000;

function publicActor(user, expiresAt, sessionId = "") {
  return {
    id: user.id,
    account: user.account,
    role: user.role,
    supplierCode: user.supplierCode || null,
    permissions: publicRolePolicy(user.role),
    sessionId,
    expiresAt
  };
}

function userFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    account: row.account,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    note: row.note,
    supplierCode: row.supplier_code,
    lastLoginAt: row.last_login_at,
    failedLoginCount: row.failed_login_count,
    lockedUntil: row.locked_until
  };
}

async function findActiveUser(account) {
  const normalized = String(account || "").trim().toLowerCase();
  if (hasDatabaseUrl()) {
    const result = await query("select * from users where lower(account) = $1 and status = 'active' limit 1", [normalized]);
    return userFromRow(result.rows[0]);
  }
  return db.users.find(item => item.account.toLowerCase() === normalized && item.status === "active");
}

function canAttemptLogin(user) {
  if (!user?.lockedUntil) return true;
  return new Date(user.lockedUntil).getTime() <= Date.now();
}

async function recordFailedLogin(user) {
  if (!user) return;
  user.failedLoginCount = (user.failedLoginCount || 0) + 1;
  if (user.failedLoginCount >= maxFailedLogins) {
    user.lockedUntil = new Date(Date.now() + lockMs).toISOString();
  }
  if (hasDatabaseUrl()) {
    await query("update users set failed_login_count = $2, locked_until = $3, updated_at = now() where id = $1", [
      user.id,
      user.failedLoginCount,
      user.lockedUntil || null
    ]);
  }
}

async function recordSuccessfulLogin(user) {
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date().toISOString();
  if (hasDatabaseUrl()) {
    await query("update users set failed_login_count = 0, locked_until = null, last_login_at = now(), updated_at = now() where id = $1", [user.id]);
  }
}

function passwordMatches(user, password) {
  if (user.passwordHash && verifyPassword(password, user.passwordHash)) {
    if (passwordNeedsUpgrade(user.passwordHash)) user.passwordHash = hashPassword(password);
    return true;
  }

  if (verifyLegacyPassword(password, user.password)) {
    user.passwordHash = hashPassword(password);
    delete user.password;
    return true;
  }

  return false;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(key);
  }
}

export async function login(account, password) {
  cleanupSessions();

  const user = await findActiveUser(account);
  if (!user || !canAttemptLogin(user)) return null;

  if (!passwordMatches(user, password)) {
    await recordFailedLogin(user);
    return null;
  }

  await recordSuccessfulLogin(user);
  const token = createSessionToken();
  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + config.sessionTtlMs;
  const actor = publicActor(user, expiresAt, sessionId);
  sessions.set(tokenDigest(token), {
    ...actor,
    issuedAt: Date.now(),
    lastSeenAt: Date.now()
  });
  return { token, actor };
}

export function logout(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  return sessions.delete(tokenDigest(token));
}

export function authenticate(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const sessionKey = token ? tokenDigest(token) : "";
  const session = sessionKey ? sessions.get(sessionKey) : null;
  if (session && session.expiresAt > Date.now()) {
    session.lastSeenAt = Date.now();
    return session;
  }
  if (sessionKey) sessions.delete(sessionKey);

  const devRole = req.headers["x-role"];
  if (config.allowDevRoleHeader && devRole) {
    const user = db.users.find(item => item.role === devRole && item.status === "active");
    if (user) {
      return {
        ...publicActor(user, Date.now() + config.sessionTtlMs, "dev-bypass"),
        devBypass: true
      };
    }
  }
  return null;
}

export function listSessions() {
  cleanupSessions();
  return Array.from(sessions.values()).map(item => ({
    sessionId: item.sessionId,
    account: item.account,
    role: item.role,
    issuedAt: new Date(item.issuedAt).toISOString(),
    lastSeenAt: new Date(item.lastSeenAt).toISOString(),
    expiresAt: new Date(item.expiresAt).toISOString()
  }));
}

export function audit(actor, action, targetType, targetId, meta = {}) {
  const entry = {
    id: crypto.randomUUID(),
    actor: actor?.account || "anonymous",
    role: actor?.role || "public",
    action,
    targetType,
    targetId,
    meta: redactSensitiveMeta(meta),
    createdAt: new Date().toISOString()
  };
  db.auditLogs.unshift(entry);

  if (hasDatabaseUrl()) {
    query(`
      insert into audit_logs (id, actor, role, action, target_type, target_id, meta, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      entry.id,
      entry.actor,
      entry.role,
      entry.action,
      entry.targetType,
      entry.targetId,
      JSON.stringify(entry.meta || {}),
      entry.createdAt
    ]).catch(() => {});
  }
}
