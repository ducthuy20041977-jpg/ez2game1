import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabasePool, query } from "../src/db/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationDir = path.resolve(__dirname, "../db/migrations");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const files = (await fs.readdir(migrationDir))
    .filter(file => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationDir, file), "utf8");
    await query(sql);
    console.log(`migrated ${file}`);
  }
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => closeDatabasePool());
