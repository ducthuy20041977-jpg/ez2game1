import { Pool } from "pg";

let pool = null;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!hasDatabaseUrl()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX || 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
  }
  return pool;
}

export async function query(text, params = []) {
  const activePool = getPool();
  if (!activePool) return null;
  return activePool.query(text, params);
}

export async function closeDatabasePool() {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export async function checkDatabaseConnection() {
  if (!hasDatabaseUrl()) return { connected: false, latencyMs: null };
  const startedAt = Date.now();
  await query("select 1 as ok");
  return { connected: true, latencyMs: Date.now() - startedAt };
}

export async function databaseStatus() {
  const configured = hasDatabaseUrl();
  let connection = { connected: false, latencyMs: null };
  if (configured) {
    try {
      connection = await checkDatabaseConnection();
    } catch (error) {
      connection = { connected: false, latencyMs: null, error: error.message };
    }
  }
  return {
    mode: configured ? "postgres" : "memory",
    provider: configured ? "PostgreSQL" : "In-memory mock database",
    connected: configured ? connection.connected : true,
    latencyMs: connection.latencyMs,
    note: configured
      ? (connection.connected ? "DATABASE_URL is configured and reachable." : `DATABASE_URL is configured but not reachable: ${connection.error || "unknown error"}`)
      : "No DATABASE_URL configured. API is using mock data for local development."
  };
}

export async function createDatabaseClient() {
  return getPool();
}

export const sqlFiles = {
  init: "db/migrations/001_init.sql"
};
