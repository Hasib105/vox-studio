// Procedural paper-foley SFX synthesized from the story timeline (no sample files needed) + WAV writer.
'use strict';
const fs = require('fs');
const { mulberry, hash } = require('./core');
const { normTransition } = require('./scene');

const SR = 48000;
const ENTER_SFX = { pop: 'pop', slide: 'whoosh', fly: 'whoosh', spin: 'whoosh', drop: 'thud', rise: 'whoosh', stamp: 'stamp', grow: 'swish', unfold: 'pop' };

// Build the SFX event list from the story structure.
function buildEvents(story) {
  const ev = []; let T = 0;
  story.scenes.forEach((sc, i) => {
    const tr = normTransition(sc.transition);
    if (i > 0) ev.push({ t: T - 0.04, type: tr.type === 'cut' ? 'click' : 'whoosh', gain: tr.type === 'cut' ? 0.35 : 0.75 });
    if (sc.headline) ev.push({ t: T + 0.32, type: 'thud', gain: 0.45 });
    if (sc.caption) ev.push({ t: T + 0.03, type: 'paper', gain: 0.3 });
    for (const sh of sc._shakes || []) ev.push({ t: T + sh.at, type: 'thud', gain: Math.min(1, (sh.amp ?? 14) / 16) });
    const walk = els => (els || []).forEach(el => {
      if (el.sfx === 'none') return;
      const en = typeof el.enter === 'string' ? { anim: el.enter } : el.enter;
      let type = el.sfx || (en && ENTER_SFX[en.anim]);
      if (type) {
        const at = el.sfxAt ?? ((en && en.at) || 0) + (type === 'thud' || type === 'stamp' ? ((en && en.dur) || 0.45) * 0.75 : 0);
        ev.push({ t: T + at, type, gain: el.sfxGain ?? 0.6 });
      }
      for (const s of el.sfxEvents || []) ev.push({ t: T + s.at, type: s.type, gain: s.gain ?? 0.6 });
      if (el.elements) walk(el.elements);
    });
    walk(sc.elements);
    for (const s of sc.sfx || []) ev.push({ t: T + s.at, type: s.type, gain: s.gain ?? 0.6 });
    T += sc.dur;
  });
  ev.sort((a, b) => a.t - b.t);
  // de-duplicate same-type hits within 60ms, and cap density
  const out = [];
  for (const e of ev) { const last = out.findLast?.(x => x.type === e.type) || [...out].reverse().find(x => x.type === e.type); if (last && e.t - last.t < 0.06) { last.gain = Math.max(last.gain, e.gain); continue; } out.push(e); }
  return out.filter(e => e.t >= 0);
}

function synth(type, seed) {
  const r = mulberry(seed), n = () => r() * 2 - 1;
  const len = { whoosh: 0.45, swish: 0.28, pop: 0.14, thud: 0.4, stamp: 0.45, paper: 0.35, click: 0.04, tick: 0.05 }[type] || 0.2;
  const N = Math.floor(len * SR), out = new Float32Array(N);
  let y = 0, y2 = 0, ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR, x = t / len;
    let s = 0;
    switch (type) {
      case 'whoosh': case 'swish': {
        const env = Math.pow(Math.sin(Math.PI * Math.min(1, x * 1.15)), 2);
        const a = (type === 'swish' ? 0.08 : 0.03) + (type === 'swish' ? 0.35 : 0.22) * Math.sin(Math.PI * x);
        y += a * (n() - y); y2 += 0.5 * (y - y2); s = (y - y2 * 0.4) * env * 2.4; break;
      }
      case 'pop': { const f = 650 * Math.exp(-t * 28) + 170; ph += 2 * Math.PI * f / SR; s = Math.sin(ph) * Math.exp(-t * 32) * 0.9 + n() * Math.exp(-t * 260) * 0.35; break; }
      case 'thud': { const f = 115 * Math.exp(-t * 7) + 42; ph += 2 * Math.PI * f / SR; y += 0.06 * (n() - y); s = Math.sin(ph) * Math.exp(-t * 9) * 1.0 + y * Math.exp(-t * 18) * 1.6; break; }
      case 'stamp': { const f = 95 * Math.exp(-t * 9) + 45; ph += 2 * Math.PI * f / SR; y += 0.35 * (n() - y); s = Math.sin(ph) * Math.exp(-t * 10) + (n() - y) * Math.exp(-t * 45) * 0.7; break; }
      case 'paper': { const crack = r() < 0.06 ? n() : 0; y += 0.45 * (crack - y); s = (crack - y * 0.5) * Math.exp(-t * 7) * 1.4 + n() * 0.04 * Math.exp(-t * 9); break; }
      case 'click': s = n() * Math.exp(-t * 380) * 0.8; break;
      case 'tick': ph += 2 * Math.PI * 2100 / SR; s = Math.sin(ph) * Math.exp(-t * 120) * 0.4; break;
      default: s = 0;
    }
    out[i] = s;
  }
  return out;
}

function renderSfx(story, duration, file) {
  const N = Math.ceil(duration * SR), L = new Float32Array(N), R = new Float32Array(N);
  const vol = (story.audio && story.audio.sfxVolume) ?? 0.8;
  const events = buildEvents(story);
  events.forEach((e, k) => {
    const buf = synth(e.type, hash(e.type + k)), start = Math.floor(e.t * SR);
    const pan = (mulberry(k * 7 + 3)() - 0.5) * 0.5, gl = e.gain * vol * (1 - pan), gr = e.gain * vol * (1 + pan);
    for (let i = 0; i < buf.length && start + i < N; i++) { if (start + i < 0) continue; L[start + i] += buf[i] * gl; R[start + i] += buf[i] * gr; }
  });
  let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0.89 ? 0.89 / peak : 1;
  const data = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) { data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), i * 4); data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), i * 4 + 2); }
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12);
  hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([hdr, data]));
  return events.length;
}

module.exports = { buildEvents, synth, renderSfx };
