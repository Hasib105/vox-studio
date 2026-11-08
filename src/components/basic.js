// Basic collage pieces: paper shapes, labels, newspaper scraps, hazard tape, starbursts, stamps, photos.
'use strict';
const { createCanvas } = require('@napi-rs/canvas');
const { mulberry, hash, twos } = require('../engine/core');
const { paper, rectPts, circlePts, starPts, torn, pathPoly, htTile, bbox } = require('../engine/paper');
const { chip, font, nativeDigits } = require('../engine/text');

module.exports = {
  paper: {
    doc: 'A plain torn-paper shape. Building block for skies, cards, suns, panels.',
    props: { shape: 'rect | circle | star | poly (default rect)', w: 'width', h: 'height', r: 'radius (circle/star outer)', r2: 'star inner radius', n: 'star points', points: '[[x,y],...] for poly (relative to x,y)', color: 'fill color', ht: 'halftone dot color', htA: 'halftone opacity 0-1', amp: 'torn-edge roughness (default 4)', fringe: 'false to hide the cream torn edge', shadow: '0 to disable drop shadow' },
    draw(ctx, p, S) {
      let pts;
      if (p.shape === 'circle') pts = circlePts(p.r || 100, Math.max(24, Math.round((p.r || 100) / 4)));
      else if (p.shape === 'star') pts = starPts(p.r2 || (p.r || 200) * 0.6, p.r || 200, p.n || 14);
      else if (p.shape === 'poly') pts = p.points;
      else pts = rectPts(p.w || 300, p.h || 200);
      paper(ctx, pts, S.key, p.color || '#f3e9d2', { amp: p.amp ?? 4, step: p.step, ht: p.ht, htA: p.htA, htSp: p.htSp, fringe: p.fringe, shadow: p.shadow, fringeColor: p.fringeColor });
    },
  },

  label: {
    doc: 'Text printed on a torn paper chip (tags, place names, kickers). Supports \\n line breaks.',
    props: { text: 'the words', size: 'font size px (default 40)', font: 'headline | body | mono', bg: 'paper color or "none"', color: 'text color', w: 'fixed width', h: 'fixed height', padX: 'horizontal padding', rot: 'rotation radians', align: 'center | left' },
    draw(ctx, p, S) {
      chip(ctx, S, p.text ?? '', 0, 0, { size: p.size || 40, font: p.font || 'body', bg: p.bg ?? '#fdfcf7', color: p.color, w: p.w, h: p.h, padX: p.padX, padY: p.padY, key: S.key, lh: p.lh, align: p.align, amp: p.amp, ht: p.ht });
    },
  },

  text: {
    doc: 'Bare text with no paper behind it (e.g. a country name printed on a map, a big number).',
    props: { text: 'the words', size: 'font size', font: 'headline | body | mono', color: 'text color', stroke: 'optional outline color', strokeW: 'outline width' },
    draw(ctx, p, S) {
      if (p.stroke) { ctx.save(); ctx.font = font(S, p.font || 'headline', p.size || 80); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = p.strokeW || 8; ctx.strokeStyle = p.stroke; ctx.lineJoin = 'round'; String(p.text).split('\n').forEach((l, i, a) => ctx.strokeText(l, 0, (i - (a.length - 1) / 2) * (p.size || 80) * 1.1)); ctx.restore(); }
      chip(ctx, S, p.text ?? '', 0, 0, { size: p.size || 80, font: p.font || 'headline', bg: 'none', color: p.color });
    },
  },

  newspaper: {
    doc: 'A torn newspaper clipping with a fake headline bar and text lines. Great background filler.',
    props: { w: 'width (default 300)', h: 'height (default 220)', color: 'paper color', ink: 'line color' },
    draw(ctx, p, S) {
      const w = p.w || 300, h = p.h || 220;
      paper(ctx, rectPts(w, h), S.key, p.color || '#ebe2cc', { amp: 5, shadow: 0.8 });
      const r = mulberry(hash(S.key));
      ctx.fillStyle = p.ink || '#3b3b3b'; ctx.fillRect(-w / 2 + 18, -h / 2 + 18, w * (0.55 + r() * 0.3), 22);
      ctx.globalAlpha *= 0.55;
      for (let yy = -h / 2 + 56; yy < h / 2 - 14; yy += 13) ctx.fillRect(-w / 2 + 18, yy, (w - 36) * (0.6 + r() * 0.4), 5);
    },
  },

  hazard: {
    doc: 'Yellow/black diagonal hazard tape strip.',
    props: { w: 'length (default 1400)', h: 'thickness (default 74)', color: 'stripe base', stripe: 'stripe color' },
    draw(ctx, p, S) {
      const w = p.w || 1400, h = p.h || 74;
      const poly = paper(ctx, rectPts(w, h), S.key, p.color || '#ffd60a', { amp: 4 });
      ctx.save(); pathPoly(ctx, poly); ctx.clip(); ctx.fillStyle = p.stripe || '#111';
      for (let x = -w / 2 - h; x < w / 2 + h; x += 70) { ctx.beginPath(); ctx.moveTo(x, -h / 2); ctx.lineTo(x + 35, -h / 2); ctx.lineTo(x + 35 - h, h / 2); ctx.lineTo(x - h, h / 2); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    },
  },

  starburst: {
    doc: 'Radial paper starburst, the classic "reveal" backdrop. Use loop spin/pulse for energy.',
    props: { r: 'outer radius (default 300)', r2: 'inner radius', n: 'number of rays (default 14)', color: 'fill', ht: 'halftone color' },
    draw(ctx, p, S) { paper(ctx, starPts(p.r2 || (p.r || 300) * 0.62, p.r || 300, p.n || 14), S.key, p.color || '#ffd60a', { amp: 3, step: 16, ht: p.ht, htA: 0.3 }); },
  },

  stamp: {
    doc: 'Rubber-stamp text in a double outline box (BLOCKED, BANNED, CONFIRMED). Pair with enter "stamp".',
    props: { text: 'stamp words', size: 'font size (default 150)', color: 'ink color (default red)', w: 'box width', h: 'box height' },
    draw(ctx, p, S) {
      const size = p.size || 150; ctx.font = font(S, 'headline', size);
      const w = p.w || ctx.measureText(p.text || 'STAMP').width + 120, h = p.h || size * 1.35;
      ctx.globalAlpha *= 0.92; ctx.strokeStyle = p.color || '#d00000'; ctx.lineWidth = 16; ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.lineWidth = 5; ctx.strokeRect(-w / 2 + 20, -h / 2 + 19, w - 40, h - 38);
      ctx.fillStyle = p.color || '#d00000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.text || 'STAMP', 0, size * 0.05);
      // ink wear: punch small holes with the background via destination-out speckles
      const r = mulberry(hash(S.key)); ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 60; i++) { ctx.beginPath(); ctx.arc((r() - .5) * w, (r() - .5) * h, 1 + r() * 4, 0, 7); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
    },
  },

  question: {
    doc: 'A "?" on a paper card. Use for unknowns, open questions.',
    props: { size: 'glyph size (default 90)', bg: 'card color', color: 'glyph color', round: 'true for a circle card' },
    draw(ctx, p, S) {
      const size = p.size || 90;
      if (p.round) { paper(ctx, circlePts(size * 0.8, 34), S.key, p.bg || '#e63946', { amp: 3 }); chip(ctx, S, '?', 0, 4, { size: size * 1.1, font: 'headline', bg: 'none', color: p.color || '#fff' }); }
      else chip(ctx, S, '?', 0, 0, { size, font: 'headline', bg: p.bg || '#e63946', color: p.color || '#fff', w: size * 1.1, h: size * 1.45, key: S.key });
    },
  },

  pin: {
    doc: 'Red push-pin (marks a location on a map or a note).',
    props: { color: 'head color' },
    draw(ctx, p, S) {
      ctx.strokeStyle = '#555'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, 34); ctx.stroke();
      paper(ctx, circlePts(22, 18), S.key, p.color || '#e63946', { amp: 1.5, fringeW: 3 });
    },
  },

  counter: {
    doc: 'Ransom-note number counter: each digit on its own torn chip. Animate `value` with keyframes.',
    props: { value: 'number (keyframe it: {"from":0,"to":130,"at":0.2,"dur":2})', pad: 'zero-pad digits (default 3)', suffix: 'e.g. "+" or "%"', suffixAt: 'second the suffix pops in', size: 'digit size (default 250)', bg: 'digit chip color', color: 'digit color', suffixBg: 'suffix chip color', native: 'true = native digits for the story language (e.g. Bangla)' },
    draw(ctx, p, S) {
      const v = Math.round(p.value ?? 0); let str = String(v).padStart(p.pad ?? 3, '0');
      if (p.native !== false) str = nativeDigits(str, S.lang);
      const showSuffix = p.suffix && (p.suffixAt === undefined || S.sec >= p.suffixAt);
      const chars = [...str, ...(showSuffix ? [p.suffix] : [])], n = chars.length, size = p.size || 250, cw = size * 0.76, gap = size * 0.84;
      const rots = [-0.06, 0.04, -0.03, 0.06, -0.05];
      chars.forEach((c, i) => {
        const isSuf = showSuffix && i === n - 1;
        const sc = isSuf ? require('../engine/core').ease('back', (S.sec - p.suffixAt) / 0.35) : 1;
        chip(ctx, S, c, (i - (n - 1) / 2) * gap, i % 2 ? 14 : -10, { size, font: 'headline', w: cw, h: size * 1.16, bg: isSuf ? (p.suffixBg || '#c1121f') : (p.bg || '#111'), color: p.color || '#fff', rot: rots[i % 5], scale: sc, key: S.key + 'd' + i, amp: 5, base: 0.06, jitter: 0.7 });
      });
    },
  },

  photo: {
    doc: 'Your own image as a collage cut-out: white paper border, torn edge, shadow, optional duotone/halftone. PNG with transparency + cutout:true gives a sticker outline.',
    props: { src: 'image path (relative to the story file)', w: 'display width (default 500)', duotone: '["#dark", "#light"] recolor', grayscale: 'true for B&W print look', ht: 'halftone overlay color', border: 'paper border px (default 16)', cutout: 'true for transparent PNG sticker mode' },
    draw(ctx, p, S) {
      const img = S.images[p.src];
      if (!img) { require('./basic').label.draw(ctx, { text: 'missing ' + p.src, size: 24 }, S); return; }
      const w = p.w || 500, h = w * img.height / img.width;
      const src = processed(img, p);
      if (p.cutout) {
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 9;
        const b = p.border ?? 12, wc = whiteSil(src);
        for (let a = 0; a < 16; a++) ctx.drawImage(wc, -w / 2 + Math.cos(a / 16 * 6.283) * b, -h / 2 + Math.sin(a / 16 * 6.283) * b, w, h);
        ctx.restore(); ctx.drawImage(src, -w / 2, -h / 2, w, h);
        return;
      }
      const b = p.border ?? 16;
      paper(ctx, rectPts(w + b * 2, h + b * 2), S.key, '#fbf8f0', { amp: 5 });
      const inner = torn(rectPts(w, h), S.key + 'in', 2.5, 14);
      ctx.save(); pathPoly(ctx, inner); ctx.clip(); ctx.drawImage(src, -w / 2, -h / 2, w, h);
      if (p.ht) { ctx.globalAlpha *= 0.3; const bb = bbox(inner); ctx.drawImage(htTile(p.ht, 12), bb.x, bb.y); }
      ctx.restore();
    },
  },

  scraps: {
    doc: 'Confetti of small paper bits drifting down across the whole frame (absolute, full screen).',
    absolute: true,
    props: { count: 'number of bits (default 16)', colors: 'array of colors', speed: 'fall speed multiplier' },
    draw(ctx, p, S) {
      const cols = p.colors || ['#e63946', '#f1faee', '#ffd60a'], t = twos(S.sec, S.fps);
      for (let i = 0; i < (p.count || 16); i++) {
        const r = mulberry(hash(S.key) + i * 97), x = r() * 1080, sp = (120 + r() * 160) * (p.speed || 1), y = ((r() * 1920 + t * sp) % 2020) - 50;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * (r() - .5) * 4); ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-10, -6, 20, 12); ctx.restore();
      }
    },
  },

  halftone: {
    doc: 'Background halftone dot field (absolute). Adds print texture to a flat background.',
    absolute: true,
    props: { color: 'dot color', x: 'left', y: 'top', alpha: 'opacity (default 0.22)', spacing: 'dot spacing (default 20)' },
    draw(ctx, p) { ctx.globalAlpha *= p.alpha ?? 0.22; ctx.drawImage(htTile(p.color || '#000', p.spacing || 20), p.x ?? -150, p.y ?? 500); },
  },
};

// image processing caches
const procCache = new WeakMap();
function processed(img, p) {
  if (!p.duotone && !p.grayscale) return img;
  let m = procCache.get(img); if (!m) procCache.set(img, m = {});
  const k = JSON.stringify([p.duotone, p.grayscale]); if (m[k]) return m[k];
  const c = createCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const id = x.getImageData(0, 0, img.width, img.height), d = id.data;
  const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = p.duotone ? p.duotone.map(hx) : [[20, 20, 20], [245, 240, 228]];
  for (let i = 0; i < d.length; i += 4) {
    let l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; l = Math.min(1, Math.max(0, (l - 0.5) * 1.25 + 0.5));
    d[i] = a[0] + (b[0] - a[0]) * l; d[i + 1] = a[1] + (b[1] - a[1]) * l; d[i + 2] = a[2] + (b[2] - a[2]) * l;
  }
  x.putImageData(id, 0, 0); return (m[k] = c);
}
const silCache = new WeakMap();
function whiteSil(img) {
  if (silCache.has(img)) return silCache.get(img);
  const c = createCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fbf8f0'; x.fillRect(0, 0, img.width, img.height);
  silCache.set(img, c); return c;
}
