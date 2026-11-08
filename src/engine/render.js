// Render pipeline: parallel frame workers -> H.264 segments -> concat -> optional SFX/music mix. Also stills/contact sheets.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');
const { Worker } = require('worker_threads');
const { createCanvas } = require('@napi-rs/canvas');
const FFMPEG = require('ffmpeg-static');
const { loadStory } = require('./loader');
const { Renderer } = require('./scene');
const { renderSfx } = require('./audio');

function run(args, quiet = true) {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, ['-y', '-loglevel', quiet ? 'error' : 'info', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', d => { err += d; });
    p.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg failed: ' + err.slice(-800)))));
  });
}

// Encode a frame range [a, b) to an mp4 segment. Used by workers (and inline when workers=1).
async function encodeRange(storyInput, a, b, out, scale, onFrame, baseDir) {
  const story = await loadStory(storyInput, { baseDir });
  const R = new Renderer(story, { scale });
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${R.cw}x${R.ch}`, '-r', String(story.fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-g', String(story.fps * 2), out], { stdio: ['pipe', 'ignore', 'inherit'] });
  for (let f = a; f < b; f++) {
    R.renderFrame(f);
    const buf = Buffer.from(R.ctx.getImageData(0, 0, R.cw, R.ch).data.buffer);
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
    if (onFrame) onFrame(f);
  }
  ff.stdin.end();
  const [code] = await once(ff, 'close');
  if (code !== 0) throw new Error('ffmpeg segment encode failed');
}

async function renderVideo(storyInput, opts = {}) {
  const t0 = Date.now();
  const story = await loadStory(storyInput, { baseDir: opts.baseDir });
  const R = new Renderer(story, { scale: opts.scale || 1 });
  const total = opts.frames ? Math.min(opts.frames, R.total) : R.total;
  const name = slug(story.title);
  const out = path.resolve(opts.out || path.join(opts.outDir || 'output', `${name}.mp4`));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vox-'));
  const log = opts.log || (m => process.stdout.write(m + '\n'));
  const nw = Math.max(1, Math.min(opts.workers || Math.max(1, Math.min(6, os.cpus().length - 1)), Math.ceil(total / 60)));
  log(`Rendering "${story.title}": ${total} frames (${(total / story.fps).toFixed(1)}s) at ${R.cw}x${R.ch} with ${nw} worker(s)...`);
  const segs = []; const chunk = Math.ceil(total / nw); let done = 0, lastPct = -1;
  const tick = () => { done++; const pct = Math.floor(done / total * 100); if (pct % 10 === 0 && pct !== lastPct) { lastPct = pct; log(`  ${pct}%  (${((Date.now() - t0) / 1000).toFixed(0)}s)`); } };
  const storyArg = typeof storyInput === 'string' ? path.resolve(storyInput) : storyInput;
  const jobs = [];
  for (let k = 0; k < nw; k++) {
    const a = k * chunk, b = Math.min(total, a + chunk); if (a >= b) break;
    const seg = path.join(tmp, `seg${String(k).padStart(3, '0')}.mp4`); segs.push(seg);
    if (nw === 1) jobs.push(encodeRange(storyArg, a, b, seg, opts.scale || 1, tick, opts.baseDir));
    else jobs.push(new Promise((res, rej) => {
      const w = new Worker(path.join(__dirname, 'worker.js'), { workerData: { story: storyArg, a, b, out: seg, scale: opts.scale || 1, baseDir: opts.baseDir } });
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
  if (wantSfx || music) {
    const args = ['-i', video]; let filter = '', inputs = [];
    if (wantSfx) { const wav = path.join(tmp, 'sfx.wav'); const n = renderSfx(story, duration, wav); log(`  ${n} sound effects synthesized`); args.push('-i', wav); inputs.push(`[${inputs.length + 1}:a]`); }
    if (music) {
      if (!fs.existsSync(music)) throw new Error('music file not found: ' + music);
      args.push('-i', music); const idx = inputs.length + 1, mv = audio.musicVolume ?? 0.35;
      filter += `[${idx}:a]volume=${mv},afade=t=out:st=${Math.max(0, duration - 1.5)}:d=1.5[m];`; inputs.push('[m]');
    }
    filter += inputs.length > 1 ? `${inputs.join('')}amix=inputs=${inputs.length}:normalize=0:duration=first[a]` : `${inputs[0]}anull[a]`;
    await run([...args, '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(duration), '-movflags', '+faststart', out]);
  } else {
    await run(['-i', video, '-c', 'copy', '-movflags', '+faststart', out]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  log(`Done: ${out}  (${duration.toFixed(1)}s video, rendered in ${secs}s)`);
  return { out, duration, frames: total, size: [R.cw, R.ch], renderSeconds: +secs };
}

// Contact sheet: one frame per scene (at fraction `at` of the scene), plus optional full-size PNGs.
async function renderStills(storyInput, opts = {}) {
  const story = await loadStory(storyInput, { baseDir: opts.baseDir });
  const R = new Renderer(story, { scale: 1 });
  const name = slug(story.title);
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

// Render a single frame at time t (seconds) to PNG.
async function renderFrameAt(storyInput, t, out, opts = {}) {
  const story = await loadStory(storyInput, { baseDir: opts.baseDir });
  const R = new Renderer(story, { scale: opts.scale || 1 });
  R.renderFrame(Math.min(R.total - 1, Math.floor(t * story.fps)));
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, R.canvas.toBuffer('image/png'));
  return out;
}

const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^\wঀ-৿]+/g, '-').replace(/^-|-$/g, '') || 'story';
module.exports = { renderVideo, renderStills, renderFrameAt, encodeRange, slug };
