import http from "node:http";
import { config } from "./config.js";
import { sendJson, sendError, readJson, matchPath } from "./lib/http.js";
import { login, logout, authenticate, listSessions, audit } from "./middleware/auth.js";
import { checkApiPermission, listRolePolicies } from "./middleware/permissions.js";
import { getOrder, createOrder, dispatchOrder, supplierOrders } from "./services/order-service.js";
import { getMessages, addMessage, markRead } from "./services/chat-service.js";
import { createUploadRecord } from "./services/upload-service.js";
import { createSignedUpload } from "./services/storage-service.js";
import { processWebhook } from "./services/payment-service.js";
import { getFrontendContent, saveFrontendContent, publishFrontendContent } from "./services/frontend-content-service.js";
import { getMediaPlatforms, generateMediaDraft, approveMediaDrafts, publishMediaDrafts } from "./services/media-publish-service.js";
import { getAiEmployees, assignAiTasks, getAiSalesIntel, generateSalesLaunchPlan } from "./services/ai-workforce-service.js";
import { getRealtimeAnalytics, getDailyAnalytics, recordAnalyticsEvent } from "./services/analytics-service.js";
import { listGameProjects, createGameProject, bulkCreateGameProjects } from "./services/game-project-service.js";
import { getPricingRules, simulatePricing } from "./services/pricing-service.js";
import { runBusinessSimulation, businessLoopAudit } from "./services/business-simulation-service.js";
import { listAccounts, createAccount, updateAccount, deleteAccount } from "./services/account-service.js";
import { sfGames, sfGame, sfCategories, sfProducts, sfProduct, sfCreateOrder } from "./services/storefront-service.js";
import { db } from "./data/mock-db.js";
import { databaseStatus } from "./db/client.js";

const routes = [];

function addRoute(method, pattern, handler, options = {}) {
  routes.push({ method, pattern, handler, public: Boolean(options.public) });
}

addRoute("GET", "/api/health", async () => ({ ok: true, app: config.appName, database: await databaseStatus(), time: new Date().toISOString() }), { public: true });
addRoute("GET", "/api/system/database", async () => ({ ok: true, data: await databaseStatus() }));
addRoute("POST", "/api/auth/login", async ({ body }) => {
  const result = await login(body.account, body.password);
  if (!result) return { status: 401, payload: { ok: false, error: "INVALID_LOGIN" } };
  return { ok: true, token: result.token, actor: result.actor };
}, { public: true });
addRoute("POST", "/api/auth/logout", async ({ req, actor }) => {
  const removed = logout(req);
  audit(actor, "logout", "session", actor.sessionId);
  return { ok: true, removed };
});

// ===== 商城公开接口（买家无需登录）=====
addRoute("GET", "/api/storefront/games", async ({ url }) => {
  const all = await sfGames();
  const hot = url.searchParams.get("hot");
  const data = hot === "true" ? all.filter(g => g.hot) : all;
  return { ok: true, data };
}, { public: true });

addRoute("GET", "/api/storefront/games/:slug", async ({ params }) => {
  const game = await sfGame(params.slug);
  if (!game) return { status: 404, payload: { ok: false, error: "GAME_NOT_FOUND" } };
  return { ok: true, data: game };
}, { public: true });

addRoute("GET", "/api/storefront/categories", async () => ({ ok: true, data: await sfCategories() }), { public: true });

addRoute("GET", "/api/storefront/products", async ({ url }) => {
  const q = Object.fromEntries(url.searchParams.entries());
  return { ok: true, data: await sfProducts(q) };
}, { public: true });

addRoute("GET", "/api/storefront/products/:id", async ({ params }) => {
  const product = await sfProduct(params.id);
  if (!product) return { status: 404, payload: { ok: false, error: "PRODUCT_NOT_FOUND" } };
  return { ok: true, data: product };
}, { public: true });

addRoute("POST", "/api/storefront/orders", async ({ body }) => {
  const record = await sfCreateOrder(body);
  return { status: 201, payload: { ok: true, data: record } };
}, { public: true });

