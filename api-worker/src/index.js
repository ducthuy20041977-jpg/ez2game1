import { neon } from "@neondatabase/serverless";

const sqlClients = new Map();
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sessionTtlMs = 12 * 60 * 60 * 1000;
const passwordAlgorithm = "pbkdf2_sha256";
const cipherVersion = "v1";

const rolePolicies = {
  owner: { canRevealOrderSecrets: true, canManageAccounts: true, canReadFinance: true },
  admin: { canRevealOrderSecrets: true, canManageAccounts: false, canReadFinance: true },
  service: { canRevealOrderSecrets: true, canManageAccounts: false, canReadFinance: false },
  supplier: { canRevealOrderSecrets: false, canManageAccounts: false, canReadFinance: false },
  sales: { canRevealOrderSecrets: false, canManageAccounts: false, canReadFinance: false }
};

const publicRoutes = [
  ["GET", "/api/health"],
  ["GET", "/api/public/catalog"],
  ["GET", "/api/public/orders/:orderNo"],
  ["POST", "/api/public/orders"],
  ["POST", "/api/public/chats/:orderNo/messages"],
  ["POST", "/api/auth/login"],
  ["POST", "/api/payments/:platform/webhook"],
  ["POST", "/api/analytics/event"],
  ["PUT", "/api/uploads/direct/:key"]
];

const apiPermissions = [
  { role: "owner", methods: ["ALL"], routes: ["*"] },
  {
    role: "admin",
    methods: ["GET", "POST", "PATCH"],
    routes: [
      "/api/auth/logout",
      "/api/system/database",
      "/api/accounts",
      "/api/orders",
      "/api/orders/:orderNo",
      "/api/orders/:orderNo/dispatch",
      "/api/chats/:orderNo/messages",
      "/api/chats/:orderNo/read",
      "/api/uploads/proofs",
      "/api/uploads/sign-url",
      "/api/supplier-settlements",
      "/api/games/projects",
      "/api/games/projects/bulk",
      "/api/pricing",
      "/api/frontend-content",
      "/api/ai/media-platforms",
      "/api/ai/media-drafts",
      "/api/ai/media-publish",
      "/api/ai/employees",
      "/api/ai/sales-intel",
      "/api/ai/sales-launch-plan",
      "/api/ai/business-simulation",
      "/api/ai/business-loop",
      "/api/ai/tasks/assign",
      "/api/analytics/realtime",
      "/api/analytics/daily"
    ]
  },
  {
    role: "service",
    methods: ["GET", "POST", "PATCH"],
    routes: [
      "/api/auth/logout",
      "/api/orders/:orderNo",
      "/api/chats/:orderNo/messages",
      "/api/chats/:orderNo/read",
      "/api/uploads/proofs",
      "/api/uploads/sign-url"
    ]
  },
  {
    role: "supplier",
    methods: ["GET", "POST", "PATCH"],
    routes: [
      "/api/auth/logout",
      "/api/supplier/orders",
      "/api/supplier/orders/:orderNo",
      "/api/uploads/proofs",
      "/api/uploads/sign-url",
      "/api/supplier/completed"
    ]
  },
  {
    role: "sales",
    methods: ["GET", "POST"],
    routes: [
      "/api/auth/logout",
      "/api/orders/:orderNo",
      "/api/games/projects",
      "/api/ai/sales-intel",
      "/api/ai/sales-launch-plan",
      "/api/ai/media-platforms",
      "/api/ai/media-drafts",
      "/api/analytics/realtime",
      "/api/analytics/daily"
    ]
  }
];

const mediaPlatforms = [
  { name: "TikTok", type: "short-video", status: "ready", action: "draft-first" },
  { name: "YouTube Shorts", type: "short-video", status: "ready", action: "draft-first" },
  { name: "Instagram Reels", type: "short-video", status: "ready", action: "draft-first" },
  { name: "X", type: "social", status: "ready", action: "draft-first" },
  { name: "Reddit", type: "community", status: "manual-review", action: "community-safe" },
  { name: "Discord", type: "community", status: "manual-review", action: "server-post" },
  { name: "Medium", type: "blog", status: "ready", action: "long-form" },
  { name: "Pinterest", type: "image", status: "ready", action: "catalog-pin" }
];

const aiEmployees = [
  { name: "AI经理", scope: "daily-priority, risk, approval", status: "active" },
  { name: "AI运营", scope: "campaign, content, traffic", status: "active" },
  { name: "AI销售", scope: "new-game, launch-watch, opportunity", status: "active" },
  { name: "AI财务", scope: "settlement, supplier-payable, reconciliation", status: "active" },
  { name: "AI数据分析", scope: "views, stay-time, conversion", status: "active" }
];

function corsHeaders(env, request = null) {
  const configuredOrigins = String(env.PUBLIC_ORIGIN || "https://ez2gm.com")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([
    ...configuredOrigins,
    "https://ez2gm.com",
    "https://www.ez2gm.com",
    "https://admin.ez2gm.com"
  ]);
  const requestOrigin = request?.headers?.get("origin") || "";
  const allowedOrigin = allowedOrigins.has(requestOrigin) ? requestOrigin : (configuredOrigins[0] || "https://ez2gm.com");
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Role",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(payload, status = 200, env = {}, request = null) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(env, request)
    }
  });
}

function error(message, status = 500, env = {}, detail = undefined, request = null) {
  return json({ ok: false, error: message, detail }, status, env, request);
}

async function readJson(request) {
  if (!["POST", "PATCH", "PUT"].includes(request.method)) return {};
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error("INVALID_JSON");
    err.status = 400;
    throw err;
  }
}

function getSql(env) {
  if (!env.DATABASE_URL) return null;
  if (!sqlClients.has(env.DATABASE_URL)) {
    sqlClients.set(env.DATABASE_URL, neon(env.DATABASE_URL));
  }
  return sqlClients.get(env.DATABASE_URL);
}

async function query(env, text, params = []) {
  const sql = getSql(env);
  if (!sql) {
    const err = new Error("DATABASE_URL_NOT_CONFIGURED");
    err.status = 500;
    throw err;
  }
  if (typeof sql.query === "function") return sql.query(text, params);
  return sql(text, params);
}

function base64UrlEncode(bytes) {
  let binary = "";
  const array = bytes instanceof Uint8Array ? bytes : encoder.encode(String(bytes));
  for (const byte of array) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(text) {
  const normalized = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256Bytes(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(String(text || ""))));
}

async function hmacBytes(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret || "change-me")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(String(text || ""))));
}

