import crypto from "node:crypto";

export function normalizeOrderNo(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";

  if (raw.startsWith("EZ")) {
    const digits = raw.slice(2).replace(/\D/g, "");
    return digits ? `EZ${digits}` : "";
  }

  const digits = raw.replace(/\D/g, "");
  return digits ? `EZ${digits}` : "";
}

export function createOrderNo(date = new Date()) {
  const yymmdd = date.toISOString().slice(2, 10).replace(/-/g, "");
  return `EZ${yymmdd}${crypto.randomInt(1000, 9999)}`;
}
