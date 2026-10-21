// AssemblyScript -> plain, scalar WebAssembly. No imports, GC, per-frame
// allocations or relaxed floating-point math. The JS implementation is the oracle.
const MAX_PIXELS: i32 = 640 * 480;
const IMAGE: usize = memory.data(MAX_PIXELS * 4);
const MASK: usize = memory.data(MAX_PIXELS);
const QUEUE: usize = memory.data(MAX_PIXELS * 4);
const RESULT: usize = memory.data(24 * 6 * 8);
// Two-bit classification of the finite Y/Cb/Cr domain: 0/1/2 are proved
// constant across the entire fractional UV cell; 3 requests exact evaluation.
// 4 MiB, no quantization: interpolated chroma retains its 1/16-byte precision.
// UV-major layout keeps the 256 possible lumas of one chroma pair in 64 bytes.
const YUV_COLORS: usize = memory.data(256 * 256 * 64);
let cachedYuvFormat: i32 = -1;

export function imagePointer(): usize { return IMAGE; }
export function resultPointer(): usize { return RESULT; }
let pinkGreen: bool = false;
export function setPinkGreen(enabled: i32): void {
  if (pinkGreen !== (enabled !== 0)) cachedYuvFormat = -1;
  pinkGreen = enabled !== 0;
}
// Native NV12 is copied directly from the camera into IMAGE. No RGBA image,
// GPU colour-conversion pass or second JS -> WASM copy. BT.709 SDR only.
let inputFormat: i32 = 0; // 0 RGBA, 1 BGRA, 2 NV12 limited, 3 NV12 full
export function setInputFormat(format: i32): void {
  inputFormat = format;
  if (format < 2 || cachedYuvFormat === format) return;
  if (!pinkGreen) { memory.fill(YUV_COLORS, 255, 256 * 256 * 64); cachedYuvFormat = format; return; }
  for (let u = 0; u < 256; u++) for (let v = 0; v < 256; v++) {
    const scale: f64 = format === 2 ? 255.0 / 224.0 : 1;
    const cb: f64 = <f64>u - 128, cr: f64 = <f64>v - 128;
    const ro = 1.5748 * scale * cr, go = -.1873242729306488 * scale * cb - .4681242729306488 * scale * cr;
    const bo = 1.8556 * scale * cb;
    const roMax = 1.5748 * scale * min(127, cr + 1);
    const goMin = -.1873242729306488 * scale * min(127, cb + 1) - .4681242729306488 * scale * min(127, cr + 1);
    const boMax = 1.8556 * scale * min(127, cb + 1);
    const row = YUV_COLORS + ((u << 8) | v) * 64;
    for (let luma = 0; luma < 256; luma += 4) {
      let packed = 0;
      for (let lane = 0; lane < 4; lane++) {
        const yy: f64 = format === 2 ? (<f64>(luma + lane) - 16) * (255.0 / 219.0) : <f64>(luma + lane);
        const r0=byte(yy+ro),r1=byte(yy+roMax),g0=byte(yy+goMin),g1=byte(yy+go),b0=byte(yy+bo),b1=byte(yy+boMax);
        const pink = r0>65 && b0>35 && r0>g1*1.4+15 && b0>g1*1.05+5 && r0>b1*.7;
        const green = g0>60 && g0>r1*1.35+15 && g0>b1*1.2+10;
        const noPink = r1<=65 || b1<=35 || r1<=g0*1.4+15 || b1<=g0*1.05+5 || r1<=b0*.7;
        const noGreen = g1<=60 || g1<=r0*1.35+15 || g1<=b0*1.2+10;
        const c: i32 = pink ? 1 : green ? 2 : noPink && noGreen ? 0 : 3;
        packed |= c << (lane * 2);
      }
      store<u8>(row + (luma >> 2), packed);
    }
  }
  cachedYuvFormat = format;
}

@inline
function classifyRGB(r: f64, g: f64, b: f64): i32 {
  if (pinkGreen) {
    if (r > 65 && b > 35 && r > g * 1.4 + 15 && b > g * 1.05 + 5 && r > b * .7) return 1;
    if (g > 60 && g > r * 1.35 + 15 && g > b * 1.2 + 10) return 2;
    return 0;
  }
  if (r > 65 && b > 65 && r > g * 1.5 + 15 && b > g * 1.35 + 15 && r < b * 2.5 && b < r * 2.5) return 1;
  if (g > 65 && b > 65 && g > r * 1.45 + 15 && b > r * 1.45 + 15 && g < b * 2.2 && b < g * 2.2) return 2;
  return 0;
}

@inline
function color(p: usize): i32 {
  if (load<u8>(p + 3) < 128) return 0;
  const r = <f64>load<u8>(p), g = <f64>load<u8>(p + 1), b = <f64>load<u8>(p + 2);
  return inputFormat === 1 ? classifyRGB(b, g, r) : classifyRGB(r, g, b);
}

@inline
function byte(v: f64): f64 { return min(255, max(0, Math.floor(v + .5))); }

@inline
function classifyYUV(luma: i32, u16: i32, v16: i32): i32 {
  const uv = ((u16 >> 4) << 8) | (v16 >> 4);
  const c = (<i32>load<u8>(YUV_COLORS + uv * 64 + (luma >> 2)) >> ((luma & 3) * 2)) & 3;
  if (c !== 3) return c;
  const scale: f64 = inputFormat === 2 ? 255.0 / 224.0 : 1;
  const yy = inputFormat === 2 ? (<f64>luma - 16) * (255.0 / 219.0) : <f64>luma;
  const cb = <f64>u16 / 16 - 128, cr = <f64>v16 / 16 - 128;
  return classifyRGB(byte(yy + 1.5748 * scale * cr),
    byte(yy - .1873242729306488 * scale * cb - .4681242729306488 * scale * cr),
    byte(yy + 1.8556 * scale * cb));
}

