// Frame renderer: scenes -> camera -> elements (enter / exit / loop / keyframes) -> headline -> caption -> transitions -> paper grain.
'use strict';
const { createCanvas } = require('@napi-rs/canvas');
const { resolve, ease, prog, lerp, clamp, shake, twos, hash, mulberry, isGeo, isKf, kfValue } = require('./core');
const { jit, makeGrain, makeVignette } = require('./paper');
const { banner, caption } = require('./text');
const { registry } = require('../components');
const { setStyle } = require('./style');
const { background, accents, decor } = require('./backdrop');

const ANIM_DUR = { pop: 0.45, fade: 0.4, slide: 0.6, drop: 0.55, rise: 0.55, stamp: 0.3, fly: 0.6, grow: 0.6, unfold: 0.4, spin: 0.6, none: 0 };
const ANIM_EASE = { slide: 'out', drop: 'back', rise: 'back', fade: 'linear', fly: 'out', grow: 'inOut', spin: 'out' };
const DIRS = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };

function animState(spec, sec, kind) {
  const st = { alpha: 1, s: 1, sy: 1, dx: 0, dy: 0, rot: 0, p: 1 };
  if (!spec) return st;
  if (typeof spec === 'string') spec = { anim: spec };
  const anim = spec.anim || (kind === 'exit' ? 'fade' : 'pop'), at = spec.at ?? 0, dur = spec.dur ?? ANIM_DUR[anim] ?? 0.45;
  const raw = prog(sec, at, dur);
  if (kind === 'exit') {
    if (sec < at) return st;
    const e = ease(spec.ease || 'in', raw);
    if (anim === 'pop') st.s = 1 - ease('backIn', raw);
    else if (anim === 'slide') { const [dx, dy] = DIRS[spec.to || 'left'] || DIRS.left, d = spec.dist ?? 1300; st.dx = dx * d * e; st.dy = dy * d * e; }
    else if (anim === 'drop') st.dy = e * (spec.dist ?? 1400);
    else st.alpha = 1 - e;
    return st;
  }
  const e = ease(spec.ease || ANIM_EASE[anim] || 'out', raw);
  st.p = e;
  switch (anim) {
    case 'pop': st.s = raw <= 0 ? 0 : ease(spec.ease || 'back', raw); break;
    case 'fade': st.alpha = e; break;
    case 'slide': { const [dx, dy] = DIRS[spec.from || 'left'] || DIRS.left, d = spec.dist ?? 1300; st.dx = dx * d * (1 - e); st.dy = dy * d * (1 - e); break; }
    case 'drop': st.dy = -(spec.dist ?? 1100) * (1 - e); break;
    case 'rise': st.dy = (spec.dist ?? 1100) * (1 - e); break;
    case 'stamp': st.s = lerp(spec.scale ?? 2.2, 1, ease('out', raw)); st.alpha = raw <= 0 ? 0 : clamp(raw * 3); break;
    case 'fly': { const f = spec.from || [0, 600]; st.dx = f[0] * (1 - e); st.dy = f[1] * (1 - e) - Math.sin(Math.PI * e) * (spec.arc ?? 220); st.s = raw <= 0 ? 0 : lerp(spec.startScale ?? 0.3, 1, ease('back', raw)); break; }
    case 'unfold': st.sy = raw <= 0 ? 0 : ease('back', raw); break;
    case 'spin': st.rot = (1 - e) * (spec.turns ?? -1) * Math.PI * 2; st.s = raw <= 0 ? 0 : ease('back', raw); break;
    case 'grow': if (raw <= 0) st.p = 0; break;
    default: break;
  }
  return st;
}

