// Build README preview GIFs: a ~1s slice from every scene of each demo MP4 (montage), small palette GIF.
// Usage: node scripts/make-demo-gifs.js [demosDir=output/demos] [outDir=docs/media/demos]
// Size knobs (env): GIF_W (portrait width, 200), GIF_WL (landscape width, 360), GIF_FPS (10), GIF_COLORS (64)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const FFMPEG = process.env.FFMPEG_PATH || require('ffmpeg-static');

const demosDir = process.argv[2] || 'output/demos', outDir = process.argv[3] || 'docs/media/demos';
fs.mkdirSync(outDir, { recursive: true });
for (const file of fs.readdirSync(demosDir).filter(f => f.endsWith('.mp4'))) {
  const name = file.replace(/\.mp4$/, ''), storyFile = path.join('stories', name + '.json');
  if (!fs.existsSync(storyFile)) { console.log('skip (no story):', name); continue; }
  const story = JSON.parse(fs.readFileSync(storyFile, 'utf8'));
  const landscape = story.format === '16:9';
  let t = 0; const windows = [];
  for (const sc of story.scenes) { const a = t + Math.min(1.4, sc.dur * 0.3); windows.push([a, a + 0.9]); t += sc.dur; }
  const select = windows.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+');
  const w = landscape ? +(process.env.GIF_WL || 360) : +(process.env.GIF_W || 200), fps = +(process.env.GIF_FPS || 10), colors = +(process.env.GIF_COLORS || 64);
  const vf = `select='${select}',setpts=N/(${fps}*TB),fps=${fps},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`;
  const out = path.join(outDir, name + '.gif');
  const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', path.join(demosDir, file), '-vf', vf, '-an', out]);
  if (r.status !== 0) { console.error('failed', name, String(r.stderr)); continue; }
  console.log(`${out}  ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB`);
}
