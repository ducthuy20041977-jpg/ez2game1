import crypto from "node:crypto";
import { db } from "../data/mock-db.js";
import { hasDatabaseUrl, query } from "../db/client.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundMarketPrice(value) {
  const price = Math.max(Number(value || 0), 0);
  return Number(price.toFixed(2));
}

export function calculateDailyPrice(rule = {}) {
  const marketAvg = Number(rule.marketAvgUsd || 0);
  const marketLow = Number(rule.marketLowUsd || marketAvg);
  const marketHigh = Number(rule.marketHighUsd || marketAvg);
  const ezPrice = Number(rule.ezPriceUsd || 0);
  const targetGapPct = Number(rule.targetGapPct || 0);
  const dailyLimitPct = Number(rule.dailyLimitPct || 0);
  const targetPrice = marketAvg * (1 + targetGapPct / 100);
  const marketBounded = clamp(targetPrice, marketLow * 0.98, marketHigh * 1.02);
  const dailyMove = dailyLimitPct ? ezPrice * (dailyLimitPct / 100) : 0;
  const dailyLimited = dailyMove ? clamp(marketBounded, ezPrice - dailyMove, ezPrice + dailyMove) : ezPrice;
  const suggestedUsd = roundMarketPrice(dailyLimited);
  const gapPct = marketAvg ? ((ezPrice - marketAvg) / marketAvg) * 100 : 0;
  const suggestedGapPct = marketAvg ? ((suggestedUsd - marketAvg) / marketAvg) * 100 : 0;
  const changeUsd = Number((suggestedUsd - ezPrice).toFixed(2));
  const changePct = ezPrice ? (changeUsd / ezPrice) * 100 : 0;
  const action = Math.abs(changeUsd) < 0.05 ? "hold" : (changeUsd > 0 ? "raise" : "lower");
  return { marketAvg, marketLow, marketHigh, ezPrice, targetPrice, suggestedUsd, gapPct, suggestedGapPct, changeUsd, changePct, action };
}

function riskFor(rule, result = calculateDailyPrice(rule)) {
  if (result.ezPrice > result.marketHigh * 1.02) return "above-market";
  if (result.ezPrice < result.marketLow * 0.95) return "too-low";
  if (Math.abs(result.gapPct - Number(rule.targetGapPct || 0)) > 2) return "off-strategy";
  return result.action === "hold" ? "ok" : "daily-adjust";
}

function calculateScopedPrice(rule = {}, payload = {}) {
  const strategy = payload.strategy || "market";
  const targetGapPct = Number(payload.targetGapPct ?? rule.targetGapPct ?? 0);
  const dailyLimitPct = Number(payload.dailyLimitPct ?? rule.dailyLimitPct ?? 0);
  if (strategy === "market") return calculateDailyPrice({ ...rule, targetGapPct, dailyLimitPct });

  const marketAvg = Number(rule.marketAvgUsd || 0);
  const marketLow = Number(rule.marketLowUsd || marketAvg);
  const marketHigh = Number(rule.marketHighUsd || marketAvg);
  const ezPrice = Number(rule.ezPriceUsd || 0);
  const manualPct = Math.abs(Number(payload.manualPct || 0));
  const direction = strategy === "raise" ? 1 : (strategy === "lower" ? -1 : 0);
  const desired = ezPrice * (1 + (manualPct * direction) / 100);
  const dailyMove = dailyLimitPct ? ezPrice * (dailyLimitPct / 100) : Math.abs(desired - ezPrice);
  const suggestedUsd = roundMarketPrice(clamp(desired, ezPrice - dailyMove, ezPrice + dailyMove));
  const gapPct = marketAvg ? ((ezPrice - marketAvg) / marketAvg) * 100 : 0;
  const suggestedGapPct = marketAvg ? ((suggestedUsd - marketAvg) / marketAvg) * 100 : 0;
  const changeUsd = Number((suggestedUsd - ezPrice).toFixed(2));
  const changePct = ezPrice ? (changeUsd / ezPrice) * 100 : 0;
  const action = Math.abs(changeUsd) < 0.05 ? "hold" : (changeUsd > 0 ? "raise" : "lower");
  return { marketAvg, marketLow, marketHigh, ezPrice, targetPrice: desired, suggestedUsd, gapPct, suggestedGapPct, changeUsd, changePct, action };
}

function selectScopedRules(payload = {}) {
  if (payload.scopeMode === "game") return db.pricingRules.filter(item => item.game === payload.game);
  if (payload.scopeMode === "category") {
    return db.pricingRules.filter(item => item.game === payload.game && item.serviceType === payload.serviceType);
  }
  const base = db.pricingRules.find(item => item.project === payload.project);
  return base ? [base] : [{ project: payload.project || "Custom Project", ...payload }];
}

function pricingRuleFromRow(row) {
  return {
    id: row.id,
    game: row.game,
    project: row.project,
    serviceType: row.service_type,
    region: row.region,
    marketAvgUsd: Number(row.market_avg_usd || 0),
    marketLowUsd: Number(row.market_low_usd || 0),
    marketHighUsd: Number(row.market_high_usd || 0),
    ezPriceUsd: Number(row.ez_price_usd || 0),
    yesterdayEzPriceUsd: Number(row.yesterday_ez_price_usd || 0),
    targetGapPct: Number(row.target_gap_pct || 0),
    dailyLimitPct: Number(row.daily_limit_pct || 0),
    strategy: row.strategy,
    mode: row.mode,
    permission: row.permission,
    sources: Number(row.source_count || 0),
    lastScanAt: row.last_scan_at
  };
}

