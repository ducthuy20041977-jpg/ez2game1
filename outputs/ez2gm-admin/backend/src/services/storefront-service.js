import { db } from "../data/mock-db.js";
import { hasDatabaseUrl, query } from "../db/client.js";
import { createOrder } from "./order-service.js";

// ===== 工具：把后端 game/serviceType 转成前端商城结构 =====

function gameSlug(game) {
  return String(game || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const SERVICE_CATEGORY = {
  Gold: "gold", Currency: "gold", Item: "gear", Gear: "gear",
  Material: "mats", Blueprint: "blueprint", Boost: "boost",
  Carry: "carry", Escort: "carry", Account: "account", CDK: "account"
};
function toCategoryId(serviceType) {
  return SERVICE_CATEGORY[serviceType] || String(serviceType || "gold").toLowerCase();
}

const CATEGORY_NAME = {
  gold: "游戏金币", gear: "稀有装备", mats: "游戏材料", blueprint: "蓝图配方",
  boost: "专业代练", carry: "陪玩陪跑", account: "游戏账号"
};
const CATEGORY_ICON = {
  gold: "💰", gear: "🗡️", mats: "🧪", blueprint: "📜", boost: "🎮", carry: "🏃", account: "👤"
};

function parsePrice(value) {
  const n = parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// required_fields 字符串 → 动态下单字段数组
function parseFields(requiredFields, servers) {
  const keys = String(requiredFields || "").split(/[,，]/).map(s => s.trim()).filter(Boolean);
  if (keys.length === 0) keys.push("server", "character");
  const labelMap = {
    server: "区服", character: "游戏角色名", quantity: "数量", league: "联盟/赛季",
    difficulty: "难度", time: "时间", note: "备注"
  };
  return keys.map(key => {
    const k = key.toLowerCase();
    if (k === "server" || k === "league") {
      return { key: k === "league" ? "league" : "server", label: labelMap[k] || key, type: "select", required: true, options: servers };
    }
    if (k === "quantity") return { key: "quantity", label: "数量", type: "number", required: true };
    if (k === "note") return { key: "note", label: "备注", type: "textarea", required: false };
    return { key: k.replace(/\s+/g, "_"), label: labelMap[k] || key, type: "text", required: true };
  });
}

function imageUrl(raw) {
  if (!raw) return "";
  if (/^https?:\/\//.test(raw)) return raw;
  const base = process.env.R2_PUBLIC_BASE_URL || process.env.UPLOAD_BASE_URL || "";
  return base ? `${base.replace(/\/+$/, "")}/${raw.replace(/^\/+/, "")}` : raw;
}

function makeId(prefix, value) {
  return `${prefix}_${String(value).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase()}`;
}

// 后端为每个游戏自定义的平台/区服（预留配置，可接入配置表）
const GAME_PLATFORMS = {};
const GAME_SERVERS = {};
function platformsFor(game) { return GAME_PLATFORMS[game] || ["PC"]; }
function serversFor(game) { return GAME_SERVERS[game] || []; }

// 取所有上架的 game_projects（含定价）
async function loadProjects() {
  if (hasDatabaseUrl()) {
    const result = await query(`
      select gp.game, gp.project, gp.service_type, gp.frontend_price, gp.status, gp.image_url, gp.required_fields,
             pr.ez_price_usd
      from game_projects gp
      left join pricing_rules pr
        on pr.game = gp.game and pr.project = gp.project and pr.service_type = gp.service_type
      where gp.status = 'active'
      order by gp.game, gp.service_type, gp.project
    `);
    return result.rows.map(r => ({
      game: r.game, project: r.project, serviceType: r.service_type,
      frontendPrice: r.frontend_price, status: r.status, imageUrl: r.image_url,
      requiredFields: r.required_fields, ezPriceUsd: r.ez_price_usd
    }));
  }
  return (db.gameProjects || [])
    .filter(p => p.status === "active")
    .map(p => {
      const rule = (db.pricingRules || []).find(r => r.game === p.game && r.project === p.project);
      return { ...p, ezPriceUsd: rule ? rule.ezPriceUsd : undefined };
    });
}

async function buildGames() {
  const projects = await loadProjects();
  const byGame = new Map();
  for (const p of projects) {
    const slug = gameSlug(p.game);
    if (!byGame.has(slug)) {
      byGame.set(slug, {
        slug, name: p.game, cover: "🎮", tagline: "", hot: true,
        platforms: platformsFor(p.game), servers: serversFor(p.game),
        categories: new Map(), serverFirst: false
      });
    }
    const g = byGame.get(slug);
    const catId = toCategoryId(p.serviceType);
    if (!g.categories.has(catId)) {
      g.categories.set(catId, { id: catId, name: CATEGORY_NAME[catId] || p.serviceType, icon: CATEGORY_ICON[catId] || "🎮" });
    }
  }
  return [...byGame.values()].map(g => ({ ...g, categories: [...g.categories.values()] }));
}

function toSfProduct(p) {
  const catId = toCategoryId(p.serviceType);
  return {
    id: makeId("sfp", `${p.game}_${p.project}`),
    gameSlug: gameSlug(p.game), game: p.game,
    category: catId, categoryName: CATEGORY_NAME[catId] || p.serviceType,
    name: p.project,
    price: p.ezPriceUsd != null ? Number(p.ezPriceUsd) : parsePrice(p.frontendPrice),
    image: imageUrl(p.imageUrl),
    stock: 999, rating: 4.9, sales: 0,
    fields: parseFields(p.requiredFields, serversFor(p.game))
  };
}

// ===== 对外服务 =====

export async function sfGames() {
  return buildGames();
}

export async function sfGame(slug) {
  const games = await buildGames();
  return games.find(g => g.slug === slug) || null;
}

export async function sfCategories() {
  if (hasDatabaseUrl()) {
    const result = await query("select name from service_types where status = 'active' order by name");
    return result.rows.map(r => {
      const catId = toCategoryId(r.name);
      return { id: catId, name: CATEGORY_NAME[catId] || r.name, icon: CATEGORY_ICON[catId] || "🎮" };
    });
  }
  return (db.serviceTypes || []).map(s => {
    const catId = toCategoryId(s.name);
    return { id: catId, name: CATEGORY_NAME[catId] || s.name, icon: CATEGORY_ICON[catId] || "🎮" };
  });
}

export async function sfProducts(qparams = {}) {
  const projects = await loadProjects();
  let list = projects.map(toSfProduct);

  if (qparams.gameSlug) list = list.filter(p => p.gameSlug === qparams.gameSlug);
  if (qparams.category) list = list.filter(p => p.category === qparams.category);
  if (qparams.keyword) {
    const kw = String(qparams.keyword).toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(kw));
  }
  const min = parseFloat(qparams.minPrice);
  const max = parseFloat(qparams.maxPrice);
  if (Number.isFinite(min)) list = list.filter(p => p.price >= min);
  if (Number.isFinite(max)) list = list.filter(p => p.price <= max);

  const sort = qparams.sort;
  list.sort((a, b) => sort === "priceAsc" ? a.price - b.price : sort === "priceDesc" ? b.price - a.price : b.sales - a.sales);

  const page = Math.max(1, parseInt(qparams.page, 10) || 1);
  const pageSize = Math.max(1, parseInt(qparams.pageSize, 10) || 15);
  const total = list.length;
  const start = (page - 1) * pageSize;
  return { list: list.slice(start, start + pageSize), total, page, pageSize };
}

export async function sfProduct(productId) {
  const projects = await loadProjects();
  const list = projects.map(toSfProduct);
  return list.find(p => p.id === productId) || null;
}

// 商城下单 —— 复用现有 createOrder（含账号/密码加密）
export async function sfCreateOrder(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const first = items[0] || {};
  return createOrder({
    customer: payload.email || "",
    game: payload.game || first.game || "",
    project: items.length > 1 ? `${items.length} items` : (first.name || ""),
    gameId: payload.gameId || payload.character || "",
    account: payload.account || "",
    password: payload.password || "",
    payment: "paid",
    items: items.map(it => ({ name: it.name, server: it.server || "", qty: String(it.qty || ""), price: String(it.price || "") }))
  });
}