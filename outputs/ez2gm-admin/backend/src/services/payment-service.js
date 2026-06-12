import crypto from "node:crypto";
import { db } from "../data/mock-db.js";
import { hasDatabaseUrl, query } from "../db/client.js";
import { normalizeOrderNo } from "../lib/order-number.js";

export async function processWebhook(platform, payload) {
  const orderNo = normalizeOrderNo(payload.orderNo);
  if (hasDatabaseUrl()) {
    const eventId = payload.eventId || crypto.randomUUID();
    const duplicate = await query("select id from payment_webhooks where event_id = $1", [eventId]);
    const order = (await query("select * from orders where order_no = $1", [orderNo])).rows[0] || null;
    if (duplicate.rowCount) return { duplicate: true, order };

    const record = {
      id: crypto.randomUUID(),
      eventId,
      platform,
      orderNo,
      amount: payload.amount || "0",
      verifiedAt: new Date().toISOString()
    };
    await query(`
      insert into payment_webhooks (id, order_id, platform, amount, event_id, verified_at)
      values ($1, $2, $3, $4, $5, $6)
    `, [record.id, order?.id || null, platform, record.amount, eventId, record.verifiedAt]);
    if (order) {
      await query("update orders set payment_status = $2, status = $3, updated_at = now() where id = $1", [
        order.id,
        `${platform} paid`,
        "pending"
      ]);
    }
    return { duplicate: false, order, record };
  }

  const order = db.orders[orderNo];
  const eventId = payload.eventId || crypto.randomUUID();
  const duplicate = db.paymentWebhooks.some(item => item.eventId === eventId);
  if (duplicate) return { duplicate: true, order };

  const record = {
    id: crypto.randomUUID(),
    eventId,
    platform,
    orderNo,
    amount: payload.amount || "0",
    verifiedAt: new Date().toISOString()
  };
  db.paymentWebhooks.unshift(record);
  if (order) {
    order.payment = `${platform} 已付款`;
    order.status = "待处理";
  }
  return { duplicate: false, order, record };
}
