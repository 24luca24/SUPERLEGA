export const MAX_AVATAR_BYTES = 4 * 1024 * 1024;
export function avatarType(bytes: Uint8Array, maxBytes = MAX_AVATAR_BYTES): { mime: string; extension: string } {
  if (!bytes.length || bytes.length > maxBytes) throw new Error("La foto supera il limite consentito.");
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return { mime: "image/png", extension: "png" };
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && text(0,4) === "RIFF" && text(8,12) === "WEBP") return { mime: "image/webp", extension: "webp" };
  throw new Error("Sono ammesse foto JPG, PNG o WebP.");
}
