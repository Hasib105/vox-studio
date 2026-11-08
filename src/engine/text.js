// Typography: font registry, paper label chips, headline banners and captions with per-theme treatments.
'use strict';
const fs = require('fs');
const path = require('path');
const { GlobalFonts } = require('@napi-rs/canvas');
const { lerp, prog, ease } = require('./core');
const { paper, rectPts, jit } = require('./paper');

let fontsLoaded = false;
function registerFonts(extraDirs = []) {
  if (fontsLoaded && !extraDirs.length) return;
  const dirs = [path.join(__dirname, '..', '..', 'assets', 'fonts'), ...extraDirs];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (/\.(ttf|otf|ttc)$/i.test(f)) GlobalFonts.registerFromPath(path.join(d, f));
  }
  for (const f of ['C:/Windows/Fonts/Nirmala.ttc', '/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf']) {
    if (fs.existsSync(f)) try { GlobalFonts.registerFromPath(f); } catch (e) { /* ignore */ }
  }
  fontsLoaded = true;
}

const FALLBACK = '"Hind Siliguri", "Nirmala UI", "Noto Sans", "Arial Unicode MS", Arial, sans-serif';
function font(S, role, size) {
  const f = S.fonts[role] || S.fonts.body;
  return `${f.weight || ''} ${Math.round(size * (f.scale || 1))}px "${f.family}", ${FALLBACK}`.trim();
}
const lineH = (S, role) => (S.fonts[role] || S.fonts.body).lh || 1.1;

const NATIVE_DIGITS = { bn: '০১২৩৪৫৬৭৮৯', hi: '०१२३४५६७८९', ar: '٠١٢٣٤٥٦٧٨٩', fa: '۰۱۲۳۴۵۶۷۸۹' };
const nativeDigits = (str, lang) => NATIVE_DIGITS[lang] ? String(str).replace(/\d/g, d => NATIVE_DIGITS[lang][d]) : String(str);

function measure(ctx, S, text, role, size, o = {}) {
  const lines = String(text).split('\n'), lh = size * (o.lh ?? lineH(S, role));
  ctx.font = font(S, role, size);
  const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
  return { lines, lh, tw, w: o.w || tw + (o.padX ?? size * 0.55) * 2, h: o.h || lines.length * lh + (o.padY ?? size * 0.32) * 2 };
}
function drawLines(ctx, S, m, role, size, color, o = {}) {
  ctx.fillStyle = color; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle'; ctx.font = font(S, role, size);
  const ax = o.align === 'left' ? -m.w / 2 + (o.padX ?? size * 0.55) : 0, base = size * (o.base ?? S.fonts[role]?.base ?? 0.04);
  m.lines.forEach((l, i) => ctx.fillText(l, ax + (o.dx || 0), (i - (m.lines.length - 1) / 2) * m.lh + base + (o.dy || 0)));
}

// Text on a torn paper label.
function chip(ctx, S, text, x, y, o = {}) {
  const role = o.font || 'body', size = o.size || 40;
  const m = measure(ctx, S, text, role, size, o);
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); const sc = o.scale ?? 1; ctx.scale(sc, sc);
  if (o.jitter) jit(ctx, 'chip' + text, S.sec, o.jitter, S.fps);
  if (o.bg && o.bg !== 'none') paper(ctx, rectPts(m.w, m.h), (o.key || text) + '|' + Math.round(m.w), o.bg, { amp: o.amp ?? 3, shadow: o.shadow ?? 1, ht: o.ht, htA: o.htA });
  drawLines(ctx, S, m, role, size, o.color || S.theme.ink, o);
  if (o.tape && o.bg && o.bg !== 'none') require('./backdrop').tape(ctx, 0, -m.h / 2, Math.min(130, m.w * 0.5), (o.rot ? -o.rot : 0) - 0.08, 'tp' + text);
  ctx.restore();
  return { w: m.w, h: m.h };
}

function roundRect(ctx, w, h, r) { ctx.beginPath(); ctx.moveTo(-w / 2 + r, -h / 2); ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r); ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r); ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r); ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r); ctx.closePath(); }