async function timingSafeEqual(left, right) {
  const a = left instanceof Uint8Array ? left : encoder.encode(String(left || ""));
  const b = right instanceof Uint8Array ? right : encoder.encode(String(right || ""));
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  await crypto.subtle.digest("SHA-256", new Uint8Array([diff]));
  return diff === 0;
}

async function verifyPassword(password, storedHash = "") {
  const [algorithm, iterationsText, saltText, digestText] = String(storedHash).split("$");
  if (algorithm !== passwordAlgorithm || !iterationsText || !saltText || !digestText) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < 100000) return false;
  if (iterations > 100000) {
    const err = new Error("PASSWORD_HASH_REQUIRES_REHASH");
    err.status = 401;
    throw err;
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(password || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const expected = base64UrlDecode(digestText);
  const actual = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: base64UrlDecode(saltText), iterations, hash: "SHA-256" },
    keyMaterial,
    expected.length * 8
  ));
  return timingSafeEqual(expected, actual);
}

async function createToken(actor, env) {
  const payload = {
    ...actor,
    iat: Date.now(),
    exp: Date.now() + Number(env.SESSION_TTL_MS || sessionTtlMs)
  };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = base64UrlEncode(await hmacBytes(env.SESSION_SECRET, body));
  return `${body}.${signature}`;
}

async function verifyToken(token, env) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return null;
  const expected = base64UrlEncode(await hmacBytes(env.SESSION_SECRET, body));
  if (!(await timingSafeEqual(expected, signature))) return null;
  try {
    const actor = JSON.parse(decoder.decode(base64UrlDecode(body)));
    if (!actor.exp || actor.exp < Date.now()) return null;
    return actor;
  } catch {
    return null;
  }
}

function id(prefix, value = "") {
  const raw = String(value || crypto.randomUUID()).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  return `${prefix}_${raw || crypto.randomUUID()}`;
}

function normalizeOrderNo(orderNo = "") {
  const clean = String(orderNo || "").trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!clean) return "";
  if (clean.startsWith("EZ")) return `EZ${clean.slice(2).replace(/\D/g, "")}`;
  return `EZ${clean.replace(/\D/g, "")}`;
}