addRoute("GET", "/api/security/policy", async () => ({ ok: true, data: listRolePolicies() }));
addRoute("GET", "/api/security/sessions", async () => ({ ok: true, data: listSessions() }));
addRoute("GET", "/api/accounts", async () => ({ ok: true, data: await listAccounts() }));
addRoute("POST", "/api/accounts", async ({ body, actor }) => {
  const account = await createAccount(body);
  audit(actor, "create_account", "user", account.id, { account: account.account, role: account.role });
  return { status: 201, payload: { ok: true, data: account } };
});
addRoute("PATCH", "/api/accounts/:id", async ({ params, body, actor }) => {
  const account = await updateAccount(params.id, body, actor);
  audit(actor, "update_account", "user", params.id, { role: account.role, status: account.status });
  return { ok: true, data: account };
});
addRoute("DELETE", "/api/accounts/:id", async ({ params, actor }) => {
  const account = await deleteAccount(params.id, actor);
  audit(actor, "delete_account", "user", params.id, { account: account.account, role: account.role });
  return { ok: true, data: account };
});

addRoute("GET", "/api/orders/:orderNo", async ({ params, actor }) => {
  const record = await getOrder(params.orderNo, actor);
  if (!record) return { status: 404, payload: { ok: false, error: "ORDER_NOT_FOUND" } };
  audit(actor, "read_order", "order", params.orderNo);
  return { ok: true, data: record };
});

addRoute("POST", "/api/orders", async ({ body, actor }) => {
  const record = await createOrder(body);
  audit(actor, "create_order", "order", record.order.orderNo);
  return { status: 201, payload: { ok: true, data: record } };
});

addRoute("POST", "/api/orders/:orderNo/dispatch", async ({ params, body, actor }) => {
  const record = await dispatchOrder(params.orderNo, body);
  if (!record) return { status: 404, payload: { ok: false, error: "ORDER_NOT_FOUND" } };
  audit(actor, "dispatch_order", "order", params.orderNo);
  return { ok: true, data: record };
});

addRoute("GET", "/api/chats/:orderNo/messages", async ({ params, actor }) => {
  await markRead(params.orderNo, actor);
  return { ok: true, data: await getMessages(params.orderNo) };
});

addRoute("POST", "/api/chats/:orderNo/messages", async ({ params, body, actor }) => {
  const message = await addMessage(params.orderNo, body.sender || actor.role, body.body || "");
  audit(actor, "send_chat_message", "order", params.orderNo);
  return { status: 201, payload: { ok: true, data: message } };
});

addRoute("PATCH", "/api/chats/:orderNo/read", async ({ params, actor }) => {
  const thread = await markRead(params.orderNo, actor);
  return { ok: true, data: thread };
});

addRoute("POST", "/api/uploads/proofs", async ({ body, actor }) => {
  const record = await createUploadRecord(body, actor);
  audit(actor, "upload_proof", "order", body.orderNo);
  return { status: 201, payload: { ok: true, data: record } };
});

addRoute("POST", "/api/uploads/sign-url", async ({ body, actor }) => {
  const signedUpload = await createSignedUpload(body, actor);
  audit(actor, "create_upload_signature", "order", body.orderNo);
  return { status: 201, payload: { ok: true, data: signedUpload } };
});

addRoute("POST", "/api/payments/:platform/webhook", async ({ params, body, actor }) => {
  const result = await processWebhook(params.platform, body);
  audit(actor, "payment_webhook", "order", body.orderNo, { platform: params.platform });
  return { ok: true, data: result };
}, { public: true });

addRoute("GET", "/api/supplier-settlements", async () => ({ ok: true, data: db.supplierSettlements }));
addRoute("GET", "/api/supplier/orders", async ({ actor }) => ({ ok: true, data: await supplierOrders(actor) }));
addRoute("GET", "/api/supplier/orders/:orderNo", async ({ params, actor }) => {
  const record = await getOrder(params.orderNo, actor);
  if (!record || record.dispatch?.supplier !== actor.supplierCode) {
    return { status: 404, payload: { ok: false, error: "ORDER_NOT_FOUND" } };
  }
  return { ok: true, data: record };
});
addRoute("GET", "/api/supplier/completed", async ({ actor }) => ({
  ok: true,
  data: db.supplierSettlements.filter(item => item.supplierCode === actor.supplierCode)
}));

addRoute("GET", "/api/games/projects", async () => ({ ok: true, data: await listGameProjects() }));
addRoute("POST", "/api/games/projects", async ({ body, actor }) => {
  const project = await createGameProject(body);
  audit(actor, "create_game_project", "game_project", project.project);
  return { status: 201, payload: { ok: true, data: project } };
});
addRoute("POST", "/api/games/projects/bulk", async ({ body, actor }) => {
  const created = await bulkCreateGameProjects(body);
  audit(actor, "bulk_create_game_projects", "game_project", "bulk", { count: created.length });
  return { status: 201, payload: { ok: true, data: created } };
});

