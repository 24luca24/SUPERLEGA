import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
// Next.js already includes Sharp; this script only packages the supplied image.
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
const sharp = nextRequire("sharp");
const source = "logo-superlega.PNG";
const background = "#0f1117";
await mkdir("public/icons", { recursive: true });
async function icon(size, fraction = 0.9) {
  const inner = Math.round(size * fraction);
  const photo = await sharp(source).rotate().resize(inner, inner, { fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background } })
    .composite([{ input: photo, gravity: "center" }]).flatten({ background }).png({ compressionLevel: 9 }).toBuffer();
}
await writeFile("public/icons/superlega-192.png", await icon(192));
await writeFile("public/icons/superlega-512.png", await icon(512));
// A portrait fitted to 64% height stays inside Android's central safe circle.
await writeFile("public/icons/superlega-maskable-512.png", await icon(512, 0.64));
await writeFile("src/app/apple-icon.png", await icon(180));
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => icon(size)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  header[entry] = size; header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(images[index].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += images[index].length;
}
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...images]));
console.log("Icone Superlega generate dall’immagine originale: Android, iPhone e favicon.");
