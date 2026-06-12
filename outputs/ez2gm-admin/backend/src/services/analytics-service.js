import { db } from "../data/mock-db.js";

export function getRealtimeAnalytics() {
  const visitors = db.analytics.visitors;
  const events = db.analytics.events;
  return {
    metrics: {
      liveViews: events.length,
      onlineUsers: visitors.length,
      cartUsers: visitors.filter(item => item.status === "cart").length,
      supportUsers: visitors.filter(item => item.status === "manual-support").length
    },
    visitors,
    events
  };
}

export function getDailyAnalytics() {
  return db.analytics.daily;
}

export function recordAnalyticsEvent(payload) {
  const event = {
    time: new Date().toISOString(),
    page: payload.page || "unknown",
    source: payload.source || "direct",
    action: payload.action || "view",
    value: payload.value || "normal"
  };
  db.analytics.events.unshift(event);
  db.analytics.events = db.analytics.events.slice(0, 100);

  const visitor = {
    user: payload.user || `V-${Math.floor(1000 + Math.random() * 8999)}`,
    region: payload.region || "US",
    game: payload.game || "Unknown",
    status: payload.status || "viewing",
    service: payload.service || "ai-watch",
    updatedAt: event.time
  };
  db.analytics.visitors.unshift(visitor);
  db.analytics.visitors = db.analytics.visitors.slice(0, 100);
  return { event, visitor };
}
