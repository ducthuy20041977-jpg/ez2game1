import crypto from "node:crypto";
import { db } from "../data/mock-db.js";
import { hasDatabaseUrl, query } from "../db/client.js";
import { normalizeOrderNo } from "../lib/order-number.js";

function maskValue(value) {
  return "*".repeat(Math.min(Math.max(String(value).length, 4), 12));
}

export function sanitizeChatText(text) {
  let output = String(text || "");
  output = output.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, match => maskValue(match));
  output = output.replace(/https?:\/\/[^\s]+|www\.[^\s]+/gi, match => maskValue(match));
  output = output.replace(/(^|[^\w])(\+?\d[\d\s().-]{5,}\d)(?=$|[^\w])/g, (_match, prefix, value) => prefix + maskValue(value));
  output = output.replace(/私下交易|私聊|加我|联系我|微信|QQ|whatsapp|telegram|discord|skype|outside payment|private deal|bank transfer|phone|email/gi, match => maskValue(match));
  return output;
}

export function autoTranslate(text) {
  if (/[\u4e00-\u9fff]/.test(text)) return "AI translation: I will check this order and reply as soon as possible.";
  if (String(text).toLowerCase().includes("refund")) return "我需要处理退款问题。";
  if (String(text).toLowerCase().includes("when")) return "请问什么时候完成？";
  return "AI翻译：我会尽快检查并回复。";
}

async function ensureThread(orderNo, actor = {}) {
  const normalizedOrderNo = normalizeOrderNo(orderNo);
  const orderResult = await query("select id from orders where order_no = $1", [normalizedOrderNo]);
  if (!orderResult.rows[0]) return null;
  const orderId = orderResult.rows[0].id;
  let thread = (await query("select * from chat_threads where order_id = $1 order by created_at desc limit 1", [orderId])).rows[0];
  if (!thread) {
    const id = `thread_${normalizedOrderNo.toLowerCase()}`;
    thread = (await query(`
      insert into chat_threads (id, order_id, owner_account, unread_count, customer_online)
      values ($1, $2, $3, 0, false)
      returning *
    `, [id, orderId, actor.account || ""])).rows[0];
  }
  return thread;
}

export async function getMessages(orderNo) {
  if (hasDatabaseUrl()) {
    const thread = await ensureThread(orderNo);
    if (!thread) return [];
    const result = await query(`
      select sender_type, body, translated_body, created_at
      from chat_messages
      where thread_id = $1
      order by created_at, id
    `, [thread.id]);
    return result.rows.map(item => ({
      sender: item.sender_type,
      body: item.body,
      translatedBody: item.translated_body,
      createdAt: item.created_at
    }));
  }
  return db.chatThreads[normalizeOrderNo(orderNo)]?.messages || [];
}

export async function addMessage(orderNo, sender, body) {
  const normalizedOrderNo = normalizeOrderNo(orderNo);
  if (hasDatabaseUrl()) {
    const thread = await ensureThread(normalizedOrderNo);
    if (!thread) {
      const error = new Error("ORDER_NOT_FOUND");
      error.status = 404;
      throw error;
    }
    const cleanBody = sanitizeChatText(body);
    const translatedBody = autoTranslate(cleanBody);
    const message = {
      id: crypto.randomUUID(),
      sender,
      body: cleanBody,
      translatedBody,
      createdAt: new Date().toISOString()
    };
    await query(`
      insert into chat_messages (id, thread_id, sender_type, body, translated_body, created_at)
      values ($1, $2, $3, $4, $5, $6)
    `, [message.id, thread.id, sender, cleanBody, translatedBody, message.createdAt]);
    if (sender === "customer") {
      await query("update chat_threads set unread_count = unread_count + 1, updated_at = now() where id = $1", [thread.id]);
    }
    return message;
  }

  if (!db.chatThreads[normalizedOrderNo]) {
    db.chatThreads[normalizedOrderNo] = { orderNo: normalizedOrderNo, owner: "", customerOnline: false, unread: 0, messages: [] };
  }
  const cleanBody = sanitizeChatText(body);
  const message = {
    sender,
    body: cleanBody,
    translatedBody: autoTranslate(cleanBody),
    createdAt: new Date().toISOString()
  };
  db.chatThreads[normalizedOrderNo].messages.push(message);
  db.chatThreads[normalizedOrderNo].unread = sender === "customer" ? db.chatThreads[normalizedOrderNo].unread + 1 : db.chatThreads[normalizedOrderNo].unread;
  return message;
}

export async function markRead(orderNo, actor) {
  const normalizedOrderNo = normalizeOrderNo(orderNo);
  if (hasDatabaseUrl()) {
    const thread = await ensureThread(normalizedOrderNo, actor);
    if (!thread) return null;
    const owner = thread.owner_account || actor.account;
    const result = await query(`
      update chat_threads
      set unread_count = 0,
          owner_account = $2,
          updated_at = now()
      where id = $1
      returning *
    `, [thread.id, owner]);
    const updated = result.rows[0];
    return {
      orderNo: normalizedOrderNo,
      owner: updated.owner_account,
      customerOnline: updated.customer_online,
      unread: updated.unread_count,
      messages: []
    };
  }

  if (!db.chatThreads[normalizedOrderNo]) return null;
  db.chatThreads[normalizedOrderNo].unread = 0;
  db.chatThreads[normalizedOrderNo].owner = db.chatThreads[normalizedOrderNo].owner || actor.account;
  return db.chatThreads[normalizedOrderNo];
}
