import "server-only";
import { Pool } from "pg";

const globalDb = globalThis as unknown as { superlegaPool?: Pool };
export function database() {
  if (!process.env.CONNECTION_STRING) throw new Error("CONNECTION_STRING non configurata.");
  if (!globalDb.superlegaPool) globalDb.superlegaPool = new Pool({ connectionString: process.env.DB_PASSWORD ? process.env.CONNECTION_STRING.replace(/\[(?:YOUR-PASSWORD|PASSWORD)\]/g, encodeURIComponent(process.env.DB_PASSWORD)) : process.env.CONNECTION_STRING, max: 5, connectionTimeoutMillis: 8000 });
  return globalDb.superlegaPool;
}
