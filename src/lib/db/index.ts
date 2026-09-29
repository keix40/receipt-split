import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * node-postgres works with both Neon (use the *pooled* connection string) and
 * Render Postgres, so switching providers is just a DATABASE_URL change.
 * The pool is cached on globalThis to survive hot reloads in dev.
 */
const globalForDb = globalThis as unknown as { pgPool?: Pool };

function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  globalForDb.pgPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return globalForDb.pgPool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export { schema };
