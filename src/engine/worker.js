'use strict';
const { parentPort, workerData } = require('worker_threads');
const { encodeRange } = require('./render');

const { story, a, b, out, enc } = workerData;
encodeRange(story, a, b, out, enc, () => parentPort.postMessage('f'))
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
