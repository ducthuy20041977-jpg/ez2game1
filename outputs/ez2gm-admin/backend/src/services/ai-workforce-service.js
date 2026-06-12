import { db } from "../data/mock-db.js";

function employeeForTask(task) {
  const text = `${task.type} ${task.name} ${task.target}`.toLowerCase();
  if (/销售|购物车|复购|促单|新游|发布|交易|类目|supplier|release|trade|category/.test(text)) return "AI销售专员";
  if (/营销|发布|短视频|平台|seo|blog|discord|telegram/.test(text)) return "AI营销专员";
  if (/内容|博客|faq|标题|文案/.test(text)) return "AI内容专员";
  if (/浏览|停留|数据|日报|analytics|traffic/.test(text)) return "AI数据分析师";
  if (/客服|售后|人工|support|chat/.test(text)) return "AI客服助手";
  if (/风险|敏感|风控|risk|tos|anti-cheat/.test(text)) return "AI风控专员";
  return "AI运营经理";
}

export function getAiEmployees() {
  return db.aiEmployees;
}

export function assignAiTasks() {
  db.aiTasks = db.aiTasks.map(task => ({ ...task, employee: employeeForTask(task) }));
  return db.aiTasks;
}

export function getAiSalesIntel() {
  return {
    opportunities: db.newGameOpportunities,
    upcomingReleases: db.upcomingReleases,
    tradeSignals: db.tradeSignals,
    launchActions: db.salesLaunchActions,
    summary: {
      opportunities: db.newGameOpportunities.length,
      upcoming: db.upcomingReleases.length,
      averageScore: Math.round(
        db.newGameOpportunities.reduce((sum, item) => sum + Number(item.score || 0), 0) / Math.max(db.newGameOpportunities.length, 1)
      ),
      prebuild: db.salesLaunchActions.length || db.newGameOpportunities.filter(item => Number(item.score) >= 75).length
    }
  };
}

export function generateSalesLaunchPlan(payload = {}, actor) {
  const target = payload.game || db.newGameOpportunities.find(item => Number(item.score) >= 80)?.game;
  const opportunity = db.newGameOpportunities.find(item => item.game === target) || db.newGameOpportunities[0];
  if (!opportunity) return { actions: [], tasks: [] };

  db.salesLaunchActions = [
    { action: "create-game-category", target: opportunity.game, owner: "AI销售专员", status: "pending" },
    { action: "create-product-drafts", target: opportunity.services, owner: "AI内容专员", status: "pending" },
    { action: "supplier-quote", target: opportunity.game, owner: "AI运营经理", status: "queued" },
    { action: "seo-warmup-page", target: `${opportunity.game} trading`, owner: "AI营销专员", status: "pending" },
    { action: "risk-check", target: opportunity.genre, owner: "AI风控专员", status: "queued" }
  ];

  const tasks = db.salesLaunchActions.map((action, index) => ({
    id: `TASK-SALES-${Date.now()}-${index}`,
    employee: action.owner,
    type: "AI销售",
    name: action.action,
    target: action.target,
    mode: "manual-review",
    status: action.status,
    createdBy: actor.account,
    createdAt: new Date().toISOString()
  }));
  db.aiTasks.unshift(...tasks);
  return { opportunity, actions: db.salesLaunchActions, tasks };
}
