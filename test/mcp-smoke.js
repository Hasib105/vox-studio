// End-to-end smoke test: spawn the MCP server over stdio and call its tools like a real client would.
'use strict';
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

(async () => {
  const root = path.join(__dirname, '..');
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'src', 'mcp', 'server.js')], env: { ...process.env, VOX_WORKSPACE: root }, stderr: 'ignore' });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map(t => t.name);
  console.log('tools:', tools.join(', '));
  const prompts = (await client.listPrompts()).prompts.map(p => p.name);
  console.log('prompts:', prompts.join(', '));
  const call = async (name, args) => { const r = await client.callTool({ name, arguments: args }); if (r.isError) throw new Error(name + ': ' + r.content[0].text); return r; };

  const guide = await call('vox_get_guide', {});
  console.log('guide chars:', guide.content[0].text.length);
  console.log((await call('vox_validate_story', { story_path: 'stories/_template.json' })).content[0].text.split('\n')[0]);
  const bad = await client.callTool({ name: 'vox_validate_story', arguments: { story: { scenes: [{ dur: 3, elements: [{ type: 'nope' }] }] } } });
  console.log('invalid story rejected:', !!bad.isError, '-', bad.content[0].text.split('\n')[1]);
  const prev = await call('vox_preview', { story_path: 'stories/_template.json' });
  console.log('preview:', prev.content[0].type, prev.content[0].mimeType, Math.round(prev.content[0].data.length / 1024) + 'KB base64');
  const job = await call('vox_render_video', { story_path: 'stories/_template.json', scale: 0.5, output_path: 'output/_template-draft.mp4' });
  const id = job.content[0].text.match(/job\d+/)[0];
  let st; do { st = (await call('vox_render_status', { job_id: id, wait_seconds: 50 })).content[0].text; console.log('status:', st.split('\n')[0]); } while (st.startsWith('RUNNING'));
  await client.close();
  if (!st.startsWith('DONE')) process.exit(1);
})().catch(e => { console.error('SMOKE FAILED:', e.message); process.exit(1); });