function loopState(loops, sec, key, fps) {
  const st = { dx: 0, dy: 0, rot: 0, s: 1 };
  if (!loops) return st;
  const t = twos(sec, fps);
  for (let l of [].concat(loops)) {
    if (typeof l === 'string') l = { anim: l };
    const sp = l.speed ?? 1, ph = (hash(key + l.anim) % 1000) / 1000 * 6.283, a = l.amp;
    switch (l.anim) {
      case 'bob': st.dy += Math.sin(t * 2.2 * sp + ph) * (a ?? 6); break;
      case 'sway': st.rot += Math.sin(t * 1.8 * sp + ph) * (a ?? 0.05); break;
      case 'pulse': st.s *= 1 + Math.sin(t * 4 * sp + ph) * (a ?? 0.03); break;
      case 'drift': st.dx += Math.sin(t * 0.9 * sp + ph) * (a ?? 12); st.dy += Math.cos(t * 0.7 * sp + ph) * (a ?? 12) * 0.8; break;
      case 'spin': st.rot += t * sp * 0.6; break;
      case 'flutter': { const r = mulberry(hash(key) + Math.floor(sec * fps / 2)); st.rot += (r() - 0.5) * (a ?? 0.04); break; }
      case 'shiver': { const r = mulberry(hash(key) + Math.floor(sec * fps / 2) * 31); st.dx += (r() - 0.5) * (a ?? 5); st.dy += (r() - 0.5) * (a ?? 5); break; }
      default: break;
    }
  }
  return st;
}

function cameraAt(scene, sec) {
  let spec = scene.camera || 'static'; if (typeof spec === 'string') spec = { move: spec };
  const t = clamp(sec / scene.dur), a = spec.amount;
  let s = spec.scale ?? 1, tx = 0, ty = 0, rot = 0, px = 0, py = 0;
  switch (spec.move) {
    case 'push_in': s = lerp(spec.scale ?? 1, (spec.scale ?? 1) + (a ?? 0.08), ease(spec.ease || 'inOut', t)); break;
    case 'pull_out': s = lerp((spec.scale ?? 1) + (a ?? 0.14), spec.scale ?? 1, ease(spec.ease || 'out', t)); break;
    case 'pan': s = spec.scale ?? 1.06; tx = lerp(spec.from ?? 70, spec.to ?? -70, ease(spec.ease || 'inOut', t)); break;
    case 'tilt': s = spec.scale ?? 1.04; ty = lerp(spec.from ?? 40, spec.to ?? -40, ease(spec.ease || 'inOut', t)); break;
    case 'parallax': s = spec.scale ?? 1.04; px = lerp(a ?? 40, -(a ?? 40), ease(spec.ease || 'inOut', t)); break;
    case 'drift': s = lerp(spec.scale ?? 1.02, (spec.scale ?? 1.02) + 0.03, t); tx = Math.sin(sec * 0.6) * 10; break;
    default: break;
  }
  for (const k of ['s', 'tx', 'ty', 'rot']) if (isKf(spec[k])) { const v = kfValue(spec[k], sec); if (k === 's') s = v; if (k === 'tx') tx = v; if (k === 'ty') ty = v; if (k === 'rot') rot = v; }
  for (const sh of scene._shakes || []) { tx += shake(sec, sh.at, (sh.amp ?? 14) * 0.6); ty += shake(sec, sh.at, sh.amp ?? 14); }
  return { s, tx, ty, rot, px, py };
}

class Renderer {
  constructor(story, opts = {}) {
    this.story = story;
    this.scale = opts.scale || 1;
    [this.W, this.H] = story.size;
    this.cw = Math.round(this.W * this.scale); this.ch = Math.round(this.H * this.scale);
    this.canvas = createCanvas(this.cw, this.ch); this.ctx = this.canvas.getContext('2d');
    this.bufs = [];
    this.grains = [makeGrain(this.cw, this.ch, 11, this.scale), makeGrain(this.cw, this.ch, 23, this.scale)];
    this.vignette = makeVignette(this.cw, this.ch, story._theme.vignette);
    this.starts = []; let total = 0;
    for (const sc of story.scenes) { this.starts.push(total); sc._frames = Math.round(sc.dur * story.fps); total += sc._frames; }
    this.total = total;
  }
  buf(i) { if (!this.bufs[i]) { const c = createCanvas(this.cw, this.ch); this.bufs[i] = { c, ctx: c.getContext('2d') }; } return this.bufs[i]; }
  locate(f) { let i = this.story.scenes.length - 1; while (i > 0 && this.starts[i] > f) i--; return { i, sec: (f - this.starts[i]) / this.story.fps }; }

