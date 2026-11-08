#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { renderVideo, renderStills, renderFrameAt } = require('./engine/render');
const { loadStory } = require('./engine/loader');
const { catalog } = require('./components');
const { THEMES } = require('./engine/themes');
const { countryNames } = require('./engine/geo');

const HELP = `vox-studio — Vox-style paper-collage explainer videos from a JSON story. Runs 100% locally.

Usage:
  vox render <story.json> [-o out.mp4] [--scale 0.5] [--workers 4] [--sfx] [--music track.mp3] [--frames N]
  vox stills <story.json> [--at 0.85] [--full] [--scene 3 --times 0.2,0.5,0.9] [--out dir]
  vox frame  <story.json> <seconds> [-o frame.png]
  vox check  <story.json>                 validate a story and print its timeline
  vox new    <name> [--lang bn]           scaffold stories/<name>.json from the template
  vox components [name]                   list components and their props
  vox themes | vox countries

Examples:
  vox stills stories/iron-gate.en.json            # quick contact sheet to review the look
  vox render stories/iron-gate.bn.json --sfx      # full MP4 with procedural paper foley
  vox render my.json --scale 0.5                  # fast half-res preview
`;

const BOOL_FLAGS = new Set(['sfx', 'full']);
function parse(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '-o') a.out = argv[++i];
    else if (k.startsWith('--')) {
      const key = k.slice(2), nx = argv[i + 1];
      if (BOOL_FLAGS.has(key) || nx === undefined || /^-[a-z-]/i.test(nx)) a[key] = true; else { a[key] = nx; i++; }
    }
    else a._.push(k);
  }
  return a;
}

async function main() {
  const args = parse(process.argv.slice(2)), [cmd, file, extra] = args._;
  switch (cmd) {
    case 'render': {
      if (!file) throw new Error('usage: vox render <story.json>');
      await renderVideo(file, { out: args.out, scale: num(args.scale), workers: num(args.workers), sfx: args.sfx ? true : undefined, music: args.music, frames: num(args.frames) });
      break;
    }
    case 'stills': {
      if (!file) throw new Error('usage: vox stills <story.json>');
      const r = await renderStills(file, { at: num(args.at), full: !!args.full, scene: args.scene, times: args.times ? String(args.times).split(',').map(Number) : undefined, outDir: args.out });
      console.log('Contact sheet:', r.sheet); r.files.forEach(f => console.log('  ', f));
      break;
    }
    case 'frame': {
      const out = args.out || `output/frame-${extra}.png`;
      console.log(await renderFrameAt(file, Number(extra), out));
      break;
    }
    case 'check': {
      const s = await loadStory(file); let t = 0;
      console.log(`"${s.title}"  lang=${s.lang}  ${s.size.join('x')} @${s.fps}fps  theme=${s.theme || 'vox-news'}`);
      for (const sc of s.scenes) { console.log(`  ${t.toFixed(1).padStart(5)}s  [${sc.id}] ${sc.dur}s  ${sc.elements.length} elements  ${sc.headline ? 'H ' : '  '}${(typeof sc.caption === 'string' ? sc.caption : sc.caption?.text || '').slice(0, 60)}`); t += sc.dur; }
      console.log(`  total ${t.toFixed(1)}s. OK`);
      break;
    }
    case 'new': {
      if (!file) throw new Error('usage: vox new <name>');
      const tpl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'stories', '_template.json'), 'utf8'));
      tpl.title = file; if (args.lang) tpl.lang = args.lang;
      const out = path.join('stories', `${file}.json`); fs.mkdirSync('stories', { recursive: true });
      if (fs.existsSync(out)) throw new Error(out + ' already exists');
      fs.writeFileSync(out, JSON.stringify(tpl, null, 2)); console.log('Created', out);
      break;
    }
    case 'components': {
      for (const c of catalog().filter(c => !file || c.name === file)) {
        console.log(`\n${c.name}${c.absolute ? '  (absolute coords)' : ''}\n  ${c.doc}`);
        for (const [k, v] of Object.entries(c.props || {})) console.log(`    ${k.padEnd(12)} ${v}`);
      }
      console.log('\nCommon to every element: x, y | pos, rot, scale, scaleX, scaleY, flipX, opacity, depth, jitter, seed, show:[t0,t1], enter, exit, loop, sfx, each');
      break;
    }
    case 'themes': console.log(Object.keys(THEMES).join('\n')); break;
    case 'countries': console.log(countryNames().join('\n')); break;
    default: console.log(HELP);
  }
}
const num = v => (v === undefined || v === true ? undefined : Number(v));
main().catch(e => { console.error('\nError:', e.message); process.exit(1); });
