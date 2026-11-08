// Theme backgrounds (grid paper, fiber paper, newsprint, riso, blueprint, sunburst), scene accents, auto decor, tape.
'use strict';
const { createCanvas } = require('@napi-rs/canvas');
const { mulberry, hash, twos } = require('./core');
const { paper, rectPts, circlePts, htTile, pathPoly } = require('./paper');
const { styleId } = require('./style');

const texCache = new Map();
function cached(key, W, H, draw) {
  const k = key + '|' + W + 'x' + H + '|' + styleId();
  if (!texCache.has(k)) { const c = createCanvas(W, H); draw(c.getContext('2d'), W, H); texCache.set(k, c); }
  return texCache.get(k);
}
function fiber(x, W, H, seed, dark = 'rgba(90,70,40,', light = 'rgba(255,255,255,') {
  const r = mulberry(seed);
  for (let i = 0; i < 260; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); const cx = r() * W, cy = r() * H, rad = 40 + r() * 180; x.save(); x.translate(cx, cy); x.scale(rad, rad); g.addColorStop(0, (r() < 0.5 ? dark : light) + (0.025 + r() * 0.03) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore(); }
  x.lineWidth = 1;
  for (let i = 0; i < 1400; i++) { const px = r() * W, py = r() * H, a = r() * 7, l = 5 + r() * 22; x.strokeStyle = (r() < 0.6 ? dark : light) + (0.07 + r() * 0.1) + ')'; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a + 1) * l / 2, py + Math.sin(a + 1) * l / 2, px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
}

