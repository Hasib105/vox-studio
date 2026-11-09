// Offline TTS test: a mock Gemini + Deepgram server checks key rotation, model fallback, PCM->WAV, timeline fitting
// and caption sync without real keys or network. Run: node test/tts-test.js
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const seen = []; // [key, model] per Gemini request
function pcmSine(sec, rate = 24000) {
  const b = Buffer.alloc(Math.round(sec * rate) * 2);
  for (let i = 0; i < b.length / 2; i++) b.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 220) * 12000), i * 2);
  return b;
}
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', d => { body += d; });
  req.on('end', () => {
    const key = req.headers['x-goog-api-key'];
    assert(!req.url.includes('key='), 'API key must never travel in the URL');
    if (req.url.startsWith('/gemini/models?')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash' }, { name: 'models/any-new-tts-model', displayName: 'New TTS' }] })); }
    const g = req.url.match(/^\/gemini\/models\/([^:]+):generateContent$/);
    if (g) {
      const model = decodeURIComponent(g[1]); seen.push([key, model]);
      const j = JSON.parse(body), text = j.contents[0].parts[0].text;
      assert.deepStrictEqual(j.generationConfig.responseModalities, ['AUDIO']);
      if (key === 'KEY_SPENT') { res.writeHead(429); return res.end('{"error":{"status":"RESOURCE_EXHAUSTED","message":"quota"}}'); }
      if (model === 'retired-tts-model') { res.writeHead(404); return res.end('{"error":{"status":"NOT_FOUND"}}'); }
      const sec = Math.max(0.6, text.split(/\s+/).length * 0.4);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcmSine(sec).toString('base64') } }] } }] }));
    }
    if (req.url.startsWith('/deepgram/speak?')) {
      assert(/^Token /.test(req.headers.authorization));
      if (req.headers.authorization === 'Token DG_SPENT') { res.writeHead(429); return res.end('Too Many Requests'); }
      const pcm = pcmSine(1.0), h = Buffer.alloc(44);
      h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
      h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
      res.writeHead(200, { 'content-type': 'audio/wav' }); return res.end(Buffer.concat([h, pcm]));
    }
    res.writeHead(404); res.end();
  });
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const k of Object.keys(process.env)) if (/^(GEMINI|GOOGLE|DEEPGRAM)_API_KEY/.test(k) || k === 'GEMINI_TTS_MODEL') delete process.env[k];
  Object.assign(process.env, { GEMINI_BASE_URL: base + '/gemini', DEEPGRAM_BASE_URL: base + '/deepgram', GEMINI_API_KEY: 'KEY_SPENT, KEY_GOOD', GEMINI_API_KEY_1: 'KEY_GOOD', DEEPGRAM_API_KEYS: 'DG_SPENT;DG_GOOD' });
  const tts = require('../src/engine/tts');
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vox-tts-test-'));
  const log = () => {};

  // keys: every spelling merged, duplicates dropped, masked when described
  assert.deepStrictEqual(tts.readKeys('gemini'), ['KEY_SPENT', 'KEY_GOOD']);
  assert.deepStrictEqual(tts.readKeys('deepgram'), ['DG_SPENT', 'DG_GOOD']);
  assert(!tts.keyRing('gemini').describe().includes('KEY_GOOD'));
  console.log('ok  keys merged + de-duplicated:', tts.keyRing('gemini').describe());

  // rotation only on rate limits; a bad request is raised on the first key
  const ring = new tts.KeyRing('t', ['a', 'b', 'c']); const tried = [];
  assert.strictEqual(await ring.run(async k => { tried.push(k); if (k !== 'c') throw new Error('HTTP 429 quota'); return k; }, { log }), 'c');
  await assert.rejects(ring.run(async k => { tried.push('bad:' + k); throw new Error('HTTP 400 INVALID_ARGUMENT'); }, { log }), /400/);
  assert.deepStrictEqual(tried, ['a', 'b', 'c', 'bad:c']);
  console.log('ok  rotates on 429, raises 400 immediately');

  // any Gemini model: a retired model hands over to the next; a spent key rotates to the next key
  const plan = tts.planVoice({ provider: 'gemini', voice: 'Kore', model: 'retired-tts-model, any-new-tts-model' }, 'bn');
  assert.strictEqual(plan.provider, 'gemini'); assert.deepStrictEqual(plan.models, ['retired-tts-model', 'any-new-tts-model']);
  const clip = await tts.speak('ঢাকায় আজ বৃষ্টি', plan, { cacheDir, log });
  assert.strictEqual(clip.model, 'any-new-tts-model');
  assert(seen.some(([k, m]) => k === 'KEY_SPENT') && seen.some(([k, m]) => k === 'KEY_GOOD' && m === 'any-new-tts-model'));
  assert(clip.duration > 0.9 && clip.duration < 1.4, 'duration ' + clip.duration);
  const n0 = seen.length; const again = await tts.speak('ঢাকায় আজ বৃষ্টি', plan, { cacheDir, log });
  assert(again.cached && seen.length === n0, 'second call must come from cache');
  console.log(`ok  gemini model fallback -> ${clip.model}, ${clip.duration.toFixed(2)}s clip, cached on repeat`);

  // GEMINI_TTS_MODEL picks the default chain; "models/" prefix is accepted
  process.env.GEMINI_TTS_MODEL = 'models/any-new-tts-model';
  assert.deepStrictEqual(tts.planVoice('gemini:Puck', 'en').models, ['any-new-tts-model']);
  delete process.env.GEMINI_TTS_MODEL;
  assert.deepStrictEqual((await tts.listGeminiModels()).map(m => m.name), ['any-new-tts-model']);
  console.log('ok  GEMINI_TTS_MODEL + tts-models listing');

  // deepgram: rotation + English only (Bangla goes to edge, same language)
  const dg = await tts.speak('hello there', tts.planVoice('deepgram', 'en'), { cacheDir, log });
  assert.strictEqual(dg.provider, 'deepgram'); assert(dg.duration > 0.8);
  const dgBn = tts.planVoice('deepgram', 'bn');
  assert.strictEqual(dgBn.provider, 'edge'); assert.strictEqual(dgBn.voice, 'bn-BD-PradeepNeural');
  console.log('ok  deepgram rotation; bn re-routed to', dgBn.voice);

  // routing without keys / local
  assert.strictEqual(tts.planVoice('kokoro', 'bn').provider, 'edge');
  assert.strictEqual(tts.planVoice('gemini', 'bn', {}).provider, 'edge'); // no keys in this env
  assert.strictEqual(tts.planVoice('none', 'en'), null);
  assert.strictEqual(tts.planVoice('auto', 'en').provider, 'gemini');
  console.log('ok  routing (kokoro/bn -> edge, missing key -> edge, none -> silent, auto -> gemini)');

  // story: scene stretched to fit the voice, caption re-timed, per-scene say + scene voice override
  const story = { lang: 'en', voice: { provider: 'gemini', model: 'any-new-tts-model' }, scenes: [
    { id: 'a', dur: 1.5, caption: 'one *two* three four five six seven' },
    { id: 'b', dur: 6, caption: 'short', say: 'a different spoken line' },
    { id: 'c', dur: 3, caption: 'not spoken', say: false },
    { id: 'd', dur: 3, caption: 'deepgram here', voice: 'deepgram' },
  ] };
  const n = await tts.narrate(story, { cacheDir, log });
  assert.strictEqual(n.clips.length, 3);
  assert(story.scenes[0].dur > 3, 'scene a should stretch, got ' + story.scenes[0].dur);
  assert.strictEqual(story.scenes[1].dur, 6);
  assert(story.scenes[0].caption.rate > 1 && story.scenes[0].caption.at >= 0);
  assert.strictEqual(n.clips[1].text, 'a different spoken line');
  assert.strictEqual(n.clips[2].provider, 'deepgram');
  assert(Math.abs(n.clips[1].at - (story.scenes[0].dur + 0.25)) < 1e-6);
  const track = tts.buildVoiceTrack(n.clips, n.duration, path.join(cacheDir, 'track.wav'));
  assert(Math.abs(tts.readWav(track).duration - n.duration) < 0.01);
  console.log(`ok  narrate: scene a 1.5s -> ${story.scenes[0].dur}s, caption rate ${story.scenes[0].caption.rate}/s, track ${n.duration}s`);

  fs.rmSync(cacheDir, { recursive: true, force: true });
  server.close();
  console.log('TTS tests passed');
})().catch(e => { console.error('TTS TEST FAILED:', e); server.close(); process.exit(1); });
