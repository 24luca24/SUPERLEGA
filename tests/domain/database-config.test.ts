import { describe, expect, it } from "vitest";
import { databaseConfig } from "@/lib/server/database-config";

describe("database connection management", () => {
  const connection = "postgresql://postgres.project:password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require";
  it("uses the Supabase transaction pooler on Vercel with a bounded pool", () => {
    const config = databaseConfig({ CONNECTION_STRING: connection, VERCEL: "1" });
    expect(new URL(config.connectionString!).port).toBe("6543");
    expect(config.max).toBe(2);
    expect(config.idleTimeoutMillis).toBe(5000);
  });
  it("preserves local and non-Supabase connection settings", () => {
    expect(new URL(databaseConfig({ CONNECTION_STRING: connection }).connectionString!).port).toBe("5432");
    expect(new URL(databaseConfig({ CONNECTION_STRING: "postgresql://test:test@localhost:5432/db", VERCEL: "1" }).connectionString!).port).toBe("5432");
  });
  it("encodes the database password and preserves TLS", () => {
    const config = databaseConfig({ CONNECTION_STRING: connection.replace("password", "[YOUR-PASSWORD]"), DB_PASSWORD: "a@b/c?d" });
    const url = new URL(config.connectionString!);
    expect(decodeURIComponent(url.password)).toBe("a@b/c?d");
    expect(url.searchParams.get("sslmode")).toBe("require");
  });
});
