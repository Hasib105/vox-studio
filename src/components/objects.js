// Story props: locks, gates, chains, barricades, vehicles, people, icons, arrows, waves.
'use strict';
const { lerp, clamp, twos, mulberry, hash } = require('../engine/core');
const { paper, rectPts, circlePts, shift, pathPoly } = require('../engine/paper');
const { chip } = require('../engine/text');

const shadow = (ctx, b = 8, y = 5) => { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = b; ctx.shadowOffsetY = y; };

function drawArrow(ctx, from, to, p, color, width) {
  if (p <= 0) return;
  const ex = lerp(from[0], to[0], p), ey = lerp(from[1], to[1], p), a = Math.atan2(to[1] - from[1], to[0] - from[0]);
  ctx.save(); shadow(ctx);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(ex - Math.cos(a) * width, ey - Math.sin(a) * width); ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(a - 0.5) * width * 2.6, ey - Math.sin(a - 0.5) * width * 2.6);
  ctx.lineTo(ex - Math.cos(a + 0.5) * width * 2.6, ey - Math.sin(a + 0.5) * width * 2.6); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function partialPath(ctx, pts, p) {
  let total = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
  let left = total * clamp(p); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const l = seg[i - 1];
    if (l <= left) { ctx.lineTo(pts[i][0], pts[i][1]); left -= l; }
    else { const k = left / l; ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)); left = 0; }
  }
}

