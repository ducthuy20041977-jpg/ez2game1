export const rolePolicies = {
  owner: {
    label: "超级管理员",
    canManageAccounts: true,
    canManageSecurity: true,
    canRevealOrderSecrets: true,
    canManagePayments: true,
    canManageFrontend: true,
    canManageProjects: true,
    canReadFinance: true,
    dataScope: "all",
    guards: ["全部接口", "账号分配", "密钥管理", "审计日志", "订单敏感资料"]
  },
  admin: {
    label: "管理员",
    canManageAccounts: false,
    canManageSecurity: false,
    canRevealOrderSecrets: true,
    canManagePayments: true,
    canManageFrontend: true,
    canManageProjects: true,
    canReadFinance: true,
    dataScope: "operation",
    guards: ["不能管理超级管理员账号", "不能读取系统密钥", "可处理运营订单"]
  },
  service: {
    label: "后端客服",
    canManageAccounts: false,
    canManageSecurity: false,
    canRevealOrderSecrets: true,
    canManagePayments: false,
    canManageFrontend: false,
    canManageProjects: false,
    canReadFinance: false,
    dataScope: "assigned-orders",
    guards: ["只能处理订单和聊天", "不能改价", "不能管理账号"]
  },
  supplier: {
    label: "供应商",
    canManageAccounts: false,
    canManageSecurity: false,
    canRevealOrderSecrets: false,
    canManagePayments: false,
    canManageFrontend: false,
    canManageProjects: false,
    canReadFinance: false,
    dataScope: "assigned-supplier-orders",
    guards: ["只看分配订单", "订单账号密码默认打码", "不能进入客户聊天"]
  },
  sales: {
    label: "Sales",
    canManageAccounts: false,
    canManageSecurity: false,
    canRevealOrderSecrets: false,
    canManagePayments: false,
    canManageFrontend: false,
    canManageProjects: false,
    canReadFinance: false,
    dataScope: "sales-workbench",
    guards: ["sales leads", "launch watch", "promotion drafts"]
  }
};

const apiPermissions = [
  { role: "owner", methods: ["ALL"], routes: ["*"] },
  {
    role: "admin",
    methods: ["GET", "POST", "PATCH"],
    routes: [
      "/api/auth/logout",
      "/api/orders",
      "/api/orders/:orderNo",
      "/api/orders/:orderNo/dispatch",
      "/api/chats/:orderNo/messages",
      "/api/chats/:orderNo/read",
      "/api/uploads/proofs",
      "/api/uploads/sign-url",
      "/api/games/projects",
      "/api/games/projects/bulk",
      "/api/frontend-content",
      "/api/pricing",
      "/api/supplier-settlements",
      "/api/system/database",
      "/api/security/policy",
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
  }
];

function routeMatches(pattern, endpoint) {
  if (pattern === "*") return true;
  const patternParts = pattern.split("/").filter(Boolean);
  const endpointParts = endpoint.split("?")[0].split("/").filter(Boolean);
  if (patternParts.length !== endpointParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(":") || part === endpointParts[index]);
}

export function publicRolePolicy(role) {
  const policy = rolePolicies[role];
  if (!policy) return null;
  const { canManageSecurity, ...publicPolicy } = policy;
  return publicPolicy;
}

export function canRevealOrderSecrets(actor) {
  return Boolean(actor && rolePolicies[actor.role]?.canRevealOrderSecrets);
}

export function listRolePolicies() {
  return Object.fromEntries(
    Object.entries(rolePolicies).map(([role, policy]) => [role, publicRolePolicy(role)])
  );
}

export function checkApiPermission(role, method, endpoint) {
  const rules = apiPermissions.filter(item => item.role === role);
  if (!rules.length) return { allowed: false, reason: "ROLE_NOT_FOUND" };

  const routeMatchesForRole = rules.filter(item => item.routes.some(route => routeMatches(route, endpoint)));
  if (!routeMatchesForRole.length) return { allowed: false, reason: "ROUTE_DENIED" };

  const normalizedMethod = method.toUpperCase();
  const matched = routeMatchesForRole.find(item => item.methods.includes("ALL") || item.methods.includes(normalizedMethod));
  if (!matched) return { allowed: false, reason: "METHOD_DENIED" };

  return { allowed: true, reason: "ALLOW" };
}
