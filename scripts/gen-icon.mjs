// Generates scripts/icon-source.png — a 1024x1024 routing-glyph icon (dark
// gradient + hub-and-spoke nodes). Used as input for `tauri icon`.
import zlib from "node:zlib";
import fs from "node:fs";

const S = 1024;

const table = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const px = Buffer.alloc(S * S * 4);
function set(x, y, r, g, b, a = 255) {
  const i = (y * S + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}
const lerp = (a, b, t) => a + (b - a) * t;

// base vertical gradient #131722 -> #0a0d14 with a violet radial glow
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const v = y / S;
    let r = lerp(19, 10, v);
    let g = lerp(23, 13, v);
    let b = lerp(34, 20, v);
    const d = Math.hypot(x - S / 2, y - S / 2) / (S * 0.78);
    if (d < 1) {
      const glow = 1 - d;
      r += glow * 42;
      g += glow * 26;
      b += glow * 76;
    }
    set(x, y, Math.min(255, r | 0), Math.min(255, g | 0), Math.min(255, b | 0));
  }
}

function fillCircle(cx, cy, rad, r, g, b, a) {
  const r2 = rad * rad;
  for (let y = cy - rad; y <= cy + rad; y++) {
    for (let x = cx - rad; x <= cx + rad; x++) {
      if (x < 0 || y < 0 || x >= S || y >= S) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) set(x, y, r, g, b, a);
    }
  }
}
function fillLine(x0, y0, x1, y1, w, r, g, b, a) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const step = w / 2 / len; // overlapping stamps
  for (let t = 0; t <= 1; t += step) fillCircle(x0 + dx * t, y0 + dy * t, w / 2, r, g, b, a);
}

// hub-and-spoke routing glyph
const cx = S / 2;
const cy = S / 2;
const spokes = [
  [cx, cy - 252],
  [cx - 218, cy + 126],
  [cx + 218, cy + 126],
];
for (const [sx, sy] of spokes) fillLine(cx, cy, sx, sy, 15, 255, 255, 255, 140);
fillCircle(cx, cy, 48, 255, 255, 255, 235);
for (const [sx, sy] of spokes) fillCircle(sx, sy, 40, 255, 255, 255, 215);

fs.mkdirSync("scripts", { recursive: true });
fs.writeFileSync("scripts/icon-source.png", encodePNG(S, S, px));
console.log("wrote scripts/icon-source.png");