// Headline banner, baked into the poster (drawn inside the camera). Treatment depends on the theme.
function banner(ctx, S, hl, sec) {
  if (typeof hl === 'string') hl = { text: hl };
  const TH = S.theme.headline || {}, kind = hl.kind || TH.kind || 'chip';
  const st = { ...(S.theme.headlineStyles[hl.style || 'dark'] || S.theme.headlineStyles.dark), ...(TH.force || {}) };
  const bg = hl.bg || st.bg, color = hl.color || st.color;
  const lines = hl.text.split('\n'), maxW = hl.maxW || Math.min(S.W * 0.8, 1300);
  let size = (hl.max || 140) * (TH.sizeMul || 1);
  ctx.font = font(S, 'headline', size);
  while (Math.max(...lines.map(l => ctx.measureText(l).width)) > maxW && size > 40) { size -= 3; ctx.font = font(S, 'headline', size); }
  const at = hl.at ?? 0.05, y = lerp(-340, hl.y ?? (S.H > S.W ? 300 : 150), ease('back', prog(sec, at, 0.5)));
  const x = hl.x ?? S.W / 2, rot = hl.rot ?? (TH.rot ?? -0.035), lh = lineH(S, 'headline') * 0.98;
  const m = measure(ctx, S, hl.text, 'headline', size, { padX: 42, padY: 26, lh });
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); jit(ctx, 'ban' + hl.text, sec, 0.5, S.fps);
  const key = 'ban' + hl.text;
  switch (kind) {
    case 'tape':
      paper(ctx, rectPts(m.w, m.h), key, bg, { amp: 4 });
      drawLines(ctx, S, m, 'headline', size, color);
      require('./backdrop').tape(ctx, -m.w / 2 + 40, -m.h / 2 + 6, 120, -0.55, key + 't1');
      require('./backdrop').tape(ctx, m.w / 2 - 40, -m.h / 2 + 6, 120, 0.5, key + 't2');
      break;
    case 'display':
      ctx.save(); ctx.shadowColor = 'rgba(40,25,10,0.35)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 12;
      drawLines(ctx, S, m, 'headline', size, color); ctx.restore();
      ctx.save(); ctx.globalAlpha *= 0.35; drawLines(ctx, S, m, 'headline', size, '#ffffff', { dx: -1.5, dy: -1.5 }); ctx.restore();
      drawLines(ctx, S, m, 'headline', size, color);
      break;
    case 'riso':
      drawLines(ctx, S, m, 'headline', size, TH.ink1 || '#ff48b0');
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha *= 0.85; drawLines(ctx, S, m, 'headline', size, TH.ink2 || '#0078bf', { dx: 7, dy: -6 }); ctx.restore();
      break;
    case 'outline': {
      ctx.fillStyle = 'rgba(13,59,140,0.55)'; ctx.fillRect(-m.w / 2, -m.h / 2, m.w, m.h);
      ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.strokeRect(-m.w / 2, -m.h / 2, m.w, m.h);
      ctx.lineWidth = 2; for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(sx * (m.w / 2 + 18), sy * m.h / 2); ctx.lineTo(sx * (m.w / 2 - 6), sy * m.h / 2); ctx.moveTo(sx * m.w / 2, sy * (m.h / 2 + 18)); ctx.lineTo(sx * m.w / 2, sy * (m.h / 2 - 6)); ctx.stroke(); }
      ctx.font = font(S, 'mono', 22); ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText('FIG. ' + (S.sceneIndex + 1), -m.w / 2, -m.h / 2 - 16);
      drawLines(ctx, S, m, 'headline', size, color);
      break;
    }
    case 'pill': {
      ctx.save(); ctx.shadowColor = 'rgba(27,27,30,0.9)'; ctx.shadowOffsetX = 8; ctx.shadowOffsetY = 9; ctx.fillStyle = bg; roundRect(ctx, m.w + 20, m.h, Math.min(m.h / 2, 90)); ctx.fill(); ctx.restore();
      ctx.strokeStyle = TH.stroke || '#1b1b1e'; ctx.lineWidth = 7; roundRect(ctx, m.w + 20, m.h, Math.min(m.h / 2, 90)); ctx.stroke();
      drawLines(ctx, S, m, 'headline', size, TH.stroke || '#1b1b1e', { dx: 4, dy: 5 });
      drawLines(ctx, S, m, 'headline', size, color);
      break;
    }
    default:
      paper(ctx, rectPts(m.w, m.h), key + '|' + Math.round(m.w), bg, { amp: 6, ht: st.ht, htA: 0.25 });
      drawLines(ctx, S, m, 'headline', size, color);
  }
  ctx.restore();
}

