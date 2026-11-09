// Render pipeline: parallel frame workers -> H.264 segments -> concat -> optional SFX/music mix. Also stills/contact sheets.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');
const { Worker } = require('worker_threads');
const { createCanvas } = require('@napi-rs/canvas');
const { FFMPEG, ffmpegMissing, run } = require('./ffmpeg');
const { loadStory } = require('./loader');
const { Renderer } = require('./scene');
const { renderSfx } = require('./audio');
const { narrate, wantsVoice, buildVoiceTrack } = require('./tts');

// Quality presets: ss = supersampling (draw bigger, downscale with lanczos), then x264 settings.
const QUALITY = {
  draft: { ss: 1, crf: 23, preset: 'veryfast', scale: 0.5 },
  standard: { ss: 1, crf: 18, preset: 'medium' },
  high: { ss: 1.5, crf: 16, preset: 'slow' },
  max: { ss: 2, crf: 13, preset: 'slower' },
};
const RESOLUTION = { '720p': 2 / 3, '1080p': 1, '1440p': 4 / 3, '4k': 2, '2160p': 2 };
function plan(story, opts) {
  const q = QUALITY[opts.quality || story.quality || 'high'];
  if (!q) throw new Error(`Unknown quality "${opts.quality}". Use ${Object.keys(QUALITY).join(', ')}`);
  const r = opts.resolution || story.resolution;
  let outScale = q.scale || 1;                                   // draft defaults to half size
  if (r) outScale = typeof r === 'number' ? r : RESOLUTION[r];
  if (opts.scale) outScale = opts.scale;
  if (!outScale) throw new Error(`Unknown resolution "${r}". Use ${Object.keys(RESOLUTION).join(', ')}`);
  const even = v => Math.round(v / 2) * 2;
  return { ...q, outScale, renderScale: outScale * q.ss, outW: even(story.size[0] * outScale), outH: even(story.size[1] * outScale) };
}

