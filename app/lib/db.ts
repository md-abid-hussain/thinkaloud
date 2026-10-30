import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

/** Anything that can run a query: the pool, or a client inside a transaction. */
export type Db = Pick<Pool | PoolClient, "query">;

const store = globalThis as unknown as { __thinkaloudPool?: Pool };

/** One pool per server process. Kept on globalThis so dev reloads don't open new pools. */
export function pool(): Pool {
  if (!store.__thinkaloudPool) {
    store.__thinkaloudPool = new Pool({ connectionString: env.databaseUrl, max: 10 });
  }
  return store.__thinkaloudPool;
}

export async function closePool(): Promise<void> {
  await store.__thinkaloudPool?.end();
  store.__thinkaloudPool = undefined;
}

export async function rows<T extends QueryResultRow>(sql: string, params: unknown[] = [], db: Db = pool()): Promise<T[]> {
  const result = await db.query<T>(sql, params);
  return result.rows;
}

export async function one<T extends QueryResultRow>(sql: string, params: unknown[] = [], db: Db = pool()): Promise<T | null> {
  const result = await db.query<T>(sql, params);
  return result.rows[0] ?? null;
}

export async function tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