// Captions: words reveal one by one, *highlighted words* get the theme's highlight treatment.
function caption(ctx, S, cap, sec) {
  if (!cap) return;
  if (typeof cap === 'string') cap = { text: cap };
  const C = { ...S.theme.caption, ...(S.fonts.caption || {}), ...cap };
  const role = C.font || 'body', size = C.size, maxW = C.maxW || Math.min(S.W * 0.76, 1250), lh = size * C.lh;
  ctx.font = font(S, role, size);
  const toks = []; let hl = false;
  for (const para of cap.text.split('\n')) {
    for (const raw of para.split(/\s+/).filter(Boolean)) {
      let w = raw; if (w.startsWith('*')) { hl = true; w = w.slice(1); }
      const end = w.match(/^(.*)\*([.,;:!?।)"'’]*)$/); // "word*," closes a highlight before trailing punctuation
      if (end) { toks.push({ w: end[1] + end[2], hl: true }); hl = false; } else toks.push({ w, hl });
    }
    toks.push({ br: true });
  }
  toks.pop();
  const sp = ctx.measureText(' ').width, lines = [[]]; let lw = 0;
  for (const t of toks) {
    if (t.br) { lines.push([]); lw = 0; continue; }
    t.width = ctx.measureText(t.w).width;
    if (lw + t.width > maxW && lines[lines.length - 1].length) { lines.push([]); lw = 0; }
    lines[lines.length - 1].push(t); lw += t.width + sp;
  }
  const widths = lines.map(l => l.reduce((a, t) => a + t.width, 0) + sp * Math.max(0, l.length - 1));
  const bw = Math.max(...widths) + 70, bh = lines.length * lh + 46;
  const at = cap.at ?? 0; if (sec < at) return;
  const a = ease('back', prog(sec, at, 0.3)), shown = Math.floor((sec - at) * C.rate) + 2;
  ctx.save(); ctx.translate(S.W / 2, C.y + (1 - a) * 60); ctx.rotate(C.rot ?? -0.012); const sc = lerp(0.8, 1, a); ctx.scale(sc, sc);
  const key = 'cap' + cap.text;
  switch (C.box) {
    case 'outline': ctx.fillStyle = C.bg; ctx.fillRect(-bw / 2, -bh / 2, bw, bh); ctx.strokeStyle = C.border || '#e9f2ff'; ctx.lineWidth = 3; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh); break;
    case 'pill': ctx.save(); ctx.shadowColor = 'rgba(27,27,30,0.85)'; ctx.shadowOffsetX = 6; ctx.shadowOffsetY = 7; ctx.fillStyle = C.bg; roundRect(ctx, bw, bh, 40); ctx.fill(); ctx.restore(); ctx.strokeStyle = C.border || '#1b1b1e'; ctx.lineWidth = 5; roundRect(ctx, bw, bh, 40); ctx.stroke(); break;
    case 'tape': paper(ctx, rectPts(bw, bh), key, C.bg, { amp: 4, shadowA: 0.45 }); require('./backdrop').tape(ctx, -bw / 2 + 30, -bh / 2 + 4, 110, -0.6, key + 'a'); require('./backdrop').tape(ctx, bw / 2 - 30, -bh / 2 + 4, 110, 0.55, key + 'b'); break;
    default: paper(ctx, rectPts(bw, bh), key, C.bg, { amp: 4, shadowA: 0.5 });
  }
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = font(S, role, size);
  let idx = 0;
  lines.forEach((l, li) => {
    let x = -widths[li] / 2; const y = -bh / 2 + 23 + lh * (li + 0.5);
    for (const t of l) {
      if (idx < shown) {
        let col = C.color;
        if (t.hl) {
          ctx.save(); ctx.translate(x + t.width / 2, y);
          switch (C.highlight) {
            case 'invert': ctx.fillStyle = C.highlightColor; ctx.fillRect(-t.width / 2 - 7, -lh * 0.42, t.width + 14, lh * 0.84); col = C.highlightText || '#ffffff'; break;
            case 'underline': ctx.fillStyle = C.highlightColor; ctx.fillRect(-t.width / 2 - 2, lh * 0.22, t.width + 4, Math.max(5, size * 0.13)); col = C.highlightText || C.color; break;
            case 'box': ctx.strokeStyle = C.highlightColor; ctx.lineWidth = 3; ctx.strokeRect(-t.width / 2 - 6, -lh * 0.4, t.width + 12, lh * 0.8); col = C.highlightText || C.color; break;
            default: ctx.rotate(-0.02); ctx.fillStyle = C.highlightColor; ctx.fillRect(-t.width / 2 - 7, -lh * 0.42, t.width + 14, lh * 0.82); col = C.highlightText || C.color;
          }
          ctx.restore();
        }
        ctx.fillStyle = col; ctx.fillText(t.w, x, y + size * 0.04);
      }
      x += t.width + sp; idx++;
    }
  });
  ctx.restore();
}

module.exports = { registerFonts, font, lineH, chip, banner, caption, nativeDigits, FALLBACK, roundRect };
