import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function normalizeIdentity(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(normalizeIdentity(password), salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string) {
  const [algorithm, salt, encoded] = hash.split(":");
  if (algorithm !== "scrypt" || !salt || !encoded) return false;
  const expected = Buffer.from(encoded, "hex");
  const actual = scryptSync(normalizeIdentity(password), salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
