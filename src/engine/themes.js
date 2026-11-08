// Visual styles. Each theme restyles ANY story: fonts, color remap, paper treatment, background, headline,
// caption, decor. Switch with "theme" in the story or `--theme <name>` on the CLI.
'use strict';

const BN = (headline = 'Hind Siliguri', hand = 'Galada') => ({
  headline: { family: headline, weight: headline === 'Hind Siliguri' ? 'bold' : '', lh: 1.22, base: 0.08, scale: 1 },
  body: { family: 'Hind Siliguri', weight: 'bold', lh: 1.3, base: 0.08, scale: 1.12 },
  mono: { family: 'Hind Siliguri', weight: '600', lh: 1.3, base: 0.08, scale: 1.12 },
  hand: { family: hand, lh: 1.25, base: 0.06, scale: 1.1 },
  caption: { size: 50, lh: 1.5, rate: 8 },
});
const HI = { headline: { family: 'Nirmala UI', weight: 'bold', lh: 1.25 }, body: { family: 'Nirmala UI', weight: 'bold', lh: 1.3 }, mono: { family: 'Nirmala UI', weight: 'bold', lh: 1.3 }, hand: { family: 'Nirmala UI', weight: 'bold', lh: 1.3 }, caption: { size: 54, lh: 1.5, rate: 8 } };

const base = {
  label: 'Vox News', description: 'Bold flat color per scene, torn paper chips, yellow marker captions. The classic.',
  ink: '#111111', jitter: 0.7, grain: 0.6, vignette: 0.38, colorMap: 'none', decor: null,
  palette: { accent: '#ffd60a', accent2: '#2a9d8f', pink: '#ff6b8b', red: '#e63946', ink: '#111111', paper: '#fdfcf7' },
  fonts: {
    headline: { family: 'Anton', lh: 1.0, base: 0.05 },
    body: { family: 'Archivo Black', lh: 1.1 },
    mono: { family: 'Courier Prime', weight: 'bold', lh: 1.1 },
    hand: { family: 'Caveat Brush', lh: 1.1, scale: 1.15 },
  },
  fontsByLang: { bn: BN(), hi: HI },
  paperStyle: {},
  background: { kind: 'flat' },
  headline: { kind: 'chip' },
  headlineStyles: {
    dark: { bg: '#111111', color: '#ffffff' }, light: { bg: '#fdfcf7', color: '#111111' }, red: { bg: '#c1121f', color: '#ffffff' },
    yellow: { bg: '#ffd60a', color: '#111111' }, cream: { bg: '#f1faee', color: '#c1121f' }, accent: { bg: '#111111', color: '#ffd60a' },
  },
  caption: { y: 1450, size: 50, lh: 1.36, rate: 10, box: 'torn', bg: '#fdfcf7', color: '#111111', highlight: 'marker', highlightColor: '#ffd60a' },
  labelFont: 'body', labelTape: false,
};
const T = (over) => deepMerge(base, over);