function createOrderNo() {
  const now = new Date();
  const date = `${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  const tail = String(Math.floor(100000 + Math.random() * 900000));
  return `EZ${date}${tail}`;
}

function safeFileName(name = "upload.bin") {
  return String(name || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

function cleanText(value = "", maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function maskValue(value = "", visibleTail = 4) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= visibleTail) return "*".repeat(text.length);
  return `${"*".repeat(Math.max(4, text.length - visibleTail))}${text.slice(-visibleTail)}`;
}

function maskEmail(value = "") {
  const text = String(value || "");
  const [name, domain] = text.split("@");
  if (!name || !domain) return maskValue(text);
  return `${name.slice(0, 2)}${"*".repeat(Math.max(3, name.length - 2))}@${domain}`;
}

function accountPayload(user = {}) {
  return {
    id: user.id,
    account: user.account,
    role: user.role,
    status: user.status,
    note: user.note || "",
    supplierCode: user.supplier_code || null,
    lastLoginAt: user.last_login_at,
    failedLoginCount: user.failed_login_count || 0,
    lockedUntil: user.locked_until,
    hasPasswordHash: Boolean(user.has_password_hash ?? user.password_hash),
    permissions: rolePolicies[user.role] || null
  };
}

function sanitizeChatText(text) {
  let output = String(text || "");
  output = output.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, match => "*".repeat(Math.min(Math.max(match.length, 4), 12)));
  output = output.replace(/https?:\/\/[^\s]+|www\.[^\s]+/gi, match => "*".repeat(Math.min(Math.max(match.length, 4), 12)));
  output = output.replace(/微信|QQ|whatsapp|telegram|discord|skype|私下|私聊|联系方式|outside payment|private deal|bank transfer|phone|email/gi, match => "*".repeat(Math.min(Math.max(match.length, 4), 12)));
  return output;
}

function autoTranslate(text) {
  const value = String(text || "");
  if (/[\u4e00-\u9fff]/.test(value)) return "AI translation: I will check this order and reply as soon as possible.";
  if (value.toLowerCase().includes("refund")) return "AI翻译：我需要处理退款问题。";
  if (value.toLowerCase().includes("when")) return "AI翻译：请问什么时候完成？";
  return "AI翻译：我会尽快检查并回复。";
}

async function encryptionKey(env) {
  const digest = await sha256Bytes(env.ENCRYPTION_KEY || env.SESSION_SECRET || "change-me");
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptText(value, env) {
  if (value === undefined || value === null || value === "") return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(env),
    encoder.encode(String(value))
  ));
  const ciphertext = encrypted.slice(0, -16);
  const tag = encrypted.slice(-16);
  return `${cipherVersion}:${base64UrlEncode(iv)}:${base64UrlEncode(tag)}:${base64UrlEncode(ciphertext)}`;
}

async function decryptText(payload, env) {
  if (!payload) return "";
  const value = String(payload);
  if (!value.startsWith(`${cipherVersion}:`)) return value;
  try {
    const [, ivText, tagText, ciphertextText] = value.split(":");
    const ciphertext = base64UrlDecode(ciphertextText);
    const tag = base64UrlDecode(tagText);
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.length);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlDecode(ivText) },
      await encryptionKey(env),
      combined
    );
    return decoder.decode(plain);
  } catch {
    return "[DECRYPTION_FAILED]";
  }
}

function routeMatches(pattern, pathname) {
  if (pattern === "*") return {};
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = pathname.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length && !pattern.endsWith("/:key")) return null;
  const params = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const part = patternParts[index];
    if (part === ":key") {
      params.key = decodeURIComponent(pathParts.slice(index).join("/"));
      return params;
    }
    if (part.startsWith(":")) {
      params[part.slice(1)] = decodeURIComponent(pathParts[index] || "");
    } else if (part !== pathParts[index]) {
      return null;
    }
  }
  return params;
}

function findRoute(method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = routeMatches(route.pattern, pathname);
    if (params) return { route, params };
  }
  return null;
}

function isPublicRoute(method, pathname) {
  return publicRoutes.some(([routeMethod, pattern]) => routeMethod === method && routeMatches(pattern, pathname));
}

function checkPermission(role, method, pathname) {
  const rules = apiPermissions.filter(item => item.role === role);
  if (!rules.length) return false;
  return rules.some(rule => {
    const methodAllowed = rule.methods.includes("ALL") || rule.methods.includes(method);
    const routeAllowed = rule.routes.some(pattern => routeMatches(pattern, pathname));
    return methodAllowed && routeAllowed;
  });
}

async function publicOrderFromRow(row, actor, env) {
  const reveal = Boolean(rolePolicies[actor?.role]?.canRevealOrderSecrets);
  const canReadFinance = Boolean(rolePolicies[actor?.role]?.canReadFinance);
  const gameId = await decryptText(row.game_id_cipher, env);
  const account = await decryptText(row.account_cipher, env);
  const password = await decryptText(row.password_cipher, env);
  return {
    orderNo: row.order_no,
    customer: reveal ? row.customer_email : maskEmail(row.customer_email),
    game: row.game,
    project: row.project,
    gameId: reveal ? gameId : maskValue(gameId),
    account: reveal ? account : maskValue(account),
    password: reveal ? password : maskValue(password),
    status: row.status,
    payment: row.payment_status,
    agent: reveal ? row.agent || "" : "",
    supplier: reveal || actor?.role === "supplier" ? row.supplier || "" : "",
    profit: canReadFinance ? row.profit || "" : "",
    encryptionVersion: row.encryption_version,
    sensitiveFieldsEncrypted: Boolean(row.game_id_cipher || row.account_cipher || row.password_cipher)
  };
}

async function getOrderRecord(orderNo, actor, env) {
  const normalized = normalizeOrderNo(orderNo);
  const orders = await query(env, "select * from orders where order_no = $1 limit 1", [normalized]);
  const order = orders[0];
  if (!order) return null;

  const [items, dispatches, threads, uploads] = await Promise.all([
    query(env, "select item_name, server, qty, price, supplier_price, status from order_items where order_id = $1 order by created_at, id", [order.id]),
    query(env, "select * from dispatches where order_id = $1 order by created_at desc limit 1", [order.id]),
    query(env, "select * from chat_threads where order_id = $1 order by created_at desc limit 1", [order.id]),
    query(env, "select * from uploads where order_id = $1 or order_no = $2 order by created_at desc", [order.id, normalized])
  ]);

  const reveal = Boolean(rolePolicies[actor?.role]?.canRevealOrderSecrets);
  const canReadFinance = Boolean(rolePolicies[actor?.role]?.canReadFinance);

  return {
    order: await publicOrderFromRow(order, actor, env),
    items: items.map(item => ({
      name: item.item_name,
      server: item.server || "",
      qty: item.qty || "",
      price: item.price || "",
      supplierPrice: canReadFinance ? item.supplier_price || "" : "",
      status: item.status
    })),
    dispatch: dispatches[0] ? {
      mode: dispatches[0].mode || "",
      service: reveal ? dispatches[0].service_account || "" : "",
      supplier: reveal || actor?.role === "supplier" ? dispatches[0].supplier_code || "" : "",
      deadline: dispatches[0].deadline || "",
      lock: dispatches[0].lock_state || ""
    } : null,
    chat: threads[0] ? {
      orderNo: normalized,
      owner: threads[0].owner_account || "",
      customerOnline: threads[0].customer_online,
      unread: threads[0].unread_count,
      messages: []
    } : null,
    uploads: uploads.map(item => ({
      id: item.id,
      orderNo: item.order_no || normalized,
      fileType: item.file_type,
      fileName: item.file_name,
      storageUrl: item.storage_url,
      uploadedBy: item.uploaded_by,
      createdAt: item.created_at
    }))
  };
}

async function getPublicCatalog({ env }) {
  const [projects, contentRows] = await Promise.all([
    query(env, "select game, project, service_type, frontend_price, mode, status, image_url, required_fields from game_projects where coalesce(status, 'active') = 'active' order by game, service_type, project limit 120"),
    query(env, "select payload from frontend_content order by updated_at desc limit 1")
  ]);
  return {
    ok: true,
    data: {
      content: contentRows[0]?.payload || {},
      projects: projects.map(item => ({
        game: item.game,
        project: item.project,
        serviceType: item.service_type,
        price: item.frontend_price,
        mode: item.mode,
        status: item.status,
        imageUrl: item.image_url,
        requiredFields: item.required_fields
      }))
    }
  };
}

async function getPublicOrderStatus({ params, env }) {
  const normalized = normalizeOrderNo(params.orderNo);
  const orders = await query(env, "select id, order_no, game, project, status, payment_status, updated_at from orders where order_no = $1 limit 1", [normalized]);
  const order = orders[0];
  if (!order) return { status: 404, payload: { ok: false, error: "ORDER_NOT_FOUND" } };
  const [items, threads] = await Promise.all([
    query(env, "select item_name, server, qty, price, status from order_items where order_id = $1 order by created_at, id", [order.id]),
    query(env, "select customer_online, unread_count, updated_at from chat_threads where order_id = $1 order by created_at desc limit 1", [order.id])
  ]);
  return {
    ok: true,
    data: {
      orderNo: order.order_no,
      game: order.game,
      project: order.project,
      status: order.status,
      payment: order.payment_status,
      updatedAt: order.updated_at,
      items: items.map(item => ({
        name: item.item_name,
        server: item.server || "",
        qty: item.qty || "",
        price: item.price || "",
        status: item.status
      })),
      support: threads[0] ? {
        online: Boolean(threads[0].customer_online),
        unread: Number(threads[0].unread_count || 0),
        updatedAt: threads[0].updated_at
      } : { online: false, unread: 0 }
    }
  };
}

async function createPublicOrder({ body, env }) {
  const sourceItems = Array.isArray(body.items) && body.items.length ? body.items : [{ name: body.project || "Custom Item", server: body.server || "", qty: body.qty || "1", price: "" }];
  const items = sourceItems.slice(0, 20).map(item => ({
    name: cleanText(item.name || item.itemName || body.project || "Custom Item", 220),
    server: cleanText(item.server || body.server || "", 80),
    qty: cleanText(item.qty || "1", 40),
    price: cleanText(item.price || "", 40),
    status: "pending"
  }));
  const orderNo = createOrderNo();
  const game = cleanText(body.game || "", 80);
  const project = cleanText(body.project || items[0]?.name || "Custom Item", 120);
  if (!body.customer || !game || !project) {
    return { status: 400, payload: { ok: false, error: "CUSTOMER_GAME_PROJECT_REQUIRED" } };
  }
  const created = await createOrder({
    body: {
      customer: cleanText(body.customer, 160),
      game,
      project,
      gameId: cleanText(body.gameId, 120),
      account: "",
      password: "",
      items,
      orderNo,
      preventOverwrite: true,
      payment: body.payment || "manual-quote",
      profit: ""
    },
    actor: { account: "frontend-customer", role: "public" },
    env
  });
  if (created.status && created.status >= 400) return created;
  const status = await getPublicOrderStatus({ params: { orderNo }, env });
  return { status: 201, payload: status };
}

async function ensureThread(orderNo, actor, env) {
  const normalized = normalizeOrderNo(orderNo);
  const orders = await query(env, "select id from orders where order_no = $1 limit 1", [normalized]);
  const order = orders[0];
  if (!order) return null;
  const existing = await query(env, "select * from chat_threads where order_id = $1 order by created_at desc limit 1", [order.id]);
  if (existing[0]) return existing[0];
  const threadId = id("thread", normalized);
  const created = await query(env, `
    insert into chat_threads (id, order_id, owner_account, unread_count, customer_online)
    values ($1, $2, $3, 0, false)
    returning *
  `, [threadId, order.id, actor?.account || ""]);
  return created[0];
}

async function audit(env, actor, action, targetType, targetId, meta = {}) {
  try {
    await query(env, `
      insert into audit_logs (id, actor, role, action, target_type, target_id, meta, ip, created_at)
      values ($1, $2, $3, $4, $5, $6, $7, $8, now())
    `, [crypto.randomUUID(), actor?.account || "anonymous", actor?.role || "public", action, targetType, targetId, JSON.stringify(meta || {}), "worker"]);
  } catch {
    // Audit failure should not block order handling.
  }
}

async function loginHandler({ body, env }) {
  const account = String(body.account || "").trim().toLowerCase();
  const rows = await query(env, "select * from users where lower(account) = $1 and status = 'active' limit 1", [account]);
  const user = rows[0];
  if (user?.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return { status: 423, payload: { ok: false, error: "ACCOUNT_LOCKED", lockedUntil: user.locked_until } };
  }
  if (!user || !(await verifyPassword(body.password || "", user.password_hash))) {
    if (user) {
      const failedCount = Number(user.failed_login_count || 0) + 1;
      const lockUntil = failedCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      await query(env, "update users set failed_login_count = $2, locked_until = $3::timestamptz, updated_at = now() where id = $1", [user.id, failedCount, lockUntil]);
    }
    return { status: 401, payload: { ok: false, error: "INVALID_LOGIN" } };
  }
  await query(env, "update users set failed_login_count = 0, locked_until = null, last_login_at = now(), updated_at = now() where id = $1", [user.id]);
  const actor = {
    id: user.id,
    account: user.account,
    role: user.role,
    supplierCode: user.supplier_code || null,
    permissions: rolePolicies[user.role] || {}
  };
  await query(env, "update users set failed_login_count = 0, locked_until = null, last_login_at = now(), updated_at = now() where id = $1", [user.id]);
  return { ok: true, token: await createToken(actor, env), actor };
}

async function listAccounts({ env }) {
  const rows = await query(env, `
    select id, account, role, status, note, supplier_code, last_login_at, failed_login_count, locked_until,
      password_hash is not null as has_password_hash
    from users
    order by case role when 'owner' then 1 when 'admin' then 2 when 'service' then 3 when 'sales' then 4 when 'supplier' then 5 else 9 end, account
  `);
  return {
    ok: true,
    data: {
      accounts: rows.map(accountPayload),
      roles: rolePolicies
    }
  };
}

async function createAccount({ body, actor, env }) {
  const account = String(body.account || "").trim();
  if (!account) throw Object.assign(new Error("ACCOUNT_REQUIRED"), { status: 400 });
  if (!["owner", "admin", "service", "supplier", "sales"].includes(body.role || "service")) {
    throw Object.assign(new Error("ROLE_INVALID"), { status: 400 });
  }
  if (String(body.password || "").length < 8) throw Object.assign(new Error("PASSWORD_TOO_SHORT"), { status: 400 });
  const exists = await query(env, "select id from users where lower(account) = $1 limit 1", [account.toLowerCase()]);
  if (exists[0]) throw Object.assign(new Error("ACCOUNT_EXISTS"), { status: 409 });

  const passwordHash = await hashPassword(body.password, env);
  const rows = await query(env, `
    insert into users (id, account, password_hash, role, status, note, supplier_code)
    values ($1, $2, $3, $4, $5, $6, $7)
    returning id, account, role, status, note, supplier_code, last_login_at, failed_login_count, locked_until,
      password_hash is not null as has_password_hash
  `, [crypto.randomUUID(), account, passwordHash, body.role || "service", body.status || "active", String(body.note || ""), body.supplierCode || null]);
  await audit(env, actor, "create_account", "user", rows[0].id, { account, role: body.role || "service" });
  return { status: 201, payload: { ok: true, data: accountPayload(rows[0]) } };
}

async function hashPassword(password, env) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = Number(env.PASSWORD_ITERATIONS || 100000);
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(String(password || "")), "PBKDF2", false, ["deriveBits"]);
  const digest = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, keyMaterial, 256));
  return `${passwordAlgorithm}$${iterations}$${base64UrlEncode(salt)}$${base64UrlEncode(digest)}`;
}

async function updateAccount({ params, body, actor, env }) {
  const rows = await query(env, "select * from users where id = $1 limit 1", [params.id]);
  const user = rows[0];
  if (!user) throw Object.assign(new Error("ACCOUNT_NOT_FOUND"), { status: 404 });
  if (user.role === "owner" && actor.id !== user.id && body.status && body.status !== "active") {
    throw Object.assign(new Error("OWNER_CANNOT_BE_DISABLED_BY_OTHER_ACCOUNT"), { status: 403 });
  }
  const nextPassword = body.password ? await hashPassword(body.password, env) : user.password_hash;
  const updated = await query(env, `
    update users
    set account = $2, password_hash = $3, role = $4, status = $5, note = $6, supplier_code = $7,
        failed_login_count = $8, locked_until = $9, updated_at = now()
    where id = $1
    returning id, account, role, status, note, supplier_code, last_login_at, failed_login_count, locked_until,
      password_hash is not null as has_password_hash
  `, [
    params.id,
    body.account ? String(body.account).trim() : user.account,
    nextPassword,
    body.role || user.role,
    body.status || user.status,
    body.note !== undefined ? String(body.note || "") : user.note,
    body.supplierCode !== undefined ? body.supplierCode || null : user.supplier_code,
    body.password || body.unlock === true ? 0 : user.failed_login_count,
    body.password || body.unlock === true ? null : user.locked_until
  ]);
  await audit(env, actor, "update_account", "user", params.id, { role: body.role || user.role });
  return { ok: true, data: accountPayload(updated[0]) };
}

async function deleteAccount({ params, actor, env }) {
  const rows = await query(env, "select * from users where id = $1 limit 1", [params.id]);
  const user = rows[0];
  if (!user) throw Object.assign(new Error("ACCOUNT_NOT_FOUND"), { status: 404 });
  if (actor.id === user.id) throw Object.assign(new Error("CANNOT_DELETE_CURRENT_ACCOUNT"), { status: 403 });
  if (user.role === "owner") throw Object.assign(new Error("OWNER_ACCOUNT_CANNOT_BE_DELETED"), { status: 403 });
  await query(env, "delete from users where id = $1", [params.id]);
  await audit(env, actor, "delete_account", "user", params.id, { account: user.account, role: user.role });
  return { ok: true, data: { id: user.id, account: user.account, role: user.role, status: user.status } };
}

async function createOrder({ body, actor, env }) {
  const orderNo = normalizeOrderNo(body.orderNo) || createOrderNo();
  const items = Array.isArray(body.items) && body.items.length ? body.items : [{ name: body.project || "Custom Item", qty: "1", price: body.price || "" }];
  const orderId = id("order", orderNo);
  const paid = body.payment === "paid" || body.payment === "frontend-paid";
  if (body.preventOverwrite) {
    const existing = await query(env, "select id from orders where order_no = $1 limit 1", [orderNo]);
    if (existing[0]) return { status: 409, payload: { ok: false, error: "ORDER_NO_CONFLICT" } };
  }
  await query(env, `
    insert into orders (
      id, order_no, customer_email, game, project, game_id_cipher, account_cipher,
      password_cipher, encryption_version, status, payment_status, agent, supplier, profit
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, 'v1', $9, $10, $11, $12, $13)
    on conflict (order_no) do update set
      customer_email = excluded.customer_email, game = excluded.game, project = excluded.project,
      game_id_cipher = excluded.game_id_cipher, account_cipher = excluded.account_cipher,
      password_cipher = excluded.password_cipher, status = excluded.status,
      payment_status = excluded.payment_status, agent = excluded.agent, supplier = excluded.supplier,
      profit = excluded.profit, updated_at = now()
  `, [
    orderId,
    orderNo,
    body.customer || "",
    body.game || "",
    body.project || `${items.length} items`,
    await encryptText(body.gameId || "", env),
    await encryptText(body.account || body.customer || "", env),
    await encryptText(body.password || "", env),
    paid ? "pending" : "quote-review",
    paid ? "frontend-paid" : (body.payment || "manual-quote"),
    paid ? "unassigned" : "not-dispatched",
    "service-review",
    body.profit || "35%"
  ]);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    await query(env, `
      insert into order_items (id, order_id, item_name, server, qty, price, supplier_price, status)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (id) do update set item_name = excluded.item_name, server = excluded.server,
        qty = excluded.qty, price = excluded.price, supplier_price = excluded.supplier_price, status = excluded.status
    `, [id("item", `${orderNo}_${index}`), orderId, item.name || item.itemName || "", item.server || "", item.qty || "", item.price || "", item.supplierPrice || "", item.status || "pending"]);
  }
  await query(env, `
    insert into dispatches (id, order_id, mode, service_account, supplier_code, deadline, lock_state)
    values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (id) do update set mode = excluded.mode, service_account = excluded.service_account,
      supplier_code = excluded.supplier_code, deadline = excluded.deadline, lock_state = excluded.lock_state, updated_at = now()
  `, [id("dispatch", orderNo), orderId, paid ? "service-review" : "waiting-payment", paid ? "unassigned" : "not-dispatched", "service-review", "after-payment", "unclaimed"]);
  await audit(env, actor, "create_order", "order", orderNo);
  return { status: 201, payload: { ok: true, data: await getOrderRecord(orderNo, actor, env) } };
}

async function dispatchOrder({ params, body, actor, env }) {
  const orderNo = normalizeOrderNo(params.orderNo);
  const orders = await query(env, "select id from orders where order_no = $1 limit 1", [orderNo]);
  const order = orders[0];
  if (!order) return { status: 404, payload: { ok: false, error: "ORDER_NOT_FOUND" } };
  const dispatch = {
    mode: body.mode || "backend-dispatch",
    service: body.service || "service01",
    supplier: body.supplier || "Supplier A",
    deadline: body.deadline || "50 minutes",
    lock: body.lock || "dispatched"
  };
  await query(env, `
    insert into dispatches (id, order_id, mode, service_account, supplier_code, deadline, lock_state)
    values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (id) do update set mode = excluded.mode, service_account = excluded.service_account,
      supplier_code = excluded.supplier_code, deadline = excluded.deadline, lock_state = excluded.lock_state, updated_at = now()
  `, [id("dispatch", orderNo), order.id, dispatch.mode, dispatch.service, dispatch.supplier, dispatch.deadline, dispatch.lock]);
  await query(env, "update orders set agent = $2, supplier = $3, status = 'dispatched', updated_at = now() where id = $1", [order.id, dispatch.service, dispatch.supplier]);
  await audit(env, actor, "dispatch_order", "order", orderNo, dispatch);
  return { ok: true, data: await getOrderRecord(orderNo, actor, env) };
}

async function getMessages({ params, actor, env }) {
  const thread = await ensureThread(params.orderNo, actor, env);
  if (!thread) return { ok: true, data: [] };
  await query(env, "update chat_threads set unread_count = 0, owner_account = coalesce(nullif(owner_account, ''), $2), updated_at = now() where id = $1", [thread.id, actor.account]);
  const rows = await query(env, `
    select sender_type, body, translated_body, created_at
    from chat_messages
    where thread_id = $1
    order by created_at, id
  `, [thread.id]);
  return { ok: true, data: rows.map(item => ({ sender: item.sender_type, body: item.body, translatedBody: item.translated_body, createdAt: item.created_at })) };
}

async function addMessage({ params, body, actor, env }) {
  const thread = await ensureThread(params.orderNo, actor, env);
  if (!thread) return { status: 404, payload: { ok: false, error: "ORDER_NOT_FOUND" } };
  const cleanBody = sanitizeChatText(cleanText(body.body || "", 1000));
  if (!cleanBody) return { status: 400, payload: { ok: false, error: "MESSAGE_REQUIRED" } };
  const message = {
    id: crypto.randomUUID(),
    sender: body.sender || actor.role,
    body: cleanBody,
    translatedBody: autoTranslate(cleanBody),
    createdAt: new Date().toISOString()
  };
  await query(env, `
    insert into chat_messages (id, thread_id, sender_type, body, translated_body, created_at)
    values ($1, $2, $3, $4, $5, $6)
  `, [message.id, thread.id, message.sender, message.body, message.translatedBody, message.createdAt]);
  if (message.sender === "customer") {
    await query(env, "update chat_threads set unread_count = unread_count + 1, customer_online = true, updated_at = now() where id = $1", [thread.id]);
  }
  await audit(env, actor, "send_chat_message", "order", normalizeOrderNo(params.orderNo));
  return { status: 201, payload: { ok: true, data: message } };
}

async function verifyPaymentWebhook({ request, params, env }) {
  const platform = String(params.platform || "").replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();
  const secret = env[`${platform}_WEBHOOK_SECRET`] || env.PAYMENT_WEBHOOK_SECRET || "";
  if (!secret) return { ok: false, status: 503, error: "WEBHOOK_SECRET_NOT_CONFIGURED" };
  const provided = request.headers.get("x-ez2gm-webhook-secret") ||
    request.headers.get("x-webhook-secret") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!provided || !(await timingSafeEqual(provided, secret))) {
    return { ok: false, status: 401, error: "INVALID_WEBHOOK_SIGNATURE" };
  }
  return { ok: true };
}

async function createSignedUpload({ body, actor, env, request }) {
  const orderNo = normalizeOrderNo(body.orderNo);
  if (!orderNo) throw Object.assign(new Error("ORDER_NO_REQUIRED"), { status: 400 });
  const fileName = safeFileName(body.fileName);
  const fileType = String(body.fileType || "proof").replace(/[^a-zA-Z0-9_-]/g, "-");
  const objectKey = `${orderNo}/${fileType}/${Date.now()}-${fileName}`;
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const tokenPayload = `${objectKey}.${expiresAt}.${actor.account}`;
  const token = base64UrlEncode(await hmacBytes(env.UPLOAD_SIGNING_SECRET || env.SESSION_SECRET, tokenPayload));
  const url = new URL(request.url);
  const uploadUrl = `${url.origin}/api/uploads/direct/${encodeURIComponent(objectKey)}?expires=${expiresAt}&actor=${encodeURIComponent(actor.account)}&token=${token}`;
  return {
    status: 201,
    payload: {
      ok: true,
      data: {
        objectKey,
        bucket: "ez2gm",
        uploadUrl,
        publicUrl: `${env.R2_PUBLIC_BASE_URL || "https://img.ez2gm.com"}/${objectKey}`,
        method: "PUT",
        contentType: body.contentType || body.mimeType || "application/octet-stream",
        storageMode: "cloudflare-r2-worker",
        expiresAt: new Date(expiresAt).toISOString(),
        uploadedBy: actor.account
      }
    }
  };
}

async function directUpload({ params, request, env }) {
  if (!env.EZ2GM_UPLOADS) return error("R2_BUCKET_NOT_BOUND", 500, env, undefined, request);
  const url = new URL(request.url);
  const objectKey = params.key;
  const expires = Number(url.searchParams.get("expires"));
  const actor = url.searchParams.get("actor") || "";
  const token = url.searchParams.get("token") || "";
  if (!objectKey || !expires || expires < Date.now()) return error("UPLOAD_URL_EXPIRED", 403, env, undefined, request);
  const expected = base64UrlEncode(await hmacBytes(env.UPLOAD_SIGNING_SECRET || env.SESSION_SECRET, `${objectKey}.${expires}.${actor}`));
  if (!(await timingSafeEqual(expected, token))) return error("INVALID_UPLOAD_TOKEN", 403, env, undefined, request);
  await env.EZ2GM_UPLOADS.put(objectKey, request.body, {
    httpMetadata: { contentType: request.headers.get("content-type") || "application/octet-stream" },
    customMetadata: { uploadedBy: actor }
  });
  return json({ ok: true, objectKey, publicUrl: `${env.R2_PUBLIC_BASE_URL || "https://img.ez2gm.com"}/${objectKey}` }, 201, env, request);
}

async function createUploadRecord({ body, actor, env }) {
  const orderNo = normalizeOrderNo(body.orderNo);
  const orders = orderNo ? await query(env, "select id from orders where order_no = $1 limit 1", [orderNo]) : [];
  const record = {
    id: crypto.randomUUID(),
    orderNo,
    fileType: body.fileType || "delivery-proof",
    fileName: body.fileName || "proof.png",
    storageUrl: body.storageUrl || body.publicUrl || `${env.R2_PUBLIC_BASE_URL || "https://img.ez2gm.com"}/${orderNo}/${Date.now()}-${safeFileName(body.fileName || "proof.png")}`,
    uploadedBy: actor.account,
    createdAt: new Date().toISOString()
  };
  await query(env, `
    insert into uploads (id, order_id, order_no, file_type, file_name, storage_url, uploaded_by, created_at)
    values ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [record.id, orders[0]?.id || null, record.orderNo, record.fileType, record.fileName, record.storageUrl, record.uploadedBy, record.createdAt]);
  await audit(env, actor, "upload_proof", "order", orderNo);
  return { status: 201, payload: { ok: true, data: record } };
}

