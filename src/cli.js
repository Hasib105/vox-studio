#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { renderVideo, renderStills, renderFrameAt, renderGallery } = require('./engine/render');
const { loadStory } = require('./engine/loader');
const { catalog } = require('./components');
const { themeList } = require('./engine/themes');
const { countryNames } = require('./engine/geo');
const tts = require('./engine/tts');

const HELP = `vox-studio — Vox-style paper-collage explainer videos from a JSON story. Runs 100% locally.

Usage:
  vox render  <story.json> [-o out.mp4] [--theme T] [--quality draft|standard|high|max] [--resolution 1080p|1440p|4k]
                           [--sfx] [--music track.mp3] [--workers N] [--frames N]
                           [--voice gemini:Kore|deepgram|kokoro|edge|auto] [--tts-model M[,M2]] [--no-voice]
  vox narrate <story.json> [--voice V] [--tts-model M]   voice track only (WAV), cached; shows per-scene timing
  vox voices  [lang]                      TTS providers, key status (masked), voices per language
  vox tts-models                          every Gemini TTS model your key can use
  vox stills  <story.json> [--theme T] [--at 0.85] [--full] [--scene 3 --times 0.2,0.5,0.9] [--out dir]
  vox gallery <story.json> [--scenes 1,5] [-o gallery.jpg]   the same shots in every theme
  vox frame   <story.json> <seconds> [--theme T] [-o frame.png]
  vox check   <story.json>                validate a story and print its timeline
  vox new     <name> [--lang bn]          scaffold stories/<name>.json from the template
  vox components [name]                   list components and their props
  vox themes | vox countries

Examples:
  vox stills stories/iron-gate.en.json                        # contact sheet to review the look
  vox render stories/iron-gate.bn.json --sfx                  # full MP4 with procedural paper foley
  vox render my.json --theme scrapbook --quality max          # supersampled 2x, near-lossless
  vox render stories/iron-gate.landscape.json --resolution 4k # 16:9 story at 3840x2160
  vox render my.json --quality draft                          # fast half-size preview
  vox render stories/iron-gate.bn.json --voice gemini:Charon  # Bangla narration (multi-key rotation)
  vox render my.json --voice gemini --tts-model gemini-2.5-pro-preview-tts
  vox render my.json --voice kokoro                           # offline English voice (npm i kokoro-js)

Keys: GEMINI_API_KEY / DEEPGRAM_API_KEY in the environment or .env, several comma-separated (see .env.example).
`;