function background(ctx, S) {
  const B = S.theme.background || { kind: 'flat' }, W = S.W, H = S.H, bg = S.scene.bg || '#c1121f';
  switch (B.kind) {
    case 'grid': {
      ctx.fillStyle = B.base; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(cached('grid', W, H, (x) => {
        fiber(x, W, H, 7);
        const sp = B.spacing || 38; x.lineWidth = 1.2; x.strokeStyle = B.line || 'rgba(70,110,160,0.16)';
        for (let i = 0; i <= W / sp; i++) { x.beginPath(); x.moveTo(i * sp, 0); x.lineTo(i * sp, H); x.stroke(); }
        for (let j = 0; j <= H / sp; j++) { x.beginPath(); x.moveTo(0, j * sp); x.lineTo(W, j * sp); x.stroke(); }
        x.lineWidth = 2; x.strokeStyle = B.major || 'rgba(70,110,160,0.24)';
        for (let i = 0; i <= W / sp; i += 5) { x.beginPath(); x.moveTo(i * sp, 0); x.lineTo(i * sp, H); x.stroke(); }
        for (let j = 0; j <= H / sp; j += 5) { x.beginPath(); x.moveTo(0, j * sp); x.lineTo(W, j * sp); x.stroke(); }
      }), 0, 0);
      break;
    }
    case 'fiber': ctx.fillStyle = B.base; ctx.fillRect(0, 0, W, H); ctx.drawImage(cached('fiber', W, H, (x) => fiber(x, W, H, 11)), 0, 0); break;
    case 'newsprint': {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalAlpha = 0.16; const t = htTile(B.dots || 'rgba(0,0,30,1)', 24);
      for (let y = 0; y < H; y += t.height) for (let x = 0; x < W; x += t.width) ctx.drawImage(t, x, y); ctx.restore();
      ctx.drawImage(cached('np', W, H, (x) => { fiber(x, W, H, 5, 'rgba(0,0,0,', 'rgba(255,255,255,'); }), 0, 0);
      break;
    }
    case 'riso': {
      ctx.fillStyle = B.base; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(cached('riso', W, H, (x) => { const r = mulberry(3); for (let i = 0; i < W * H / 900; i++) { x.fillStyle = `rgba(40,40,80,${0.05 + r() * 0.12})`; x.fillRect(r() * W, r() * H, 1 + r() * 1.6, 1 + r() * 1.6); } fiber(x, W, H, 9); }), 0, 0);
      break;
    }
    case 'blueprint': {
      ctx.fillStyle = B.base; ctx.fillRect(0, 0, W, H);
      ctx.drawImage(cached('bp', W, H, (x) => {
        const sp = 30; x.strokeStyle = 'rgba(233,242,255,0.10)'; x.lineWidth = 1;
        for (let i = 0; i <= W / sp; i++) { x.beginPath(); x.moveTo(i * sp, 0); x.lineTo(i * sp, H); x.stroke(); }
        for (let j = 0; j <= H / sp; j++) { x.beginPath(); x.moveTo(0, j * sp); x.lineTo(W, j * sp); x.stroke(); }
        x.strokeStyle = 'rgba(233,242,255,0.22)'; x.lineWidth = 1.6;
        for (let i = 0; i <= W / sp; i += 5) { x.beginPath(); x.moveTo(i * sp, 0); x.lineTo(i * sp, H); x.stroke(); }
        for (let j = 0; j <= H / sp; j += 5) { x.beginPath(); x.moveTo(0, j * sp); x.lineTo(W, j * sp); x.stroke(); }
        x.strokeStyle = 'rgba(233,242,255,0.55)'; x.lineWidth = 3; x.strokeRect(28, 28, W - 56, H - 56); x.lineWidth = 1.2; x.strokeRect(40, 40, W - 80, H - 80);
        fiber(x, W, H, 13, 'rgba(0,0,40,', 'rgba(255,255,255,');
      }), 0, 0);
      break;
    }
    case 'sunburst': {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H * 0.46, n = 24, R = Math.hypot(W, H), rot = twos(S.sec, S.fps) * 0.06;
      ctx.save(); ctx.fillStyle = 'rgba(255,240,210,0.14)';
      for (let i = 0; i < n; i += 2) { const a0 = rot + i / n * Math.PI * 2, a1 = rot + (i + 1) / n * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.drawImage(cached('sb', W, H, (x) => fiber(x, W, H, 17)), 0, 0);
      break;
    }
    default: ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  }
}

// Scene-colored accent shapes for themes with a fixed paper base (keeps each scene's color identity).
function accents(ctx, S) {
  const B = S.theme.background || {}, W = S.W, H = S.H, bg = S.scene.bg || '#c1121f';
  const kind = S.scene.accent ?? B.accent;
  if (!kind || kind === 'none') return;
  const key = 'acc' + S.scene.id, m = Math.min(W, H);
  if (kind === 'circle' || kind === 'both') { ctx.save(); ctx.translate(W / 2, H * (W < H ? 0.47 : 0.5)); paper(ctx, circlePts(m * 0.36, 60), key + 'c', bg, { amp: 3, ht: '#000000', htA: 0.12, shadow: 0.6 }); ctx.restore(); }
  if (kind === 'strip' || kind === 'both') {
    const r = mulberry(hash(key)), y0 = H * 0.88, pts = [];
    for (let x = -40; x <= W + 40; x += 30) pts.push([x, y0 + (r() - 0.5) * 26 + Math.sin(x * 0.01) * 10]);
    pts.push([W + 40, H + 40], [-40, H + 40]);
    paper(ctx, pts, key + 's', B.stripColor || '$accent2', { amp: 2, ht: '#000000', htA: 0.15 });
  }
  if (kind === 'blob') {
    const r = mulberry(hash(key)), cx = W * (0.35 + r() * 0.3), cy = H * (0.38 + r() * 0.15), pts = [];
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, rr = m * 0.4 * (0.85 + 0.15 * Math.sin(a * 3 + r() * 6) + 0.05 * Math.sin(a * 7)); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    paper(ctx, pts, key + 'b', bg, { amp: 1, shadow: 0 });
  }
}

// ---- tape ----
function tape(ctx, x, y, w, rot, key, color) {
  const h = 34, r = mulberry(hash(key)), poly = [];
  for (let i = 0; i <= 4; i++) poly.push([-w / 2 + (i % 2 ? 6 * (r() + 0.4) : 0), -h / 2 + i * h / 4]);   // left zigzag, top→bottom
  for (let i = 4; i >= 0; i--) poly.push([w / 2 - (i % 2 ? 6 * (r() + 0.4) : 0), -h / 2 + i * h / 4]);    // right zigzag, bottom→top
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.globalAlpha *= 0.78; ctx.fillStyle = color || '#ece2bf'; pathPoly(ctx, poly); ctx.fill();
  ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.globalAlpha *= 0.5; ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let k = -w / 2 + 8; k < w / 2 - 8; k += 14) ctx.fillRect(k, -h / 2 + 3, 5, h - 6);
  ctx.restore();
}

