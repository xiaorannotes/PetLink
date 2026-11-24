import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverHub } from '../shared/index.mjs';
import { validateEvent } from '../protocol/index.mjs';

export const HOOK_STATES = Object.freeze({
  sessionStart: 'idle',
  beforeSubmitPrompt: 'working',
  preToolUse: 'working',
  postToolUse: 'working',
  postToolUseFailure: 'error',
  afterAgentResponse: 'working',
  stop: 'done',
  sessionEnd: 'offline'
});

export function translateHook(input, now = Date.now()) {
  const eventName = input?.hook_event_name || input?.event;
  let state = HOOK_STATES[eventName];
  if (!state) return null;
  if (eventName === 'stop' && input?.status === 'aborted') state = 'idle';
  if (eventName === 'stop' && input?.status === 'error') state = 'error';
  const session = String(input?.conversation_id || input?.session_id || 'cursor-main');
  const event = { v: 1, source: 'cursor', session, state, ts: now };
  if (eventName === 'afterAgentResponse') event.beat = true;
  if (typeof input?.cwd === 'string') {
    const base = path.win32.basename(input.cwd.replace(/\/+$/u, ''));
    if (base && base !== '.' && base !== '..') event.project = base;
  }
  return validateEvent(event).ok ? event : null;
}

async function main() {
  const deadline = setTimeout(() => process.exit(0), 450);
  try {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) { size += chunk.length; if (size > 1048576) return; chunks.push(chunk); }
    const event = translateHook(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (!event) return;
    if (process.argv.includes('--dry-run')) { process.stdout.write(JSON.stringify(event) + '\n'); return; }
    const { port, token } = await discoverHub();
    await new Promise(resolve => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/v1/event', method: 'POST', headers: { 'x-petlink-token': token, 'content-type': 'application/json' } }, res => { res.resume(); res.on('end', resolve); res.on('error', resolve); });
      req.on('error', resolve); req.end(JSON.stringify(event));
    });
  } catch {} finally { clearTimeout(deadline); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
