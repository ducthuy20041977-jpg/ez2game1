import { db } from "../data/mock-db.js";

function targetPlatforms(target) {
  if (String(target).includes("TikTok")) return ["TikTok", "YouTube Shorts"];
  if (String(target).includes("Facebook")) return ["Facebook Reels/Page", "Threads"];
  if (String(target).includes("Reddit")) return ["Reddit", "Telegram Channel"];
  if (String(target).includes("Twitch")) return ["Twitch Clips", "Kick Clips"];
  if (String(target).includes("Discord")) return ["Discord", "X"];
  if (String(target).includes("Blog")) return ["Blog", "Email"];
  return db.mediaPlatforms.map(item => item.platform);
}

export function getMediaPlatforms() {
  return db.mediaPlatforms;
}

export function generateMediaDraft(payload, actor) {
  const product = payload.product || "Diablo 4 Gold";
  const mediaType = payload.mediaType || "短视频";
  const script = payload.script || "Fast delivery, order tracking, and manual support.";
  const platforms = targetPlatforms(payload.target || "全平台");
  db.mediaDrafts = platforms.map(platform => ({
    platform,
    product,
    mediaType,
    title: `${product} Fast Delivery | EZ2GM`,
    script,
    status: "review",
    createdBy: actor.account,
    createdAt: new Date().toISOString()
  }));
  return db.mediaDrafts;
}

export function approveMediaDrafts(actor) {
  db.mediaDrafts = db.mediaDrafts.map(item => ({
    ...item,
    status: "approved",
    approvedBy: actor.account,
    approvedAt: new Date().toISOString()
  }));
  return db.mediaDrafts;
}

export function publishMediaDrafts(actor) {
  if (!db.mediaDrafts.length) {
    generateMediaDraft({}, actor);
    approveMediaDrafts(actor);
  }
  db.mediaDrafts = db.mediaDrafts.map(item => ({
    ...item,
    status: "published",
    publishedBy: actor.account,
    publishedAt: new Date().toISOString(),
    externalId: `${item.platform.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`
  }));
  const log = {
    count: db.mediaDrafts.length,
    platforms: db.mediaDrafts.map(item => item.platform),
    actor: actor.account,
    createdAt: new Date().toISOString()
  };
  db.mediaPublishLogs.unshift(log);
  return { drafts: db.mediaDrafts, log };
}
