// Typography: font registry, paper label chips, headline banners, word-reveal captions. Any script (Latin, Bangla, ...).
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
  // OS fallbacks for scripts the bundled fonts do not cover
  for (const f of ['C:/Windows/Fonts/Nirmala.ttc', '/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf']) {
    if (fs.existsSync(f)) try { GlobalFonts.registerFromPath(f); } catch (e) { /* ignore */ }
  }
  fontsLoaded = true;
}

const FALLBACK = '"Hind Siliguri", "Nirmala UI", "Noto Sans", "Arial Unicode MS", Arial, sans-serif';
// role: headline | body | mono
function font(S, role, size) {
  const f = S.fonts[role] || S.fonts.body;
  return `${f.weight || ''} ${Math.round(size * (f.scale || 1))}px "${f.family}", ${FALLBACK}`.trim();
}
const lineH = (S, role) => (S.fonts[role] || S.fonts.body).lh || 1.1;

const NATIVE_DIGITS = { bn: '০১২৩৪৫৬৭৮৯', hi: '०१२३४५६७८९', ar: '٠١٢٣٤٥٦٧٨٩', fa: '۰۱۲۳۴۵۶۷۸۹' };
const nativeDigits = (str, lang) => NATIVE_DIGITS[lang] ? String(str).replace(/\d/g, d => NATIVE_DIGITS[lang][d]) : String(str);

// Text on a torn paper label.
function chip(ctx, S, text, x, y, o = {}) {
  const role = o.font || 'body', size = o.size || 40, lines = String(text).split('\n');
  const lh = size * (o.lh ?? lineH(S, role));
  ctx.font = font(S, role, size);
  const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
  const w = o.w || tw + (o.padX ?? size * 0.55) * 2, h = o.h || lines.length * lh + (o.padY ?? size * 0.32) * 2;
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); const sc = o.scale ?? 1; ctx.scale(sc, sc);
  if (o.jitter) jit(ctx, 'chip' + text, S.sec, o.jitter, S.fps);
  if (o.bg && o.bg !== 'none') paper(ctx, rectPts(w, h), (o.key || text) + '|' + Math.round(w), o.bg, { amp: o.amp ?? 3, shadow: o.shadow ?? 1, ht: o.ht, htA: o.htA });
  ctx.fillStyle = o.color || S.theme.ink; ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle'; ctx.font = font(S, role, size);
  const ax = o.align === 'left' ? -w / 2 + (o.padX ?? size * 0.55) : 0;
  lines.forEach((l, i) => ctx.fillText(l, ax, (i - (lines.length - 1) / 2) * lh + size * (o.base ?? S.fonts[role]?.base ?? 0.04)));
  ctx.restore();
  return { w, h };
}

// Big headline banner, "baked" into the poster (drawn inside the camera).
function banner(ctx, S, hl, sec) {
  if (typeof hl === 'string') hl = { text: hl };
  const style = S.theme.headlineStyles[hl.style || 'dark'] || S.theme.headlineStyles.dark;
  const lines = hl.text.split('\n'); let size = hl.max || 140;
  ctx.font = font(S, 'headline', size);
  while (Math.max(...lines.map(l => ctx.measureText(l).width)) > (hl.maxW || 860) && size > 50) { size -= 4; ctx.font = font(S, 'headline', size); }
  const at = hl.at ?? 0.05;
  const y = lerp(-340, hl.y ?? 300, ease('back', prog(sec, at, 0.5)));
  chip(ctx, S, hl.text, hl.x ?? S.W / 2, y, {
    size, font: 'headline', bg: hl.bg || style.bg, color: hl.color || style.color, rot: hl.rot ?? -0.035,
    padX: 42, padY: 26, lh: lineH(S, 'headline') * 0.98, key: 'ban' + hl.text, amp: 6, jitter: 0.5, ht: style.ht, htA: 0.25,
  });
}

// Captions: torn white strip, words reveal one by one, *highlighted words* get a marker swipe.
function caption(ctx, S, cap, sec) {
  if (!cap) return;
  if (typeof cap === 'string') cap = { text: cap };
  const C = { ...S.theme.caption, ...(S.fonts.caption || {}), ...cap };
  const size = C.size, maxW = C.maxW, lh = size * C.lh;
  ctx.font = font(S, 'body', size);
  const toks = []; let hl = false;
  for (const para of cap.text.split('\n')) {
    for (const raw of para.split(/\s+/).filter(Boolean)) {
      let w = raw; if (w.startsWith('*')) { hl = true; w = w.slice(1); }
      if (w.endsWith('*')) { toks.push({ w: w.slice(0, -1), hl: true }); hl = false; } else toks.push({ w, hl });
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
  const at = cap.at ?? 0, a = ease('back', prog(sec, at, 0.3));
  if (sec < at) return;
  const shown = Math.floor((sec - at) * C.rate) + 2;
  ctx.save(); ctx.translate(S.W / 2, C.y + (1 - a) * 60); ctx.rotate(-0.012); const sc = lerp(0.8, 1, a); ctx.scale(sc, sc);
  paper(ctx, rectPts(bw, bh), 'cap' + cap.text, C.bg, { amp: 4, shadowA: 0.5 });
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.font = font(S, 'body', size);
  let idx = 0;
  lines.forEach((l, li) => {
    let x = -widths[li] / 2; const y = -bh / 2 + 23 + lh * (li + 0.5);
    for (const t of l) {
      if (idx < shown) {
        if (t.hl) { ctx.save(); ctx.translate(x + t.width / 2, y); ctx.rotate(-0.02); ctx.fillStyle = C.highlight; ctx.fillRect(-t.width / 2 - 7, -lh * 0.42, t.width + 14, lh * 0.82); ctx.restore(); }
        ctx.fillStyle = C.color; ctx.fillText(t.w, x, y + size * 0.04);
      }
      x += t.width + sp; idx++;
    }
  });
  ctx.restore();
}

module.exports = { registerFonts, font, lineH, chip, banner, caption, nativeDigits, FALLBACK };