const BOOL_FLAGS = new Set(['sfx', 'full', 'no-voice']);
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
  const need = () => { if (!file) throw new Error(`usage: vox ${cmd} <story.json>`); };
  switch (cmd) {
    case 'render':
      need();
      await renderVideo(file, { out: args.out, scale: num(args.scale), workers: num(args.workers), sfx: args.sfx ? true : undefined, music: args.music, frames: num(args.frames), theme: args.theme, quality: args.quality, resolution: args.resolution, voice: args['no-voice'] ? false : args.voice, ttsModel: args['tts-model'] });
      break;
    case 'narrate': {
      need();
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')); raw.title = raw.title || path.basename(file, '.json');
      await loadStory(raw, { baseDir: path.dirname(path.resolve(file)) });
      const outDir = path.dirname(path.resolve(args.out || path.join('output', 'x')));
      const n = await tts.narrate(raw, { voice: args.voice === undefined ? (raw.voice ?? 'auto') : args.voice, model: args['tts-model'], cacheDir: path.join(outDir, '.tts-cache') });
      if (!n) { console.log('Nothing to narrate (no "say" lines or captions).'); break; }
      const { slug } = require('./engine/render');
      const out = path.resolve(args.out || path.join('output', slug(raw.title) + '-voice.wav'));
      fs.mkdirSync(path.dirname(out), { recursive: true }); tts.buildVoiceTrack(n.clips, n.duration, out);
      for (const c of n.clips) console.log(`  ${c.at.toFixed(1).padStart(5)}s  [${raw.scenes[c.scene].id ?? c.scene + 1}] ${c.duration.toFixed(1)}s  ${c.provider}:${c.voice}${c.fellBack ? ' (fallback)' : ''}  ${c.text.slice(0, 60)}`);
      console.log(`Voice track: ${out}  (${n.duration.toFixed(1)}s)`);
      break;
    }
    case 'voices': {
      console.log(tts.ttsStatus());
      const langs = file ? [tts.resolveLanguage(file).lang] : tts.LANGUAGES;
      console.log('\nlang  edge voice              deepgram             kokoro');
      for (const l of langs) console.log(`${l.code.padEnd(5)} ${l.edge.padEnd(23)} ${(l.deepgram || '-').padEnd(20)} ${l.kokoro || '-'}`);
      console.log(`\ngemini voices (any language): ${tts.GEMINI_VOICES.join(', ')}`);
      break;
    }
    case 'tts-models':
      for (const m of await tts.listGeminiModels()) console.log(m.name.padEnd(36), m.displayName || '');
      break;
    case 'stills': {
      need();
      const r = await renderStills(file, { theme: args.theme, at: num(args.at), full: !!args.full, scene: args.scene, times: args.times ? String(args.times).split(',').map(Number) : undefined, outDir: args.out });
      console.log('Contact sheet:', r.sheet); r.files.forEach(f => console.log('  ', f));
      break;
    }
    case 'gallery':
      need();
      console.log(await renderGallery(file, { out: args.out, scenes: args.scenes ? String(args.scenes).split(',').map(n => Number(n) - 1) : undefined, at: num(args.at), themes: args.themes ? String(args.themes).split(',') : undefined }));
      break;
    case 'frame': {
      need();
      const out = args.out || `output/frame-${extra}.png`;
      console.log(await renderFrameAt(file, Number(extra), out, { theme: args.theme }));
      break;
    }
    case 'check': {
      need();
      const s = await loadStory(file, { theme: args.theme }); let t = 0;
      console.log(`"${s.title}"  lang=${s.lang}  ${s.size.join('x')} @${s.fps}fps  theme=${s.theme || 'vox-news'}`);
      for (const sc of s.scenes) { console.log(`  ${t.toFixed(1).padStart(5)}s  [${sc.id}] ${sc.dur}s  ${sc.elements.length} elements  ${sc.headline ? 'H ' : '  '}${(typeof sc.caption === 'string' ? sc.caption : sc.caption?.text || '').slice(0, 60)}`); t += sc.dur; }
      console.log(`  total ${t.toFixed(1)}s. OK`);
      break;
    }
    case 'new': {
      if (!file) throw new Error('usage: vox new <name>');
      const tpl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'stories', '_template.json'), 'utf8'));
      tpl.title = file; if (args.lang) tpl.lang = args.lang; if (args.theme) tpl.theme = args.theme;
      const out = path.join('stories', `${file}.json`); fs.mkdirSync('stories', { recursive: true });
      if (fs.existsSync(out)) throw new Error(out + ' already exists');
      fs.writeFileSync(out, JSON.stringify(tpl, null, 2)); console.log('Created', out);
      break;
    }
    case 'components':
      for (const c of catalog().filter(c => !file || c.name === file)) {
        console.log(`\n${c.name}${c.absolute ? '  (absolute coords)' : ''}\n  ${c.doc}`);
        for (const [k, v] of Object.entries(c.props || {})) console.log(`    ${k.padEnd(12)} ${v}`);
      }
      console.log('\nCommon to every element: x, y | pos, rot, scale, scaleX, scaleY, flipX, opacity, depth, jitter, seed, show:[t0,t1], enter, exit, loop, sfx, each');
      break;
    case 'themes': for (const t of themeList()) console.log(t.name.padEnd(11), '-', t.description); break;
    case 'countries': console.log(countryNames().join('\n')); break;
    default: console.log(HELP);
  }
}
const num = v => (v === undefined || v === true ? undefined : Number(v));
main().catch(e => { console.error('\nError:', e.message); process.exit(1); });