// ---- auto decor ----
const SLOTS = [[0.09, 0.27], [0.91, 0.24], [0.08, 0.6], [0.92, 0.64], [0.88, 0.42], [0.12, 0.44], [0.2, 0.18], [0.8, 0.74]];
const SETS = {
  scrapbook: ['tri:$accent2', 'tri:$pink', 'dot:$accent', 'zig:#222222', 'tape', 'tape', 'ht'],
  protest: ['tape', 'tape', 'tri:#e63946', 'plus:#f3eee2'],
  riso: ['dot:#ff48b0', 'dot:#0078bf', 'dot:#ffd400', 'zig:#0078bf'],
  retro: ['spark:#f3e3c3', 'spark:#e9c46a', 'dot:#f3e3c3'],
  blueprint: ['plus:#e9f2ff', 'plus:#e9f2ff'],
};
function decor(ctx, S) {
  const set = SETS[S.theme.decor]; if (!set || S.scene.decor === false) return;
  const r = mulberry(hash('decor' + S.scene.id)), W = S.W, H = S.H;
  const slots = SLOTS.map(s => [s, r()]).sort((a, b) => a[1] - b[1]).map(s => s[0]);
  const n = Math.min(set.length, S.theme.decorCount || 5), t = twos(S.sec, S.fps);
  const items = set.map(x => [x, r()]).sort((a, b) => a[1] - b[1]).slice(0, n).map(x => x[0]);
  items.forEach((it, i) => {
    const [kind, color] = it.split(':'), [sx, sy] = slots[i], k = 'dc' + S.scene.id + i;
    const x = sx * W + Math.sin(t * 0.9 + i) * 6, y = sy * H + Math.cos(t * 0.7 + i) * 6, rot = (r() - 0.5) * 1.2 + Math.sin(t + i) * 0.04;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    switch (kind) {
      case 'tri': paper(ctx, [[0, -38], [36, 26], [-36, 26]], k, color, { amp: 1.5 }); break;
      case 'dot': paper(ctx, circlePts(26 + r() * 14, 24), k, color, { amp: 1.5 }); break;
      case 'zig': { ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineJoin = 'miter'; ctx.beginPath(); for (let z = 0; z < 6; z++) ctx[z ? 'lineTo' : 'moveTo'](-50 + z * 20, z % 2 ? -12 : 12); ctx.stroke(); break; }
      case 'tape': tape(ctx, 0, 0, 120 + r() * 50, 0, k); break;
      case 'ht': { const p = paper(ctx, rectPts(150, 46), k, '#f6f0e1', { amp: 2 }); ctx.save(); pathPoly(ctx, p); ctx.clip(); ctx.globalAlpha *= 0.8; ctx.drawImage(htTile('#222222', 10), -75, -23); ctx.restore(); break; }
      case 'plus': ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(20, 0); ctx.moveTo(0, -20); ctx.lineTo(0, 20); ctx.stroke(); break;
      case 'spark': { const pts = []; for (let q = 0; q < 8; q++) { const rr = q % 2 ? 9 : 34, a = q / 8 * Math.PI * 2; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); } paper(ctx, pts, k, color, { amp: 1 }); break; }
      default: break;
    }
    ctx.restore();
  });
}

module.exports = { background, accents, decor, tape };