  makeState(i, sec) {
    const st = this.story, sc = st.scenes[i];
    const S = { sceneIndex: i, sec, t: sec / sc.dur, dur: sc.dur, fps: st.fps, W: this.W, H: this.H, scene: sc, story: st, theme: st._theme, fonts: st._fonts, lang: st.lang, cam: cameraAt(sc, sec), maps: {}, images: st._images || {}, key: 's' + (sc.id ?? i), enterP: 1 };
    S.pt = v => this.pt(v, S);
    S.drawChildren = (ctx, els, SS) => this.drawElements(ctx, els, SS, SS.key);
    return S;
  }
  pt(v, S) {
    if (v == null) return [S.W / 2, S.H / 2];
    if (isKf(v)) v = kfValue(v, S.sec);
    if (isGeo(v)) {
      const m = S.maps[v.map || '_default'];
      if (!m) throw new Error(`Scene ${S.scene.id}: a {"geo":...} position needs a "map" element earlier in the scene.`);
      const [x, y] = m.project(v.geo); return [x + (v.dx || 0), y + (v.dy || 0)];
    }
    return v;
  }
  prepare(els, S) { for (const el of els || []) { const c = registry[el.type]; if (c && c.prepare) c.prepare(el, S); } }

  renderScene(ctx, i, sec) {
    const sc = this.story.scenes[i], s = this.scale, { W, H } = this;
    ctx.setTransform(s, 0, 0, s, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    setStyle(this.story._theme);
    const S = this.makeState(i, sec);
    background(ctx, S);
    this.prepare(sc.elements, S);
    const cam = S.cam;
    ctx.save();
    ctx.translate(W / 2 + cam.tx, H / 2 + cam.ty); ctx.rotate(cam.rot); ctx.scale(cam.s, cam.s); ctx.translate(-W / 2, -H / 2);
    accents(ctx, S);
    decor(ctx, S);
    this.drawElements(ctx, sc.elements || [], S, S.key);
    if (sc.headline) banner(ctx, S, sc.headline, sec);
    ctx.restore();
    if (sc.caption) caption(ctx, S, sc.caption, sec);
  }

  drawElements(ctx, els, S, key) { for (let n = 0; n < els.length; n++) this.drawElement(ctx, els[n], S, key + '.' + n); }

  drawElement(ctx, el, S, key) {
    const comp = registry[el.type], sec = S.sec;
    const p = resolve(el, sec);
    if (p.show && (sec < p.show[0] || sec > p.show[1])) return;
    const en = animState(el.enter, sec, 'enter'), ex = animState(el.exit, sec, 'exit'), lp = loopState(el.loop, sec, key, S.fps);
    const alpha = (p.opacity ?? 1) * en.alpha * ex.alpha, sc = en.s * ex.s * lp.s;
    if (alpha <= 0.005 || Math.abs(sc) < 0.005 || en.sy <= 0.005) return;
    const d0 = S.inGroup ? [0, 0] : [S.W / 2, S.H / 2];
    const depth = p.depth ?? 1, pos = p.pos !== undefined ? S.pt(p.pos) : [p.x ?? d0[0], p.y ?? d0[1]];
    if (el.enter && el.enter.anim === 'fly' && el.enter.fromPos) {
      const fp = S.pt(resolve(el.enter.fromPos, sec)), e = en.p;
      en.dx = (fp[0] - pos[0]) * (1 - e); en.dy = (fp[1] - pos[1]) * (1 - e) - Math.sin(Math.PI * e) * (el.enter.arc ?? 220);
    }
    const dx = (S.cam.px || 0) * depth + en.dx + ex.dx + lp.dx, dy = (S.cam.py || 0) * depth + en.dy + ex.dy + lp.dy;
    const SS = Object.create(S); SS.key = p.seed !== undefined ? 'seed' + p.seed : key; SS.enterP = en.p; SS.el = el;
    ctx.save(); ctx.globalAlpha *= alpha;
    if (comp.absolute) {
      ctx.translate(dx, dy);
      const r = en.rot + ex.rot + lp.rot;
      if (sc !== 1 || r || en.sy !== 1) { ctx.translate(pos[0], pos[1]); ctx.rotate(r); ctx.scale(sc, sc * en.sy); ctx.translate(-pos[0], -pos[1]); }
    } else {
      ctx.translate(pos[0] + dx, pos[1] + dy);
      ctx.rotate((p.rot || 0) + en.rot + ex.rot + lp.rot);
      const b = p.scale ?? 1;
      ctx.scale(b * (p.scaleX ?? 1) * (p.flipX ?? 1) * sc, b * (p.scaleY ?? 1) * sc * en.sy);
      const j = p.jitter ?? S.theme.jitter; if (j) jit(ctx, key, sec, j, S.fps);
    }
    try { comp.draw(ctx, p, SS); }
    catch (e) { e.message = `scene "${S.scene.id}", element ${key} (${el.type}): ${e.message}`; throw e; }
    ctx.restore();
  }

  renderFrame(f) {
    const { i, sec } = this.locate(f), sc = this.story.scenes[i], ctx = this.ctx;
    const tr = normTransition(sc.transition);
    if (i > 0 && tr.type !== 'cut' && sec < tr.dur) {
      const A = this.buf(0), B = this.buf(1);
      this.renderScene(A.ctx, i - 1, this.story.scenes[i - 1].dur + sec);
      this.renderScene(B.ctx, i, sec);
      composite(ctx, A.c, B.c, tr, sec / tr.dur, this.cw, this.ch, this.scale, i);
    } else this.renderScene(ctx, i, sec);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const th = this.story._theme;
    if (th.grain) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = th.grain; ctx.drawImage(this.grains[Math.floor(f / 4) % 2], 0, 0); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (th.vignette) ctx.drawImage(this.vignette, 0, 0);
    return this.canvas;
  }
}

const TRANSITIONS = ['cut', 'tear', 'whip', 'slide', 'flash', 'zoom'];
function normTransition(t) {
  if (!t) return { type: 'cut', dur: 0 };
  if (typeof t === 'string') t = { type: t };
  return { type: t.type || 'cut', dur: t.dur ?? ({ tear: 0.5, whip: 0.35, slide: 0.45, flash: 0.25, zoom: 0.4 }[t.type] || 0) };
}
function composite(ctx, A, B, tr, p, cw, ch, s, seed) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  const k = ease('inOut', p);
  switch (tr.type) {
    case 'tear': {
      const X = lerp(cw * 1.2, -cw * 0.3, k), r = mulberry(hash('tear' + seed)), pts = [];
      for (let y = -60 * s; y <= ch + 60 * s; y += 28 * s) pts.push([X + (y - ch / 2) * 0.2 + (r() - 0.5) * 22 * s, y]);
      ctx.drawImage(A, 0, 0);
      ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]);
      ctx.lineTo(cw * 3, ch + 60 * s); ctx.lineTo(cw * 3, -60 * s); ctx.closePath(); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18 * s; ctx.shadowOffsetX = -8 * s;
      ctx.strokeStyle = '#f6f0e1'; ctx.lineWidth = 16 * s; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.restore();
      break;
    }
    case 'whip': {
      const off = k * cw, blur = Math.sin(Math.PI * p);
      ctx.drawImage(A, -off, 0); ctx.drawImage(B, cw - off, 0);
      if (blur > 0.15) { ctx.globalAlpha = 0.28 * blur; for (const d of [-60, -30, 30, 60]) { ctx.drawImage(A, -off + d * s * blur, 0); ctx.drawImage(B, cw - off + d * s * blur, 0); } ctx.globalAlpha = 1; }
      break;
    }
    case 'slide': ctx.drawImage(A, 0, -k * ch); ctx.drawImage(B, 0, ch - k * ch); break;
    case 'flash': ctx.drawImage(p < 0.5 ? A : B, 0, 0); ctx.fillStyle = `rgba(255,255,250,${(1 - Math.abs(p - 0.5) * 2) * 0.9})`; ctx.fillRect(0, 0, cw, ch); break;
    case 'zoom': {
      ctx.drawImage(B, 0, 0); const z = 1 + k * 0.6; ctx.globalAlpha = 1 - k;
      ctx.drawImage(A, cw / 2 - cw * z / 2, ch / 2 - ch * z / 2, cw * z, ch * z); ctx.globalAlpha = 1; break;
    }
    default: ctx.drawImage(B, 0, 0);
  }
}

module.exports = { Renderer, animState, cameraAt, normTransition, TRANSITIONS };
