// Theme presets: palette, fonts per role (and per language), caption style, texture strength.
'use strict';

const base = {
  ink: '#111111',
  paper: '#f6f0e1',
  jitter: 0.7,        // stop-motion boil amount on every element
  grain: 0.6,         // paper grain overlay strength (multiply)
  vignette: 0.38,
  fonts: {
    headline: { family: 'Anton', lh: 1.0, base: 0.05 },
    body: { family: 'Archivo Black', lh: 1.1 },
    mono: { family: 'Courier Prime', weight: 'bold', lh: 1.1 },
  },
  fontsByLang: {
    bn: {
      headline: { family: 'Hind Siliguri', weight: 'bold', lh: 1.22, base: 0.08 },
      body: { family: 'Hind Siliguri', weight: 'bold', lh: 1.3, base: 0.08, scale: 1.12 },
      mono: { family: 'Hind Siliguri', weight: '600', lh: 1.3, base: 0.08, scale: 1.12 },
      caption: { size: 50, lh: 1.5, rate: 8 },
    },
    hi: {
      headline: { family: 'Nirmala UI', weight: 'bold', lh: 1.25 },
      body: { family: 'Nirmala UI', weight: 'bold', lh: 1.3 },
      mono: { family: 'Nirmala UI', weight: 'bold', lh: 1.3 },
      caption: { size: 54, lh: 1.5, rate: 8 },
    },
  },
  caption: { y: 1450, size: 50, lh: 1.36, maxW: 820, rate: 10, bg: '#fdfcf7', color: '#111111', highlight: '#ffd60a' },
  headlineStyles: {
    dark: { bg: '#111111', color: '#ffffff' },
    light: { bg: '#fdfcf7', color: '#111111' },
    red: { bg: '#c1121f', color: '#ffffff' },
    yellow: { bg: '#ffd60a', color: '#111111' },
    cream: { bg: '#f1faee', color: '#c1121f' },
    accent: { bg: '#111111', color: '#ffd60a' },
  },
  palette: { red: '#c1121f', navy: '#14213d', teal: '#2a9d8f', mustard: '#f2b134', orange: '#e76f51', slate: '#3d5a80', sea: '#1d3f66', cream: '#f3e9d2', yellow: '#ffd60a' },
};

const THEMES = {
  'vox-news': base,
  'swiss': {
    ...base, jitter: 0.4, grain: 0.45,
    fonts: { ...base.fonts, headline: { family: 'Archivo Black', lh: 1.05 } },
    headlineStyles: { ...base.headlineStyles, dark: { bg: '#e63946', color: '#ffffff' } },
    caption: { ...base.caption, highlight: '#e63946', color: '#111111' },
  },
  'zine': {
    ...base, jitter: 1.2, grain: 0.75, vignette: 0.45,
    caption: { ...base.caption, highlight: '#ff4fa3' },
    headlineStyles: { ...base.headlineStyles, dark: { bg: '#111111', color: '#ff4fa3' } },
  },
};

function resolveTheme(name, overrides = {}, lang = 'en') {
  const t = THEMES[name || 'vox-news'];
  if (!t) throw new Error(`Unknown theme "${name}". Available: ${Object.keys(THEMES).join(', ')}`);
  const theme = deepMerge(t, overrides);
  const fonts = deepMerge(theme.fonts, (theme.fontsByLang || {})[lang] || {});
  return { theme, fonts };
}
function deepMerge(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const k in b) out[k] = a && typeof a[k] === 'object' && !Array.isArray(a[k]) ? deepMerge(a[k], b[k]) : b[k];
  return out;
}

module.exports = { THEMES, resolveTheme, deepMerge };
