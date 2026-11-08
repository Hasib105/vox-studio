// More story props: cup, molecule, clock, calendar, bars, rocket, planet, bridge, cube, bread, bubbles, parachute, bag.
'use strict';
const { lerp, clamp, twos, mulberry, hash, ease } = require('../engine/core');
const { paper, rectPts, circlePts, pathPoly } = require('../engine/paper');
const { chip, nativeDigits } = require('../engine/text');

const shadow = (ctx, b = 8, y = 5) => { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = b; ctx.shadowOffsetY = y; };

module.exports = {
  cup: {
    doc: 'Coffee/tea cup with wiggling steam.',
    props: { color: 'cup color', liquid: 'drink color', steam: 'true/false (default true)', label: 'text printed on the cup' },
    draw(ctx, p, S) {
      const k = S.key, t = twos(S.sec, S.fps);
      if (p.steam !== false) {
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 12; ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); for (let y = 0; y <= 150; y += 10) { const x = i * 45 + Math.sin(y * 0.05 + t * 3 + i) * 14; y ? ctx.lineTo(x, -150 - y) : ctx.moveTo(x, -150); } ctx.globalAlpha = 0.8; ctx.stroke(); }
        ctx.restore();
      }
      ctx.save(); ctx.strokeStyle = p.color || '#f1faee'; ctx.lineWidth = 26; shadow(ctx); ctx.beginPath(); ctx.arc(140, -20, 55, -Math.PI / 2.2, Math.PI / 2.2); ctx.stroke(); ctx.restore();
      paper(ctx, [[-150, -130], [150, -130], [120, 110], [-120, 110]], k + 'c', p.color || '#f1faee', { amp: 3, ht: '#c9c3b0', htA: 0.3 });
      paper(ctx, circlePts(150, 40, 0, -130, 26), k + 'l', p.liquid || '#6f4518', { amp: 2, fringe: false, shadow: 0 });
      if (p.label) chip(ctx, S, p.label, 0, 0, { size: 44, font: 'headline', bg: 'none', color: '#1d1d1d' });
      paper(ctx, circlePts(190, 44, 0, 120, 26), k + 's', '#e9e4d8', { amp: 2 });
    },
  },

  molecule: {
    doc: 'Ball-and-stick molecule (atoms + bonds). Good for chemistry/biology explainers.',
    props: { atoms: '[[x,y,r,color],...] relative positions', bonds: '[[i,j],...] atom index pairs', label: 'name under it', spin: 'slow rotation speed' },
    draw(ctx, p, S) {
      const atoms = p.atoms || [[0, 0, 46, '#e63946'], [-110, -60, 34, '#1d3557'], [110, -60, 34, '#1d3557'], [0, 120, 34, '#457b9d']];
      const bonds = p.bonds || [[0, 1], [0, 2], [0, 3]];
      ctx.save(); if (p.spin) ctx.rotate(twos(S.sec, S.fps) * p.spin);
      ctx.strokeStyle = '#f1faee'; ctx.lineWidth = 16; shadow(ctx, 6, 4);
      for (const [i, j] of bonds) { ctx.beginPath(); ctx.moveTo(atoms[i][0], atoms[i][1]); ctx.lineTo(atoms[j][0], atoms[j][1]); ctx.stroke(); }
      atoms.forEach(([x, y, r, c], i) => paper(ctx, circlePts(r, 26, x, y), S.key + 'a' + i, c, { amp: 1.5, ht: '#000000', htA: 0.15 }));
      ctx.restore();
      if (p.label) chip(ctx, S, p.label, 0, 230, { size: 40, bg: '#fdfcf7' });
    },
  },

  clock: {
    doc: 'Analog clock. Animate `time` (hours, e.g. 9 -> 17) to spin the hands.',
    props: { time: 'hours as a number (keyframe it)', r: 'radius (default 160)', face: 'face color', rim: 'rim color' },
    draw(ctx, p, S) {
      const r = p.r || 160, h = p.time ?? 10.1;
      paper(ctx, circlePts(r + 18, 48), S.key + 'rim', p.rim || '#e63946', { amp: 2.5 });
      paper(ctx, circlePts(r, 48), S.key + 'f', p.face || '#fdfcf7', { amp: 1.5, fringe: false, shadow: 0 });
      ctx.fillStyle = '#1d1d1d';
      for (let i = 0; i < 12; i++) { ctx.save(); ctx.rotate(i / 12 * Math.PI * 2); ctx.fillRect(-4, -r + 12, 8, i % 3 ? 16 : 30); ctx.restore(); }
      const hand = (ang, len, w, c) => { ctx.save(); ctx.rotate(ang); ctx.fillStyle = c; shadow(ctx, 4, 3); ctx.fillRect(-w / 2, -len, w, len + 18); ctx.restore(); };
      hand((h % 12) / 12 * Math.PI * 2, r * 0.55, 16, '#1d1d1d');
      hand((h % 1) * Math.PI * 2, r * 0.8, 10, '#1d1d1d');
      ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.fill();
    },
  },

  calendar: {
    doc: 'Week calendar page with day columns; highlight some days, cross out others (e.g. a 4-day week).',
    props: { days: 'labels array (default MON..SUN)', on: 'indexes of highlighted days', off: 'indexes crossed out', title: 'header text', progress: '0-1 reveal of marks (defaults to enter progress)', color: 'highlight color' },
    draw(ctx, p, S) {
      const days = p.days || ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], n = days.length, cw = 110, W = n * cw + 40, H = 330;
      paper(ctx, rectPts(W, H), S.key + 'pg', '#fdfcf7', { amp: 3 });
      paper(ctx, rectPts(W, 74, 0, -H / 2 + 37), S.key + 'hd', p.header || '#e63946', { amp: 2, fringe: false, shadow: 0 });
      if (p.title) chip(ctx, S, p.title, 0, -H / 2 + 38, { size: 40, font: 'headline', bg: 'none', color: '#fff' });
      const pr = p.progress ?? S.enterP;
      days.forEach((d, i) => {
        const x = -W / 2 + 20 + cw * (i + 0.5), y = 20;
        chip(ctx, S, d, x, y - 60, { size: 26, bg: 'none', color: '#555' });
        const shown = pr * n > i;
        if ((p.on || []).includes(i)) paper(ctx, rectPts(cw - 16, 120, x, y + 30), S.key + 'on' + i, shown ? (p.color || '#2a9d8f') : '#e9e4d8', { amp: 2, shadow: 0.5 });
        else paper(ctx, rectPts(cw - 16, 120, x, y + 30), S.key + 'd' + i, '#e9e4d8', { amp: 2, shadow: 0.3 });
        if ((p.off || []).includes(i) && shown) { ctx.save(); ctx.strokeStyle = '#e63946'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 36, y - 10); ctx.lineTo(x + 36, y + 70); ctx.moveTo(x + 36, y - 10); ctx.lineTo(x - 36, y + 70); ctx.stroke(); ctx.restore(); }
      });
    },
  },

  bars: {
    doc: 'Paper bar chart. Bars grow with enter progress. Values are relative heights.',
    props: { values: '[number,...]', labels: '["A","B",...]', colors: 'bar colors', max: 'value for full height', h: 'chart height (default 420)', barW: 'bar width (default 110)', gap: 'gap (default 50)', valueLabels: 'true to print values on top', suffix: 'e.g. "%"' },
    draw(ctx, p, S) {
      const vals = p.values || [3, 6, 9], n = vals.length, bw = p.barW || 110, gap = p.gap || 50, H = p.h || 420, max = p.max || Math.max(...vals);
      const W = n * bw + (n - 1) * gap, pr = p.progress ?? S.enterP, cols = p.colors || ['#457b9d', '#e9c46a', '#e63946', '#2a9d8f'];
      ctx.save(); ctx.strokeStyle = '#1d1d1d'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-W / 2 - 30, 0); ctx.lineTo(W / 2 + 30, 0); ctx.stroke(); ctx.restore();
      vals.forEach((v, i) => {
        const x = -W / 2 + bw / 2 + i * (bw + gap), e = ease('back', clamp(pr * 1.4 - i * 0.15)), h = Math.max(2, v / max * H * e);
        paper(ctx, [[x - bw / 2, 0], [x + bw / 2, 0], [x + bw / 2, -h], [x - bw / 2, -h]], S.key + 'b' + i, cols[i % cols.length], { amp: 2.5, ht: '#000000', htA: 0.12 });
        if (p.labels) chip(ctx, S, p.labels[i], x, String(p.labels[i]).includes('\n') ? 70 : 50, { size: 28, bg: '#fdfcf7', color: '#1d1d1d', key: S.key + 'l' + i, rot: (i % 2 ? 0.03 : -0.03) });
        if (p.valueLabels && e > 0.5) chip(ctx, S, nativeDigits(Math.round(v * Math.min(1, e)), S.lang) + (p.suffix || ''), x, -h - 40, { size: 40, font: 'headline', bg: '#fdfcf7', key: S.key + 'v' + i });
      });
    },
  },

  rocket: {
    doc: 'Retro paper rocket (nose up). Add a flame flicker with `thrust` 0-1.',
    props: { color: 'body color', accent: 'fins/nose color', thrust: 'flame size 0-1' },
    draw(ctx, p, S) {
      const k = S.key, th = p.thrust ?? 0, t = twos(S.sec, S.fps);
      if (th > 0) {
        const f = 1 + Math.sin(t * 40) * 0.15;
        paper(ctx, [[-40, 200], [40, 200], [0, 200 + 230 * th * f]], k + 'f1', '#f4a261', { amp: 4, shadow: 0 });
        paper(ctx, [[-22, 200], [22, 200], [0, 200 + 140 * th * f]], k + 'f2', '#ffd166', { amp: 3, shadow: 0, fringe: false });
      }
      paper(ctx, [[-70, 200], [-150, 250], [-150, 160], [-70, 90]], k + 'fl', p.accent || '#e63946', { amp: 2 });
      paper(ctx, [[70, 200], [150, 250], [150, 160], [70, 90]], k + 'fr', p.accent || '#e63946', { amp: 2 });
      paper(ctx, [[-70, 210], [70, 210], [70, -120], [0, -260], [-70, -120]], k + 'b', p.color || '#f1faee', { amp: 2.5, ht: '#c9c3b0', htA: 0.35 });
      paper(ctx, [[-70, -120], [0, -260], [70, -120]], k + 'n', p.accent || '#e63946', { amp: 2 });
      paper(ctx, circlePts(38, 24, 0, -40), k + 'w', '#1d3557', { amp: 1.5, fringeColor: '#adb5bd', fringeW: 2 });
      ctx.fillStyle = '#1d1d1d'; ctx.fillRect(-70, 120, 140, 14);
    },
  },

  planet: {
    doc: 'Planet / moon / sun disc. kind: moon (craters), sun (rays), earth (blue-green), ringed.',
    props: { kind: 'moon | sun | earth | ringed', r: 'radius (default 200)', color: 'override color' },
    draw(ctx, p, S) {
      const r = p.r || 200, k = S.key, rnd = mulberry(hash(k));
      if (p.kind === 'sun') {
        ctx.save(); ctx.rotate(twos(S.sec, S.fps) * 0.2);
        const rays = []; for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2, rr = i % 2 ? r * 1.15 : r * 1.45; rays.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
        paper(ctx, rays, k + 'r', '#f4a261', { amp: 3, shadow: 0.6 }); ctx.restore();
        paper(ctx, circlePts(r, 56), k, p.color || '#ffd166', { amp: 2, ht: '#f4a261', htA: 0.5 }); return;
      }
      if (p.kind === 'ringed') { ctx.save(); ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 18; ctx.rotate(-0.3); ctx.beginPath(); ctx.ellipse(0, 0, r * 1.7, r * 0.45, 0, 0, 7); ctx.stroke(); ctx.restore(); }
      const col = p.color || ({ moon: '#d9d4c7', earth: '#4ea8de', ringed: '#e9c46a' }[p.kind] || '#d9d4c7');
      paper(ctx, circlePts(r, 56), k, col, { amp: 2, ht: '#000000', htA: 0.18 });
      if (p.kind === 'moon' || !p.kind) for (let i = 0; i < 9; i++) { const a = rnd() * 7, d = rnd() * r * 0.7, cr = r * (0.08 + rnd() * 0.12); paper(ctx, circlePts(cr, 18, Math.cos(a) * d, Math.sin(a) * d), k + 'cr' + i, '#bcb6a6', { amp: 1, fringe: false, shadow: 0 }); }
      if (p.kind === 'earth') for (let i = 0; i < 4; i++) { const a = rnd() * 7, d = rnd() * r * 0.55; paper(ctx, circlePts(r * (0.18 + rnd() * 0.15), 16, Math.cos(a) * d, Math.sin(a) * d, r * 0.12), k + 'ld' + i, '#74c69d', { amp: 6, fringe: false, shadow: 0 }); }
    },
  },

  bridge: {
    doc: 'Long truss bridge across the frame with river piers. `progress` builds it span by span.',
    props: { w: 'total length (default 1000)', spans: 'number of spans (default 6)', color: 'steel color', deck: 'deck color', progress: '0-1 build (defaults to enter progress)' },
    draw(ctx, p, S) {
      const W = p.w || 1000, n = p.spans || 6, sw = W / n, pr = p.progress ?? S.enterP, col = p.color || '#2b2d42';
      for (let i = 0; i < n; i++) {
        const e = clamp(pr * n - i); if (e <= 0) continue;
        const x0 = -W / 2 + i * sw;
        paper(ctx, rectPts(26, 160, x0 + sw / 2, 90), S.key + 'p' + i, '#8d99ae', { amp: 1.5 });
        ctx.save(); ctx.globalAlpha *= e;
        ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.lineJoin = 'round'; shadow(ctx, 5, 3);
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + sw, 0); ctx.moveTo(x0, -70); ctx.lineTo(x0 + sw, -70);
        for (let j = 0; j < 4; j++) { const a = x0 + j * sw / 4, b = a + sw / 4; ctx.moveTo(a, 0); ctx.lineTo(b, -70); ctx.moveTo(b, -70); ctx.lineTo(b, 0); }
        ctx.stroke(); ctx.restore();
        paper(ctx, rectPts(sw * e, 18, x0 + sw * e / 2, 8), S.key + 'd' + i, p.deck || '#e63946', { amp: 1.5, shadow: 0.6 });
      }
    },
  },

  cube: {
    doc: 'Isometric Rubik-style cube with colored stickers. `solve` 0 = scrambled, 1 = solved (stickers flip in steps).',
    props: { size: 'edge length (default 300)', solve: '0-1 (keyframe it)', colors: '[top, left, right] solved colors' },
    draw(ctx, p, S) {
      const s = p.size || 300, c = s / 3, cols = p.colors || ['#f1faee', '#e63946', '#2a9d8f'], all = ['#f1faee', '#e63946', '#2a9d8f', '#ffd60a', '#f77f00', '#1d4ed8'];
      const rnd = mulberry(hash(S.key)), solve = clamp(p.solve ?? 0), iso = (x, y, z) => [(x - y) * 0.866, (x + y) * 0.5 - z];
      const face = (fi, pt) => {
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
          const idx = fi * 9 + a * 3 + b, flipAt = rnd(), col = solve > flipAt ? cols[fi] : all[Math.floor(rnd() * 6)];
          const q = [pt(a, b), pt(a + 1, b), pt(a + 1, b + 1), pt(a, b + 1)].map(([x, y, z]) => iso(x * c, y * c, z * c));
          const cx = q.reduce((m, v) => m + v[0], 0) / 4, cy = q.reduce((m, v) => m + v[1], 0) / 4;
          const inset = q.map(([x, y]) => [cx + (x - cx) * 0.84, cy + (y - cy) * 0.84]);
          paper(ctx, inset, S.key + idx, col, { amp: 0.8, fringe: false, shadow: 0 });
        }
      };
      paper(ctx, [iso(0, 0, 3 * c), iso(3 * c, 0, 3 * c), iso(3 * c, 0, 0), iso(3 * c, 3 * c, 0), iso(0, 3 * c, 0), iso(0, 3 * c, 3 * c)].map(([x, y]) => [x, y]), S.key + 'body', '#111111', { amp: 1.5 });
      face(0, (a, b) => [a, b, 3]); face(1, (a, b) => [a, 3, 3 - b]); face(2, (a, b) => [3, a, 3 - b]);
    },
  },

  bread: {
    doc: 'Bread loaf with score lines. Animate `rise` 0.6 -> 1 to make the dough grow.',
    props: { rise: 'scale of the dough 0-1.2', color: 'crust color' },
    draw(ctx, p, S) {
      const r = p.rise ?? 1, k = S.key;
      ctx.save(); ctx.scale(lerp(0.85, 1, r), r);
      const pts = []; for (let i = 0; i <= 30; i++) { const a = Math.PI + i / 30 * Math.PI; pts.push([Math.cos(a) * 260, Math.sin(a) * 150]); }
      pts.push([260, 40], [-260, 40]);
      paper(ctx, pts, k, p.color || '#d4a373', { amp: 3, ht: '#8d5b3a', htA: 0.35 });
      ctx.strokeStyle = '#f3e3c3'; ctx.lineWidth = 9; ctx.lineCap = 'round';
      for (const x of [-120, 0, 120]) { ctx.beginPath(); ctx.moveTo(x - 40, -70); ctx.quadraticCurveTo(x, -110, x + 40, -70); ctx.stroke(); }
      ctx.restore();
      paper(ctx, rectPts(600, 30, 0, 52), k + 'board', '#7b4b36', { amp: 2 });
    },
  },

  bubbles: {
    doc: 'Rising gas bubbles (CO2, fizz, air) inside a box. Absolute if you set w/h around x,y.',
    props: { w: 'area width (default 400)', h: 'area height (default 300)', count: 'number (default 18)', color: 'bubble color', speed: 'rise speed' },
    draw(ctx, p, S) {
      const w = p.w || 400, h = p.h || 300, t = twos(S.sec, S.fps) * (p.speed || 1);
      ctx.save(); ctx.strokeStyle = p.color || '#f1faee'; ctx.lineWidth = 4;
      for (let i = 0; i < (p.count || 18); i++) {
        const r = mulberry(hash(S.key) + i * 31), x = (r() - 0.5) * w + Math.sin(t * 3 + i) * 6, y = h / 2 - ((r() * h + t * (40 + r() * 60)) % h), rad = 6 + r() * 14;
        ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.stroke();
      }
      ctx.restore();
    },
  },

  parachute: {
    doc: 'Parachute canopy with lines and a small figure. Use loop sway while it drifts down.',
    props: { color: 'canopy color', stripe: 'stripe color' },
    draw(ctx, p, S) {
      const k = S.key, pts = []; for (let i = 0; i <= 24; i++) { const a = Math.PI + i / 24 * Math.PI; pts.push([Math.cos(a) * 170, Math.sin(a) * 110]); }
      for (let i = 4; i >= 0; i--) pts.push([-170 + i * 85, (i % 2 ? 18 : 0)]);
      ctx.save(); ctx.strokeStyle = '#555'; ctx.lineWidth = 3; for (const x of [-165, -85, 0, 85, 165]) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(0, 210); ctx.stroke(); } ctx.restore();
      paper(ctx, pts, k + 'c', p.color || '#f1faee', { amp: 2 });
      ctx.save(); pathPoly(ctx, pts); ctx.clip(); ctx.fillStyle = p.stripe || '#e63946'; for (const x of [-120, 0, 120]) ctx.fillRect(x - 25, -120, 50, 140); ctx.restore();
      paper(ctx, [[-22, 200], [22, 200], [26, 290], [-26, 290]], k + 'b', '#1d1d1d', { amp: 1.5 });
      paper(ctx, circlePts(20, 16, 0, 182), k + 'h', '#1d1d1d', { amp: 1 });
    },
  },

  bag: {
    doc: 'Money bag with a $ sign (ransom, budget, cost).',
    props: { color: 'bag color', symbol: 'text on the bag (default $)' },
    draw(ctx, p, S) {
      const k = S.key;
      paper(ctx, [[-60, -170], [60, -170], [30, -120], [-30, -120]], k + 't', p.color || '#c9a96e', { amp: 2 });
      const pts = []; for (let i = 0; i <= 30; i++) { const a = -Math.PI / 2 + i / 30 * Math.PI * 2; pts.push([Math.cos(a) * 150 * (a > 0 && a < Math.PI ? 1 : 0.85), Math.sin(a) * 140 + 20]); }
      paper(ctx, pts, k + 'b', p.color || '#c9a96e', { amp: 3, ht: '#7b5e2e', htA: 0.35 });
      ctx.fillStyle = '#5c3d0e'; ctx.fillRect(-48, -128, 96, 14);
      chip(ctx, S, p.symbol || '$', 0, 30, { size: 140, font: 'headline', bg: 'none', color: '#3d2a0a' });
    },
  },
};