export async function getPricingRules() {
  if (hasDatabaseUrl()) {
    const ruleRows = await query("select * from pricing_rules order by game, service_type, project");
    const approvalRows = await query("select * from price_reviews order by created_at desc limit 100");
    const rules = ruleRows.rows.map(pricingRuleFromRow).map(rule => ({
      ...rule,
      result: calculateDailyPrice(rule),
      risk: riskFor(rule)
    }));
    const categoryMap = new Map();
    rules.forEach(rule => {
      const key = `${rule.game}__${rule.serviceType}`;
      const current = categoryMap.get(key) || { game: rule.game, serviceType: rule.serviceType, count: 0, updates: 0 };
      current.count += 1;
      if (rule.result.action !== "hold") current.updates += 1;
      categoryMap.set(key, current);
    });
    const approvals = approvalRows.rows.map(row => ({
      id: row.id,
      project: row.pricing_rule_id || row.game || "Custom Project",
      scopeMode: row.scope_mode,
      game: row.game,
      serviceType: row.service_type,
      marketAvgUsd: Number(row.market_avg_usd || 0),
      oldPriceUsd: Number(row.old_ez_price_usd || 0),
      suggestedPriceUsd: Number(row.suggested_ez_price_usd || 0),
      gapPct: Number(row.old_gap_pct || 0),
      suggestedGapPct: Number(row.suggested_gap_pct || 0),
      reason: row.reason,
      permission: row.permission,
      status: row.status,
      createdAt: row.created_at
    }));
    return {
      rules,
      categories: [...categoryMap.values()],
      marketSources: db.marketSources,
      dailyPriceRules: db.dailyPriceRules,
      approvals,
      summary: {
        count: rules.length,
        updates: rules.filter(rule => rule.result.action !== "hold").length,
        alerts: rules.filter(rule => rule.risk !== "ok").length,
        approvalCount: approvals.length
      }
    };
  }

  const rules = db.pricingRules.map(rule => ({
    ...rule,
    result: calculateDailyPrice(rule),
    risk: riskFor(rule)
  }));
  const categoryMap = new Map();
  rules.forEach(rule => {
    const key = `${rule.game}__${rule.serviceType}`;
    const current = categoryMap.get(key) || { game: rule.game, serviceType: rule.serviceType, count: 0, updates: 0 };
    current.count += 1;
    if (rule.result.action !== "hold") current.updates += 1;
    categoryMap.set(key, current);
  });
  return {
    rules,
    categories: [...categoryMap.values()],
    marketSources: db.marketSources,
    dailyPriceRules: db.dailyPriceRules,
    approvals: db.pricingApprovals,
    summary: {
      count: rules.length,
      updates: rules.filter(rule => rule.result.action !== "hold").length,
      alerts: rules.filter(rule => rule.risk !== "ok").length,
      approvalCount: db.pricingApprovals.length
    }
  };
}

export async function simulatePricing(payload = {}, actor) {
  let scopedRules = selectScopedRules(payload);
  if (hasDatabaseUrl()) {
    if (payload.scopeMode === "game") {
      scopedRules = (await query("select * from pricing_rules where game = $1", [payload.game])).rows.map(pricingRuleFromRow);
    } else if (payload.scopeMode === "category") {
      scopedRules = (await query("select * from pricing_rules where game = $1 and service_type = $2", [payload.game, payload.serviceType])).rows.map(pricingRuleFromRow);
    } else {
      scopedRules = (await query("select * from pricing_rules where project = $1 limit 1", [payload.project])).rows.map(pricingRuleFromRow);
    }
  }
  const rules = scopedRules.length ? scopedRules : [{ project: payload.project || "Custom Project", ...payload }];
  const approvals = rules.map(base => {
    const rule = { ...base, ...payload };
    const result = calculateScopedPrice(rule, payload);
    const risk = riskFor(rule, result);
    return {
    id: crypto.randomUUID(),
    project: rule.project || "Custom Project",
    scopeMode: payload.scopeMode || "item",
    game: rule.game,
    serviceType: rule.serviceType,
    marketAvgUsd: result.marketAvg,
    oldPriceUsd: result.ezPrice,
    suggestedPriceUsd: result.suggestedUsd,
    gapPct: result.gapPct,
    suggestedGapPct: result.suggestedGapPct,
    reason: payload.reason || risk,
    permission: rule.permission || "admin",
    status: "pending",
    createdBy: actor.account,
    createdAt: new Date().toISOString()
  };
  });

  if (hasDatabaseUrl()) {
    for (const approval of approvals) {
      await query(`
        insert into price_reviews (
          id, pricing_rule_id, scope_mode, game, service_type, reason, market_avg_usd,
          old_ez_price_usd, suggested_ez_price_usd, old_gap_pct, suggested_gap_pct,
          permission, status, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        approval.id,
        approval.id.startsWith("pricing_") ? approval.id : null,
        approval.scopeMode,
        approval.game || null,
        approval.serviceType || null,
        approval.reason,
        approval.marketAvgUsd,
        approval.oldPriceUsd,
        approval.suggestedPriceUsd,
        approval.gapPct,
        approval.suggestedGapPct,
        approval.permission,
        approval.status,
        approval.createdAt
      ]);
    }
    return { approvals, approval: approvals[0], risk: approvals[0]?.reason || "daily-adjust", count: approvals.length };
  }

  db.pricingApprovals.unshift(...approvals);
  return { approvals, approval: approvals[0], risk: approvals[0]?.reason || "daily-adjust", count: approvals.length };
}
