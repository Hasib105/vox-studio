#!/usr/bin/env node
// vox-studio MCP server (stdio). Lets any MCP client (Claude Code, Claude Desktop, Cursor, ...) write a JSON story,
// preview it as images, and render a finished Vox-style collage MP4 — all locally.
'use strict';
const fs = require('fs');
const path = require('path');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { renderVideo, renderStills, renderFrameAt, slug } = require('../engine/render');
const { loadStory } = require('../engine/loader');
const { catalog } = require('../components');
const { THEMES } = require('../engine/themes');
const { countryNames } = require('../engine/geo');

const ROOT = path.join(__dirname, '..', '..');
const WORKSPACE = path.resolve(process.env.VOX_WORKSPACE || process.cwd());
const OUT = path.resolve(process.env.VOX_OUTPUT_DIR || path.join(WORKSPACE, 'output'));
const log = m => process.stderr.write(`[vox] ${m}\n`);
const pkg = require(path.join(ROOT, 'package.json'));

const server = new McpServer({ name: 'vox-studio', version: pkg.version });

// story can be inline JSON or a path to a .json file
const storyArgs = {
  story: z.any().optional().describe('The story as a JSON object (see vox_get_guide). Use this OR story_path.'),
  story_path: z.string().optional().describe('Path to a story .json file (relative paths resolve against the workspace).'),
};
function storyInput({ story, story_path }) {
  if (story_path) { const p = path.resolve(WORKSPACE, story_path); if (!fs.existsSync(p)) throw new Error('story_path not found: ' + p); return p; }
  if (story) return typeof story === 'string' ? JSON.parse(story) : story;
  throw new Error('Provide either "story" (JSON object) or "story_path".');
}
const text = t => ({ content: [{ type: 'text', text: t }] });
const fail = e => ({ isError: true, content: [{ type: 'text', text: 'Error: ' + (e && e.message || e) }] });
async function imageContent(file, maxW = 1400) {
  const img = await loadImage(fs.readFileSync(file));
  const k = Math.min(1, maxW / img.width), c = createCanvas(Math.round(img.width * k), Math.round(img.height * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { type: 'image', data: (await c.encode('jpeg', 82)).toString('base64'), mimeType: 'image/jpeg' };
}

server.registerTool('vox_get_guide', {
  title: 'Get the story-writing guide',
  description: 'READ THIS FIRST. Returns the complete guide for writing a vox-studio story: JSON format, every component, animation, camera move, transition, map usage, captions, languages, and the Vox editorial design rules (hook in 3s, 4-6s shots, anti-monotony, palette arc). Call before writing any story.',
  inputSchema: {},
}, async () => {
  const guide = fs.readFileSync(path.join(ROOT, 'docs', 'STORY_FORMAT.md'), 'utf8');
  const rules = fs.readFileSync(path.join(ROOT, 'docs', 'DESIGN_RULES.md'), 'utf8');
  return text(guide + '\n\n---\n\n' + rules + '\n\n---\n\n## Component catalog\n' + catalogText());
});

function catalogText(name) {
  return catalog().filter(c => !name || c.name === name).map(c =>
    `### ${c.name}${c.absolute ? ' (absolute coords)' : ''}\n${c.doc}\n` + Object.entries(c.props || {}).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')).join('\n\n');
}
server.registerTool('vox_list_components', {
  title: 'List components',
  description: 'List the collage components (paper, label, map, arrow, padlock, gate, truck, counter, photo, ...) with their props. Pass a name for one component.',
  inputSchema: { name: z.string().optional() },
}, async ({ name }) => text(catalogText(name) || `No component "${name}".`));

server.registerTool('vox_list_countries', {
  title: 'List map country names',
  description: 'Natural Earth country names usable in map "focus", "fill", "border.of". Optional filter substring.',
  inputSchema: { filter: z.string().optional() },
}, async ({ filter }) => text(countryNames().filter(n => !filter || n.toLowerCase().includes(filter.toLowerCase())).join('\n')));

server.registerTool('vox_validate_story', {
  title: 'Validate a story',
  description: 'Check a story for errors (unknown components, bad animations, missing durations) and print its timeline. Cheap; run it after every edit.',
  inputSchema: storyArgs,
}, async (a) => {
  try {
    const s = await loadStory(storyInput(a), { baseDir: WORKSPACE }); let t = 0;
    const lines = s.scenes.map(sc => { const l = `${t.toFixed(1)}s  [${sc.id}] ${sc.dur}s, ${sc.elements.length} elements${sc.headline ? ', headline' : ''}${sc.transition ? ', ' + (sc.transition.type || sc.transition) : ''}`; t += sc.dur; return l; });
    return text(`OK: "${s.title}" ${s.size.join('x')} lang=${s.lang}, ${t.toFixed(1)}s\n` + lines.join('\n'));
  } catch (e) { return fail(e); }
});

server.registerTool('vox_preview', {
  title: 'Preview story as images',
  description: 'Render a contact sheet (one frame per scene) and RETURN IT AS AN IMAGE so you can check the look before rendering video. Use scene + times to inspect one scene\'s animation (e.g. times [0.1,0.4,0.8]). Fast (seconds).',
  inputSchema: { ...storyArgs, at: z.number().optional().describe('Fraction of each scene to sample (default 0.85)'), scene: z.number().optional().describe('1-based scene number to inspect'), times: z.array(z.number()).optional().describe('Fractions of the scene to sample, with scene') },
}, async (a) => {
  try {
    const input = storyInput(a);
    const name = typeof input === 'string' ? path.basename(input, '.json') : slug(input.title || 'story');
    const r = await renderStills(input, { at: a.at, scene: a.scene, times: a.times, outDir: path.join(OUT, slug(name), 'stills'), baseDir: WORKSPACE });
    return { content: [await imageContent(r.sheet), { type: 'text', text: `Saved: ${r.sheet}` }] };
  } catch (e) { return fail(e); }
});

server.registerTool('vox_render_frame', {
  title: 'Render one frame',
  description: 'Render a single full-resolution frame at a given second of the video and return it as an image (for close inspection of text, maps, layout).',
  inputSchema: { ...storyArgs, seconds: z.number().describe('Time in the video, in seconds') },
}, async (a) => {
  try {
    const out = path.join(OUT, `frame-${Date.now()}.png`);
    await renderFrameAt(storyInput(a), a.seconds, out, { baseDir: WORKSPACE });
    return { content: [await imageContent(out, 1080), { type: 'text', text: `Saved: ${out}` }] };
  } catch (e) { return fail(e); }
});

// Rendering video can take a minute or more, so it runs as a background job.
const jobs = new Map(); let jobSeq = 0;
server.registerTool('vox_render_video', {
  title: 'Render the MP4',
  description: 'Start rendering the final MP4 (parallel, local). Returns a job_id immediately; poll vox_render_status. Typical speed: ~1-2 min for a 40s 1080x1920 video. Use scale 0.5 for a fast draft.',
  inputSchema: {
    ...storyArgs,
    output_path: z.string().optional().describe('Where to write the .mp4 (default <output>/<title>.mp4)'),
    scale: z.number().optional().describe('Resolution scale, 0.5 = fast half-res draft (default 1)'),
    sfx: z.boolean().optional().describe('Add procedural paper-foley sound effects (default: story.audio.sfx or false)'),
    music: z.string().optional().describe('Path to a music file to mix underneath'),
    workers: z.number().optional().describe('Parallel render workers (default: CPU count - 1, max 6)'),
  },
}, async (a) => {
  try {
    const input = storyInput(a);
    await loadStory(input, { baseDir: WORKSPACE }); // validate up front
    const id = `job${++jobSeq}`, job = { id, status: 'running', progress: [], started: Date.now() };
    jobs.set(id, job);
    renderVideo(input, { out: a.output_path && path.resolve(WORKSPACE, a.output_path), outDir: OUT, scale: a.scale, sfx: a.sfx, music: a.music && path.resolve(WORKSPACE, a.music), workers: a.workers, baseDir: WORKSPACE, log: m => { job.progress.push(m); log(m); } })
      .then(r => { job.status = 'done'; job.result = r; })
      .catch(e => { job.status = 'error'; job.error = e.message; log(e.stack); });
    return text(`Started ${id}. Poll vox_render_status with job_id "${id}".`);
  } catch (e) { return fail(e); }
});

server.registerTool('vox_render_status', {
  title: 'Render job status',
  description: 'Check a render job. Waits up to wait_seconds (default 30) for it to finish, then reports progress or the final MP4 path.',
  inputSchema: { job_id: z.string(), wait_seconds: z.number().optional() },
}, async ({ job_id, wait_seconds }) => {
  const job = jobs.get(job_id); if (!job) return fail(`unknown job ${job_id}`);
  const until = Date.now() + Math.min(55, wait_seconds ?? 30) * 1000;
  while (job.status === 'running' && Date.now() < until) await new Promise(r => setTimeout(r, 500));
  if (job.status === 'done') return text(`DONE: ${job.result.out}\n${job.result.duration.toFixed(1)}s video, ${job.result.size.join('x')}, rendered in ${job.result.renderSeconds}s.`);
  if (job.status === 'error') return fail(job.error);
  return text(`RUNNING (${((Date.now() - job.started) / 1000).toFixed(0)}s): ${job.progress.slice(-1)[0] || 'starting'}`);
});

server.registerTool('vox_save_story', {
  title: 'Save a story file',
  description: 'Save a story JSON to <workspace>/stories/<name>.json so it can be edited and re-rendered later.',
  inputSchema: { name: z.string().describe('file name without extension'), story: z.any() },
}, async ({ name, story }) => {
  try {
    const obj = typeof story === 'string' ? JSON.parse(story) : story;
    await loadStory(obj, { baseDir: WORKSPACE });
    const dir = path.join(WORKSPACE, 'stories'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${slug(name)}.json`); fs.writeFileSync(file, JSON.stringify(obj, null, 2));
    return text(`Saved ${file}`);
  } catch (e) { return fail(e); }
});

server.registerTool('vox_list_examples', {
  title: 'List example stories',
  description: 'List bundled example stories (full working videos) you can read and adapt. Returns their paths; read one with vox_get_example.',
  inputSchema: {},
}, async () => text(fs.readdirSync(path.join(ROOT, 'stories')).filter(f => f.endsWith('.json')).map(f => path.join(ROOT, 'stories', f)).join('\n')));

server.registerTool('vox_get_example', {
  title: 'Read an example story',
  description: 'Return the JSON of a bundled example story by file name (e.g. "iron-gate.en.json"). Great starting point to copy patterns from.',
  inputSchema: { name: z.string() },
}, async ({ name }) => {
  const f = path.join(ROOT, 'stories', path.basename(name));
  return fs.existsSync(f) ? text(fs.readFileSync(f, 'utf8')) : fail('not found: ' + name);
});

server.registerPrompt('vox_explainer', {
  title: 'Make a Vox-style explainer',
  description: 'Guided workflow: research a topic, write the beat map, build the story, preview, render.',
  argsSchema: { topic: z.string().describe('What the video explains'), language: z.string().optional().describe('Caption language, e.g. en, bn, hi'), length: z.string().optional().describe('Target length, default ~35s') },
}, ({ topic, language, length }) => ({
  messages: [{ role: 'user', content: { type: 'text', text:
`Make a Vox-style paper-collage explainer video about: ${topic}
Language: ${language || 'en'}. Length: ${length || '~35 seconds'}. Format 9:16 unless I say otherwise.

Workflow:
1. Call vox_get_guide and read it fully.
2. Verify the facts (search the web if you can). Keep sources; put them in "sources" and a small on-screen source label.
3. Propose a beat map (hook <3s, 4-6s shots, 6-8 shots) with headline, caption and visual idea per shot. Wait for my OK.
4. Write the story JSON. Run vox_validate_story, then vox_preview and LOOK at the image. Fix overlaps, clipped text, empty frames. Inspect key scenes with scene+times.
5. Render with vox_render_video, poll vox_render_status, and give me the MP4 path.` } }],
}));

async function main() {
  await server.connect(new StdioServerTransport());
  log(`vox-studio MCP ready (workspace ${WORKSPACE}, output ${OUT})`);
}
main().catch(e => { log(e.stack); process.exit(1); });
