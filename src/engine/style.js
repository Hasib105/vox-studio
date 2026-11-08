// Global style state for the current frame: palette tokens ($name), color remapping per theme, paper treatment.
// Colors are remapped at the canvas level (fillStyle / strokeStyle / shadowColor), so every component restyles
// itself automatically: one story, many looks.
'use strict';
const { createCanvas } = require('@napi-rs/canvas');

let MAPPER = null, MAPNAME = 'none', PALETTE = {}, PAPER = defaultPaper();
const cache = new Map();

function defaultPaper() {
  return { edge: 'torn', ampMul: 1, fringe: true, fringeColor: '#f6f0e1', fringeW: 1, shadow: 'soft', shadowA: 1, misreg: null, outline: null, bevel: false, htMul: 1 };
}

// ---- color math ----
const NAMED = { white: '#ffffff', black: '#000000', red: '#ff0000', transparent: 'rgba(0,0,0,0)' };
function parse(c) {
  if (typeof c !== 'string') return null;
  c = c.trim(); if (NAMED[c]) c = NAMED[c];
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map(x => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  const m = c.match(/^rgba?\(([^)]+)\)$/i);
  if (m) { const p = m[1].split(',').map(s => parseFloat(s)); return [p[0], p[1], p[2], p[3] ?? 1]; }
  return null;
}
const toStr = ([r, g, b, a]) => a >= 1 ? '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('') : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+a.toFixed(3)})`;
function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
const hueToward = (h, target, k) => h + ((((target - h) % 360) + 540) % 360 - 180) * k; // shortest way around the wheel
const mixRgb = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const hex = h => parse(h).slice(0, 3);
const lum = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
function nearest(c, list) { let best = list[0], bd = 1e9; for (const p of list) { const d = (c[0] - p[0]) ** 2 * 0.3 + (c[1] - p[1]) ** 2 * 0.59 + (c[2] - p[2]) ** 2 * 0.11; if (d < bd) { bd = d; best = p; } } return best; }

// ---- per-theme color maps: (rgb, hsl) -> rgb ----
const MAPS = {
  none: null,
  warm: (c, [h, s, l]) => hsl2rgb(hueToward(h, 30, 0.06), s * 0.88, l),
  protest: (c, [h, s, l]) => {
    if (s > 0.45 && (h < 22 || h > 335) && l > 0.25 && l < 0.75) return hex('#e63946');
    if (s > 0.55 && h >= 40 && h <= 62 && l > 0.45) return hex('#ffd23f');
    const k = Math.min(1, Math.max(0, (lum(c) - 0.08) / 0.84));
    return mixRgb(hex('#142a6e'), hex('#f3eee2'), Math.pow(k, 0.9));
  },
  papercraft: (c, [h, s, l]) => hsl2rgb(hueToward(h, 32, 0.1), s * 0.68, 0.16 + l * 0.76),
  noir: (c, [h, s, l]) => {
    if (s > 0.45 && (h < 18 || h > 340) && l > 0.25 && l < 0.7) return hex('#d62828');
    const v = Math.min(1, Math.max(0, (lum(c) - 0.5) * 1.35 + 0.5)); return mixRgb(hex('#141414'), hex('#efebe2'), v);
  },
  riso: (c, [h, s, l]) => {
    if (l > 0.86) return hex('#f7f3ea');
    if (l < 0.3 || s < 0.12 && l < 0.5) return hex('#2b2a4c');
    if (s < 0.12) return mixRgb(hex('#2b2a4c'), hex('#f7f3ea'), l);
    let ink = h < 40 || h >= 290 ? '#ff48b0' : h < 75 ? '#ffd400' : h < 165 ? '#00a95c' : '#0078bf';
    const base = hex(ink); return l > 0.62 ? mixRgb(base, hex('#f7f3ea'), (l - 0.62) * 1.4) : base;
  },
  blueprint: (c) => { const k = lum(c); return mixRgb(hex('#0d3b8c'), hex('#e9f2ff'), 0.12 + k * 0.88); },
  retro: (c) => {
    const pal = ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#7b4b36', '#f3e3c3', '#c8553d', '#1b1b1e'].map(hex);
    return nearest(c, pal);
  },
};

function mapColor(v) {
  if (typeof v !== 'string') return v;
  if (v[0] === '$') { const t = PALETTE[v.slice(1)]; if (t === undefined) return v; v = t; }
  if (!MAPPER) return v;
  const key = v; const hit = cache.get(key); if (hit) return hit;
  const c = parse(v); if (!c) return v;
  const out = toStr([...MAPPER(c, rgb2hsl(c[0], c[1], c[2])), c[3]]);
  if (cache.size > 5000) cache.clear(); cache.set(key, out); return out;
}

// patch canvas color setters once
let patched = false;
function installPatch() {
  if (patched) return; patched = true;
  const proto = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d'));
  for (const prop of ['fillStyle', 'strokeStyle', 'shadowColor']) {
    let d = null, o = proto; while (o && !(d = Object.getOwnPropertyDescriptor(o, prop))) o = Object.getPrototypeOf(o);
    if (!d || !d.set) continue;
    Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get() { return d.get.call(this); }, set(v) { d.set.call(this, mapColor(v)); } });
  }
}

function setStyle(theme) {
  installPatch();
  const name = theme.colorMap || 'none';
  if (name !== MAPNAME) { MAPNAME = name; MAPPER = MAPS[name] || null; cache.clear(); }
  PALETTE = theme.palette || {};
  PAPER = { ...defaultPaper(), ...(theme.paperStyle || {}) };
}
const paperStyle = () => PAPER;
const styleId = () => MAPNAME;
const raw = c => (typeof c === 'string' && c[0] === '$' ? PALETTE[c.slice(1)] ?? c : c);

module.exports = { setStyle, paperStyle, styleId, mapColor, parse, toStr, rgb2hsl, hsl2rgb, mixRgb, lum, raw, MAPS };