const THEMES = {
  'vox-news': base,

  scrapbook: T({
    label: 'Scrapbook', description: 'Cream grid paper, taped headlines, geometric accents, a big colored circle and torn bottom strip. Warm editorial mixed-media.',
    colorMap: 'warm', grain: 0.45, vignette: 0.2, decor: 'scrapbook', decorCount: 5, labelTape: true,
    palette: { accent: '#e9b949', accent2: '#4f9d8e', pink: '#e07a8b' },
    paperStyle: { fringeColor: '#fbf8f1', fringeW: 1.1, shadowA: 0.8 },
    background: { kind: 'grid', base: '#f2ebdd', accent: 'both', stripColor: '#4f9d8e' },
    headline: { kind: 'tape', force: { bg: '#f7f1e3', color: '#151515' } },
    caption: { box: 'tape', bg: '#fbf7ee', highlight: 'marker', highlightColor: '#f2c94c' },
  }),

  protest: T({
    label: 'Protest Poster', description: 'Blue duotone newsprint photomontage, red and yellow accents, hand-lettered signs, tape. Loud and political.',
    colorMap: 'protest', grain: 0.6, vignette: 0.35, decor: 'protest', decorCount: 3, labelFont: 'hand', labelTape: true, jitter: 0.9,
    paperStyle: { ampMul: 1.25, fringeColor: '#f3eee2', shadowA: 1.1, htMul: 1.3 },
    background: { kind: 'newsprint', dots: '#0a1a4a' },
    headline: { kind: 'tape', force: { bg: '#f3eee2', color: '#141414' } },
    caption: { box: 'tape', bg: '#f3eee2', color: '#141414', highlight: 'invert', highlightColor: '#e63946', highlightText: '#ffffff' },
  }),

  papercraft: T({
    label: 'Papercraft', description: 'Warm cream fiber paper, clean-cut layered paper with deep dimensional shadows, display serif headline. Calm and premium.',
    colorMap: 'papercraft', grain: 0.3, vignette: 0.16, jitter: 0.35,
    fonts: { headline: { family: 'Abril Fatface', lh: 1.08, base: 0.04 } },
    fontsByLang: { bn: BN('Tiro Bangla', 'Galada') },
    paperStyle: { edge: 'cut', ampMul: 0.12, fringe: false, shadow: 'deep', bevel: true, htMul: 0.35 },
    background: { kind: 'fiber', base: '#ece3d2', accent: 'none' },
    headline: { kind: 'display', force: { color: '#2f2418' }, rot: 0, sizeMul: 1.05 },
    caption: { box: 'torn', bg: '#f7f1e6', color: '#2f2418', highlight: 'underline', highlightColor: '#c8553d' },
  }),

  noir: T({
    label: 'Noir Investigation', description: 'Black and white newsprint, heavy grain, a single red accent, typewriter captions. Serious, investigative.',
    colorMap: 'noir', grain: 0.85, vignette: 0.55, jitter: 0.6,
    fonts: { headline: { family: 'Bebas Neue', lh: 0.95, base: 0.06, scale: 1.15 }, body: { family: 'Courier Prime', weight: 'bold', lh: 1.2 } },
    fontsByLang: { bn: BN('Hind Siliguri', 'Tiro Bangla') },
    paperStyle: { fringeColor: '#efebe2', shadowA: 1.25, htMul: 1.5 },
    background: { kind: 'newsprint', dots: '#000000' },
    headline: { kind: 'chip' },
    caption: { box: 'torn', bg: '#efebe2', color: '#141414', size: 48, highlight: 'invert', highlightColor: '#141414', highlightText: '#efebe2' },
  }),

  riso: T({
    label: 'Risograph', description: 'Riso print on off-white paper: fluorescent pink, blue and yellow inks, off-register overprint, speckle grain. Playful zine.',
    colorMap: 'riso', grain: 0.45, vignette: 0.1, decor: 'riso', decorCount: 3, jitter: 0.8,
    fonts: { headline: { family: 'Rubik Mono One', lh: 1.12, base: 0.04, scale: 0.78 }, mono: { family: 'Space Mono', weight: 'bold', lh: 1.15 } },
    paperStyle: { ampMul: 0.5, fringe: false, shadow: 'none', misreg: { dx: 6, dy: -5, alpha: 0.32, color: '#ff48b0' }, htMul: 0.9 },
    background: { kind: 'riso', base: '#f7f3ea', accent: 'blob' },
    headline: { kind: 'riso', ink1: '#ff48b0', ink2: '#0078bf', rot: -0.02 },
    caption: { box: 'torn', bg: '#fbf8f1', color: '#2b2a4c', highlight: 'marker', highlightColor: '#ff9fd2' },
  }),

  blueprint: T({
    label: 'Blueprint', description: 'Technical drawing: blueprint blue with white grid, outlined line-work, monospace type, figure labels. For how-it-works explainers.',
    colorMap: 'blueprint', grain: 0.25, vignette: 0.3, decor: 'blueprint', decorCount: 2, jitter: 0.2,
    fonts: { headline: { family: 'Space Mono', weight: 'bold', lh: 1.1, scale: 0.85 }, body: { family: 'Space Mono', weight: 'bold', lh: 1.2 }, mono: { family: 'Space Mono', weight: 'bold', lh: 1.15 } },
    paperStyle: { edge: 'cut', ampMul: 0.1, fringe: false, shadow: 'none', outline: { color: '#e9f2ff', width: 2.5 }, htMul: 0.25 },
    background: { kind: 'blueprint', base: '#0d3b8c' },
    headline: { kind: 'outline', force: { color: '#e9f2ff' }, rot: 0 },
    caption: { box: 'outline', bg: 'rgba(9,40,100,0.82)', color: '#e9f2ff', border: '#e9f2ff', size: 44, highlight: 'box', highlightColor: '#ffd23f', highlightText: '#ffd23f', rot: 0 },
  }),

  retro70s: T({
    label: 'Retro 70s', description: 'Rotating sunburst rays, mustard / orange / teal / brown palette, groovy display type, hard offset shadows.',
    colorMap: 'retro', grain: 0.55, vignette: 0.3, decor: 'retro', decorCount: 3,
    fonts: { headline: { family: 'Shrikhand', lh: 1.12, base: 0.02 } },
    fontsByLang: { bn: BN('Galada', 'Galada') },
    paperStyle: { ampMul: 0.6, fringeColor: '#f3e3c3', shadow: 'hard', shadowColor: 'rgba(27,27,30,0.9)', htMul: 0.6 },
    background: { kind: 'sunburst' },
    headline: { kind: 'pill', force: { bg: '#e9c46a', color: '#f3e3c3' }, stroke: '#1b1b1e', rot: -0.03 },
    caption: { box: 'pill', bg: '#f3e3c3', color: '#1b1b1e', border: '#1b1b1e', highlight: 'marker', highlightColor: '#e9c46a' },
  }),

  swiss: T({
    label: 'Swiss Modern', description: 'Clean International Typographic Style: crisp cut paper, flat color, red accents, minimal texture.',
    jitter: 0.15, grain: 0.35, vignette: 0.15,
    fonts: { headline: { family: 'Archivo Black', lh: 1.05 } },
    paperStyle: { edge: 'cut', ampMul: 0.08, fringe: false, shadowA: 0.5, htMul: 0 },
    headline: { kind: 'chip', force: { bg: '#e63946', color: '#ffffff' }, rot: 0 },
    caption: { box: 'torn', bg: '#ffffff', highlight: 'invert', highlightColor: '#e63946', highlightText: '#ffffff', rot: 0 },
  }),
};
THEMES.zine = THEMES.riso; // alias

function resolveTheme(name, overrides = {}, lang = 'en') {
  const t = THEMES[name || 'vox-news'];
  if (!t) throw new Error(`Unknown theme "${name}". Available: ${themeList().map(x => x.name).join(', ')}`);
  const theme = deepMerge(t, overrides);
  const fonts = deepMerge(theme.fonts, (theme.fontsByLang || {})[lang] || {});
  return { theme, fonts };
}
function themeList() { return Object.entries(THEMES).filter(([k]) => k !== 'zine').map(([name, t]) => ({ name, label: t.label, description: t.description })); }
function deepMerge(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const k in b) out[k] = a && typeof a[k] === 'object' && a[k] !== null && !Array.isArray(a[k]) ? deepMerge(a[k], b[k]) : b[k];
  return out;
}

module.exports = { THEMES, resolveTheme, themeList, deepMerge };