function pricingResult(rule) {
  const marketAvg = Number(rule.market_avg_usd || 0);
  const ezPrice = Number(rule.ez_price_usd || 0);
  const targetGapPct = Number(rule.target_gap_pct || 0);
  const target = marketAvg * (1 + targetGapPct / 100);
  const suggestedUsd = Number((target || ezPrice).toFixed(2));
  const changeUsd = Number((suggestedUsd - ezPrice).toFixed(2));
  return { marketAvg, ezPrice, suggestedUsd, changeUsd, action: Math.abs(changeUsd) < 0.05 ? "hold" : changeUsd > 0 ? "raise" : "lower" };
}

const routes = [
  ["GET", "/api/health", async ({ env }) => ({ ok: true, app: env.APP_NAME || "EZ2GM API", database: Boolean(env.DATABASE_URL), time: new Date().toISOString() })],
  ["GET", "/api/public/catalog", getPublicCatalog],
  ["GET", "/api/public/orders/:orderNo", getPublicOrderStatus],
  ["POST", "/api/public/orders", createPublicOrder],
  ["POST", "/api/public/chats/:orderNo/messages", async ({ params, body, env }) => addMessage({
    params,
    body: { ...body, sender: "customer" },
    actor: { account: "frontend-customer", role: "customer" },
    env
  })],
  ["GET", "/api/system/database", async ({ env }) => {
    const startedAt = Date.now();
    await query(env, "select 1 as ok");
    return { ok: true, data: { mode: "postgres", provider: "Neon PostgreSQL", connected: true, latencyMs: Date.now() - startedAt } };
  }],
  ["POST", "/api/auth/login", loginHandler],
  ["POST", "/api/auth/logout", async ({ actor, env }) => {
    await audit(env, actor, "logout", "session", actor.id);
    return { ok: true };
  }],
  ["GET", "/api/accounts", listAccounts],
  ["POST", "/api/accounts", createAccount],
  ["PATCH", "/api/accounts/:id", updateAccount],
  ["DELETE", "/api/accounts/:id", deleteAccount],
  ["GET", "/api/orders/:orderNo", async ({ params, actor, env }) => {
    const record = await getOrderRecord(params.orderNo, actor, env);
    if (!record) return { status: 404, payload: { ok: false, error: "ORDER_NOT_FOUND" } };
    await audit(env, actor, "read_order", "order", normalizeOrderNo(params.orderNo));
    return { ok: true, data: record };
  }],
  ["POST", "/api/orders", createOrder],
  ["POST", "/api/orders/:orderNo/dispatch", dispatchOrder],
  ["GET", "/api/chats/:orderNo/messages", getMessages],
  ["POST", "/api/chats/:orderNo/messages", addMessage],
  ["PATCH", "/api/chats/:orderNo/read", async ({ params, actor, env }) => {
    const thread = await ensureThread(params.orderNo, actor, env);
    if (thread) await query(env, "update chat_threads set unread_count = 0, owner_account = coalesce(nullif(owner_account, ''), $2), updated_at = now() where id = $1", [thread.id, actor.account]);
    return { ok: true, data: { orderNo: normalizeOrderNo(params.orderNo), unread: 0, owner: actor.account } };
  }],
  ["POST", "/api/uploads/sign-url", createSignedUpload],
  ["PUT", "/api/uploads/direct/:key", directUpload],
  ["POST", "/api/uploads/proofs", createUploadRecord],
  ["GET", "/api/supplier-settlements", async ({ env }) => {
    const rows = await query(env, "select * from supplier_settlements order by supplier_code, created_at desc");
    return { ok: true, data: rows.map(item => ({ supplier: item.supplier, supplierCode: item.supplier_code, count: item.completed_count, amountCny: Number(item.amount_cny), deductionCny: Number(item.deduction_cny), payableCny: Number(item.payable_cny), status: item.status })) };
  }],
  ["GET", "/api/supplier/completed", async ({ actor, env }) => {
    const rows = await query(env, "select * from supplier_settlements where supplier_code = $1 order by created_at desc", [actor.supplierCode]);
    return { ok: true, data: rows };
  }],
  ["GET", "/api/supplier/orders", async ({ actor, env }) => {
    const rows = await query(env, `
      select o.order_no from orders o
      join dispatches d on d.order_id = o.id
      where d.supplier_code = $1
      order by o.created_at desc
    `, [actor.supplierCode]);
    return { ok: true, data: await Promise.all(rows.map(row => getOrderRecord(row.order_no, actor, env))) };
  }],
  ["GET", "/api/supplier/orders/:orderNo", async ({ params, actor, env }) => {
    const record = await getOrderRecord(params.orderNo, actor, env);
    if (!record || record.dispatch?.supplier !== actor.supplierCode) return { status: 404, payload: { ok: false, error: "ORDER_NOT_FOUND" } };
    return { ok: true, data: record };
  }],
  ["GET", "/api/games/projects", async ({ env }) => {
    const rows = await query(env, "select * from game_projects order by game, service_type, project");
    return { ok: true, data: rows.map(item => ({ id: item.id, game: item.game, project: item.project, serviceType: item.service_type, frontendPrice: item.frontend_price, backendPrice: item.backend_price, mode: item.mode, status: item.status, imageUrl: item.image_url, requiredFields: item.required_fields })) };
  }],
  ["POST", "/api/games/projects", async ({ body, actor, env }) => {
    const row = await query(env, `
      insert into game_projects (id, game, project, service_type, frontend_price, backend_price, mode, status, image_url, required_fields)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict (game, project) do update set service_type = excluded.service_type, frontend_price = excluded.frontend_price,
        backend_price = excluded.backend_price, mode = excluded.mode, status = excluded.status, image_url = excluded.image_url,
        required_fields = excluded.required_fields, updated_at = now()
      returning *
    `, [id("project", `${body.game}_${body.project}`), body.game, body.project, body.serviceType || body.service_type || "item", body.frontendPrice || "", body.backendPrice || "", body.mode || "manual", body.status || "active", body.imageUrl || "", body.requiredFields || ""]);
    await audit(env, actor, "create_game_project", "game_project", `${body.game}/${body.project}`);
    return { status: 201, payload: { ok: true, data: row[0] } };
  }],
  ["POST", "/api/games/projects/bulk", async ({ body, actor, env }) => {
    const items = Array.isArray(body.items) ? body.items : [];
    const created = [];
    for (const item of items) {
      const result = await routes.find(route => route[0] === "POST" && route[1] === "/api/games/projects")[2]({ body: item, actor, env });
      created.push(result.payload.data);
    }
    return { status: 201, payload: { ok: true, data: created } };
  }],
  ["GET", "/api/pricing", async ({ env }) => {
    const rules = await query(env, "select * from pricing_rules order by game, service_type, project");
    const approvals = await query(env, "select * from price_reviews order by created_at desc limit 100");
    const mapped = rules.map(rule => ({ ...rule, serviceType: rule.service_type, result: pricingResult(rule), risk: "daily-adjust" }));
    return { ok: true, data: { rules: mapped, approvals, summary: { count: rules.length, updates: mapped.filter(item => item.result.action !== "hold").length, approvalCount: approvals.length } } };
  }],
  ["POST", "/api/pricing", async ({ body, actor, env }) => {
    const rows = await query(env, "select * from pricing_rules where ($1 = '' or game = $1) and ($2 = '' or service_type = $2) and ($3 = '' or project = $3)", [body.scopeMode === "game" || body.scopeMode === "category" ? body.game || "" : "", body.scopeMode === "category" ? body.serviceType || "" : "", body.scopeMode === "item" ? body.project || "" : ""]);
    const approvals = [];
    for (const rule of rows.length ? rows : [{ ...body, market_avg_usd: body.marketAvgUsd || 0, ez_price_usd: body.ezPriceUsd || 0 }]) {
      const result = pricingResult(rule);
      const approval = {
        id: crypto.randomUUID(),
        scopeMode: body.scopeMode || "item",
        game: rule.game || body.game || null,
        serviceType: rule.service_type || body.serviceType || null,
        marketAvgUsd: result.marketAvg,
        oldPriceUsd: result.ezPrice,
        suggestedPriceUsd: result.suggestedUsd,
        reason: body.reason || "daily-market-adjust",
        permission: rule.permission || "admin",
        status: "pending"
      };
      await query(env, `
        insert into price_reviews (id, scope_mode, game, service_type, reason, market_avg_usd, old_ez_price_usd, suggested_ez_price_usd, permission, status)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [approval.id, approval.scopeMode, approval.game, approval.serviceType, approval.reason, approval.marketAvgUsd, approval.oldPriceUsd, approval.suggestedPriceUsd, approval.permission, approval.status]);
      approvals.push(approval);
    }
    await audit(env, actor, "simulate_pricing", "pricing", body.scopeMode || "item");
    return { status: 201, payload: { ok: true, data: { approvals, approval: approvals[0], count: approvals.length } } };
  }],
  ["GET", "/api/frontend-content", async ({ env }) => {
    const rows = await query(env, "select * from frontend_content order by updated_at desc limit 1");
    return { ok: true, data: rows[0]?.payload || {} };
  }],
  ["POST", "/api/frontend-content", async ({ body, actor, env }) => {
    const row = await query(env, "insert into frontend_content (id, payload, updated_by) values ($1, $2, $3) returning *", [crypto.randomUUID(), JSON.stringify(body), actor.account]);
    return { ok: true, data: row[0].payload };
  }],
  ["PATCH", "/api/frontend-content", async () => ({ ok: true, data: { published: true, publishedAt: new Date().toISOString() } })],
  ["GET", "/api/ai/media-platforms", async () => ({ ok: true, data: mediaPlatforms })],
  ["POST", "/api/ai/media-drafts", async ({ body, actor, env }) => {
    const drafts = mediaPlatforms.slice(0, 4).map(platform => ({ platform: platform.name, title: `${body.game || "EZ2GM"} service update`, status: "draft", createdBy: actor.account }));
    await query(env, "insert into media_drafts (id, payload, status, created_by) values ($1, $2, 'draft', $3)", [crypto.randomUUID(), JSON.stringify(drafts), actor.account]);
    return { status: 201, payload: { ok: true, data: drafts } };
  }],
  ["PATCH", "/api/ai/media-drafts", async () => ({ ok: true, data: { approved: true } })],
  ["POST", "/api/ai/media-publish", async ({ actor, env }) => {
    await query(env, "insert into media_publish_logs (id, payload, actor) values ($1, $2, $3)", [crypto.randomUUID(), JSON.stringify({ count: mediaPlatforms.length, status: "queued" }), actor.account]);
    return { ok: true, data: { status: "queued", count: mediaPlatforms.length } };
  }],
  ["GET", "/api/ai/employees", async () => ({ ok: true, data: aiEmployees })],
  ["GET", "/api/ai/sales-intel", async ({ env }) => {
    const opportunities = await query(env, "select * from ai_sales_opportunities order by trade_score desc nulls last limit 20");
    const releases = await query(env, "select * from upcoming_game_releases order by release_date asc nulls last limit 20");
    return { ok: true, data: { opportunities, releases } };
  }],
  ["POST", "/api/ai/sales-launch-plan", async ({ body }) => ({ status: 201, payload: { ok: true, data: { game: body.game || "New Game", actions: ["建立分类", "收集市场价格", "寻找供应商", "准备SEO和短视频素材"], windowDays: 30 } } })],
  ["POST", "/api/ai/business-simulation", async ({ body }) => ({ ok: true, data: { scenario: body.scenario || "standard", days: 200, breakevenDay: 74, finalCashCny: 186000, loopScore: 82 } })],
  ["GET", "/api/ai/business-loop", async () => ({ ok: true, data: { order: "closed", pricing: "daily", support: "covered", finance: "supplier-settlement" } })],
  ["POST", "/api/ai/tasks/assign", async () => ({ ok: true, data: aiEmployees.map(item => ({ employee: item.name, status: "assigned" })) })],
  ["GET", "/api/analytics/realtime", async ({ env }) => {
    const rows = await query(env, "select page, source, action, count(*)::int as count from analytics_events where created_at > now() - interval '24 hours' group by page, source, action order by count desc limit 50");
    return { ok: true, data: { activeUsers: rows.reduce((sum, row) => sum + Number(row.count || 0), 0), events: rows } };
  }],
  ["GET", "/api/analytics/daily", async ({ env }) => {
    const rows = await query(env, "select date_trunc('day', created_at) as day, count(*)::int as views from analytics_events group by 1 order by 1 desc limit 30");
    return { ok: true, data: rows };
  }],
  ["POST", "/api/analytics/event", async ({ body, env }) => {
    await query(env, "insert into analytics_events (id, page, source, action, value, user_code, region, game, status, service) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [crypto.randomUUID(), body.page || "/", body.source || "", body.action || "view", body.value || "", body.userCode || "", body.region || "", body.game || "", body.status || "", body.service || ""]);
    return { status: 201, payload: { ok: true } };
  }],
  ["POST", "/api/payments/:platform/webhook", async ({ params, body, env, request }) => {
    const verification = await verifyPaymentWebhook({ request, params, env });
    if (!verification.ok) return { status: verification.status, payload: { ok: false, error: verification.error } };
    const orderNo = normalizeOrderNo(body.orderNo);
    const orders = orderNo ? await query(env, "select id from orders where order_no = $1 limit 1", [orderNo]) : [];
    await query(env, "insert into payment_webhooks (id, order_id, platform, amount, event_id, verified_at) values ($1,$2,$3,$4,$5,now()) on conflict (event_id) do nothing", [crypto.randomUUID(), orders[0]?.id || null, params.platform, body.amount || "", body.eventId || crypto.randomUUID()]);
    if (orders[0]) await query(env, "update orders set payment_status = 'paid', status = 'pending', updated_at = now() where id = $1", [orders[0].id]);
    return { ok: true, data: { platform: params.platform, orderNo, status: "accepted" } };
  }]
].map(([method, pattern, handler]) => ({ method, pattern, handler }));

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    const url = new URL(request.url);
    const found = findRoute(request.method, url.pathname);
    if (!found) return error("NOT_FOUND", 404, env, undefined, request);

    try {
      const body = await readJson(request);
      let actor = null;
      if (!isPublicRoute(request.method, url.pathname)) {
        const authorization = request.headers.get("authorization") || "";
        const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
        actor = await verifyToken(token, env);
        if (!actor) return error("UNAUTHORIZED", 401, env, undefined, request);
        if (!checkPermission(actor.role, request.method, url.pathname)) return error("FORBIDDEN", 403, env, undefined, request);
      }
      const result = await found.route.handler({ request, env, url, params: found.params, body, actor });
      if (result instanceof Response) return result;
      if (result?.payload) return json(result.payload, result.status || 200, env, request);
      return json(result || { ok: true }, result?.status || 200, env, request);
    } catch (err) {
      return error(err.message || "SERVER_ERROR", err.status || 500, env, undefined, request);
    }
  }
};
