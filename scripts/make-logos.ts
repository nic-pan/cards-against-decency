// Makes the web versions of the logo from the originals in assets/logo/.
// Run again after changing a logo:
//   docker compose exec app npm run make:logos

import { mkdirSync } from "node:fs";
import sharp, { type Color } from "sharp";

// The full logo, made by the designer for each colour mode (1600 x 600).
const WORDMARK_DARK = "assets/logo/Cards/logo-black-bg.png"; // white text, #111111 background
const WORDMARK_LIGHT = "assets/logo/Cards/logo-white-bg.png"; // dark text, white background
const MARK = "assets/logo/card-stack-logo-transparent.png"; // card stack, transparent

mkdirSync("public/logo", { recursive: true });

/**
 * Makes the background transparent. Only pixels connected to the image edge and close to
 * the background colour change, so card outlines and the insides of letters stay intact.
 * "dark" removes a near-black background, "light" a near-white one.
 */
async function transparentBackground(file: string, mode: "dark" | "light", out: string) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  // 0 = exactly the background colour, 1 = clearly not background.
  const distance = (i: number) => {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    // The designer's backgrounds are #111111 and #fefefe, so measure from just beyond those.
    return mode === "dark" ? Math.max(0, Math.max(r, g, b) - 24) / 86 : Math.max(0, 250 - Math.min(r, g, b)) / 60;
  };
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    const d = distance(i);
    if (d >= 1) continue; // the edge of a letter or a card
    // The background becomes transparent; its soft edge becomes partly transparent.
    data[i * 4 + 3] = Math.min(data[i * 4 + 3], Math.round(Math.max(0, d) * 255));
    const x = i % width;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (i >= width) stack.push(i - width);
    if (i < width * (height - 1)) stack.push(i + width);
  }
  await sharp(data, { raw: { width, height, channels: 4 } })
    .resize({ width: 960 })
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(out);
}

// The full logo: one version for each colour mode.
await transparentBackground(WORDMARK_LIGHT, "light", "public/logo/wordmark.webp");
await transparentBackground(WORDMARK_DARK, "dark", "public/logo/wordmark-dark.webp");

// The card stack for headers. Shown at about 32 px, so 128 px is sharp everywhere.
await sharp(MARK).resize({ width: 128 }).webp({ quality: 90 }).toFile("public/logo/mark.webp");

// Browser tab icon. Next.js serves src/app/icon.png as the favicon.
const square = (size: number, padding: number, background: Color) =>
  sharp(MARK)
    .resize({ width: size - padding * 2, height: size - padding * 2, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background })
    .png({ compressionLevel: 9, palette: true });

await square(256, 8, { r: 0, g: 0, b: 0, alpha: 0 }).toFile("src/app/icon.png");

// Home screen icon for iPhones. It must not be transparent, so it gets the dark page colour.
const dark = { r: 23, g: 23, b: 23, alpha: 1 };
await sharp(MARK)
  .flatten({ background: dark })
  .resize({ width: 144, height: 144, fit: "contain", background: dark })
  .extend({ top: 18, bottom: 18, left: 18, right: 18, background: dark })
  .png({ compressionLevel: 9 })
  .toFile("src/app/apple-icon.png");

console.log("Wrote public/logo/wordmark.webp, public/logo/wordmark-dark.webp, public/logo/mark.webp, src/app/icon.png, src/app/apple-icon.png");
