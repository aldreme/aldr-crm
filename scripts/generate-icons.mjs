// Generate PNG app icons (apple-touch-icon, favicon-32, manifest icons) from the
// same geometry as public/favicon.svg (blue rounded square + white table grid).
// Run: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BLUE = [37, 99, 235]; // #2563eb
const WHITE = [255, 255, 255];

// Normalized geometry (matches favicon.svg on a 32x32 canvas).
const CORNER_R = 7 / 32;
const TBL = { x1: 7 / 32, y1: 8 / 32, x2: 25 / 32, y2: 24 / 32 };
const STROKE = 2 / 32;

function inRoundedRect(x, y) {
  const cx = 0.5;
  const cy = 0.5;
  const px = Math.max(Math.abs(x - cx) - (0.5 - CORNER_R), 0);
  const py = Math.max(Math.abs(y - cy) - (0.5 - CORNER_R), 0);
  return px * px + py * py <= CORNER_R * CORNER_R;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function onTableLine(x, y) {
  const half = STROKE / 2;
  const { x1, y1, x2, y2 } = TBL;
  return (
    distToSegment(x, y, x1, y1, x2, y1) <= half ||
    distToSegment(x, y, x1, y2, x2, y2) <= half ||
    distToSegment(x, y, x1, y1, x1, y2) <= half ||
    distToSegment(x, y, x2, y1, x2, y2) <= half ||
    distToSegment(x, y, x1, 13 / 32, x2, 13 / 32) <= half ||
    distToSegment(x, y, 12.5 / 32, y1, 12.5 / 32, y2) <= half ||
    distToSegment(x, y, 18 / 32, y1, 18 / 32, y2) <= half
  );
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const o = (y * size + x) * 4;
      if (!inRoundedRect(nx, ny)) continue; // transparent
      const [r, g, b] = onTableLine(nx, ny) ? WHITE : BLUE;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + stride)] = 0; // filter none
    rgba.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const targets = [
  ["public/apple-touch-icon.png", 180],
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/favicon-32x32.png", 32],
];

for (const [path, size] of targets) {
  writeFileSync(path, encodePNG(size, size, drawIcon(size)));
  console.log(`wrote ${path} (${size}x${size})`);
}
