import crypto from "node:crypto";
import { db } from "../data/mock-db.js";
import { hasDatabaseUrl, query } from "../db/client.js";
import { hashPassword } from "../lib/security.js";
import { listRolePolicies } from "../middleware/permissions.js";

function publicAccount(user) {
  return {
    id: user.id,
    account: user.account,
    role: user.role,
    status: user.status,
    note: user.note || "",
    supplierCode: user.supplierCode || null,
    lastLoginAt: user.lastLoginAt || null,
    failedLoginCount: user.failedLoginCount || 0,
    lockedUntil: user.lockedUntil || null,
    hasPasswordHash: Boolean(user.passwordHash),
    permissions: listRolePolicies()[user.role] || null
  };
}

function publicAccountFromRow(row) {
  return publicAccount({
    id: row.id,
    account: row.account,
    role: row.role,
    status: row.status,
    note: row.note,
    supplierCode: row.supplier_code,
    lastLoginAt: row.last_login_at,
    failedLoginCount: row.failed_login_count,
    lockedUntil: row.locked_until,
    passwordHash: row.password_hash
  });
}

async function assertUniqueAccount(account, ignoreId = "") {
  const normalized = String(account || "").trim().toLowerCase();
  if (!normalized) {
    const error = new Error("ACCOUNT_REQUIRED");
    error.status = 400;
    throw error;
  }
  const exists = hasDatabaseUrl()
    ? (await query("select id from users where lower(account) = $1 and id <> $2 limit 1", [normalized, ignoreId || ""])).rowCount > 0
    : db.users.some(item => item.id !== ignoreId && item.account.toLowerCase() === normalized);
  if (exists) {
    const error = new Error("ACCOUNT_EXISTS");
    error.status = 409;
    throw error;
  }
}

function assertRole(role) {
  if (!["owner", "admin", "service", "supplier", "sales"].includes(role)) {
    const error = new Error("ROLE_INVALID");
    error.status = 400;
    throw error;
  }
}

function assertPassword(password) {
  if (String(password || "").length < 8) {
    const error = new Error("PASSWORD_TOO_SHORT");
    error.status = 400;
    throw error;
  }
}

export async function listAccounts() {
  if (hasDatabaseUrl()) {
    const result = await query(`
      select id, account, password_hash, role, status, note, supplier_code, last_login_at, failed_login_count, locked_until
      from users
      order by
        case role when 'owner' then 1 when 'admin' then 2 when 'service' then 3 when 'sales' then 4 when 'supplier' then 5 else 9 end,
        account
    `);
    return {
      accounts: result.rows.map(publicAccountFromRow),
      roles: listRolePolicies()
    };
  }

  return {
    accounts: db.users.map(publicAccount),
    roles: listRolePolicies()
  };
}

export async function createAccount(payload = {}) {
  await assertUniqueAccount(payload.account);
  assertRole(payload.role || "service");
  assertPassword(payload.password);

  const user = {
    id: crypto.randomUUID(),
    account: String(payload.account).trim(),
    passwordHash: hashPassword(payload.password),
    role: payload.role || "service",
    status: payload.status || "active",
    note: String(payload.note || "").trim(),
    supplierCode: payload.supplierCode || null,
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date().toISOString()
  };

  if (hasDatabaseUrl()) {
    const result = await query(`
      insert into users (id, account, password_hash, role, status, note, supplier_code)
      values ($1, $2, $3, $4, $5, $6, $7)
      returning id, account, password_hash, role, status, note, supplier_code, last_login_at, failed_login_count, locked_until
    `, [user.id, user.account, user.passwordHash, user.role, user.status, user.note, user.supplierCode]);
    return publicAccountFromRow(result.rows[0]);
  }

  db.users.push(user);
  return publicAccount(user);
}

export async function updateAccount(id, payload = {}, actor) {
  const user = hasDatabaseUrl()
    ? (await query("select * from users where id = $1", [id])).rows[0]
    : db.users.find(item => item.id === id);
  if (!user) {
    const error = new Error("ACCOUNT_NOT_FOUND");
    error.status = 404;
    throw error;
  }

  if (user.role === "owner" && actor?.id !== user.id && payload.status && payload.status !== "active") {
    const error = new Error("OWNER_CANNOT_BE_DISABLED_BY_OTHER_ACCOUNT");
    error.status = 403;
    throw error;
  }

  if (hasDatabaseUrl()) {
    if (payload.account) await assertUniqueAccount(payload.account, id);
    if (payload.role) assertRole(payload.role);
    if (payload.password) assertPassword(payload.password);

    const next = {
      account: payload.account ? String(payload.account).trim() : user.account,
      role: payload.role || user.role,
      status: payload.status || user.status,
      note: payload.note !== undefined ? String(payload.note || "").trim() : user.note,
      supplierCode: payload.supplierCode !== undefined ? payload.supplierCode || null : user.supplier_code,
      passwordHash: payload.password ? hashPassword(payload.password) : user.password_hash,
      failedLoginCount: payload.password || payload.unlock === true ? 0 : user.failed_login_count,
      lockedUntil: payload.password || payload.unlock === true ? null : user.locked_until
    };

    const result = await query(`
      update users
      set account = $2,
          password_hash = $3,
          role = $4,
          status = $5,
          note = $6,
          supplier_code = $7,
          failed_login_count = $8,
          locked_until = $9,
          updated_at = now()
      where id = $1
      returning id, account, password_hash, role, status, note, supplier_code, last_login_at, failed_login_count, locked_until
    `, [id, next.account, next.passwordHash, next.role, next.status, next.note, next.supplierCode, next.failedLoginCount, next.lockedUntil]);
    return publicAccountFromRow(result.rows[0]);
  }

  if (payload.account) {
    await assertUniqueAccount(payload.account, id);
    user.account = String(payload.account).trim();
  }
  if (payload.role) {
    assertRole(payload.role);
    user.role = payload.role;
  }
  if (payload.status) user.status = payload.status;
  if (payload.note !== undefined) user.note = String(payload.note || "").trim();
  if (payload.supplierCode !== undefined) user.supplierCode = payload.supplierCode || null;
  if (payload.password) {
    assertPassword(payload.password);
    user.passwordHash = hashPassword(payload.password);
    user.failedLoginCount = 0;
    user.lockedUntil = null;
  }
  if (payload.unlock === true) {
    user.failedLoginCount = 0;
    user.lockedUntil = null;
  }

  user.updatedAt = new Date().toISOString();
  return publicAccount(user);
}

export async function deleteAccount(id, actor) {
  const user = hasDatabaseUrl()
    ? (await query("select * from users where id = $1", [id])).rows[0]
    : null;
  const index = hasDatabaseUrl() ? -1 : db.users.findIndex(item => item.id === id);

  if (!user && index === -1) {
    const error = new Error("ACCOUNT_NOT_FOUND");
    error.status = 404;
    throw error;
  }

  const currentUser = user || db.users[index];
  if (actor?.id === currentUser.id) {
    const error = new Error("CANNOT_DELETE_CURRENT_ACCOUNT");
    error.status = 403;
    throw error;
  }

  if (currentUser.role === "owner") {
    const error = new Error("OWNER_ACCOUNT_CANNOT_BE_DELETED");
    error.status = 403;
    throw error;
  }

  if (hasDatabaseUrl()) {
    await query("delete from users where id = $1", [id]);
    return publicAccountFromRow(currentUser);
  }

  const [removed] = db.users.splice(index, 1);
  return publicAccount(removed);
}
