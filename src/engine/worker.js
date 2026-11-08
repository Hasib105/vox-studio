'use strict';
const { parentPort, workerData } = require('worker_threads');
const { encodeRange } = require('./render');

const { story, a, b, out, scale, baseDir } = workerData;
encodeRange(story, a, b, out, scale, () => parentPort.postMessage('f'), baseDir)
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
