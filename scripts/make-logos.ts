// Makes the web versions of the logo from the originals in assets/logo/.
// Run again after changing a logo:
//   docker compose exec app npm run make:logos

import { mkdirSync } from "node:fs";
import sharp, { type Color } from "sharp";

const WORDMARK = "assets/logo/big-logo.png"; // 1600 x 600, black background
const MARK = "assets/logo/card-stack-logo-transparent.png"; // card stack, transparent

mkdirSync("public/logo", { recursive: true });

// The full logo for the front page. 960 px wide is sharp on high-density screens at 480 px.
await sharp(WORDMARK).resize({ width: 960 }).webp({ quality: 88 }).toFile("public/logo/wordmark.webp");

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

console.log("Wrote public/logo/wordmark.webp, public/logo/mark.webp, src/app/icon.png, src/app/apple-icon.png");
