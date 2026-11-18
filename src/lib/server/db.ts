import "server-only";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { databaseConfig } from "./database-config";

const globalDb = globalThis as unknown as { superlegaPool?: Pool };
export function database() {
  if (!globalDb.superlegaPool) {
    const pool = new Pool(databaseConfig());
    // An idle socket error must not become an unhandled event that kills the app.
    pool.on("error", (error) => console.error("Database idle connection error", { code: (error as { code?: string }).code ?? "unknown" }));
    if (process.env.VERCEL) attachDatabasePool(pool);
    globalDb.superlegaPool = pool;
  }
  return globalDb.superlegaPool;
}
