import crypto from "node:crypto";
import { config } from "../config.js";
import { db } from "../data/mock-db.js";
import { hasDatabaseUrl, query } from "../db/client.js";
import { normalizeOrderNo } from "../lib/order-number.js";

export async function createUploadRecord(payload, actor) {
  const orderNo = normalizeOrderNo(payload.orderNo);
  const record = {
    id: crypto.randomUUID(),
    orderNo,
    fileType: payload.fileType || "delivery-proof",
    fileName: payload.fileName || "proof.png",
    storageUrl: payload.storageUrl || payload.publicUrl || `${config.publicUploadBaseUrl}/${orderNo}/${Date.now()}-${payload.fileName || "proof.png"}`,
    uploadedBy: actor.account,
    createdAt: new Date().toISOString()
  };

  if (hasDatabaseUrl()) {
    const order = (await query("select id from orders where order_no = $1", [orderNo])).rows[0];
    await query(`
      insert into uploads (id, order_id, order_no, file_type, file_name, storage_url, uploaded_by, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [record.id, order?.id || null, orderNo, record.fileType, record.fileName, record.storageUrl, record.uploadedBy, record.createdAt]);
    return record;
  }

  db.uploads.unshift(record);
  return record;
}
