import { db } from "../data/mock-db.js";

export function getFrontendContent() {
  return db.frontendContent;
}

export function saveFrontendContent(payload, actor) {
  if (Array.isArray(payload.modules)) db.frontendContent.modules = payload.modules;
  if (Array.isArray(payload.seo)) db.frontendContent.seo = payload.seo;
  db.frontendContent.publishQueue.unshift({
    scope: payload.scope || "frontend-content",
    status: "pending",
    owner: actor.account,
    createdAt: new Date().toISOString()
  });
  return db.frontendContent;
}

export function publishFrontendContent(actor) {
  db.frontendContent.publishQueue = db.frontendContent.publishQueue.map(item => ({
    ...item,
    status: "published",
    publishedBy: actor.account,
    publishedAt: new Date().toISOString()
  }));
  db.frontendContent.modules = db.frontendContent.modules.map(item => ({ ...item, status: "published" }));
  db.frontendContent.seo = db.frontendContent.seo.map(item => ({ ...item, status: "published" }));
  return db.frontendContent;
}
