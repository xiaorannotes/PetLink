// Node >=20；安装器可指定工具自带的兼容 Node 运行时。
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverHub } from '../shared/index.mjs';
import { validateEvent } from '../protocol/index.mjs';
import { HOOK_STATES } from './claude-code.mjs';
export function translateNotify(input, now = Date.now()) {
  if (input?.type !== 'agent-turn-complete') return null;
  const event = { v: 1, source: 'codex', session: input['thread-id'], state: 'done', ts: now };
  if (typeof input.cwd === 'string') event.project = path.win32.basename(input.cwd.replace(/\/+$/u, ''));
  if (typeof input['last-assistant-message'] === 'string') {
    const title = [...input['last-assistant-message']].slice(0, 20).join('');
    if (validateEvent({ ...event, title }).ok) event.title = title;
  }
  return validateEvent(event).ok ? event : null;
}
export function translateHook(input, now = Date.now()) {
  if (typeof input?.hook_event_name !== 'string') return null;
  const state = input.hook_event_name==='Interrupt'?'idle':input.hook_event_name==='PreModelRequest'?'working':input.hook_event_name==='PostModelRequest'?(input.status==='failed'?'error':input.status==='cancelled'?'idle':'working'):HOOK_STATES[input.hook_event_name];
  const event = { v: 1, source: 'codex', session: input.session_id, state: state ?? 'idle', ts: now };
  if (!state || (input.hook_event_name==='PostModelRequest'&&input.status==='completed')) event.beat = true;
  if (typeof input.cwd === 'string') event.project = path.win32.basename(input.cwd.replace(/\/+$/u, ''));
  return validateEvent(event).ok ? event : null;
}
async function main() {
  let stopReply=false;
  const deadline = setTimeout(() => process.exit(0), 450);
  try {
    let input;
    if (process.argv.includes('--codex-notify')) input = JSON.parse(process.argv.at(-1));
    else {
      const chunks = []; let size = 0;
      for await (const chunk of process.stdin) { size += chunk.length; if (size > 1048576) return; chunks.push(chunk); }
      input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    stopReply=process.argv.includes('--petlink-codex-hook')&&input.hook_event_name==='Stop';
    const event = process.argv.includes('--codex-notify') ? translateNotify(input) : translateHook(input);
    if (!event) return;
    if (process.argv.includes('--dry-run')) { process.stdout.write(JSON.stringify(event) + '\n'); return; }
    const { port, token } = await discoverHub();
    await new Promise(resolve => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/v1/event', method: 'POST', headers: { 'x-petlink-token': token, 'content-type': 'application/json' } }, res => { res.resume(); res.on('end', resolve); res.on('error', resolve); });
      req.on('error', resolve); req.end(JSON.stringify(event));
    });
  } catch {} finally { clearTimeout(deadline);if(stopReply)process.stdout.write('{}\n'); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
