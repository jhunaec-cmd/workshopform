// One-off helper: draws the app icon (amber square with "AEC" + "WORKSHOP")
// as an SVG and saves the PNG sizes phones/PCs need. Run with: npm run icons
const path = require("path");
const sharp = require("sharp");

const OUT = path.join(__dirname, "..", "public", "assets", "icons");

// scale < 1 shrinks the text so it stays inside the "safe zone" of
// maskable icons (Android crops those into circles/squircles).
const svg = ({ rounded, scale }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 96 : 0}" fill="#f0a500"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <text x="256" y="270" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
      font-weight="700" font-size="190" fill="#1d1a14">AEC</text>
    <rect x="96" y="312" width="320" height="10" rx="5" fill="#1d1a14"/>
    <text x="256" y="390" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
      font-weight="700" font-size="54" letter-spacing="10" fill="#1d1a14">WORKSHOP</text>
  </g>
</svg>`;

const jobs = [
  { file: "icon-192.png", size: 192, rounded: true, scale: 1 },
  { file: "icon-512.png", size: 512, rounded: true, scale: 1 },
  { file: "icon-maskable-512.png", size: 512, rounded: false, scale: 0.75 },
  { file: "apple-touch-icon.png", size: 180, rounded: false, scale: 0.9 },
  { file: "favicon-32.png", size: 32, rounded: true, scale: 1 },
];

(async () => {
  for (const { file, size, rounded, scale } of jobs) {
    await sharp(Buffer.from(svg({ rounded, scale }))).resize(size, size).png().toFile(path.join(OUT, file));
    console.log("made", file);
  }
})();
