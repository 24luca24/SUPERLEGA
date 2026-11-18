import type { PoolConfig } from "pg";

export function databaseConfig(env: Record<string, string | undefined> = process.env): PoolConfig {
  if (!env.CONNECTION_STRING) throw new Error("CONNECTION_STRING non configurata.");
  const url = new URL(env.DB_PASSWORD
    ? env.CONNECTION_STRING.replace(/\[(?:YOUR-PASSWORD|PASSWORD)\]/g, encodeURIComponent(env.DB_PASSWORD))
    : env.CONNECTION_STRING);
  // Supavisor transaction mode shares backend connections across Vercel instances.
  // Keep local tools and non-Supabase endpoints on their configured port.
  if (env.VERCEL && url.hostname.endsWith(".pooler.supabase.com") && url.port === "5432") url.port = "6543";
  return {
    connectionString: url.toString(), max: 2, min: 0,
    idleTimeoutMillis: 5000, connectionTimeoutMillis: 10000,
    statement_timeout: 15000, application_name: "superlega",
  };
}
