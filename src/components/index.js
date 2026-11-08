'use strict';
const registry = {
  ...require('./basic'),
  ...require('./objects'),
  ...require('./props'),
  ...require('./map'),
  group: {
    doc: 'Groups child elements so they move/animate together. Children positions are relative to the group.',
    props: { elements: 'array of child elements' },
    prepare(el, S) { for (const c of el.elements || []) { const comp = registry[c.type]; if (comp && comp.prepare) comp.prepare(c, S); } },
    draw(ctx, p, S) { const G = Object.create(S); G.inGroup = true; S.drawChildren(ctx, S.el.elements || [], G); },
  },
};

function catalog() {
  return Object.entries(registry).map(([name, c]) => ({ name, absolute: !!c.absolute, doc: c.doc, props: c.props }));
}
module.exports = { registry, catalog };
