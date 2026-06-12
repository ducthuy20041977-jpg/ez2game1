import { db } from "../data/mock-db.js";

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loopScore() {
  const rows = db.businessLoopCheckpoints || [];
  const score = rows.reduce((sum, item) => {
    if (item.status === "closed") return sum + 1;
    if (item.status === "partial") return sum + 0.5;
    return sum;
  }, 0);
  return Math.round((score / Math.max(rows.length, 1)) * 100);
}

export function runBusinessSimulation(payload = {}) {
  const scenarioKey = payload.scenario || "standard";
  const scenario = db.businessSimulationPresets[scenarioKey] || db.businessSimulationPresets.standard;
  const initialCost = num(payload.initialCost, 18000);
  const monthlyFixed = num(payload.monthlyFixed, 3800);
  const baseAds = num(payload.dailyAds, 160);
  const startVisits = num(payload.startVisits, 320);
  const avgOrderUsd = num(payload.avgOrderUsd, 29);
  const netMarginPct = num(payload.netMarginPct, 35);
  const conversionPct = num(payload.conversionPct, 0.9);
  const fx = num(payload.fx, 7.2);
  const days = [];
  let cumulativeCash = -initialCost;
  let dailyProfitDay = null;
  let breakevenDay = null;

  for (let day = 1; day <= 200; day += 1) {
    const launchMultiplier = day >= scenario.launchBoostDay ? 1 + Math.min((day - scenario.launchBoostDay) * 0.006, 0.42) : 1;
    const visits = Math.round(startVisits * Math.pow(1 + scenario.growthPct / 100, day - 1) * launchMultiplier);
    const conversion = (conversionPct + Math.min(day * scenario.conversionLiftPct / 200, scenario.conversionLiftPct)) / 100;
    const orders = Math.max(visits * conversion, 0);
    const revenueCny = orders * avgOrderUsd * fx;
    const grossProfitCny = revenueCny * (netMarginPct / 100);
    const refundDrag = revenueCny * (scenario.refundDragPct / 100);
    const adSpend = baseAds * (1 + Math.min(day / 200, 1) * scenario.adScalePct);
    const fixedDaily = monthlyFixed / 30;
    const dailyNet = grossProfitCny - refundDrag - adSpend - fixedDaily;
    cumulativeCash += dailyNet;
    if (!dailyProfitDay && dailyNet > 0) dailyProfitDay = day;
    if (!breakevenDay && cumulativeCash > 0) breakevenDay = day;
    days.push({ day, visits, orders, revenueCny, dailyNet, cumulativeCash });
  }

  const summaryDays = [1, 15, 30, 45, 60, 90, 120, 150, 180, 200].map(day => days[day - 1]);
  return {
    scenario: scenario.label,
    dailyProfitDay,
    breakevenDay,
    final: days[199],
    loopScore: loopScore(),
    summaryDays,
    assumptions: { initialCost, monthlyFixed, baseAds, startVisits, avgOrderUsd, netMarginPct, conversionPct, fx }
  };
}

export function businessLoopAudit() {
  return {
    score: loopScore(),
    checkpoints: db.businessLoopCheckpoints
  };
}
