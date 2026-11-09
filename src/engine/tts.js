// Narration (TTS): which voice speaks, which API key pays for it, and fitting the voice to the story timeline.
//
// Providers
//   gemini   - any Gemini TTS model (multilingual, incl. Bangla). Needs GEMINI_API_KEY. Model chain with fallback.
//   deepgram - Aura-2 voices (English). Needs DEEPGRAM_API_KEY.
//   kokoro   - local, offline Kokoro-82M via kokoro-js (English). Optional: `npm i kokoro-js`.
//   edge     - Microsoft Edge read-aloud voices (every language in the table, no key). The universal fallback.
//
// Keys come from the environment (or a .env file) and nowhere else. Several keys per provider are rotated on
// quota / rate-limit errors only: a bad request would fail identically on every key, so it is raised at once.
// Nothing here prints or stores a key; KeyRing.describe() shows masked fragments.
//
// A provider that cannot speak the story's language, or has no key, hands off to edge in the SAME language:
// Bangla read by an English-only voice is worse than Bangla read by a different provider.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { run } = require('./ffmpeg');

const ROOT = path.join(__dirname, '..', '..');
const SR = 48000; // every clip is normalized to 48 kHz mono s16 so the mixer never has to resample

// ---------------------------------------------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------------------------------------------

// edge is mandatory (it is the backstop); an empty deepgram/kokoro voice means "cannot speak this language".
const LANGUAGES = [
  { code: 'en', name: 'English', edge: 'en-US-AndrewNeural', deepgram: 'aura-2-odysseus-en', kokoro: 'am_puck', aliases: ['eng', 'english', 'en-us', 'en-gb'] },
  { code: 'bn', name: 'Bangla', edge: 'bn-BD-PradeepNeural', aliases: ['bangla', 'bengali', 'bn-bd', 'bn-in'] },
  { code: 'hi', name: 'Hindi', edge: 'hi-IN-MadhurNeural', aliases: ['hindi'] },
  { code: 'ur', name: 'Urdu', edge: 'ur-PK-AsadNeural', aliases: ['urdu'] },
  { code: 'ar', name: 'Arabic', edge: 'ar-EG-ShakirNeural', aliases: ['arabic'] },
  { code: 'es', name: 'Spanish', edge: 'es-ES-AlvaroNeural', aliases: ['spanish', 'espanol'] },
  { code: 'fr', name: 'French', edge: 'fr-FR-HenriNeural', aliases: ['french', 'francais'] },
  { code: 'de', name: 'German', edge: 'de-DE-ConradNeural', aliases: ['german', 'deutsch'] },
  { code: 'it', name: 'Italian', edge: 'it-IT-DiegoNeural', aliases: ['italian', 'italiano'] },
  { code: 'pt', name: 'Portuguese', edge: 'pt-BR-AntonioNeural', aliases: ['portuguese', 'pt-br'] },
  { code: 'ru', name: 'Russian', edge: 'ru-RU-DmitryNeural', aliases: ['russian'] },
  { code: 'ja', name: 'Japanese', edge: 'ja-JP-KeitaNeural', aliases: ['japanese'] },
  { code: 'ko', name: 'Korean', edge: 'ko-KR-InJoonNeural', aliases: ['korean'] },
  { code: 'zh', name: 'Chinese', edge: 'zh-CN-YunxiNeural', aliases: ['chinese', 'mandarin', 'zh-cn'] },
  { code: 'id', name: 'Indonesian', edge: 'id-ID-ArdiNeural', aliases: ['indonesian'] },
  { code: 'tr', name: 'Turkish', edge: 'tr-TR-AhmetNeural', aliases: ['turkish'] },
];
const ENGLISH = LANGUAGES[0];
const LANG_INDEX = new Map();
for (const l of LANGUAGES) for (const k of [l.code, l.name, ...l.aliases]) LANG_INDEX.set(k.toLowerCase(), l);

