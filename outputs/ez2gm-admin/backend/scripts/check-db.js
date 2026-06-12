import { closeDatabasePool, query } from "../src/db/client.js";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to check database.");

  const pingStartedAt = Date.now();
  await query("select 1 as ok");
  const pingMs = Date.now() - pingStartedAt;
  const tables = await query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `);
  const counts = {};
  for (const table of ["users", "orders", "order_items", "chat_threads", "game_projects", "pricing_rules"]) {
    try {
      const result = await query(`select count(*)::int as count from ${table}`);
      counts[table] = result.rows[0].count;
    } catch {
      counts[table] = null;
    }
  }

  console.log(JSON.stringify({
    connected: true,
    pingMs,
    tables: tables.rows.map(row => row.table_name),
    counts
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => closeDatabasePool());
