import crypto from "node:crypto";
import { db } from "../data/mock-db.js";
import { hasDatabaseUrl, query } from "../db/client.js";
import { normalizeOrderNo, createOrderNo } from "../lib/order-number.js";
import { decryptText, encryptText, maskValue } from "../lib/security.js";
import { canRevealOrderSecrets } from "../middleware/permissions.js";

function id(prefix, value) {
  return `${prefix}_${String(value || crypto.randomUUID()).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

function orderId(orderNo) {
  return id("order", normalizeOrderNo(orderNo));
}

function normalizeOrderSecrets(order) {
  if (!order) return null;
  if (order.gameId && !order.gameIdCipher) {
    order.gameIdCipher = encryptText(order.gameId);
    delete order.gameId;
  }
  if (order.account && !order.accountCipher) {
    order.accountCipher = encryptText(order.account);
    delete order.account;
  }
  if (order.password && !order.passwordCipher) {
    order.passwordCipher = encryptText(order.password);
    delete order.password;
  }
  order.encryptionVersion = order.encryptionVersion || "v1";
  return order;
}

function exposeOrder(order, actor) {
  const normalized = normalizeOrderSecrets(order);
  if (!normalized) return null;

  const reveal = canRevealOrderSecrets(actor);
  const gameId = decryptText(normalized.gameIdCipher);
  const account = decryptText(normalized.accountCipher);
  const password = decryptText(normalized.passwordCipher);
  const { gameIdCipher, accountCipher, passwordCipher, ...safeOrder } = normalized;

  return {
    ...safeOrder,
    gameId,
    account,
    password: reveal ? password : maskValue(password),
    sensitiveFieldsEncrypted: Boolean(gameIdCipher || accountCipher || passwordCipher)
  };
}

function exposeDbOrder(row, actor) {
  if (!row) return null;
  const reveal = canRevealOrderSecrets(actor);
  const gameId = decryptText(row.game_id_cipher);
  const account = decryptText(row.account_cipher);
  const password = decryptText(row.password_cipher);
  return {
    orderNo: row.order_no,
    customer: row.customer_email,
    game: row.game,
    project: row.project,
    gameId,
    account,
    password: reveal ? password : maskValue(password),
    status: row.status,
    payment: row.payment_status,
    agent: row.agent || "",
    supplier: row.supplier || "",
    profit: row.profit || "",
    encryptionVersion: row.encryption_version,
    sensitiveFieldsEncrypted: Boolean(row.game_id_cipher || row.account_cipher || row.password_cipher)
  };
}

async function getOrderFromPostgres(orderNo, actor) {
  const normalizedOrderNo = normalizeOrderNo(orderNo);
  const orderResult = await query("select * from orders where order_no = $1", [normalizedOrderNo]);
  const order = orderResult.rows[0];
  if (!order) return null;

  const items = await query(`
    select item_name, server, qty, price, supplier_price, status
    from order_items
    where order_id = $1
    order by created_at, id
  `, [order.id]);
  const dispatch = await query("select * from dispatches where order_id = $1 order by created_at desc limit 1", [order.id]);
  const chat = await query("select * from chat_threads where order_id = $1 order by created_at desc limit 1", [order.id]);
  const uploads = await query("select * from uploads where order_id = $1 or order_no = $2 order by created_at desc", [order.id, normalizedOrderNo]);

  return {
    order: exposeDbOrder(order, actor),
    items: items.rows.map(item => ({
      name: item.item_name,
      server: item.server || "",
      qty: item.qty || "",
      price: item.price || "",
      supplierPrice: item.supplier_price || "",
      status: item.status
    })),
    dispatch: dispatch.rows[0] ? {
      mode: dispatch.rows[0].mode || "",
      service: dispatch.rows[0].service_account || "",
      supplier: dispatch.rows[0].supplier_code || "",
      deadline: dispatch.rows[0].deadline || "",
      lock: dispatch.rows[0].lock_state || ""
    } : null,
    chat: chat.rows[0] ? {
      orderNo: normalizedOrderNo,
      owner: chat.rows[0].owner_account || "",
      customerOnline: chat.rows[0].customer_online,
      unread: chat.rows[0].unread_count,
      messages: []
    } : null,
    uploads: uploads.rows.map(item => ({
      id: item.id,
      orderNo: normalizedOrderNo,
      fileType: item.file_type,
      fileName: item.file_name,
      storageUrl: item.storage_url,
      uploadedBy: item.uploaded_by,
      createdAt: item.created_at
    }))
  };
}

export async function getOrder(orderNo, actor) {
  if (hasDatabaseUrl()) return getOrderFromPostgres(orderNo, actor);

  const normalizedOrderNo = normalizeOrderNo(orderNo);
  const order = db.orders[normalizedOrderNo];
  if (!order) return null;

  return {
    order: exposeOrder(order, actor),
    items: db.orderItems[normalizedOrderNo] || [],
    dispatch: db.dispatches[normalizedOrderNo] || null,
    chat: db.chatThreads[normalizedOrderNo] || null,
    uploads: db.uploads.filter(item => normalizeOrderNo(item.orderNo) === normalizedOrderNo)
  };
}

export async function createOrder(payload = {}) {
  const orderNo = normalizeOrderNo(payload.orderNo) || createOrderNo();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const itemCount = items.length || 1;
  const paid = payload.payment === "paid" || payload.payment === "已付款";
  const quote = payload.payment === "quote" || payload.payment === "人工报价";

  const order = {
    orderNo,
    customer: payload.customer || "",
    game: payload.game || "",
    project: payload.project || `${itemCount} items`,
    gameIdCipher: encryptText(payload.gameId || ""),
    accountCipher: encryptText(payload.account || payload.customer || ""),
    passwordCipher: encryptText(payload.password || ""),
    encryptionVersion: "v1",
    status: paid ? "pending" : (quote ? "quote-review" : "unpaid"),
    payment: paid ? "frontend-paid" : (quote ? "manual-quote" : "unpaid"),
    agent: paid ? "unassigned" : "not-dispatched",
    supplier: "service-review",
    profit: payload.profit || "35%"
  };

  if (hasDatabaseUrl()) {
    const currentOrderId = orderId(orderNo);
    await query(`
      insert into orders (
        id, order_no, customer_email, game, project, game_id_cipher, account_cipher,
        password_cipher, encryption_version, status, payment_status, agent, supplier, profit
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, 'v1', $9, $10, $11, $12, $13)
      on conflict (order_no) do update set
        customer_email = excluded.customer_email,
        game = excluded.game,
        project = excluded.project,
        game_id_cipher = excluded.game_id_cipher,
        account_cipher = excluded.account_cipher,
        password_cipher = excluded.password_cipher,
        status = excluded.status,
        payment_status = excluded.payment_status,
        agent = excluded.agent,
        supplier = excluded.supplier,
        profit = excluded.profit,
        updated_at = now()
    `, [
      currentOrderId,
      orderNo,
      order.customer,
      order.game,
      order.project,
      order.gameIdCipher,
      order.accountCipher,
      order.passwordCipher,
      order.status,
      order.payment,
      order.agent,
      order.supplier,
      order.profit
    ]);

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      await query(`
        insert into order_items (id, order_id, item_name, server, qty, price, supplier_price, status)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (id) do update set
          item_name = excluded.item_name,
          server = excluded.server,
          qty = excluded.qty,
          price = excluded.price,
          supplier_price = excluded.supplier_price,
          status = excluded.status
      `, [
        id("item", `${orderNo}_${index}`),
        currentOrderId,
        item.name || item.itemName || "",
        item.server || "",
        item.qty || "",
        item.price || "",
        item.supplierPrice || "",
        item.status || "pending"
      ]);
    }

    await query(`
      insert into dispatches (id, order_id, mode, service_account, supplier_code, deadline, lock_state)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (id) do update set
        mode = excluded.mode,
        service_account = excluded.service_account,
        supplier_code = excluded.supplier_code,
        deadline = excluded.deadline,
        lock_state = excluded.lock_state,
        updated_at = now()
    `, [
      id("dispatch", orderNo),
      currentOrderId,
      paid ? "service-review" : "waiting-payment",
      paid ? "unassigned" : "not-dispatched",
      "service-review",
      "after-payment",
      "unclaimed"
    ]);

    return getOrder(orderNo, { role: "owner" });
  }

  db.orders[orderNo] = order;
  db.orderItems[orderNo] = items;
  db.dispatches[orderNo] = {
    mode: paid ? "service-review" : "waiting-payment",
    service: paid ? "unassigned" : "not-dispatched",
    supplier: "service-review",
    deadline: paid ? "after-payment" : "after-payment",
    lock: "unclaimed"
  };

  return getOrder(orderNo, { role: "owner" });
}

export async function dispatchOrder(orderNo, payload = {}) {
  const normalizedOrderNo = normalizeOrderNo(orderNo);
  if (hasDatabaseUrl()) {
    const orderResult = await query("select id from orders where order_no = $1", [normalizedOrderNo]);
    const order = orderResult.rows[0];
    if (!order) return null;
    const dispatch = {
      mode: payload.mode || "backend-dispatch",
      service: payload.service || "service01",
      supplier: payload.supplier || "Supplier A",
      deadline: payload.deadline || "50 minutes",
      lock: payload.lock || "dispatched"
    };
    await query(`
      insert into dispatches (id, order_id, mode, service_account, supplier_code, deadline, lock_state)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (id) do update set
        mode = excluded.mode,
        service_account = excluded.service_account,
        supplier_code = excluded.supplier_code,
        deadline = excluded.deadline,
        lock_state = excluded.lock_state,
        updated_at = now()
    `, [id("dispatch", normalizedOrderNo), order.id, dispatch.mode, dispatch.service, dispatch.supplier, dispatch.deadline, dispatch.lock]);
    await query("update orders set agent = $2, supplier = $3, status = 'dispatched', updated_at = now() where id = $1", [
      order.id,
      dispatch.service,
      dispatch.supplier
    ]);
    return getOrder(normalizedOrderNo, { role: "owner" });
  }

  if (!db.orders[normalizedOrderNo]) return null;

  db.dispatches[normalizedOrderNo] = {
    mode: payload.mode || "backend-dispatch",
    service: payload.service || "service01",
    supplier: payload.supplier || "Supplier A",
    deadline: payload.deadline || "50 minutes",
    lock: payload.lock || "dispatched"
  };
  db.orders[normalizedOrderNo].agent = db.dispatches[normalizedOrderNo].service;
  db.orders[normalizedOrderNo].supplier = db.dispatches[normalizedOrderNo].supplier;
  db.orders[normalizedOrderNo].status = "dispatched";

  return getOrder(normalizedOrderNo, { role: "owner" });
}

export async function supplierOrders(actor) {
  if (hasDatabaseUrl()) {
    const result = await query(`
      select o.order_no
      from orders o
      join dispatches d on d.order_id = o.id
      where d.supplier_code = $1
      order by o.created_at desc
    `, [actor.supplierCode]);
    return Promise.all(result.rows.map(row => getOrder(row.order_no, actor)));
  }

  const code = actor.supplierCode;
  return Object.keys(db.orders)
    .filter(orderNo => db.dispatches[orderNo]?.supplier === code)
    .map(orderNo => getOrder(orderNo, actor));
}
