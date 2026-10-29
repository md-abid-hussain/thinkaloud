// One small query interface over two drivers: node-postgres on Zerops (DATABASE_URL set) and PGlite locally.
// Both return { rows }, which is the shape the shared recipes in vendor/db/support expect.
import "server-only";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export interface Q {
  query<T = Record<string, any>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface Driver extends Q {
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
}

const g = globalThis as unknown as { __taDriver?: Promise<Driver>; __taReady?: Promise<void> };

async function pgDriver(url: string): Promise<Driver> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 10 });
  return {
    query: (text, params) => pool.query(text, params as any[]) as any,
    exec: async (sql) => { await pool.query(sql); },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn({ query: (t, p) => client.query(t, p as any[]) as any });
        await client.query("commit");
        return out;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

async function pgliteDriver(dir: string): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  mkdirSync(path.dirname(dir), { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  return {
    query: (text, params) => db.query(text, params as any[]) as any,
    exec: async (sql) => { await db.exec(sql); },
    tx: (fn) => db.transaction((t) => fn({ query: (q, p) => t.query(q, p as any[]) as any })),
  };
}

function driver(): Promise<Driver> {
  g.__taDriver ??= process.env.DATABASE_URL
    ? pgDriver(process.env.DATABASE_URL)
    : pgliteDriver(process.env.PGLITE_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data", "pglite"));
  return g.__taDriver;
}

const root = () => /*turbopackIgnore: true*/ process.cwd();
const read = (...p: string[]) => readFileSync(path.join(/*turbopackIgnore: true*/ root(), ...p), "utf8");

// Loads the shared schema and seeds into an empty database, then applies the app's own migrations.
async function setup(d: Driver) {
  const { rows } = await d.query<{ t: string | null }>(`select to_regclass('public.challenge')::text as t`);
  if (!rows[0].t) {
    for (const f of ["schema.sql", "seed_reference.sql", "seed_challenges.sql", "seed_content.sql"]) {
      await d.exec(read("vendor", "db", f));
    }
    console.log("[db] loaded schema and seeds");
  }
  await d.exec(`create table if not exists app_migration (name text primary key, applied_at timestamptz not null default now())`);
  const dir = path.join(/*turbopackIgnore: true*/ root(), "db", "migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const done = await d.query(`select 1 from app_migration where name = $1`, [f]);
    if (done.rows.length) continue;
    await d.exec(read("db", "migrations", f));
    await d.query(`insert into app_migration (name) values ($1)`, [f]);
    console.log(`[db] applied ${f}`);
  }
}

async function ready(): Promise<Driver> {
  const d = await driver();
  g.__taReady ??= setup(d).catch((e) => {
    g.__taReady = undefined; // a failed setup is retried on the next request
    throw e;
  });
  await g.__taReady;
  return d;
}

export async function query<T = Record<string, any>>(text: string, params?: unknown[]) {
  return (await ready()).query<T>(text, params);
}
export async function rows<T = Record<string, any>>(text: string, params?: unknown[]) {
  return (await query<T>(text, params)).rows;
}
export async function one<T = Record<string, any>>(text: string, params?: unknown[]): Promise<T | undefined> {
  return (await query<T>(text, params)).rows[0];
}
export async function tx<T>(fn: (q: Q) => Promise<T>) {
  return (await ready()).tx(fn);
}
export { ready as dbReady };