// Unknown or blank -> English, with a note. A typo in one field should not stop a render.
function resolveLanguage(name) {
  const raw = String(name || '').trim();
  if (!raw) return { lang: ENGLISH, note: '' };
  const key = raw.toLowerCase().replace(/_/g, '-');
  if (LANG_INDEX.has(key)) return { lang: LANG_INDEX.get(key), note: '' };
  const base = LANG_INDEX.get(key.split('-')[0]);
  if (base) return { lang: base, note: '' };
  return { lang: ENGLISH, note: `language "${raw}" is not in the speech table, fallback voice is English (known: ${LANGUAGES.map(l => l.code).join(', ')})` };
}

// Gemini prebuilt voices are language-agnostic: any of them reads any language.
const GEMINI_VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'];
const DEFAULT_GEMINI_VOICE = 'Charon';
// Tried in order: each model has its own quota per key, so the next model is a fresh pool.
const DEFAULT_GEMINI_MODELS = ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'];

const PROVIDERS = ['gemini', 'deepgram', 'kokoro', 'edge'];
const KEYED = ['gemini', 'deepgram'];
const SILENT = new Set(['none', 'silent', 'off', 'false', 'no', '0', 'null']);

// ---------------------------------------------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------------------------------------------

let envLoaded = false;
// Load <repo>/.env and ./.env once. Real environment variables win over the file.
function loadEnvFile() {
  if (envLoaded) return; envLoaded = true;
  for (const f of new Set([path.join(ROOT, '.env'), path.resolve('.env')])) {
    let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/); if (!m) continue;
      let v = m[2];
      if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, '');
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}

const SEP = /[,;\s]+/;
// X_API_KEYS (list), X_API_KEY (one, or a list), X_API_KEY_1.._32. Order kept, duplicates dropped,
// so overlapping spellings cannot make one key look like a pool of three. Gemini also reads GOOGLE_API_KEY.
function readKeys(provider, env) {
  if (!env) loadEnvFile();
  const src = env || process.env, bases = [provider.toUpperCase() + '_API_KEY'];
  if (provider === 'gemini') bases.push('GOOGLE_API_KEY');
  const raw = [];
  for (const base of bases) {
    for (const v of [base + 'S', base]) raw.push(...String(src[v] || '').split(SEP));
    for (let i = 1; i <= 32; i++) raw.push(...String(src[`${base}_${i}`] || '').split(SEP));
  }
  return [...new Set(raw.map(k => k.trim()).filter(Boolean))];
}
const hasKeys = (provider, env) => readKeys(provider, env).length > 0;
const mask = k => (k.length <= 8 ? '*'.repeat(k.length) : `${k.slice(0, 4)}...${k.slice(-3)}`);

// Only quota / rate errors are worth retrying on another key.
const RATE_LIMITED = /\b429\b|\b403\b|RESOURCE_EXHAUSTED|PERMISSION_DENIED|rate.?limit|quota|too many requests|overloaded|denied access/i;
const isRateLimited = e => !!(e && (e.rateLimited || RATE_LIMITED.test(String(e.message || e))));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A provider's keys, rotated on rate-limit errors. Position persists across calls so a long render spreads load.
class KeyRing {
  constructor(provider, keys) { this.provider = provider; this.keys = [...keys]; this.pos = 0; }
  get size() { return this.keys.length; }
  describe() { return `${this.keys.length} ${this.provider} key(s): ${this.keys.map(mask).join(', ')}`; }
  // call(key) -> Promise. passes: how many times round the ring. wait=false: one pass, never sleep (lets the
  // caller move to another model instead). Non-rate-limit errors propagate from the first key.
  async run(call, { passes = 2, wait = true, log = console.log, sleepFn = sleep, baseBackoff = 5000, maxBackoff = 60000 } = {}) {
    const n = this.keys.length;
    if (!n) throw new Error(`no ${this.provider} API key (set ${this.provider.toUpperCase()}_API_KEY)`);
    const attempts = wait ? Math.max(1, n * passes) : n;
    let backoff = baseBackoff, last;
    for (let a = 0; a < attempts; a++) {
      const key = this.keys[this.pos % n];
      try { return await call(key); } catch (e) {
        if (!isRateLimited(e)) throw e;
        last = e; this.pos = (this.pos + 1) % n;
        if (a === attempts - 1) break;
        if ((a + 1) % n === 0) { // every key tried once: only now does waiting help
          log(`  all ${n} ${this.provider} key(s) rate-limited, waiting ${Math.round(backoff / 1000)}s`);
          await sleepFn(backoff); backoff = Math.min(backoff * 2, maxBackoff);
        }
      }
    }
    const err = new Error(`all ${n} ${this.provider} key(s) rate-limited (${last && last.message})`);
    err.rateLimited = true; err.cause = last; throw err;
  }
}
const rings = new Map();
function keyRing(provider) {
  if (!rings.has(provider)) rings.set(provider, new KeyRing(provider, readKeys(provider)));
  return rings.get(provider);
}

