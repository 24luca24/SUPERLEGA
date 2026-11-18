import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { database } from "./db";
import { hashPassword, normalizeIdentity, verifyPassword } from "./password";

export const sessionCookie = "superlega_session";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const dummyHash = hashPassword(randomBytes(32).toString("hex"));
export interface CurrentUser { id: string; player_id: string | null; username: string; legacy_name: string; is_admin: boolean; avatar_key: string | null }

export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await database().query<CurrentUser>(`select u.id, u.player_id, u.username, u.legacy_name, u.is_admin, u.avatar_key
    from public.user_sessions s join public.users u on u.id=s.user_id
    where s.token_hash=$1 and s.expires_at > now() and u.enabled`, [digest(token)]);
  return result.rows[0] ?? null;
});
export async function login(username: string, password: string) {
  const result = await database().query(`select id, password_hash from public.users where username_norm=$1 and enabled`, [normalizeIdentity(username)]);
  const row = result.rows[0];
  if (!verifyPassword(password, row?.password_hash ?? dummyHash) || !row) return false;
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await database().query(`insert into public.user_sessions(token_hash,user_id,expires_at) values($1,$2,$3)`, [digest(token), row.id, expires]);
  (await cookies()).set(sessionCookie, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires });
  return true;
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(sessionCookie)?.value;
  if (token) await database().query("delete from public.user_sessions where token_hash=$1", [digest(token)]);
  jar.delete(sessionCookie);
}
export { isSameOrigin, redirectUrl } from "@/lib/domain/request-origin";
