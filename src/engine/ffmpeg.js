// ffmpeg binary resolution + a promise wrapper. Shared by the renderer and the TTS pipeline.
'use strict';
const fs = require('fs');
const { spawn } = require('child_process');

// Bundled ffmpeg (ffmpeg-static) or, if its binary was not downloaded (install scripts blocked), ffmpeg on PATH.
const FFMPEG = (() => {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try { const p = require('ffmpeg-static'); if (p && fs.existsSync(p)) return p; } catch (e) { /* fall through */ }
  return 'ffmpeg';
})();

function ffmpegMissing(e) {
  if (e && e.code === 'ENOENT') throw new Error('ffmpeg not found. Run "npm rebuild ffmpeg-static" (or "npm install-scripts approve ffmpeg-static && npm rebuild"), install ffmpeg on your PATH, or set FFMPEG_PATH.');
  throw e;
}

function run(args, quiet = true) {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, ['-y', '-loglevel', quiet ? 'error' : 'info', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', d => { err += d; }); p.on('error', e => { try { ffmpegMissing(e); } catch (x) { rej(x); } });
    p.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg failed: ' + err.slice(-800)))));
  });
}

module.exports = { FFMPEG, ffmpegMissing, run };