// ---------------------------------------------------------------------------------------------------------------
// Providers. Each returns { kind: 'pcm' | 'float' | 'file', data, rate?, ext? }.
// ---------------------------------------------------------------------------------------------------------------

async function httpError(provider, res) {
  const body = await res.text().catch(() => '');
  const e = new Error(`${provider} HTTP ${res.status}: ${body.replace(/\s+/g, ' ').slice(0, 300)}`);
  e.status = res.status; return e;
}

// Retry the same key for hiccups that are not about quota: empty audio, 500/502/504.
async function retryTransient(fn, tries = 3) {
  for (let i = 1; ; i++) {
    try { return await fn(); } catch (e) {
      const transient = e.noAudio || [500, 502, 503, 504].includes(e.status) || e.name === 'TimeoutError';
      if (!transient || i >= tries) throw e;
      await sleep(1500 * i);
    }
  }
}

const geminiBase = () => (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
const modelId = m => String(m).trim().replace(/^models\//, '');

async function geminiOnce(text, o, model, key) {
  const prompt = o.style ? `${String(o.style).trim().replace(/[:.\s]+$/, '')}:\n${text}` : text;
  const speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voice } } };
  if (o.languageCode) speechConfig.languageCode = o.languageCode;
  const generationConfig = { responseModalities: ['AUDIO'], speechConfig };
  if (o.temperature != null) generationConfig.temperature = o.temperature;
  const res = await fetch(`${geminiBase()}/models/${encodeURIComponent(modelId(model))}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, // header, so the key never lands in a URL or error text
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw await httpError('gemini', res);
  const j = await res.json(), cand = (j.candidates || [])[0] || {};
  const bufs = []; let rate = 24000;
  for (const p of (cand.content && cand.content.parts) || []) {
    const d = p.inlineData || p.inline_data; if (!d || !d.data) continue;
    const m = /rate=(\d+)/i.exec(d.mimeType || d.mime_type || ''); if (m) rate = +m[1];
    bufs.push(Buffer.from(d.data, 'base64'));
  }
  if (!bufs.length) {
    const e = new Error(`gemini ${model} returned no audio (${cand.finishReason || (j.promptFeedback && j.promptFeedback.blockReason) || 'empty response'})`);
    e.noAudio = true; throw e;
  }
  return { kind: 'pcm', data: Buffer.concat(bufs), rate };
}

// Walk the model chain. Quota is per model, so a model whose every key is spent hands over to the next model
// without sleeping; only the last model backs off and retries.
async function geminiSpeak(text, o, log) {
  const ring = keyRing('gemini'), models = o.models, errs = [];
  for (let i = 0; i < models.length; i++) {
    const model = models[i], last = i === models.length - 1;
    try {
      const out = await ring.run(key => retryTransient(() => geminiOnce(text, o, model, key)), { wait: last, log });
      return { ...out, model };
    } catch (e) {
      errs.push(`${model}: ${e.message}`);
      if (!last) log(`  gemini ${model} failed (${e.message.slice(0, 120)}), trying ${models[i + 1]}`);
    }
  }
  throw new Error('gemini: every model failed. ' + errs.join(' | '));
}

async function listGeminiModels() {
  const ring = keyRing('gemini');
  return ring.run(async key => {
    const out = []; let token = '';
    do {
      const res = await fetch(`${geminiBase()}/models?pageSize=1000${token ? '&pageToken=' + encodeURIComponent(token) : ''}`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw await httpError('gemini', res);
      const j = await res.json(); out.push(...(j.models || [])); token = j.nextPageToken || '';
    } while (token);
    return out.filter(m => /tts/i.test(m.name)).map(m => ({ name: modelId(m.name), displayName: m.displayName, description: m.description }));
  });
}

async function deepgramOnce(text, o, key) {
  const base = (process.env.DEEPGRAM_BASE_URL || 'https://api.deepgram.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/speak?model=${encodeURIComponent(o.voice)}&encoding=linear16&container=wav&sample_rate=24000`, {
    method: 'POST', headers: { Authorization: `Token ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text }), signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw await httpError('deepgram', res);
  return { kind: 'file', data: Buffer.from(await res.arrayBuffer()), ext: 'wav' };
}
const deepgramSpeak = (text, o, log) => keyRing('deepgram').run(key => retryTransient(() => deepgramOnce(text, o, key)), { log });

// One at a time: Edge drops parallel connections, and there is one Kokoro model instance.
function serial() { let tail = Promise.resolve(); return fn => { const p = tail.then(fn, fn); tail = p.catch(() => {}); return p; }; }
const edgeQueue = serial(), kokoroQueue = serial();

let kokoroP = null;
function kokoroAvailable() { try { require.resolve('kokoro-js'); return true; } catch (e) { return false; } }
const kokoroSpeak = (text, o) => kokoroQueue(() => kokoroOnce(text, o));
async function kokoroOnce(text, o) {
  if (!kokoroP) {
    kokoroP = (async () => {
      let mod;
      try { mod = await import('kokoro-js'); } catch (e) { throw new Error('local TTS needs kokoro-js: run "npm i kokoro-js" (it downloads a ~90 MB model once, then runs offline)'); }
      return mod.KokoroTTS.from_pretrained(process.env.KOKORO_MODEL || 'onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: process.env.KOKORO_DTYPE || 'q8', device: 'cpu' });
    })();
    kokoroP.catch(() => { kokoroP = null; });
  }
  const tts = await kokoroP;
  const a = await tts.generate(text, { voice: o.voice, speed: o.speed || 1 });
  return { kind: 'float', data: a.audio, rate: a.sampling_rate };
}

const escapeXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const edgeSpeak = (text, o) => edgeQueue(async () => {
  for (let i = 1; ; i++) {
    try { return await edgeOnce(text, o); } catch (e) { if (i >= 4 || /no audio|voice/i.test(e.message) && !/closed/i.test(e.message)) throw e; await sleep(1000 * i); }
  }
});
async function edgeOnce(text, o) {
  let lib; try { lib = require('msedge-tts'); } catch (e) { throw new Error('edge TTS needs msedge-tts: run "npm install"'); }
  const tts = new lib.MsEdgeTTS();
  try {
    await tts.setMetadata(o.voice, lib.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const pct = Math.round(((o.speed || 1) - 1) * 100);
    const { audioStream } = tts.toStream(escapeXml(text), pct ? { rate: `${pct > 0 ? '+' : ''}${pct}%` } : undefined);
    const chunks = [];
    await new Promise((res, rej) => { audioStream.on('data', c => chunks.push(c)); audioStream.on('end', res); audioStream.on('error', rej); });
    if (!chunks.length) throw new Error(`edge voice "${o.voice}" returned no audio`);
    return { kind: 'file', data: Buffer.concat(chunks), ext: 'mp3' };
  } finally { try { tts.close(); } catch (e) { /* already closed */ } }
}

const SPEAKERS = { gemini: geminiSpeak, deepgram: deepgramSpeak, kokoro: kokoroSpeak, edge: edgeSpeak };

// ---------------------------------------------------------------------------------------------------------------
// WAV helpers
// ---------------------------------------------------------------------------------------------------------------

function wavHeader(dataLen, rate, channels = 1) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + dataLen, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * 2, 28); h.writeUInt16LE(channels * 2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(dataLen, 40);
  return h;
}
function floatToPcm(f32) {
  const b = Buffer.alloc(f32.length * 2);
  for (let i = 0; i < f32.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, f32[i])) * 32767), i * 2);
  return b;
}
// Parse a PCM s16 WAV (chunk-aware, so LIST/fact chunks from ffmpeg are fine).
function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file: ' + file);
  let off = 12, rate = SR, channels = 1, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), len = b.readUInt32LE(off + 4), body = off + 8;
    if (id === 'fmt ') { channels = b.readUInt16LE(body + 2); rate = b.readUInt32LE(body + 4); }
    if (id === 'data') { data = b.subarray(body, Math.min(b.length, body + len)); break; }
    off = body + len + (len & 1);
  }
  if (!data) throw new Error('WAV has no data chunk: ' + file);
  const samples = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + (data.length & ~1)));
  return { rate, channels, samples, duration: samples.length / channels / rate };
}

// Any source -> 48 kHz mono s16 WAV, edge silence trimmed, loudness-matched so providers sound alike.
async function normalize(src, out, { tempo = 1, trim = true, loudnorm = true } = {}) {
  const af = [];
  if (trim) af.push('silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05', 'areverse', 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.12', 'areverse');
  for (let t = tempo; Math.abs(t - 1) > 1e-3;) { const s = Math.max(0.5, Math.min(2, t)); af.push(`atempo=${s.toFixed(4)}`); t /= s; }
  if (loudnorm) af.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  af.push(`aresample=${SR}`);
  await run(['-i', src, '-af', af.join(','), '-ar', String(SR), '-ac', '1', '-c:a', 'pcm_s16le', '-map_metadata', '-1', '-fflags', '+bitexact', out]);
}

// ---------------------------------------------------------------------------------------------------------------
// Planning: (voice spec, language) -> what will actually speak
// ---------------------------------------------------------------------------------------------------------------

// "gemini:Kore" | "kokoro" | "en-US-AriaNeural" (edge) | true/"auto" | {provider, voice, model, style, ...} | "none"
function parseVoice(spec) {
  if (spec === undefined || spec === null || spec === false) return null;
  if (spec === true) return { provider: 'auto' };
  if (typeof spec === 'string') {
    const s = spec.trim(); if (!s || SILENT.has(s.toLowerCase())) return null;
    const i = s.indexOf(':');
    if (i > 0) { const p = s.slice(0, i).trim().toLowerCase(); if (p === 'auto' || PROVIDERS.includes(p)) return { provider: p, voice: s.slice(i + 1).trim() || undefined }; }
    const low = s.toLowerCase();
    if (low === 'auto' || PROVIDERS.includes(low)) return { provider: low };
    return { provider: 'edge', voice: s };
  }
  if (typeof spec === 'object') {
    if (spec.enabled === false) return null;
    let o = { ...spec };
    if (!o.provider && typeof o.voice === 'string' && o.voice.includes(':')) o = { ...o, ...parseVoice(o.voice) };
    o.provider = String(o.provider || 'auto').toLowerCase();
    if (o.provider !== 'auto' && !PROVIDERS.includes(o.provider)) throw new Error(`unknown voice provider "${o.provider}" (use ${PROVIDERS.join(', ')}, auto)`);
    return o;
  }
  throw new Error('voice must be a string like "gemini:Kore" or an object');
}

// A scene-level voice overrides the story voice; an object scene voice is merged onto an object story voice.
function mergeSpec(storySpec, sceneSpec) {
  if (sceneSpec === undefined) return storySpec;
  const a = parseVoice(storySpec), b = parseVoice(sceneSpec);
  if (!b) return null;
  if (!a) return b;
  if (typeof sceneSpec === 'object') return { ...a, ...b, provider: sceneSpec.provider || (sceneSpec.voice && String(sceneSpec.voice).includes(':') ? b.provider : a.provider) };
  return { ...a, provider: b.provider, voice: b.voice, model: b.provider === a.provider ? a.model : undefined };
}

function geminiModels(o) {
  const src = o.model || o.models || process.env.GEMINI_TTS_MODEL || process.env.GEMINI_TTS_MODELS;
  const list = src ? [].concat(src).flatMap(m => String(m).split(SEP)).map(modelId).filter(Boolean) : [];
  return list.length ? [...new Set(list)] : DEFAULT_GEMINI_MODELS;
}

function planVoice(spec, language, env) {
  const v = parseVoice(spec); if (!v) return null;
  const { lang, note } = resolveLanguage(language);
  const notes = note ? [note] : [];
  let provider = v.provider, voice = v.voice;
  if (provider === 'auto') {
    provider = hasKeys('gemini', env) ? 'gemini' : hasKeys('deepgram', env) && lang.deepgram ? 'deepgram' : kokoroAvailable() && lang.kokoro ? 'kokoro' : 'edge';
    voice = undefined;
  }
  if (provider === 'deepgram' || provider === 'kokoro') {
    if (!lang[provider] && !v.force) { notes.push(`${provider} has no ${lang.name} voice, narrating ${lang.name} with edge`); provider = 'edge'; voice = v.edgeVoice; }
    else voice = voice || lang[provider];
  }
  if (KEYED.includes(provider) && !hasKeys(provider, env)) { notes.push(`no ${provider.toUpperCase()}_API_KEY, narrating with edge`); provider = 'edge'; voice = v.edgeVoice; }
  if (provider === 'gemini') voice = voice || DEFAULT_GEMINI_VOICE;
  if (provider === 'edge') voice = voice || v.edgeVoice || lang.edge;
  return {
    provider, voice, lang, note: notes.join('; '),
    models: provider === 'gemini' ? geminiModels(v) : undefined,
    style: v.style, speed: v.speed ?? 1, languageCode: v.languageCode, temperature: v.temperature,
    fallback: v.fallback !== false, fallbackVoice: v.edgeVoice || lang.edge,
    fit: v.fit || 'extend', maxTempo: v.maxTempo ?? 1.2, lead: v.lead ?? 0.25, tail: v.tail ?? 0.4,
    fromCaptions: v.fromCaptions !== false, syncCaptions: v.syncCaptions !== false,
  };
}
const planSpec = p => (p.provider === 'edge' ? `edge:${p.voice}` : `${p.provider}:${p.voice}`) + (p.models ? ` [${p.models[0]}${p.models.length > 1 ? ` +${p.models.length - 1} fallback` : ''}]` : '');

// ---------------------------------------------------------------------------------------------------------------
// Synthesis with cache + fallback
// ---------------------------------------------------------------------------------------------------------------

function cacheKey(provider, o, text) {
  const id = { provider, voice: o.voice, text, style: o.style || '', speed: provider === 'gemini' || provider === 'deepgram' ? o.speed : o.speed || 1, languageCode: o.languageCode || '', temperature: o.temperature ?? '', models: provider === 'gemini' ? o.models : undefined };
  return crypto.createHash('sha1').update(JSON.stringify(id)).digest('hex').slice(0, 20);
}

async function synthOne(provider, text, o, cacheDir, log) {
  const key = cacheKey(provider, o, text), out = path.join(cacheDir, `${provider}-${key}.wav`), meta = out.replace(/\.wav$/, '.json');
  if (fs.existsSync(out)) { const m = fs.existsSync(meta) ? JSON.parse(fs.readFileSync(meta, 'utf8')) : {}; return { file: out, duration: readWav(out).duration, provider, voice: o.voice, model: m.model, cached: true }; }
  const r = await SPEAKERS[provider](text, o, log);
  const tmp = out + `.src.${r.kind === 'file' ? r.ext : 'wav'}`;
  if (r.kind === 'file') fs.writeFileSync(tmp, r.data);
  else { const pcm = r.kind === 'float' ? floatToPcm(r.data) : r.data; fs.writeFileSync(tmp, Buffer.concat([wavHeader(pcm.length, r.rate), pcm])); }
  // Gemini and Deepgram have no speed knob; apply it as tempo. Edge and Kokoro already spoke at that speed.
  const tempo = provider === 'gemini' || provider === 'deepgram' ? o.speed || 1 : 1;
  try { await normalize(tmp, out, { tempo }); } finally { fs.rmSync(tmp, { force: true }); }
  fs.writeFileSync(meta, JSON.stringify({ provider, voice: o.voice, model: r.model, text }, null, 1));
  return { file: out, duration: readWav(out).duration, provider, voice: o.voice, model: r.model, cached: false };
}

// Speak `text` with the plan; if the provider fails for any reason, fall back to edge in the same language.
async function speak(text, plan, { cacheDir, log = console.log } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  try { return await synthOne(plan.provider, text, plan, cacheDir, log); } catch (e) {
    if (!plan.fallback || plan.provider === 'edge') throw e;
    log(`  ${plan.provider} TTS failed (${e.message.slice(0, 200)}), falling back to edge (${plan.fallbackVoice})`);
    return { ...(await synthOne('edge', text, { ...plan, provider: 'edge', voice: plan.fallbackVoice }, cacheDir, log)), fellBack: true };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Story narration: speak every scene, fit the timeline, sync captions, build one voice track
// ---------------------------------------------------------------------------------------------------------------

const captionText = cap => (cap ? (typeof cap === 'string' ? cap : cap.text || '') : '');
const plainText = s => String(s).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
function sayText(sc, plan) {
  if (sc.say === false) return '';
  if (typeof sc.say === 'string') return plainText(sc.say);
  return plan.fromCaptions ? plainText(captionText(sc.caption)) : '';
}

const wantsVoice = (story, opts = {}) => !!parseVoice(opts.voice !== undefined ? opts.voice : story.voice) || (story.scenes || []).some(sc => sc.voice !== undefined && !!parseVoice(sc.voice));

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

// Mutates the raw story JSON: scene durations (fit) and caption timing (sync). Returns the clip placements.
async function narrate(story, { voice, model, cacheDir, log = console.log, concurrency } = {}) {
  let spec = voice !== undefined ? voice : story.voice;
  if (model) spec = { ...(parseVoice(spec) || { provider: 'gemini' }), model };
  const plans = new Map();
  const planFor = s => { const k = JSON.stringify(s ?? null); if (!plans.has(k)) { const p = planVoice(s, story.lang); if (p && p.note) log(`  voice: ${p.note}`); plans.set(k, p); } return plans.get(k); };
  const jobs = [];
  story.scenes.forEach((sc, i) => {
    const plan = planFor(sc.voice !== undefined ? mergeSpec(spec, sc.voice) : spec);
    const text = plan && sayText(sc, plan);
    if (text) jobs.push({ i, sc, plan, text });
  });
  if (!jobs.length) return null;
  const used = [...new Set(jobs.map(j => planSpec(j.plan)))];
  log(`  narration: ${jobs.length} line(s) with ${used.join(', ')}`);

  const conc = concurrency || Number(process.env.VOX_TTS_CONCURRENCY) || 3;
  // Edge and Kokoro serialize themselves internally; the pool only matters for Gemini / Deepgram.
  await pool(jobs, conc, async j => { j.clip = await speak(j.text, j.plan, { cacheDir, log }); });
  const fresh = jobs.filter(j => !j.clip.cached).length;
  log(`  ${fresh} new clip(s) synthesized, ${jobs.length - fresh} from cache (${cacheDir})`);

  for (const j of jobs) {
    const { sc, plan, clip } = j, lead = sc.sayAt ?? plan.lead;
    let file = clip.file, dur = clip.duration;
    const room = sc.dur - lead - plan.tail;
    if (dur > room && plan.fit === 'squeeze') {
      const tempo = Math.min(plan.maxTempo, dur / Math.max(0.1, room));
      if (tempo > 1.01) { file = clip.file.replace(/\.wav$/, `.x${tempo.toFixed(3)}.wav`); if (!fs.existsSync(file)) await normalize(clip.file, file, { tempo, trim: false, loudnorm: false }); dur /= tempo; }
    }
    if (dur > room) {
      if (plan.fit === 'none') log(`  warning: scene ${sc.id ?? j.i + 1} narration is ${dur.toFixed(1)}s but the scene leaves ${room.toFixed(1)}s; it will run into the next scene`);
      else { const old = sc.dur; sc.dur = Math.ceil((lead + dur + plan.tail) * 10) / 10; log(`  scene ${sc.id ?? j.i + 1}: ${old}s -> ${sc.dur}s to fit ${dur.toFixed(1)}s of narration`); }
    }
    // Reveal caption words at the pace of the voice instead of the theme's fixed reading speed.
    if (plan.syncCaptions && sc.caption) {
      const cap = typeof sc.caption === 'string' ? { text: sc.caption } : { ...sc.caption };
      const words = captionText(cap).split(/\s+/).filter(Boolean).length;
      if (cap.rate === undefined && words) cap.rate = Math.max(1.5, +(words / Math.max(0.5, dur * 0.95)).toFixed(3));
      if (cap.at === undefined) cap.at = Math.max(0, lead - 0.1);
      sc.caption = cap;
    }
    Object.assign(j, { file, dur, lead });
  }

  let T = 0; const starts = story.scenes.map(sc => { const s = T; T += sc.dur; return s; });
  return {
    clips: jobs.map(j => ({ scene: j.i, at: starts[j.i] + j.lead, file: j.file, duration: j.dur, provider: j.clip.provider, voice: j.clip.voice, model: j.clip.model, fellBack: !!j.clip.fellBack, text: j.text })),
    duration: T,
  };
}

// Place every clip on one mono 48 kHz track (s16 WAV) of the given length.
function buildVoiceTrack(clips, duration, out) {
  const N = Math.ceil(duration * SR), mix = new Float32Array(N);
  for (const c of clips) {
    const { samples, channels } = readWav(c.file), start = Math.round(c.at * SR);
    for (let i = 0; i * channels < samples.length && start + i < N; i++) if (start + i >= 0) mix[start + i] += samples[i * channels] / 32768;
  }
  const pcm = floatToPcm(mix);
  fs.writeFileSync(out, Buffer.concat([wavHeader(pcm.length, SR), pcm]));
  return out;
}

// Human-readable provider status (masked keys only).
function ttsStatus() {
  const lines = [];
  for (const p of KEYED) {
    const keys = readKeys(p);
    lines.push(`${p.padEnd(9)} ${keys.length ? new KeyRing(p, keys).describe() : `no key (set ${p.toUpperCase()}_API_KEY, comma-separate several)`}`);
  }
  lines.push(`gemini models: ${geminiModels({}).join(' -> ')}${process.env.GEMINI_TTS_MODEL ? ' (GEMINI_TTS_MODEL)' : ' (default chain)'}`);
  lines.push(`kokoro    ${kokoroAvailable() ? 'installed (local, English)' : 'not installed (npm i kokoro-js for offline English voices)'}`);
  let edge = false; try { require.resolve('msedge-tts'); edge = true; } catch (e) { /* missing */ }
  lines.push(`edge      ${edge ? 'available (no key, every language below)' : 'missing (npm install)'}`);
  return lines.join('\n');
}

module.exports = {
  LANGUAGES, GEMINI_VOICES, DEFAULT_GEMINI_VOICE, DEFAULT_GEMINI_MODELS, PROVIDERS,
  resolveLanguage, readKeys, hasKeys, mask, isRateLimited, KeyRing, keyRing, loadEnvFile,
  parseVoice, planVoice, planSpec, speak, narrate, buildVoiceTrack, wantsVoice, listGeminiModels, ttsStatus,
  readWav, normalize, sayText, _rings: rings,
};
