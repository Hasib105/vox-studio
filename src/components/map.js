// Real-geography paper map: countries cut from paper, focus countries lifted, animated land borders, geo labels.
'use strict';
const geo = require('../engine/geo');
const { paper, paperRings, rectPts, torn, pathPoly } = require('../engine/paper');
const { chip } = require('../engine/text');
const { ease, prog, twos, clamp, lerp } = require('../engine/core');

const cache = new WeakMap();
function build(el) {
  if (cache.has(el)) return cache.get(el);
  const x = num(el.x, 540), y = num(el.y, 900), w = num(el.w, 900), h = num(el.h, 760), detail = el.detail || '50m';
  const box = { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
  const focus = el.focus || [];
  const proj = geo.makeProjection({ focus, bounds: el.bounds, box, projection: el.projection, detail, rotate: el.rotate });
  const pad = el.card ? (el.card.pad ?? 30) : 0;
  const clip = el.card ? { x0: box.x0 - pad, y0: box.y0 - pad, x1: box.x1 + pad, y1: box.y1 + pad } : { x0: -150, y0: -150, x1: 1230, y1: 2070 };
  const focusNames = new Set(focus.map(n => geo.findCountry(n, detail).properties.name));
  const highlightNames = new Set(Object.keys(el.fill || {}).map(n => geo.findCountry(n, detail).properties.name));
  const ctxPieces = [], focusPieces = [];
  const mode = el.countries || 'context';
  for (const f of geo.topology(detail).fc.features) {
    const name = f.properties.name, isFocus = focusNames.has(name) || highlightNames.has(name);
    if (mode === 'focus' && !isFocus) continue;
    const rings = geo.projectRings(f, proj, clip);
    if (!rings.length) continue;
    (isFocus ? focusPieces : ctxPieces).push({ name, rings });
  }
  const border = el.border ? geo.projectLines(geo.landBorder(el.border.of, detail), proj) : null;
  const outline = el.outline ? geo.projectRings(geo.outline(el.outline.of, detail), proj, clip, 1.2, 4) : null;
  const out = { proj, box, clip, ctxPieces, focusPieces, border, outline, project: ll => proj(ll) };
  cache.set(el, out);
  return out;
}
const num = (v, d) => (typeof v === 'number' ? v : d);

module.exports = {
  map: {
    doc: 'Real-world paper map (Natural Earth borders). Fit to focus countries or a lon/lat box; focus countries are lifted off the page with halftone. Other elements can then use {"geo":[lon,lat]} positions.',
    absolute: true,
    props: {
      id: 'name to reference from geo positions (default: first map in the scene)',
      x: 'center x', y: 'center y', w: 'fit width', h: 'fit height',
      focus: '["Iran"] countries to fit and lift', bounds: '[[lonW,latS],[lonE,latN]] fit box instead of focus',
      countries: '"context" (all neighbors, default) or "focus" (only focus countries)',
      detail: '"110m" | "50m" (default) | "10m" (zoomed regions, straits)', projection: 'mercator | equalEarth | orthographic',
      focusFill: 'focus country color', contextFill: 'neighbor color', fill: '{"Country": "#color"} extra highlights',
      card: '{"color": "#4ea8de", "pad": 30} draw a torn water card behind and clip neighbors to it',
      ht: 'halftone color on focus countries', border: '{"of":"Iran","progress":0-1 or keyframes,"color":"#e63946","width":9,"dash":[20,12]} animated land borders',
      outline: '{"of":"Iran","color":"#111","width":4} full outline incl. coast', labels: '[{"text":"IRAN","geo":[lon,lat],"size":60,"font":"headline","color":"#111","bg":"none|#fff","rot":0,"at":1.2}]',
    },
    prepare(el, S) { const m = build(el); const id = el.id || 'map'; S.maps[id] = m; if (!S.maps._default) S.maps._default = m; },
    draw(ctx, p, S) {
      const m = build(S.el);
      // paper-base themes do not paint the scene color, so give context maps a water card in that color
      const kind = (S.theme.background || {}).kind;
      if (!p.card && p.countries !== 'focus' && ['grid', 'fiber', 'riso', 'blueprint'].includes(kind)) p.card = { color: S.scene.bg, pad: 20 };
      if (p.card) {
        const { box } = m, pad = p.card.pad ?? 30;
        const poly = paper(ctx, rectPts(box.x1 - box.x0 + pad * 2, box.y1 - box.y0 + pad * 2, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2), S.key + 'card', p.card.color || '#4ea8de', { amp: 5, ht: p.card.ht || '#1d6fa5', htA: 0.3 });
        ctx.save(); pathPoly(ctx, poly); ctx.clip();
        for (const c of m.ctxPieces) paperRings(ctx, c.rings, (p.fill || {})[c.name] || p.contextFill || '#d9c9a8', { fringeW: 3, shadow: 0.5, shadowA: 0.3, blur: 8 });
        ctx.restore();
      } else {
        for (const c of m.ctxPieces) paperRings(ctx, c.rings, (p.fill || {})[c.name] || p.contextFill || '#d9c9a8', { fringeW: 3, shadow: 0.5, shadowA: 0.3, blur: 8 });
      }
      for (const c of m.focusPieces) {
        const fill = (p.fill || {})[c.name] || p.focusFill || '#f3e9d2';
        paperRings(ctx, c.rings, fill, { fringeW: 6, shadow: 1.5, shadowA: 0.45, blur: 18, ht: p.ht === null ? undefined : (p.ht || '#c9b48a'), htA: 0.45 });
      }
      if (m.outline && p.outline) {
        ctx.save(); ctx.strokeStyle = p.outline.color || '#111'; ctx.lineWidth = p.outline.width || 4; ctx.lineJoin = 'round';
        ctx.beginPath(); for (const r of m.outline) { ctx.moveTo(r[0][0], r[0][1]); for (const q of r) ctx.lineTo(q[0], q[1]); ctx.closePath(); } ctx.stroke(); ctx.restore();
      }
      if (m.border && p.border) {
        const b = p.border, pr = clamp(b.progress ?? 1);
        ctx.save(); ctx.strokeStyle = b.color || '#e63946'; ctx.lineWidth = b.width || 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
        if (b.dash !== null) { ctx.setLineDash(b.dash || [20, 12]); ctx.lineDashOffset = -twos(S.sec, S.fps) * (b.flow ?? 60); }
        for (const line of m.border) {
          const n = Math.max(2, Math.ceil(line.length * pr)); if (pr <= 0) break;
          ctx.beginPath(); ctx.moveTo(line[0][0], line[0][1]); for (let i = 1; i < n; i++) ctx.lineTo(line[i][0], line[i][1]); ctx.stroke();
        }
        ctx.restore();
      }
      for (const [i, l] of (p.labels || []).entries()) {
        const sc = l.at !== undefined ? ease('back', prog(S.sec, l.at, 0.35)) : 1; if (sc <= 0.01) continue;
        const [lx, ly] = m.project(l.geo);
        chip(ctx, S, l.text, lx + (l.dx || 0), ly + (l.dy || 0), { size: l.size || 40, font: l.font || 'headline', bg: l.bg || 'none', color: l.color || '#1d1d1d', rot: l.rot ?? -0.03, scale: sc, key: S.key + 'l' + i, jitter: 0.5 });
      }
    },
  },
};
