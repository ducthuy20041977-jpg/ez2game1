export const db = {
  users: [
    {
      id: "u_owner",
      account: "owner@ez",
      passwordHash: "pbkdf2_sha256$210000$d92sYvsbFhvuvecg5jYu4g$zUUaX5q6MEwnyE8bNSqX5I_1msIlxqzUt7sj9BAoxF8",
      role: "owner",
      status: "active",
      note: "老板本人，最高权限账号",
      lastLoginAt: null,
      failedLoginCount: 0,
      lockedUntil: null
    },
    {
      id: "u_admin",
      account: "admin01",
      passwordHash: "pbkdf2_sha256$210000$z2MWulOGcWTHNZWyKP3fTA$OL1qXPB4_rpFP80Zq3zQdLSSpTTLUzmClM5Ikp65Lf0",
      role: "admin",
      status: "active",
      note: "运营管理员，负责订单、项目、价格",
      lastLoginAt: null,
      failedLoginCount: 0,
      lockedUntil: null
    },
    {
      id: "u_service",
      account: "service01",
      passwordHash: "pbkdf2_sha256$210000$mO74tR7D1CvPh528GFq7bw$UVAYOF-XnXnoZlp1kdq8iNCKLk1vr8YnVGDid0UTGiM",
      role: "service",
      status: "active",
      note: "白班客服，负责D4和POE2",
      lastLoginAt: null,
      failedLoginCount: 0,
      lockedUntil: null
    },
    {
      id: "u_supplier",
      account: "supplier-a",
      passwordHash: "pbkdf2_sha256$210000$51ftJyPkujJT4szXeo6NJQ$mLlDksv4DcTZwUlk9YF9gOKWaSk4dLtsl-qnjq4JNBg",
      role: "supplier",
      status: "active",
      supplierCode: "Supplier A",
      note: "老王供货组，D4金币供应商",
      lastLoginAt: null,
      failedLoginCount: 0,
      lockedUntil: null
    }
  ],

  orders: {
    EZ2606111008: {
      orderNo: "EZ2606111008",
      customer: "mike@example.com",
      game: "Diablo 4",
      project: "Gold 100M",
      gameId: "MikeD4#8821",
      account: "mike.game@mail.com",
      password: "D4-Mike-8821",
      status: "after-sales",
      payment: "Stripe paid",
      agent: "Sarah",
      supplier: "Supplier A",
      profit: "35.2%"
    },
    EZ2606111012: {
      orderNo: "EZ2606111012",
      customer: "amy@example.com",
      game: "Diablo 4",
      project: "Multi item order",
      gameId: "D4-Amy-4509",
      account: "amy.game@mail.com",
      password: "D4-Amy-4509",
      status: "pending",
      payment: "Crypto pending",
      agent: "service01",
      supplier: "system-dispatching",
      profit: "34.1%"
    }
  },

  orderItems: {
    EZ2606111008: [
      { name: "Gold 100M", server: "US/Eternal", qty: "100M", price: "$19.99", supplierPrice: "88", status: "supplier-processing" }
    ],
    EZ2606111012: [
      { name: "Gold 300M", server: "US/Season", qty: "300M", price: "$120.00", supplierPrice: "264", status: "dispatching" },
      { name: "Legendary Item", server: "US/Season", qty: "1", price: "$24.00", supplierPrice: "58", status: "dispatching" }
    ]
  },

  dispatches: {
    EZ2606111008: { mode: "supplier-dispatch", service: "Sarah", supplier: "Supplier A", deadline: "20 minutes", lock: "service-locked" },
    EZ2606111012: { mode: "same-game-multi-item", service: "service01", supplier: "system-dispatching", deadline: "50 minutes", lock: "unclaimed" }
  },

  chatThreads: {
    EZ2606111008: {
      orderNo: "EZ2606111008",
      owner: "service01",
      customerOnline: true,
      unread: 1,
      messages: [
        {
          sender: "customer",
          body: "Hi, my order is paid. When will the gold arrive?",
          translatedBody: "My order is paid. When will the gold arrive?",
          createdAt: new Date().toISOString()
        },
        {
          sender: "service",
          body: "I am checking it now.",
          translatedBody: "I am checking it now.",
          createdAt: new Date().toISOString()
        }
      ]
    }
  },

  uploads: [],
  paymentWebhooks: [],
  auditLogs: [],

  supplierSettlements: [
    { supplier: "Supplier A Team", supplierCode: "Supplier A", count: 18, amountCny: 8986, deductionCny: 0, payableCny: 8986, status: "pending" },
    { supplier: "POE2 Team", supplierCode: "Supplier B", count: 11, amountCny: 3642, deductionCny: 120, payableCny: 3522, status: "pending" }
  ],

  gameProjects: [
    { game: "Diablo 4", project: "Gold 100M", serviceType: "Gold", frontendPrice: "$19.99", backendPrice: "$12.20", mode: "semi-auto", status: "active", imageUrl: "assets/projects/service-gold.png", requiredFields: "server, character, quantity" },
    { game: "Diablo 4", project: "Legendary Item", serviceType: "Item", frontendPrice: "$24.00", backendPrice: "$8.10", mode: "manual-confirm", status: "active", imageUrl: "assets/projects/service-gear.png", requiredFields: "server, item name, character" },
    { game: "Path of Exile 2", project: "Divine Orb", serviceType: "Currency", frontendPrice: "$9.99", backendPrice: "$5.80", mode: "manual", status: "active", imageUrl: "assets/projects/service-gold.png", requiredFields: "server, league, quantity" },
    { game: "World of Warcraft", project: "Raid Boost", serviceType: "Boost", frontendPrice: "$78.00", backendPrice: "$53.00", mode: "manual", status: "draft", imageUrl: "assets/projects/service-carry.png", requiredFields: "server, difficulty, time" }
  ],
  serviceTypes: [
    { name: "Gold", dispatch: "auto-or-service", status: "active" },
    { name: "Item", dispatch: "service-confirm", status: "active" },
    { name: "Boost", dispatch: "manual-confirm", status: "active" },
    { name: "Escort", dispatch: "schedule-confirm", status: "active" },
    { name: "CDK", dispatch: "auto-delivery", status: "active" }
  ],

  marketSources: [
    { name: "IGMM", status: "connected", updateCycle: "daily" },
    { name: "U4GM", status: "connected", updateCycle: "daily" },
    { name: "Manual Market Check", status: "manual", updateCycle: "daily" }
  ],
  dailyPriceRules: [
    { name: "single-item", rule: "item market vs EZ price", status: "active" },
    { name: "category", rule: "service type adjustment", status: "active" },
    { name: "whole-game", rule: "game wide adjustment", status: "active" }
  ],
  pricingRules: [
    { game: "Diablo 4", serviceType: "Gold", project: "Gold 100M", marketAvgUsd: 20.6, marketLowUsd: 18.8, marketHighUsd: 22.4, ezPriceUsd: 19.99, targetGapPct: -3, dailyLimitPct: 5, permission: "admin" },
    { game: "Diablo 4", serviceType: "Item", project: "Legendary Item", marketAvgUsd: 25.5, marketLowUsd: 22.0, marketHighUsd: 28.0, ezPriceUsd: 24.0, targetGapPct: -4, dailyLimitPct: 6, permission: "admin" },
    { game: "Path of Exile 2", serviceType: "Currency", project: "Divine Orb", marketAvgUsd: 10.8, marketLowUsd: 9.2, marketHighUsd: 12.1, ezPriceUsd: 9.99, targetGapPct: -5, dailyLimitPct: 5, permission: "admin" },
    { game: "World of Warcraft", serviceType: "Boost", project: "Raid Boost", marketAvgUsd: 82.0, marketLowUsd: 74.0, marketHighUsd: 90.0, ezPriceUsd: 78.0, targetGapPct: -3, dailyLimitPct: 4, permission: "owner" }
  ],
  pricingApprovals: [],

  frontendContent: {
    modules: [
      { page: "home", module: "hero", title: "EZ2GM Game Services", status: "draft", imageUrl: "assets/frontend/hero.png" },
      { page: "game", module: "product-card", title: "Gold, items, boost, CDK", status: "draft", imageUrl: "assets/frontend/products.png" }
    ],
    seo: [
      { page: "diablo-4-gold", title: "Diablo 4 Gold Delivery", status: "draft" },
      { page: "poe2-currency", title: "POE2 Currency Service", status: "draft" }
    ],
    publishQueue: []
  },

  mediaPlatforms: [
    { platform: "TikTok", api: "short-video", status: "ready" },
    { platform: "YouTube Shorts", api: "short-video", status: "ready" },
    { platform: "Facebook Reels/Page", api: "social", status: "ready" },
    { platform: "Instagram Reels", api: "social", status: "ready" },
    { platform: "Reddit", api: "community", status: "manual-review" },
    { platform: "Discord", api: "community", status: "manual-review" },
    { platform: "Blog", api: "cms", status: "ready" },
    { platform: "Email", api: "email", status: "ready" }
  ],
  mediaDrafts: [],
  mediaPublishLogs: [],

  analytics: {
    visitors: [
      { user: "V-1001", region: "US", game: "Diablo 4", status: "viewing", service: "Gold", updatedAt: new Date().toISOString() },
      { user: "V-1002", region: "CA", game: "POE2", status: "cart", service: "Currency", updatedAt: new Date().toISOString() },
      { user: "V-1003", region: "GB", game: "WOW", status: "manual-support", service: "Boost", updatedAt: new Date().toISOString() }
    ],
    events: [
      { time: new Date().toISOString(), page: "/diablo-4-gold", source: "google", action: "view", value: "normal" },
      { time: new Date().toISOString(), page: "/checkout", source: "direct", action: "cart", value: "high" }
    ],
    daily: {
      todayViews: 4820,
      uniqueUsers: 1348,
      avgStaySeconds: 86,
      bounceRate: "38%",
      conversionRate: "1.8%",
      rows: [
        { date: "2026-06-10", views: 3920, users: 1110, staySeconds: 74, conversionRate: "1.4%" },
        { date: "2026-06-11", views: 4410, users: 1268, staySeconds: 81, conversionRate: "1.6%" },
        { date: "2026-06-12", views: 4820, users: 1348, staySeconds: 86, conversionRate: "1.8%" }
      ]
    }
  },

  aiEmployees: [
    { name: "AI Operations Manager", role: "operations-lead", data: "business-summary", status: "online" },
    { name: "AI Sales Specialist", role: "sales", data: "new-game-radar", status: "online" },
    { name: "AI Marketing Specialist", role: "marketing", data: "media-platforms", status: "online" },
    { name: "AI Finance Analyst", role: "finance", data: "supplier-settlement", status: "online" },
    { name: "AI Support Assistant", role: "support", data: "chat-routing", status: "online" }
  ],
  aiTasks: [
    { id: "TASK-1", employee: "AI Sales Specialist", type: "sales", name: "new-game-check", target: "Chrono Odyssey", mode: "manual-review", status: "queued" },
    { id: "TASK-2", employee: "AI Marketing Specialist", type: "marketing", name: "publish-short-video", target: "Diablo 4 Gold", mode: "manual-review", status: "queued" },
    { id: "TASK-3", employee: "AI Finance Analyst", type: "finance", name: "supplier-settlement", target: "Supplier A", mode: "manual-review", status: "queued" }
  ],
  newGameOpportunities: [
    { game: "Chrono Odyssey", genre: "MMORPG", score: 87, releaseWindow: "30 days", services: "Gold, Boost, Items" },
    { game: "Dune Awakening", genre: "Survival MMO", score: 78, releaseWindow: "30 days", services: "Resources, Boost" },
    { game: "Blue Protocol Star Resonance", genre: "Anime MMO", score: 74, releaseWindow: "45 days", services: "Currency, Items" }
  ],
  upcomingReleases: [
    { game: "Chrono Odyssey", date: "2026-07-02", risk: "medium", action: "prebuild-category" },
    { game: "Dune Awakening", date: "2026-07-08", risk: "medium", action: "supplier-quote" }
  ],
  tradeSignals: [
    { signal: "player-trade", weight: 30, status: "positive" },
    { signal: "auction-house", weight: 20, status: "watching" },
    { signal: "boost-demand", weight: 25, status: "positive" }
  ],
  salesLaunchActions: [],

  businessLoopCheckpoints: [
    { step: "new-game-discovery", status: "closed", ownerAction: "review high-score games" },
    { step: "frontend-listing", status: "closed", ownerAction: "approve content" },
    { step: "market-pricing", status: "closed", ownerAction: "approve daily price" },
    { step: "ai-marketing", status: "closed", ownerAction: "approve publish queue" },
    { step: "payment", status: "closed", ownerAction: "verify payment keys" },
    { step: "dispatch-delivery", status: "closed", ownerAction: "watch supplier SLA" },
    { step: "support-chat", status: "closed", ownerAction: "arrange service schedule" },
    { step: "finance-settlement", status: "closed", ownerAction: "settle supplier payroll" },
    { step: "reinvestment", status: "partial", ownerAction: "increase ads after profit" }
  ],
  businessSimulationPresets: {
    conservative: { label: "conservative", growthPct: 1.05, conversionLiftPct: 0.35, refundDragPct: 2.8, adScalePct: 0.35, launchBoostDay: 45 },
    standard: { label: "standard", growthPct: 1.25, conversionLiftPct: 0.55, refundDragPct: 2.2, adScalePct: 0.55, launchBoostDay: 35 },
    aggressive: { label: "aggressive", growthPct: 1.55, conversionLiftPct: 0.75, refundDragPct: 2.6, adScalePct: 0.85, launchBoostDay: 25 }
  }
};
