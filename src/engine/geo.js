// Real-world geography from Natural Earth (world-atlas TopoJSON). Projection, country rings, land borders.
'use strict';
const topojson = require('topojson-client');
const d3 = require('d3-geo');

const ALIASES = {
  usa: 'United States of America', us: 'United States of America', 'united states': 'United States of America',
  uk: 'United Kingdom', britain: 'United Kingdom', uae: 'United Arab Emirates', türkiye: 'Turkey', turkiye: 'Turkey',
  drc: 'Dem. Rep. Congo', 'czech republic': 'Czechia', 'ivory coast': "Côte d'Ivoire", burma: 'Myanmar',
};
const topoCache = {};
function topology(detail = '50m') {
  if (!topoCache[detail]) {
    const topo = require(`world-atlas/countries-${detail}.json`);
    const fc = topojson.feature(topo, topo.objects.countries);
    const byName = new Map(fc.features.map(f => [f.properties.name.toLowerCase(), f]));
    topoCache[detail] = { topo, fc, byName };
  }
  return topoCache[detail];
}
function findCountry(name, detail) {
  const { byName } = topology(detail);
  const key = String(name).toLowerCase();
  const f = byName.get(ALIASES[key]?.toLowerCase() || key);
  if (!f) throw new Error(`Unknown country "${name}". Use Natural Earth names, e.g. "Iran", "United States of America", "Turkey".`);
  return f;
}
function countryNames(detail = '110m') { return topology(detail).fc.features.map(f => f.properties.name).sort(); }

// Build a projection that fits focus countries (or a lon/lat bounds box) into a pixel box.
function makeProjection({ focus, bounds, box, projection = 'mercator', detail = '50m', rotate }) {
  const p = projection === 'equalEarth' ? d3.geoEqualEarth() : projection === 'orthographic' ? d3.geoOrthographic() : d3.geoMercator();
  if (rotate) p.rotate(rotate);
  let target;
  if (bounds) target = { type: 'MultiPoint', coordinates: bounds };
  else target = { type: 'FeatureCollection', features: (focus || []).map(n => findCountry(n, detail)) };
  p.fitExtent([[box.x0, box.y0], [box.x1, box.y1]], target);
  return p;
}

// Project geometry into pixel rings, simplify, drop tiny/offscreen rings.
function projectRings(geom, proj, clip, minDist = 1.6, minArea = 24) {
  const rings = []; let cur = null;
  const sink = { moveTo(x, y) { cur = [[x, y]]; rings.push(cur); }, lineTo(x, y) { const l = cur[cur.length - 1]; if (Math.abs(x - l[0]) + Math.abs(y - l[1]) >= minDist) cur.push([x, y]); }, closePath() { }, arc() { }, beginPath() { } };
  d3.geoPath(proj, sink)(geom);
  const worldW = 2 * Math.PI * proj.scale() * 0.9; // rings spanning the whole world are clip/winding artifacts
  return rings.filter(r => {
    if (r.length < 3) return false;
    let mnx = 1e12, mxx = -1e12; for (const q of r) { if (q[0] < mnx) mnx = q[0]; if (q[0] > mxx) mxx = q[0]; }
    if (mxx - mnx >= worldW) return false;
    let a = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < r.length; i++) { const [x, y] = r[i], [nx, ny] = r[(i + 1) % r.length]; a += x * ny - nx * y; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    if (Math.abs(a / 2) < minArea) return false;
    return !(x1 < clip.x0 || x0 > clip.x1 || y1 < clip.y0 || y0 > clip.y1);
  });
}
function projectLines(geom, proj) {
  const lines = []; let cur = null;
  const sink = { moveTo(x, y) { cur = [[x, y]]; lines.push(cur); }, lineTo(x, y) { cur.push([x, y]); }, closePath() { }, arc() { }, beginPath() { } };
  d3.geoPath(proj, sink)(geom);
  return lines.filter(l => l.length > 1);
}
// Land borders shared between `name` and its neighbors (no coastline).
function landBorder(name, detail = '50m') {
  const { topo } = topology(detail);
  const target = findCountry(name, detail).properties.name;
  return topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b && (a.properties.name === target || b.properties.name === target));
}
// Full outline including coastline.
function outline(name, detail = '50m') { return findCountry(name, detail); }
// Countries sharing a land border with `name`.
function neighbors(name, detail = '50m') {
  const { topo, fc } = topology(detail);
  const idx = fc.features.findIndex(f => f.properties.name === findCountry(name, detail).properties.name);
  const nb = topojson.neighbors(topo.objects.countries.geometries);
  return (nb[idx] || []).map(i => fc.features[i].properties.name);
}

module.exports = { topology, findCountry, countryNames, makeProjection, projectRings, projectLines, landBorder, outline, neighbors, ALIASES };