module.exports = {
  arrow: {
    doc: 'Thick arrow from A to B (absolute coords or geo points). With enter "grow" it draws itself.',
    absolute: true,
    props: { from: '[x,y] or {"geo":[lon,lat]}', to: '[x,y] or {"geo":[lon,lat]}', color: 'default red', width: 'stroke width (default 14)', progress: '0-1 (defaults to enter progress)', stopShort: 'fraction to stop before target (default 0.1)' },
    draw(ctx, p, S) {
      const f = S.pt(p.from), t0 = S.pt(p.to), k = p.stopShort ?? 0.1;
      const t = [t0[0] + (f[0] - t0[0]) * k, t0[1] + (f[1] - t0[1]) * k];
      drawArrow(ctx, f, t, p.progress ?? S.enterP, p.color || '#e63946', p.width || 14);
    },
  },

  path: {
    doc: 'Dashed or solid route line through points (absolute). Draws on with enter "grow". Use for trade routes, flight paths.',
    absolute: true,
    props: { points: 'array of [x,y] or {"geo":[lon,lat]}', color: 'line color', width: 'line width (default 8)', dash: '[on, off] dash pattern or null for solid', flow: 'dash crawl speed px/s (default 50)', curve: 'true to smooth through points', progress: '0-1 (defaults to enter progress)', arrowHead: 'true for an arrow head at the end' },
    draw(ctx, p, S) {
      let pts = (p.points || []).map(v => S.pt(v));
      if (pts.length < 2) return;
      if (p.curve) pts = smooth(pts);
      ctx.save(); shadow(ctx, 6, 4);
      ctx.strokeStyle = p.color || '#ffd60a'; ctx.lineWidth = p.width || 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (p.dash !== null) { ctx.setLineDash(p.dash || [18, 14]); ctx.lineDashOffset = -twos(S.sec, S.fps) * (p.flow ?? 50); }
      ctx.beginPath(); partialPath(ctx, pts, p.progress ?? S.enterP); ctx.stroke();
      ctx.restore();
      if (p.arrowHead && (p.progress ?? S.enterP) > 0.98) { const a = pts[pts.length - 2], b = pts[pts.length - 1]; drawArrow(ctx, [lerp(a[0], b[0], 0.5), lerp(a[1], b[1], 0.5)], b, 1, p.color || '#ffd60a', (p.width || 8) * 1.2); }
    },
  },

  uturn: {
    doc: 'Curved U-turn arrow ("turned back", "redirected").',
    props: { r: 'radius (default 60)', color: 'stroke color', progress: '0-1 (defaults to enter progress)' },
    draw(ctx, p, S) {
      const pr = p.progress ?? S.enterP, r = p.r || 60, color = p.color || '#f1faee'; if (pr <= 0) return;
      shadow(ctx, 6, 4); ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.lineCap = 'round';
      const a0 = Math.PI * 0.05, a1 = a0 + Math.PI * 1.1 * pr;
      ctx.beginPath(); ctx.arc(0, 0, r, -a0, -a1, true); ctx.stroke();
      const ex = Math.cos(-a1) * r, ey = Math.sin(-a1) * r, ta = -a1 - Math.PI / 2;
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(ex + Math.cos(ta) * 22, ey + Math.sin(ta) * 22);
      ctx.lineTo(ex + Math.cos(ta + 2.3) * 20, ey + Math.sin(ta + 2.3) * 20); ctx.lineTo(ex + Math.cos(ta - 2.3) * 20, ey + Math.sin(ta - 2.3) * 20); ctx.closePath(); ctx.fill();
    },
  },

  xmark: {
    doc: 'Torn paper X (blocked, closed, denied). Pair with enter "pop".',
    props: { color: 'default red', size: 'arm length (default 96)' },
    draw(ctx, p, S) {
      const s = p.size || 96; ctx.rotate(0.1);
      paper(ctx, rectPts(s, s * 0.27), S.key + 'a', p.color || '#e63946', { amp: 2, fringeW: 4 }); ctx.rotate(Math.PI / 2);
      paper(ctx, rectPts(s, s * 0.27), S.key + 'b', p.color || '#e63946', { amp: 2, fringeW: 4 });
    },
  },

  check: {
    doc: 'Torn paper check mark (approved, allowed).',
    props: { color: 'default green', size: 'size (default 110)' },
    draw(ctx, p, S) {
      const s = (p.size || 110) / 110; ctx.scale(s, s);
      paper(ctx, [[-60, 0], [-38, -22], [-14, 4], [46, -60], [66, -38], [-14, 48]], S.key, p.color || '#2a9d8f', { amp: 2 });
    },
  },

  padlock: {
    doc: 'Brass padlock. Animate `open` 1 -> 0 to snap it shut (add a shake on close).',
    props: { open: '0 closed ... 1 shackle raised', color: 'body color' },
    draw(ctx, p, S) {
      const o = -(p.open ?? 0) * 120;
      ctx.save(); shadow(ctx, 14, 8); ctx.strokeStyle = '#7d8590'; ctx.lineWidth = 50;
      ctx.beginPath(); ctx.moveTo(-100, 10 + o); ctx.lineTo(-100, -130 + o); ctx.arc(0, -130 + o, 100, Math.PI, 0); ctx.lineTo(100, 10 + o * 0.0 + Math.min(0, o + 60)); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = '#b8bec6'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(-112, o); ctx.lineTo(-112, -130 + o); ctx.arc(0, -130 + o, 112, Math.PI, Math.PI * 1.5); ctx.stroke();
      paper(ctx, rectPts(330, 260, 0, 90), S.key + 'body', p.color || '#e9a825', { amp: 4, ht: '#a8660f', htA: 0.4, fringeW: 6 });
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-145, -20, 290, 14);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 70, 26, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-14, 80); ctx.lineTo(14, 80); ctx.lineTo(22, 150); ctx.lineTo(-22, 150); ctx.closePath(); ctx.fill();
    },
  },

  chain: {
    doc: 'Steel chain hanging between two points (absolute).',
    absolute: true,
    props: { from: '[x,y] or geo', to: '[x,y] or geo', sag: 'droop px (default 80)', links: 'link count (default 14)' },
    draw(ctx, p, S) {
      const a = S.pt(p.from), b = S.pt(p.to), n = p.links || 14, ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t) + Math.sin(t * Math.PI) * (p.sag ?? 80);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang); shadow(ctx, 6, 4);
        ctx.strokeStyle = i % 2 ? '#8a929c' : '#aab1ba'; ctx.lineWidth = 12;
        ctx.beginPath(); ctx.ellipse(0, 0, i % 2 ? 30 : 34, i % 2 ? 8 : 18, 0, 0, 7); ctx.stroke(); ctx.restore();
      }
    },
  },

  gate: {
    doc: 'Two-leaf iron gate with spikes. Animate `close` 0 -> 1 to slam it shut over whatever is behind.',
    props: { close: '0 open (leaves off-screen) ... 1 shut', w: 'total width (default 1000)', h: 'height (default 740)', color: 'metal color' },
    draw(ctx, p, S) {
      const W = p.w || 1000, H = p.h || 740, half = W / 2, off = (1 - (p.close ?? 1)) * (half + 80);
      for (const side of [1, -1]) {
        ctx.save(); ctx.translate(-side * off, 0); ctx.scale(side, 1);
        const metal = p.color || '#26282c', hi = '#6c737c', bars = Math.floor(half / 62);
        for (let i = 0; i < bars; i++) {
          const x = -40 - i * 60;
          paper(ctx, rectPts(20, H, x, 0), S.key + side + 'v' + i, metal, { amp: 1.5, fringeW: 3, shadowA: 0.45 });
          ctx.fillStyle = hi; ctx.fillRect(x - 8, -H / 2 + 6, 4, H - 12);
          paper(ctx, [[x - 18, -H / 2], [x + 18, -H / 2], [x, -H / 2 - 46]], S.key + side + 'sp' + i, metal, { amp: 1, fringeW: 3 });
        }
        for (const [yy, hh] of [[-H / 2 + 30, 38], [0, 30], [H / 2 - 30, 38]]) {
          paper(ctx, rectPts(half, hh, -half / 2, yy), S.key + side + 'h' + yy, metal, { amp: 2, fringeW: 3, shadowA: 0.45 });
          ctx.fillStyle = hi; ctx.fillRect(-half + 5, yy - hh / 2 + 4, half - 10, 4);
        }
        paper(ctx, rectPts(46, H + 40, -half, 0), S.key + side + 'post', '#1b1c1f', { amp: 2, fringeW: 3 });
        paper(ctx, rectPts(26, H, -8, 0), S.key + side + 'edge', metal, { amp: 1.5, fringeW: 3 });
        ctx.restore();
      }
      if ((p.close ?? 1) > 0.99) { paper(ctx, rectPts(90, 120), S.key + 'plate', '#e9a825', { amp: 2, ht: '#a8660f' }); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, -8, 14, 0, 7); ctx.fill(); ctx.fillRect(-6, -4, 12, 34); }
    },
  },

  barricade: {
    doc: 'Red/white striped road barricade (sawhorse).',
    props: { w: 'width (default 300)' },
    draw(ctx, p, S) {
      const w = p.w || 300;
      ctx.save(); ctx.strokeStyle = '#4a4e69'; ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(-w * 0.3, -40); ctx.lineTo(-w * 0.43, 150); ctx.moveTo(w * 0.3, -40); ctx.lineTo(w * 0.43, 150); ctx.stroke(); ctx.restore();
      for (const yy of [-50, 40]) {
        const poly = paper(ctx, rectPts(w, 62, 0, yy), S.key + yy, '#f1faee', { amp: 3 });
        ctx.save(); pathPoly(ctx, poly); ctx.clip(); ctx.fillStyle = '#d62828';
        for (let x = -w; x < w; x += 60) { ctx.beginPath(); ctx.moveTo(x, yy - 31); ctx.lineTo(x + 30, yy - 31); ctx.lineTo(x, yy + 31); ctx.lineTo(x - 30, yy + 31); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
    },
  },

  road: {
    doc: 'Horizontal asphalt road strip with dashed center line.',
    props: { w: 'length (default 1500)', h: 'width (default 210)', color: 'asphalt color', scroll: 'dash scroll speed px/s (0 = still)' },
    draw(ctx, p, S) {
      const w = p.w || 1500, h = p.h || 210;
      paper(ctx, rectPts(w, h), S.key, p.color || '#2b2d42', { amp: 4 });
      ctx.fillStyle = '#f1faee'; const off = ((S.sec * (p.scroll || 0)) % 140);
      for (let x = -w / 2 - 140 + off; x < w / 2; x += 140) ctx.fillRect(x, -5, 70, 10);
    },
  },

  truck: {
    doc: 'Cargo truck (side view, facing right). Origin = front bumper at road level. Wheels spin as x changes.',
    props: { label: 'text on the trailer', color: 'cab color', trailer: 'trailer color' },
    draw(ctx, p, S) {
      paper(ctx, rectPts(390, 200, -375, -130), S.key + 'tr', p.trailer || '#f1faee', { amp: 3, ht: '#c9c3b0', htA: 0.4 });
      ctx.fillStyle = '#c1121f'; ctx.fillRect(-560, -190, 370, 12);
      if (p.label) chip(ctx, S, p.label, -375, -125, { size: 44, font: 'headline', bg: 'none', color: '#1d3557' });
      paper(ctx, [[-170, -40], [-170, -200], [-70, -200], [-8, -120], [-8, -40]], S.key + 'cab', p.color || '#264653', { amp: 2, step: 10 });
      paper(ctx, [[-150, -125], [-150, -185], [-78, -185], [-30, -125]], S.key + 'win', '#a8dadc', { amp: 1.5, fringe: false, shadow: 0 });
      for (const wx of [-500, -270, -80]) {
        ctx.save(); ctx.translate(wx, -22); ctx.rotate(-(p.x || 0) / 40);
        paper(ctx, circlePts(38, 20), S.key + 'w' + wx, '#141414', { amp: 1.5, fringeW: 3 });
        ctx.fillStyle = '#8d99ae'; ctx.fillRect(-14, -3, 28, 6); ctx.fillRect(-3, -14, 6, 28); ctx.restore();
      }
    },
  },

  icon: {
    doc: 'Cargo/subject icons: crate, circuit, barrel, cash, document, missile, oil, factory.',
    props: { kind: 'crate | circuit | barrel | cash | document | missile | factory', label: 'optional word printed on the icon' },
    draw(ctx, p, S) {
      const k = S.key;
      switch (p.kind) {
        case 'crate':
          paper(ctx, rectPts(150, 130), k, '#b07d4f', { amp: 3, ht: '#7a5230', htA: 0.35 });
          ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 8; ctx.strokeRect(-62, -52, 124, 104); ctx.beginPath(); ctx.moveTo(-62, -52); ctx.lineTo(62, 52); ctx.stroke();
          if (p.label) chip(ctx, S, p.label, 0, 2, { size: 40, font: 'headline', bg: 'none', color: '#2b1a0e' }); break;
        case 'circuit':
          paper(ctx, rectPts(140, 140), k, '#2d6a4f', { amp: 3 }); ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 5;
          for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-70, i * 24); ctx.lineTo(-30, i * 24); ctx.moveTo(30, i * 24); ctx.lineTo(70, i * 24); ctx.stroke(); }
          paper(ctx, rectPts(64, 64), k + 'c', '#111', { amp: 1.5, fringeW: 3 }); break;
        case 'barrel':
          paper(ctx, rectPts(110, 150), k, '#3d405b', { amp: 3 }); ctx.fillStyle = '#81839a'; ctx.fillRect(-55, -40, 110, 10); ctx.fillRect(-55, 30, 110, 10);
          if (p.label) chip(ctx, S, p.label, 0, -4, { size: 34, font: 'headline', bg: 'none', color: '#f6f0e1' }); break;
        case 'cash':
          for (let i = 2; i >= 0; i--) {
            ctx.save(); ctx.translate(i * 8, -i * 10); ctx.rotate(-0.08 + i * 0.06);
            paper(ctx, rectPts(190, 96), k + i, '#74c69d', { amp: 2, ht: '#2d6a4f', htA: 0.3 });
            ctx.strokeStyle = '#2d6a4f'; ctx.lineWidth = 4; ctx.strokeRect(-82, -38, 164, 76);
            chip(ctx, S, '$', 0, 0, { size: 56, font: 'headline', bg: 'none', color: '#1b4332' }); ctx.restore();
          } break;
        case 'document':
          paper(ctx, rectPts(130, 170), k, '#fdfcf7', { amp: 3 }); ctx.fillStyle = 'rgba(40,40,40,0.6)';
          for (let y = -60; y < 60; y += 16) ctx.fillRect(-48, y, 96 - (y % 32 ? 20 : 0), 6);
          if (p.label) chip(ctx, S, p.label, 0, 50, { size: 26, font: 'headline', bg: '#e63946', color: '#fff' }); break;
        case 'missile':
          ctx.rotate(-0.6); paper(ctx, [[-90, -16], [60, -16], [100, 0], [60, 16], [-90, 16]], k, '#adb5bd', { amp: 2 });
          paper(ctx, [[-90, -16], [-110, -40], [-70, -16]], k + 'f1', '#495057', { amp: 1 }); paper(ctx, [[-90, 16], [-110, 40], [-70, 16]], k + 'f2', '#495057', { amp: 1 }); break;
        case 'factory':
          paper(ctx, [[-90, 60], [-90, -10], [-40, 20], [-40, -10], [10, 20], [10, -10], [90, 20], [90, 60]], k, '#6c757d', { amp: 2 });
          paper(ctx, rectPts(26, 90, 60, -35), k + 'ch', '#495057', { amp: 1.5 }); break;
        default:
          paper(ctx, circlePts(60, 24), k, '#adb5bd', { amp: 2 });
      }
    },
  },

  figure: {
    doc: 'Generic paper person silhouette (no faces). Use rows of them for crowds, staff, troops.',
    props: { color: 'clothing color', skin: 'head color', bob: 'bob amount px (default 5)' },
    draw(ctx, p, S) {
      const ph = hash(S.key) % 100 / 10, bob = Math.sin(twos(S.sec, S.fps) * 3 + ph) * (p.bob ?? 5);
      ctx.translate(0, bob);
      const b = []; for (let k = 0; k <= 16; k++) { const a = Math.PI + k / 16 * Math.PI; b.push([Math.cos(a) * 55, Math.sin(a) * 120]); }
      paper(ctx, b, S.key + 'b', p.color || '#1d3557', { amp: 2, step: 10, fringeW: 4 });
      paper(ctx, circlePts(34, 22, 0, -150), S.key + 'h', p.skin || ['#c9a27a', '#a47148', '#e0b98a', '#8d5b3a', '#d4a373'][hash(S.key) % 5], { amp: 1.5, fringeW: 4 });
    },
  },

  desk: {
    doc: 'Wooden desk/podium front with a printed label (e.g. "~20 PERSONNEL").',
    props: { w: 'width (default 720)', label: 'text on the front', color: 'wood color' },
    draw(ctx, p, S) {
      const w = p.w || 720;
      paper(ctx, rectPts(w + 20, 46, 0, -88), S.key + 't', p.color || '#8d5524', { amp: 3 });
      paper(ctx, rectPts(w - 30, 130), S.key + 'f', '#6f4518', { amp: 3, ht: '#3d2410', htA: 0.35 });
      if (p.label) chip(ctx, S, p.label, 0, 0, { size: 46, bg: 'none', color: '#fdfcf7' });
    },
  },

  warship: {
    doc: 'Grey naval warship silhouette (side view, facing right).',
    props: { color: 'hull color', number: 'hull number' },
    draw(ctx, p, S) {
      const k = S.key;
      ctx.strokeStyle = '#2b3445'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(4, -50); ctx.lineTo(4, -110); ctx.moveTo(-14, -92); ctx.lineTo(22, -92); ctx.stroke();
      paper(ctx, rectPts(40, 32, 4, -50), k + 's2', '#9aa3b5', { amp: 2, fringeW: 3 });
      paper(ctx, rectPts(96, 34, -14, -20), k + 's1', '#7a8499', { amp: 2, fringeW: 3 });
      paper(ctx, rectPts(46, 9, 62, -8), k + 'g', '#3f4757', { amp: 1, fringeW: 2, shadow: 0 });
      paper(ctx, [[-120, -4], [125, -4], [100, 34], [-104, 34]], k + 'h', p.color || '#59647a', { amp: 2, step: 10, fringeW: 3 });
      ctx.fillStyle = '#f6f0e1'; ctx.font = 'bold 22px "Archivo Black"'; ctx.fillText(String(p.number ?? 50 + hash(k) % 40), -70, 22);
    },
  },

  cargoShip: {
    doc: 'Container cargo ship (side view, bow to the right). Use flipX to turn it around.',
    props: { hull: 'hull color (default red)' },
    draw(ctx, p, S) {
      const k = S.key, cols = ['#f77f00', '#2a9d8f', '#ffd60a', '#457b9d', '#f77f00'];
      cols.forEach((c, i) => paper(ctx, rectPts(46, 36, -40 + i * 48, -22), k + 'c' + i, c, { amp: 1.5, fringeW: 3 }));
      paper(ctx, rectPts(40, 66, -112, -36), k + 'br', '#f1faee', { amp: 1.5, fringeW: 3 });
      ctx.fillStyle = '#1d3557'; ctx.fillRect(-126, -58, 28, 10);
      paper(ctx, [[-140, -4], [150, -4], [124, 44], [-128, 44]], k + 'h', p.hull || '#d62828', { amp: 2, step: 10, fringeW: 3 });
      ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-128, 26, 252, 8);
    },
  },

  tanker: {
    doc: 'Oil tanker (side view).',
    props: { hull: 'hull color' },
    draw(ctx, p, S) {
      const k = S.key;
      paper(ctx, rectPts(46, 50, -100, -28), k + 'br', '#f1faee', { amp: 1.5, fringeW: 3 });
      paper(ctx, rectPts(190, 16, 20, -10), k + 'd', '#8d99ae', { amp: 1, fringeW: 2, shadow: 0 });
      paper(ctx, [[-140, -4], [150, -4], [124, 40], [-128, 40]], k + 'h', p.hull || '#22333b', { amp: 2, step: 10, fringeW: 3 });
    },
  },

  plane: {
    doc: 'Jet airplane silhouette (top-down, nose to the right). Rotate to set heading.',
    props: { color: 'body color' },
    draw(ctx, p, S) {
      const c = p.color || '#dee2e6', k = S.key;
      paper(ctx, [[-20, -8], [30, -100], [52, -100], [30, -8]], k + 'w1', c, { amp: 1.5 });
      paper(ctx, [[-20, 8], [30, 100], [52, 100], [30, 8]], k + 'w2', c, { amp: 1.5 });
      paper(ctx, [[-110, -12], [-110, 12], [-130, 40], [-112, 40], [-90, 12], [90, 12], [120, 0], [90, -12], [-90, -12], [-112, -40], [-130, -40]], k + 'b', c, { amp: 1.5 });
    },
  },

  wave: {
    doc: 'A full-width torn paper wave strip (absolute). Stack 3-4 with darker blues and put ships between them.',
    absolute: true,
    props: { y: 'top line y', color: 'water color', amp: 'wave height (default 14)', drift: 'side-to-side drift px (default 26)' },
    draw(ctx, p, S) {
      const pts = []; const ph = hash(S.key) % 100 / 10, y = p.y ?? 1000, a = p.amp ?? 14;
      for (let x = -400; x <= S.W + 400; x += 40) pts.push([x, y + Math.sin(x * 0.018 + ph) * a]);
      pts.push([S.W + 400, S.H + 300], [-400, S.H + 300]);
      ctx.translate(Math.sin(twos(S.sec, S.fps) * 1.4 + ph) * (p.drift ?? 26), 0);
      paper(ctx, pts, S.key, p.color || '#457b9d', { amp: 3, step: 14 });
    },
  },
};

function smooth(pts) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let t = 0; t < 1; t += 0.1) {
      const t2 = t * t, t3 = t2 * t;
      out.push([0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
    }
  }
  out.push(pts[pts.length - 1]); return out;
}
