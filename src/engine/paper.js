// Paper-collage primitives: torn edges, paper pieces with fringe + shadow, halftone, grain, stop-motion jitter.
'use strict';
const { createCanvas } = require('@napi-rs/canvas');
const { mulberry, hash, clamp } = require('./core');

const rectPts = (w, h, dx = 0, dy = 0) => [[-w / 2 + dx, -h / 2 + dy], [w / 2 + dx, -h / 2 + dy], [w / 2 + dx, h / 2 + dy], [-w / 2 + dx, h / 2 + dy]];
const circlePts = (r, n = 30, dx = 0, dy = 0, ry = r) => Array.from({ length: n }, (_, i) => [dx + Math.cos(i / n * Math.PI * 2) * r, dy + Math.sin(i / n * Math.PI * 2) * ry]);
const starPts = (r1, r2, n, rot = 0) => { const p = []; for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r1 : r2, a = i / (n * 2) * Math.PI * 2 + rot; p.push([Math.cos(a) * r, Math.sin(a) * r]); } return p; };
const shift = (pts, dx, dy) => pts.map(([x, y]) => [x + dx, y + dy]);

function offsetPoly(pts, d) {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + dx / l * d, y + dy / l * d]; });
}
function bbox(p) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of p) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }

const tornCache = new Map();
function torn(pts, key, amp = 4, step = 12) {
  const k = key + '|' + amp + '|' + step + '|' + pts.length + '|' + Math.round(pts[0][0]) + ',' + Math.round(pts[0][1]);
  const hit = tornCache.get(k); if (hit) return hit;
  const r = mulberry(hash(k)), out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const segs = Math.max(1, Math.round(len / step));
    for (let s = 0; s < segs; s++) { const t = s / segs, o = s === 0 ? 0 : (r() - 0.5) * 2 * amp; out.push([x1 + dx * t + nx * o, y1 + dy * t + ny * o]); }
  }
  if (tornCache.size > 20000) tornCache.clear();
  tornCache.set(k, out);
  return out;
}
function pathPoly(ctx, p) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
function pathRings(ctx, rings) { ctx.beginPath(); for (const p of rings) { ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); } }

// halftone dot tile with a diagonal size gradient (the Vox print look)
const htCache = {};
function htTile(color, sp = 16) {
  const k = color + '|' + sp; if (htCache[k]) return htCache[k];
  const S = 1400, c = createCanvas(S, S), x = c.getContext('2d'); x.fillStyle = color;
  for (let j = 0; j <= S / sp; j++) for (let i = 0; i <= S / sp + 1; i++) {
    const px = i * sp + (j % 2) * sp / 2, py = j * sp, g = clamp((px + py) / (S * 1.3));
    x.beginPath(); x.arc(px, py, sp * 0.5 * (0.12 + 0.88 * g), 0, 7); x.fill();
  }
  return (htCache[k] = c);
}

function shadowOn(ctx, o) {
  if (o.shadow === 0) return;
  const s = o.shadow ?? 1;
  ctx.shadowColor = `rgba(0,0,0,${o.shadowA ?? 0.38})`; ctx.shadowBlur = o.blur ?? 14;
  ctx.shadowOffsetX = 5 * s; ctx.shadowOffsetY = 8 * s;
}

// A paper piece: soft drop shadow, cream torn fringe, colored face, optional halftone.
function paper(ctx, pts, key, fill, o = {}) {
  const amp = o.amp ?? 4, step = o.step ?? 12;
  const main = torn(pts, key, amp, step);
  const fringe = o.fringe !== false;
  const under = fringe ? torn(offsetPoly(pts, o.fringeW ?? 5), key + 'f', amp + 1.5, step) : main;
  ctx.save(); shadowOn(ctx, o);
  ctx.fillStyle = fringe ? (o.fringeColor || '#f6f0e1') : fill; pathPoly(ctx, under); ctx.fill();
  ctx.restore();
  if (fringe) { ctx.fillStyle = fill; pathPoly(ctx, main); ctx.fill(); }
  if (o.ht) halftoneIn(ctx, main, o.ht, o.htA ?? 0.35, o.htSp ?? 16);
  return main;
}
function halftoneIn(ctx, poly, color, alpha = 0.35, sp = 16, rings = false) {
  const b = rings ? bbox(poly.flat()) : bbox(poly);
  ctx.save(); rings ? pathRings(ctx, poly) : pathPoly(ctx, poly); ctx.clip(); ctx.globalAlpha *= alpha;
  const t = htTile(color, sp);
  for (let y = b.y; y < b.y + b.h; y += t.height) for (let x = b.x; x < b.x + b.w; x += t.width) ctx.drawImage(t, x, y);
  ctx.restore();
}
// Arbitrary (possibly concave, multi-ring) shapes such as countries: stroke-fringe instead of offset.
function paperRings(ctx, rings, fill, o = {}) {
  if (!rings.length) return;
  ctx.save(); shadowOn(ctx, o);
  ctx.lineJoin = 'round'; ctx.lineWidth = (o.fringeW ?? 5) * 2; ctx.strokeStyle = o.fringeColor || '#f6f0e1';
  pathRings(ctx, rings); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = (o.fringeW ?? 5) * 2; ctx.strokeStyle = o.fringeColor || '#f6f0e1'; pathRings(ctx, rings); ctx.stroke(); ctx.restore();
  ctx.fillStyle = fill; pathRings(ctx, rings); ctx.fill('evenodd');
  if (o.ht) halftoneIn(ctx, rings, o.ht, o.htA ?? 0.35, o.htSp ?? 16, true);
}

function jit(ctx, key, sec, a = 1, fps = 30) {
  if (!a) return;
  const r = mulberry(hash(key) + Math.floor(sec * fps / 2) * 7919);
  ctx.translate((r() - .5) * 3 * a, (r() - .5) * 3 * a); ctx.rotate((r() - .5) * 0.01 * a);
}

function makeGrain(W, H, seed, scale = 1) {
  const c = createCanvas(W, H), x = c.getContext('2d'), id = x.createImageData(W, H), d = id.data, r = mulberry(seed);
  for (let i = 0; i < d.length; i += 4) { const v = 222 + r() * 33 | 0; d[i] = v; d[i + 1] = v - 2; d[i + 2] = v - 9; d[i + 3] = 255; }
  x.putImageData(id, 0, 0);
  x.strokeStyle = 'rgba(120,100,70,0.18)'; x.lineWidth = 1;
  for (let i = 0; i < 900 * scale * scale; i++) { const px = r() * W, py = r() * H, a = r() * 7, l = (6 + r() * 18) * scale; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  return c;
}
function makeVignette(W, H, strength = 0.38) {
  const c = createCanvas(W, H), x = c.getContext('2d');
  const g = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${strength})`);
  x.fillStyle = g; x.fillRect(0, 0, W, H); return c;
}

module.exports = { rectPts, circlePts, starPts, shift, offsetPoly, bbox, torn, pathPoly, pathRings, htTile, halftoneIn, paper, paperRings, jit, makeGrain, makeVignette, shadowOn };