@inline
function colorNV12(x: i32, y: i32, w: i32, h: i32): i32 {
  const uv = IMAGE + w * h + (y >> 1) * w + (x & ~1);
  const luma = <i32>load<u8>(IMAGE + y * w + x);
  // Centred chroma siting: 3/4 current + 1/4 neighbouring sample per axis,
  // matching the browser's bilinear conversion rather than nearest chroma.
  const sx = (x & 1) ? (x + 1 < w ? 2 : 0) : (x > 0 ? -2 : 0);
  const sy = (y & 1) ? (y + 1 < h ? w : 0) : (y > 0 ? -w : 0);
  const u16 = <i32>load<u8>(uv)*9 + <i32>load<u8>(uv+sx)*3 + <i32>load<u8>(uv+sy)*3 + <i32>load<u8>(uv+sx+sy);
  const v16 = <i32>load<u8>(uv+1)*9 + <i32>load<u8>(uv+sx+1)*3 + <i32>load<u8>(uv+sy+1)*3 + <i32>load<u8>(uv+sx+sy+1);
  return classifyYUV(luma,u16,v16);
}

// Also exported for exhaustive byte-domain parity tests, not called per pixel.
export function classify(count: i32): usize {
  if (count < 0 || count > MAX_PIXELS) return 0;
  for (let i = 0; i < count; i++) store<u8>(MASK + i, color(IMAGE + i * 4));
  return MASK;
}

// Test ABI: IMAGE contains [Y,Cb,Cr,padding] tuples. Exhaustively verify the
// cached table independently of camera plane layout or component filtering.
export function classifyYuvTriples(count: i32): usize {
  if (count < 0 || count > MAX_PIXELS || inputFormat < 2) return 0;
  for (let i = 0; i < count; i++) {
    const p = IMAGE + i * 4, y = <i32>load<u8>(p);
    store<u8>(MASK + i, classifyYUV(y,<i32>load<u8>(p+1)*16,<i32>load<u8>(p+2)*16));
  }
  return MASK;
}

@inline
function enqueue(i: i32, c: i32, tail: i32): i32 {
  if (load<u8>(MASK + i) === c) {
    store<u8>(MASK + i, 0); store<i32>(QUEUE + tail * 4, i); return tail + 1;
  }
  return tail;
}

// Result ABI: counts packed as magenta | (cyan << 8), -1 = ambiguous/invalid.
// Two fixed 12-entry groups, each entry [centroidX, centroidY, area] as f64.
export function scan(w: i32, h: i32, rx0: i32, ry0: i32, rx1: i32, ry1: i32): i32 {
  if (w < 8 || h < 8 || w > MAX_PIXELS / h || rx0 < 0 || ry0 < 0
    || rx1 > w || ry1 > h || rx1 <= rx0 || ry1 <= ry0) return -1;
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) {
    const i = y * w + x;
    store<u8>(MASK + i, inputFormat >= 2 ? colorNV12(x, y, w, h) : color(IMAGE + i * 4));
  }
  let magenta = 0, cyan = 0;
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) {
    const i = y * w + x, c = <i32>load<u8>(MASK + i);
    if (!c) continue;
    let head = 0, tail = 1, x0 = x, x1 = x, y0 = y, y1 = y;
    let sx: f64 = 0, sy: f64 = 0;
    let sxx:f64=0,sxy:f64=0,syy:f64=0;
    store<i32>(QUEUE, i); store<u8>(MASK + i, 0);
    while (head < tail) {
      const j = load<i32>(QUEUE + head++ * 4), py = j / w, px = j - py * w;
      sx += <f64>px + .5; sy += <f64>py + .5;
      if(pinkGreen){const fx=<f64>px+.5,fy=<f64>py+.5;sxx+=fx*fx;sxy+=fx*fy;syy+=fy*fy;}
      x0 = min(x0, px); x1 = max(x1, px); y0 = min(y0, py); y1 = max(y1, py);
      if (px > rx0) tail = enqueue(j - 1, c, tail);
      if (px + 1 < rx1) tail = enqueue(j + 1, c, tail);
      if (py > ry0) tail = enqueue(j - w, c, tail);
      if (py + 1 < ry1) tail = enqueue(j + w, c, tail);
    }
    const minArea: i32 = pinkGreen ? 5 : 7;
    if (tail < minArea || <f64>tail > <f64>(w * h) * .025
      || <f64>tail / <f64>((x1 - x0 + 1) * (y1 - y0 + 1)) < (pinkGreen ? .2 : .25)) continue;
    if (x0 === rx0 || y0 === ry0 || x1 === rx1 - 1 || y1 === ry1 - 1) continue;
    const count = c === 1 ? magenta++ : cyan++;
    if (count >= 12) return -1;
    const p = RESULT + ((c - 1) * 12 + count) * 48;
    const cx=sx/<f64>tail,cy=sy/<f64>tail;
    store<f64>(p, cx); store<f64>(p + 8, cy); store<f64>(p + 16, <f64>tail);
    store<f64>(p+24,sxx/<f64>tail-cx*cx);store<f64>(p+32,sxy/<f64>tail-cx*cy);store<f64>(p+40,syy/<f64>tail-cy*cy);
  }
  return magenta | (cyan << 8);
}
