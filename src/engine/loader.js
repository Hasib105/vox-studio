// Load + validate a story (JSON file or object), expand shorthand, preload images.
'use strict';
const fs = require('fs');
const path = require('path');
const { loadImage } = require('@napi-rs/canvas');
const { resolveTheme } = require('./themes');
const { registerFonts } = require('./text');
const { registry } = require('../components');
const { TRANSITIONS } = require('./scene');

const FORMATS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] };
const ENTER_ANIMS = ['pop', 'fade', 'slide', 'drop', 'rise', 'stamp', 'fly', 'grow', 'unfold', 'spin', 'none'];
const LOOP_ANIMS = ['bob', 'sway', 'pulse', 'drift', 'spin', 'flutter', 'shiver'];

function expandEach(els) {
  const out = [];
  for (const el of els || []) {
    if (Array.isArray(el.each)) { const { each, ...rest } = el; for (const item of each) out.push(...expandEach([{ ...rest, ...item }])); continue; }
    if (el.type === 'group' && el.elements) out.push({ ...el, elements: expandEach(el.elements) });
    else out.push(el);
  }
  return out;
}

function validate(story) {
  const errs = [];
  if (!Array.isArray(story.scenes) || !story.scenes.length) errs.push('story.scenes must be a non-empty array');
  (story.scenes || []).forEach((sc, i) => {
    const where = `scenes[${i}]${sc.id ? ` ("${sc.id}")` : ''}`;
    if (!(typeof sc.dur === 'number' && sc.dur > 0)) errs.push(`${where}: "dur" (seconds) must be a positive number`);
    if (sc.transition) { const t = typeof sc.transition === 'string' ? sc.transition : sc.transition.type; if (!TRANSITIONS.includes(t)) errs.push(`${where}: unknown transition "${t}" (use ${TRANSITIONS.join(', ')})`); }
    const walk = (els, w) => (els || []).forEach((el, j) => {
      const ew = `${w}.elements[${j}]`;
      if (!el || typeof el !== 'object') { errs.push(`${ew}: must be an object`); return; }
      if (!registry[el.type]) errs.push(`${ew}: unknown component type "${el.type}". Run "vox components" to list them.`);
      const en = typeof el.enter === 'string' ? el.enter : el.enter && el.enter.anim;
      if (en && !ENTER_ANIMS.includes(en)) errs.push(`${ew}: unknown enter anim "${en}" (use ${ENTER_ANIMS.join(', ')})`);
      for (const l of [].concat(el.loop || [])) { const a = typeof l === 'string' ? l : l.anim; if (!LOOP_ANIMS.includes(a)) errs.push(`${ew}: unknown loop anim "${a}" (use ${LOOP_ANIMS.join(', ')})`); }
      if (el.type === 'group') walk(el.elements, ew);
    });
    walk(sc.elements, where);
  });
  return errs;
}

function collectShakes(sc) {
  const out = [...(sc.shakes || [])];
  const walk = els => (els || []).forEach(el => {
    if (el.enter && typeof el.enter === 'object' && el.enter.shake) out.push({ at: (el.enter.at ?? 0) + (el.enter.dur ?? 0.45) * 0.8, amp: el.enter.shake === true ? 14 : el.enter.shake });
    if (el.type === 'group') walk(el.elements);
  });
  walk(sc.elements);
  return out;
}

async function loadStory(input, opts = {}) {
  let story, baseDir;
  if (typeof input === 'string') { baseDir = path.dirname(path.resolve(input)); story = JSON.parse(fs.readFileSync(input, 'utf8')); story._file = path.resolve(input); }
  else { story = JSON.parse(JSON.stringify(input)); baseDir = opts.baseDir || process.cwd(); }
  story._baseDir = baseDir;
  story.title = story.title || (story._file ? path.basename(story._file, '.json') : 'story');
  story.lang = story.lang || 'en';
  story.fps = story.fps || 30;
  story.size = story.size || FORMATS[story.format || '9:16'];
  if (!story.size) throw new Error(`Unknown format "${story.format}". Use ${Object.keys(FORMATS).join(', ')}`);
  for (const sc of story.scenes || []) sc.elements = expandEach(sc.elements);
  const errs = validate(story);
  if (errs.length) { const e = new Error('Story is invalid:\n  - ' + errs.join('\n  - ')); e.errors = errs; throw e; }
  registerFonts((story.fontDirs || []).map(d => path.resolve(baseDir, d)));
  const { theme, fonts } = resolveTheme(story.theme, story.themeOverrides, story.lang);
  const [W, H] = story.size;
  if (H !== 1920 && !(story.themeOverrides && story.themeOverrides.caption && story.themeOverrides.caption.y)) theme.caption = { ...theme.caption, y: Math.round(H * 0.8) };
  story._theme = theme; story._fonts = fonts;
  story.scenes.forEach((sc, i) => { sc.id = sc.id ?? String(i + 1); sc._shakes = collectShakes(sc); });
  // preload images used by photo elements
  story._images = {};
  const srcs = new Set();
  const walk = els => (els || []).forEach(el => { if (el.type === 'photo' && el.src) srcs.add(el.src); if (el.elements) walk(el.elements); });
  story.scenes.forEach(sc => walk(sc.elements));
  for (const src of srcs) {
    const file = path.resolve(baseDir, src);
    if (!fs.existsSync(file)) throw new Error(`photo src not found: ${src} (looked at ${file})`);
    story._images[src] = await loadImage(fs.readFileSync(file));
  }
  story._duration = story.scenes.reduce((a, s) => a + s.dur, 0);
  return story;
}

module.exports = { loadStory, validate, FORMATS, ENTER_ANIMS, LOOP_ANIMS };
