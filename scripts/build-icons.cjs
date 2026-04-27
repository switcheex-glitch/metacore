// Generates assets/icon.png (1024) + assets/icon.ico (16/32/48/64/128/256)
// from src/assets/logo.svg. Run with: node scripts/build-icons.cjs
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const pngToIco = require("png-to-ico").default ?? require("png-to-ico");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src/assets/logo.svg");
const OUT_DIR = path.join(ROOT, "assets");

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const svg = fs.readFileSync(SRC);

  // 1024 PNG master
  const master = path.join(OUT_DIR, "icon.png");
  await sharp(svg, { density: 1024 })
    .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toFile(master);
  console.log("wrote", master);

  // Multi-size PNG buffers for ICO
  const sizes = [16, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(
    sizes.map((s) =>
      sharp(svg, { density: s * 2 })
        .resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 1 } })
        .png()
        .toBuffer(),
    ),
  );
  const icoPath = path.join(OUT_DIR, "icon.ico");
  fs.writeFileSync(icoPath, await pngToIco(buffers));
  console.log("wrote", icoPath);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
