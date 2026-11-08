// Core math: seeded randomness, easing, keyframes, prop resolution.
'use strict';

function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (sec, start, dur) => dur <= 0 ? (sec >= start ? 1 : 0) : clamp((sec - start) / dur);

const EASE = {
  linear: t => t,
  in: t => t * t * t,
  out: t => 1 - Math.pow(1 - t, 3),
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  back: t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  softBack: t => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  backIn: t => { const c1 = 1.7, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  elastic: t => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
  bounce: t => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  step: t => (t < 1 ? 0 : 1),
};
const ease = (name, t) => (EASE[name] || EASE.inOut)(clamp(t));

// stop-motion "on twos": hold each pose for 2 frames
const twos = (sec, fps = 30) => Math.floor(sec * fps / 2) * 2 / fps;
// decaying impact shake
const shake = (sec, at, amp = 16) => { if (sec < at) return 0; const d = sec - at; return amp * Math.exp(-d * 9) * Math.sin(d * 70); };

// ---- keyframes ----
// {"kf": [[t, value, ease?], ...]}  or  {"from": a, "to": b, "at": t, "dur": d, "ease": "out"}
// {"to": ...} only counts as a keyframe when it is not an element (no "type") and not a geo point
const isKf = v => v !== null && typeof v === 'object' && !Array.isArray(v) && (Array.isArray(v.kf) || ('to' in v && !('type' in v) && !('geo' in v) && ('from' in v || 'at' in v || 'dur' in v)));
const isGeo = v => v !== null && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.geo);
function mix(a, b, k) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * k;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => mix(x, b[i], k));
  return k < 1 ? a : b;
}
function kfValue(v, sec) {
  let keys = v.kf;
  if (!keys) { const at = v.at ?? 0, dur = v.dur ?? 0.5; keys = [[at, v.from ?? 0], [at + dur, v.to, v.ease || 'inOut']]; }
  if (!keys.length) return undefined;
  if (sec <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    if (sec < t1) { const [t0, v0] = keys[i - 1]; return mix(v0, v1, ease(e || 'inOut', (sec - t0) / (t1 - t0))); }
  }
  return keys[keys.length - 1][1];
}
const NO_RESOLVE = new Set(['elements', 'each', 'enter', 'exit', 'loop', 'type', 'id']);
function resolve(v, sec, top = true) {
  if (isKf(v)) return kfValue(v, sec);
  if (Array.isArray(v)) return v.some(x => x && typeof x === 'object') ? v.map(x => resolve(x, sec, false)) : v;
  if (v && typeof v === 'object' && !isGeo(v)) {
    const out = {};
    for (const k in v) out[k] = top && NO_RESOLVE.has(k) ? v[k] : resolve(v[k], sec, false);
    return out;
  }
  return v;
}

module.exports = { mulberry, hash, clamp, lerp, prog, EASE, ease, twos, shake, isKf, isGeo, kfValue, resolve, mix };