// Encode a frame range [a, b) to an mp4 segment. Used by workers (and inline when workers=1).
async function encodeRange(storyInput, a, b, out, o = {}, onFrame) {
  const story = await loadStory(storyInput, { baseDir: o.baseDir, theme: o.theme });
  const P = plan(story, o);
  const R = new Renderer(story, { scale: P.renderScale });
  const vf = P.ss !== 1 ? ['-vf', `scale=${P.outW}:${P.outH}:flags=lanczos`] : (R.cw !== P.outW || R.ch !== P.outH ? ['-vf', `scale=${P.outW}:${P.outH}`] : []);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${R.cw}x${R.ch}`, '-r', String(story.fps), '-i', '-', ...vf,
    '-c:v', 'libx264', '-preset', P.preset, '-crf', String(P.crf), '-tune', 'animation', '-x264-params', 'aq-mode=3',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', String(story.fps * 2), out], { stdio: ['pipe', 'ignore', 'inherit'] });
  let spawnErr = null; ff.on('error', e => { spawnErr = e; });
  ff.stdin.on('error', () => {});
  await new Promise((res, rej) => { ff.once('spawn', res); ff.once('error', e => { try { ffmpegMissing(e); } catch (x) { rej(x); } }); });
  for (let f = a; f < b; f++) {
    if (spawnErr) ffmpegMissing(spawnErr);
    R.renderFrame(f);
    if (!ff.stdin.write(R.canvas.data())) await once(ff.stdin, 'drain');
    if (onFrame) onFrame(f);
  }
  ff.stdin.end();
  const [code] = await once(ff, 'close');
  if (code !== 0) throw new Error('ffmpeg segment encode failed');
}

// Narration runs before anything is drawn: a voice line longer than its scene stretches that scene, and captions
// re-time to the voice, so the frames must be rendered from the narrated story.
async function prepareNarration(storyInput, opts, log) {
  if (opts.voice === false || opts.noVoice) return { input: storyInput, baseDir: opts.baseDir, narration: null };
  const isFile = typeof storyInput === 'string';
  const raw = isFile ? JSON.parse(fs.readFileSync(storyInput, 'utf8')) : JSON.parse(JSON.stringify(storyInput));
  if (!wantsVoice(raw, opts)) return { input: storyInput, baseDir: opts.baseDir, narration: null };
  const baseDir = isFile ? path.dirname(path.resolve(storyInput)) : opts.baseDir;
  if (isFile && !raw.title) raw.title = path.basename(storyInput, '.json');
  await loadStory(raw, { baseDir, theme: opts.theme }); // validate before spending any TTS quota
  const cacheDir = path.resolve(opts.ttsCache || process.env.VOX_TTS_CACHE || path.join(opts.out ? path.dirname(path.resolve(opts.out)) : (opts.outDir || 'output'), '.tts-cache'));
  const narration = await narrate(raw, { voice: opts.voice, model: opts.ttsModel, cacheDir, log });
  return narration ? { input: raw, baseDir, narration } : { input: storyInput, baseDir: opts.baseDir, narration: null };
}

async function renderVideo(storyInput, opts = {}) {
  const t0 = Date.now();
  const log = opts.log || (m => process.stdout.write(m + '\n'));
  const { input, baseDir, narration } = await prepareNarration(storyInput, opts, log);
  storyInput = input;
  const story = await loadStory(storyInput, { baseDir, theme: opts.theme });
  const P = plan(story, opts);
  const R = new Renderer(story, { scale: 1 });
  R.cw = P.outW; R.ch = P.outH;
  const total = opts.frames ? Math.min(opts.frames, R.total) : R.total;
  const enc = { quality: opts.quality, resolution: opts.resolution, scale: opts.scale, baseDir, theme: opts.theme };
  const name = slug(story.title);
  const out = path.resolve(opts.out || path.join(opts.outDir || 'output', `${name}.mp4`));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vox-'));
  const nw = Math.max(1, Math.min(opts.workers || Math.max(1, Math.min(6, os.cpus().length - 1)), Math.ceil(total / 60)));
  log(`Rendering "${story.title}" [${story.theme || 'vox-news'}]: ${total} frames (${(total / story.fps).toFixed(1)}s) -> ${P.outW}x${P.outH}, quality ${opts.quality || story.quality || 'high'} (drawn at ${P.ss}x, crf ${P.crf}), ${nw} worker(s)...`);
  const segs = []; const chunk = Math.ceil(total / nw); let done = 0, lastPct = -1;
  const tick = () => { done++; const pct = Math.floor(done / total * 100); if (pct % 10 === 0 && pct !== lastPct) { lastPct = pct; log(`  ${pct}%  (${((Date.now() - t0) / 1000).toFixed(0)}s)`); } };
  const storyArg = typeof storyInput === 'string' ? path.resolve(storyInput) : storyInput;
  const jobs = [];
  for (let k = 0; k < nw; k++) {
    const a = k * chunk, b = Math.min(total, a + chunk); if (a >= b) break;
    const seg = path.join(tmp, `seg${String(k).padStart(3, '0')}.mp4`); segs.push(seg);
    if (nw === 1) jobs.push(encodeRange(storyArg, a, b, seg, enc, tick));
    else jobs.push(new Promise((res, rej) => {
      const w = new Worker(path.join(__dirname, 'worker.js'), { workerData: { story: storyArg, a, b, out: seg, enc } });
      w.on('message', m => { if (m === 'f') tick(); }); w.on('error', rej); w.on('exit', c => (c === 0 ? res() : rej(new Error('worker exited ' + c))));
    }));
  }
  await Promise.all(jobs);
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, segs.map(s => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
  const video = path.join(tmp, 'video.mp4');
  await run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
  const duration = total / story.fps;
  const audio = story.audio || {};
  const wantSfx = opts.sfx ?? audio.sfx ?? false;
  const music = opts.music || (audio.music && path.resolve(story._baseDir, audio.music));
  const voiced = !!(narration && narration.clips.length);
  if (wantSfx || music || voiced) {
    const args = ['-i', video], inputs = [], fmt = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
    let filter = '';
    const add = file => { args.push('-i', file); return args.filter(a => a === '-i').length - 1; };
    if (voiced) {
      const wav = buildVoiceTrack(narration.clips, duration, path.join(tmp, 'voice.wav'));
      const i = add(wav), vv = audio.voiceVolume ?? 1;
      filter += `[${i}:a]${fmt},volume=${vv}${music ? ',asplit=2[v][vkey]' : '[v]'};`; inputs.push('[v]');
      const by = [...new Set(narration.clips.map(c => c.provider + ':' + c.voice + (c.model ? ` (${c.model})` : '')))];
      log(`  narration: ${narration.clips.length} line(s), ${by.join(', ')}`);
    }
    if (wantSfx) {
      const wav = path.join(tmp, 'sfx.wav');
      const n = renderSfx(voiced && audio.sfxVolume === undefined ? { ...story, audio: { ...audio, sfxVolume: 0.45 } } : story, duration, wav);
      log(`  ${n} sound effects synthesized`);
      const i = add(wav); filter += `[${i}:a]${fmt}[s];`; inputs.push('[s]');
    }
    if (music) {
      if (!fs.existsSync(music)) throw new Error('music file not found: ' + music);
      const i = add(music), mv = audio.musicVolume ?? (voiced ? 0.28 : 0.35);
      filter += `[${i}:a]${fmt},volume=${mv},afade=t=out:st=${Math.max(0, duration - 1.5)}:d=1.5${voiced ? '[m0];[m0][vkey]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=400[m]' : '[m]'};`;
      inputs.push('[m]');
    }
    filter += inputs.length > 1 ? `${inputs.join('')}amix=inputs=${inputs.length}:normalize=0:duration=first,alimiter=limit=0.89[a]` : `${inputs[0]}anull[a]`;
    await run([...args, '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(duration), '-movflags', '+faststart', out]);
  } else {
    await run(['-i', video, '-c', 'copy', '-movflags', '+faststart', out]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  log(`Done: ${out}  (${duration.toFixed(1)}s video, rendered in ${secs}s)`);
  return { out, duration, frames: total, size: [R.cw, R.ch], renderSeconds: +secs, narration: voiced ? narration.clips.map(({ file, ...c }) => c) : undefined };
}

// Contact sheet: one frame per scene (at fraction `at` of the scene), plus optional full-size PNGs.
async function renderStills(storyInput, opts = {}) {
  const story = await loadStory(storyInput, { baseDir: opts.baseDir, theme: opts.theme });
  const R = new Renderer(story, { scale: 1 });
  const name = slug(story.title) + (opts.theme ? '-' + opts.theme : '');
  const dir = path.resolve(opts.outDir || path.join('output', name, 'stills'));
  fs.mkdirSync(dir, { recursive: true });
  const at = opts.at ?? 0.85, cols = Math.min(4, story.scenes.length);
  const scenes = opts.scene ? [Number(opts.scene) - 1] : story.scenes.map((_, i) => i);
  const times = opts.times || [at];
  const cells = []; for (const i of scenes) for (const t of times) cells.push([i, t]);
  const cellW = 432, cellH = Math.round(cellW * R.H / R.W), c = opts.scene ? Math.min(cells.length, 5) : cols;
  const sheet = createCanvas(c * cellW, Math.ceil(cells.length / c) * cellH), sx = sheet.getContext('2d');
  const files = [];
  cells.forEach(([i, t], k) => {
    const f = R.starts[i] + Math.min(story.scenes[i]._frames - 1, Math.floor(story.scenes[i]._frames * t));
    R.renderFrame(f);
    sx.drawImage(R.canvas, (k % c) * cellW, Math.floor(k / c) * cellH, cellW, cellH);
    sx.fillStyle = 'rgba(0,0,0,0.6)'; sx.fillRect((k % c) * cellW, Math.floor(k / c) * cellH, 90, 30);
    sx.fillStyle = '#fff'; sx.font = 'bold 18px "Archivo Black", sans-serif'; sx.fillText(`${story.scenes[i].id} @${t}`, (k % c) * cellW + 8, Math.floor(k / c) * cellH + 21);
    if (opts.full) { const fp = path.join(dir, `scene-${story.scenes[i].id}-${t}.png`); fs.writeFileSync(fp, R.canvas.toBuffer('image/png')); files.push(fp); }
  });
  const sheetPath = path.join(dir, opts.scene ? `scene-${story.scenes[scenes[0]].id}-strip.png` : 'sheet.png');
  fs.writeFileSync(sheetPath, sheet.toBuffer('image/png'));
  return { sheet: sheetPath, files };
}

// Theme gallery: the same scene frames rendered in every theme, one column per theme.
async function renderGallery(storyInput, opts = {}) {
  const { themeList } = require('./themes');
  const themes = opts.themes || themeList().map(t => t.name);
  const first = await loadStory(storyInput, { baseDir: opts.baseDir });
  const scenes = opts.scenes || [0];
  const cellW = opts.cellW || 360, cellH = Math.round(cellW * first.size[1] / first.size[0]), labelH = 44;
  const sheet = createCanvas(themes.length * cellW, scenes.length * cellH + labelH), sx = sheet.getContext('2d');
  sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
  for (const [ti, th] of themes.entries()) {
    const story = await loadStory(storyInput, { baseDir: opts.baseDir, theme: th });
    const R = new Renderer(story, { scale: 1 });
    scenes.forEach((si, k) => {
      const sc = story.scenes[si]; R.renderFrame(R.starts[si] + Math.floor(sc._frames * (opts.at ?? 0.85)));
      sx.drawImage(R.canvas, ti * cellW, labelH + k * cellH, cellW, cellH);
    });
    sx.fillStyle = '#fff'; sx.font = 'bold 22px "Archivo Black", sans-serif'; sx.textAlign = 'center'; sx.fillText(th, ti * cellW + cellW / 2, 30);
  }
  const out = path.resolve(opts.out || path.join('output', 'gallery.jpg'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, /\.png$/i.test(out) ? sheet.toBuffer('image/png') : await sheet.encode('jpeg', 88));
  return out;
}

// Render a single frame at time t (seconds) to PNG.
async function renderFrameAt(storyInput, t, out, opts = {}) {
  const story = await loadStory(storyInput, { baseDir: opts.baseDir, theme: opts.theme });
  const R = new Renderer(story, { scale: opts.scale || 1 });
  R.renderFrame(Math.min(R.total - 1, Math.floor(t * story.fps)));
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, R.canvas.toBuffer('image/png'));
  return out;
}

const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^\wঀ-৿]+/g, '-').replace(/^-|-$/g, '') || 'story';
module.exports = { renderVideo, renderStills, renderFrameAt, renderGallery, encodeRange, slug, QUALITY, RESOLUTION };
