'use strict';
// Public API
const { renderVideo, renderStills, renderFrameAt } = require('./engine/render');
const { loadStory, validate } = require('./engine/loader');
const { catalog, registry } = require('./components');
const { THEMES } = require('./engine/themes');
const { countryNames } = require('./engine/geo');
const { narrate, speak, planVoice, KeyRing, listGeminiModels } = require('./engine/tts');

module.exports = { renderVideo, renderStills, renderFrameAt, loadStory, validate, catalog, registry, THEMES, countryNames, narrate, speak, planVoice, KeyRing, listGeminiModels };
