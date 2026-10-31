import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool, tx } from "./db";

// Read from disk at startup, not bundled; the deploy ships db/migrations next to the app.
const MIGRATIONS_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "db", "migrations");

/** Applies db/migrations/*.sql in name order, each once, each in its own transaction. */
export async function migrate(dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await pool().query(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = new Set(
    (await pool().query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name),
  );
  const files = (await readdir(/*turbopackIgnore: true*/ dir)).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(/*turbopackIgnore: true*/ dir, file), "utf8");
    await tx(async (client) => {
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1)", [file]);
    });
    ran.push(file);
  }
  return ran;
}
