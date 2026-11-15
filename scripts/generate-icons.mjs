// Generates PWA icons from an inline SVG (run: node scripts/generate-icons.mjs)
import sharp from "sharp";
import fs from "node:fs";

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 96}" fill="#064e3b"/>
  <g transform="translate(256 256) scale(${pad ? 0.72 : 1}) translate(-256 -256)">
    <circle cx="256" cy="256" r="150" fill="none" stroke="#d4a73a" stroke-width="10" opacity=".35"/>
    <path d="M300 130a130 130 0 1 0 0 252a110 110 0 1 1 0-252z" fill="#e2bd5f"/>
    <path d="M330 200l12 30 32 2-25 20 9 31-28-18-28 18 9-31-25-20 32-2z" fill="#ecd08c"/>
  </g>
</svg>`;

fs.mkdirSync("public/icons", { recursive: true });
for (const [name, size, pad] of [["icon-192.png", 192, false], ["icon-512.png", 512, false], ["maskable-512.png", 512, true], ["apple-touch-icon.png", 180, false]]) {
  await sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
}
fs.writeFileSync("public/icons/icon.svg", svg(false));
console.log("icons generated");
