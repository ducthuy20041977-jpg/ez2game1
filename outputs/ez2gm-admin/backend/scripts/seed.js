import crypto from "node:crypto";
import { db } from "../src/data/mock-db.js";
import { closeDatabasePool, query } from "../src/db/client.js";
import { encryptText } from "../src/lib/security.js";
import { normalizeOrderNo } from "../src/lib/order-number.js";

function id(prefix, value) {
  return `${prefix}_${String(value).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || crypto.randomUUID()}`;
}

function orderId(orderNo) {
  return id("order", normalizeOrderNo(orderNo));
}

async function seedUsers() {
  for (const user of db.users) {
    await query(`
      insert into users (id, account, password_hash, role, status, note, supplier_code, last_login_at, failed_login_count, locked_until)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (account) do update set
        password_hash = excluded.password_hash,
        role = excluded.role,
        status = excluded.status,
        note = excluded.note,
        supplier_code = excluded.supplier_code,
        updated_at = now()
    `, [
      user.id,
      user.account,
      user.passwordHash,
      user.role,
      user.status || "active",
      user.note || "",
      user.supplierCode || null,
      user.lastLoginAt || null,
      user.failedLoginCount || 0,
      user.lockedUntil || null
    ]);
  }
}

async function seedOrders() {
  for (const [rawOrderNo, order] of Object.entries(db.orders)) {
    const orderNo = normalizeOrderNo(rawOrderNo);
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
      orderId(orderNo),
      orderNo,
      order.customer || "",
      order.game || "",
      order.project || "",
      order.gameIdCipher || encryptText(order.gameId || ""),
      order.accountCipher || encryptText(order.account || ""),
      order.passwordCipher || encryptText(order.password || ""),
      order.status || "pending",
      order.payment || "unpaid",
      order.agent || "",
      order.supplier || "",
      order.profit || ""
    ]);

    const items = db.orderItems[orderNo] || [];
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
        orderId(orderNo),
        item.name || "",
        item.server || "",
        item.qty || "",
        item.price || "",
        item.supplierPrice || "",
        item.status || "pending"
      ]);
    }

    const dispatch = db.dispatches[orderNo];
    if (dispatch) {
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
        orderId(orderNo),
        dispatch.mode || "",
        dispatch.service || "",
        dispatch.supplier || "",
        dispatch.deadline || "",
        dispatch.lock || ""
      ]);
    }
  }
}

async function seedChats() {
  for (const [rawOrderNo, thread] of Object.entries(db.chatThreads)) {
    const orderNo = normalizeOrderNo(rawOrderNo);
    const threadId = id("thread", orderNo);
    await query(`
      insert into chat_threads (id, order_id, owner_account, unread_count, customer_online)
      values ($1, $2, $3, $4, $5)
      on conflict (id) do update set
        owner_account = excluded.owner_account,
        unread_count = excluded.unread_count,
        customer_online = excluded.customer_online,
        updated_at = now()
    `, [
      threadId,
      orderId(orderNo),
      thread.owner || "",
      thread.unread || 0,
      Boolean(thread.customerOnline)
    ]);

    for (let index = 0; index < (thread.messages || []).length; index += 1) {
      const message = thread.messages[index];
      await query(`
        insert into chat_messages (id, thread_id, sender_type, body, translated_body, created_at)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (id) do update set
          body = excluded.body,
          translated_body = excluded.translated_body
      `, [
        id("message", `${orderNo}_${index}`),
        threadId,
        message.sender || "customer",
        message.body || "",
        message.translatedBody || "",
        message.createdAt || new Date().toISOString()
      ]);
    }
  }
}

async function seedSupplierSettlements() {
  for (const item of db.supplierSettlements) {
    await query(`
      insert into supplier_settlements (id, supplier, supplier_code, completed_count, amount_cny, deduction_cny, payable_cny, status)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (id) do update set
        supplier = excluded.supplier,
        supplier_code = excluded.supplier_code,
        completed_count = excluded.completed_count,
        amount_cny = excluded.amount_cny,
        deduction_cny = excluded.deduction_cny,
        payable_cny = excluded.payable_cny,
        status = excluded.status,
        updated_at = now()
    `, [
      id("settlement", item.supplierCode || item.supplier),
      item.supplier || item.supplierCode,
      item.supplierCode || item.supplier,
      item.count || 0,
      item.amountCny || 0,
      item.deductionCny || 0,
      item.payableCny || 0,
      item.status || "pending"
    ]);
  }
}

async function seedGameProjects() {
  for (const project of db.gameProjects) {
    await query(`
      insert into game_projects (id, game, project, service_type, frontend_price, backend_price, mode, status, image_url, required_fields)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (game, project) do update set
        service_type = excluded.service_type,
        frontend_price = excluded.frontend_price,
        backend_price = excluded.backend_price,
        mode = excluded.mode,
        status = excluded.status,
        image_url = excluded.image_url,
        required_fields = excluded.required_fields,
        updated_at = now()
    `, [
      id("project", `${project.game}_${project.project}`),
      project.game,
      project.project,
      project.serviceType,
      project.frontendPrice || "",
      project.backendPrice || "",
      project.mode || "manual",
      project.status || "draft",
      project.imageUrl || "",
      project.requiredFields || ""
    ]);
  }

  for (const serviceType of db.serviceTypes) {
    await query(`
      insert into service_types (id, name, dispatch, status)
      values ($1, $2, $3, $4)
      on conflict (name) do update set dispatch = excluded.dispatch, status = excluded.status
    `, [
      id("service_type", serviceType.name),
      serviceType.name,
      serviceType.dispatch || "",
      serviceType.status || "active"
    ]);
  }
}

async function seedPricingRules() {
  for (const rule of db.pricingRules) {
    await query(`
      insert into pricing_rules (
        id, game, project, service_type, market_avg_usd, market_low_usd, market_high_usd,
        ez_price_usd, target_gap_pct, daily_limit_pct, permission, source_count
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      on conflict (game, project, service_type) do update set
        market_avg_usd = excluded.market_avg_usd,
        market_low_usd = excluded.market_low_usd,
        market_high_usd = excluded.market_high_usd,
        ez_price_usd = excluded.ez_price_usd,
        target_gap_pct = excluded.target_gap_pct,
        daily_limit_pct = excluded.daily_limit_pct,
        permission = excluded.permission,
        source_count = excluded.source_count,
        updated_at = now()
    `, [
      id("pricing", `${rule.game}_${rule.project}_${rule.serviceType}`),
      rule.game,
      rule.project,
      rule.serviceType,
      rule.marketAvgUsd || 0,
      rule.marketLowUsd || 0,
      rule.marketHighUsd || 0,
      rule.ezPriceUsd || 0,
      rule.targetGapPct || 0,
      rule.dailyLimitPct || 0,
      rule.permission || "admin",
      rule.sources || 0
    ]);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to seed data.");
  await seedUsers();
  await seedOrders();
  await seedChats();
  await seedSupplierSettlements();
  await seedGameProjects();
  await seedPricingRules();
  console.log("seed complete");
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => closeDatabasePool());
