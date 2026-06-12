import crypto from "node:crypto";
import { config } from "../config.js";

const passwordAlgorithm = "pbkdf2_sha256";
const cipherVersion = "v1";
const cipherAlgorithm = "aes-256-gcm";

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const iterations = config.passwordIterations;
  const digest = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256");
  return `${passwordAlgorithm}$${iterations}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

export function verifyPassword(password, storedHash = "") {
  const [algorithm, iterationsText, saltText, digestText] = String(storedHash).split("$");
  if (algorithm !== passwordAlgorithm || !iterationsText || !saltText || !digestText) return false;

  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 100000) return false;

  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(digestText, "base64url");
  const actual = crypto.pbkdf2Sync(String(password), salt, iterations, expected.length, "sha256");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function passwordNeedsUpgrade(storedHash = "") {
  const [algorithm, iterationsText] = String(storedHash).split("$");
  return algorithm !== passwordAlgorithm || Number(iterationsText) < config.passwordIterations;
}

function encryptionKey() {
  return crypto.createHash("sha256").update(config.encryptionKey).digest();
}

export function encryptText(value) {
  if (value === undefined || value === null || value === "") return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(cipherAlgorithm, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${cipherVersion}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

export function decryptText(payload) {
  if (!payload) return "";
  const value = String(payload);
  if (!value.startsWith(`${cipherVersion}:`)) return value;

  try {
    const [, ivText, tagText, ciphertextText] = value.split(":");
    if (!ivText || !tagText || !ciphertextText) return "";

    const decipher = crypto.createDecipheriv(cipherAlgorithm, encryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return "[DECRYPTION_FAILED]";
  }
}

export function tokenDigest(token) {
  return crypto.createHmac("sha256", config.sessionSecret).update(String(token)).digest("base64url");
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function maskValue(value = "", visibleTail = 4) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= visibleTail) return "*".repeat(text.length);
  return `${"*".repeat(Math.max(4, text.length - visibleTail))}${text.slice(-visibleTail)}`;
}

export function redactSensitiveMeta(meta = {}) {
  const blocked = new Set(["password", "token", "passwordHash", "accountCipher", "passwordCipher", "gameIdCipher"]);
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [key, blocked.has(key) ? "[REDACTED]" : value])
  );
}

export function verifyLegacyPassword(password, legacyPassword) {
  if (!legacyPassword) return false;
  return timingSafeEqualText(password, legacyPassword);
}