addRoute("GET", "/api/pricing", async () => ({ ok: true, data: await getPricingRules() }));
addRoute("POST", "/api/pricing", async ({ body, actor }) => {
  const result = await simulatePricing(body, actor);
  audit(actor, "simulate_pricing", "pricing", result.approval.project, { risk: result.risk, permission: result.approval.permission });
  return { status: 201, payload: { ok: true, data: result } };
});

addRoute("GET", "/api/frontend-content", async () => ({ ok: true, data: getFrontendContent() }));
addRoute("POST", "/api/frontend-content", async ({ body, actor }) => {
  const content = saveFrontendContent(body, actor);
  audit(actor, "save_frontend_content", "frontend", body.scope || "frontend-content");
  return { ok: true, data: content };
});
addRoute("PATCH", "/api/frontend-content", async ({ actor }) => {
  const content = publishFrontendContent(actor);
  audit(actor, "publish_frontend_content", "frontend", "frontend-content");
  return { ok: true, data: content };
});

addRoute("GET", "/api/ai/media-platforms", async () => ({ ok: true, data: getMediaPlatforms() }));
addRoute("POST", "/api/ai/media-drafts", async ({ body, actor }) => {
  const drafts = generateMediaDraft(body, actor);
  audit(actor, "generate_media_draft", "ai_media", body.product || "all");
  return { status: 201, payload: { ok: true, data: drafts } };
});
addRoute("PATCH", "/api/ai/media-drafts", async ({ actor }) => {
  const drafts = approveMediaDrafts(actor);
  audit(actor, "approve_media_draft", "ai_media", "drafts");
  return { ok: true, data: drafts };
});
addRoute("POST", "/api/ai/media-publish", async ({ actor }) => {
  const result = publishMediaDrafts(actor);
  audit(actor, "publish_media_campaign", "ai_media", "one-click", { count: result.log.count });
  return { ok: true, data: result };
});

addRoute("GET", "/api/analytics/realtime", async () => ({ ok: true, data: getRealtimeAnalytics() }));
addRoute("GET", "/api/analytics/daily", async () => ({ ok: true, data: getDailyAnalytics() }));
addRoute("POST", "/api/analytics/event", async ({ body }) => {
  const result = recordAnalyticsEvent(body);
  return { status: 201, payload: { ok: true, data: result } };
}, { public: true });

addRoute("GET", "/api/ai/employees", async () => ({ ok: true, data: getAiEmployees() }));
addRoute("GET", "/api/ai/sales-intel", async () => ({ ok: true, data: getAiSalesIntel() }));
addRoute("POST", "/api/ai/sales-launch-plan", async ({ body, actor }) => {
  const result = generateSalesLaunchPlan(body, actor);
  audit(actor, "generate_sales_launch_plan", "ai_sales", result.opportunity?.game || body.game || "new-game");
  return { status: 201, payload: { ok: true, data: result } };
});
addRoute("POST", "/api/ai/business-simulation", async ({ body, actor }) => {
  const result = runBusinessSimulation(body);
  audit(actor, "run_business_simulation", "ai_sales", body.scenario || "standard", { breakevenDay: result.breakevenDay });
  return { ok: true, data: result };
});
addRoute("GET", "/api/ai/business-loop", async () => ({ ok: true, data: businessLoopAudit() }));
addRoute("POST", "/api/ai/tasks/assign", async ({ actor }) => {
  const tasks = assignAiTasks();
  audit(actor, "assign_ai_tasks", "ai_workforce", "tasks");
  return { ok: true, data: tasks };
});

function findRoute(method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchPath(route.pattern, pathname);
    if (params) return { route, params };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const found = findRoute(req.method, url.pathname);
    if (!found) return sendError(res, 404, "NOT_FOUND");

    const body = ["POST", "PATCH", "PUT"].includes(req.method) ? await readJson(req) : {};
    let actor = null;
    if (!found.route.public) {
      actor = authenticate(req);
      if (!actor) return sendError(res, 401, "UNAUTHORIZED");

      const permission = checkApiPermission(actor.role, req.method, url.pathname);
      if (!permission.allowed) return sendError(res, 403, "FORBIDDEN", permission.reason);
    }

    const result = await found.route.handler({ req, params: found.params, body, actor, url });
    if (result?.payload) return sendJson(res, result.status || 200, result.payload);
    return sendJson(res, result?.status || 200, result);
  } catch (error) {
    return sendError(res, error.status || 500, error.message || "SERVER_ERROR");
  }
});

server.listen(config.port, "127.0.0.1", () => {
  console.log(`${config.appName} running at http://127.0.0.1:${config.port}`);
});
