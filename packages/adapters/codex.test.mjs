import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { translateHook, translateNotify } from './codex.mjs';
test('Codex notify 限制类型、身份、标题与隐私', () => {
  const input = { type: 'agent-turn-complete', 'thread-id': 't', cwd: '/tmp/项目', 'last-assistant-message': '完成'.repeat(30), secret: '不发送' };
  const event = translateNotify(input, 10); assert.equal(event.title.length, 20); assert.equal(event.project, '项目'); assert.equal(event.state, 'done'); assert.equal(event.secret, undefined);
  assert.equal(translateNotify({ ...input, 'last-assistant-message': 'password=秘密' }, 10).title, undefined);
  assert.equal(translateNotify({ ...input, type: 'unknown' }), null);
  assert.equal(translateNotify({ ...input, 'thread-id': '../bad' }), null);
});
test('Codex hooks 全映射及未知事件仅续命', () => {
  for (const [hook_event_name, state] of Object.entries({ SessionStart: 'idle', UserPromptSubmit: 'working', PreToolUse: 'working', PostToolUse: 'working', Notification: 'waiting', PermissionRequest: 'waiting', Stop: 'done', StopFailure: 'error', SessionEnd: 'offline' })) {
    assert.equal(translateHook({ hook_event_name, session_id: 's' }).state, state);
  }
  assert.equal(translateHook({ hook_event_name: 'unknown', session_id: 's' }).beat, true);
  assert.equal(translateHook({ session_id: 's' }), null);
});
test('Codex 子进程 dry-run 和无效输入静默退出', () => {
  const script = new URL('./codex.mjs', import.meta.url);
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const good = spawnSync(process.execPath, [fileURLToPath(script), '--dry-run', '--codex-notify', JSON.stringify({ type: 'agent-turn-complete', 'thread-id': 's' })], { encoding: 'utf8', env });
  assert.ifError(good.error); assert.equal(good.status, 0); assert.equal(JSON.parse(good.stdout).state, 'done'); assert.equal(good.stderr, '');
  const bad = spawnSync(process.execPath, [fileURLToPath(script)], { input: '{', encoding: 'utf8', env }); assert.equal(bad.status, 0); assert.equal(bad.stdout + bad.stderr, '');
});
test('modern Codex hooks resume after permission and report model failure without private text',()=>{
 assert.equal(translateHook({hook_event_name:'PreToolUse',session_id:'s'}).beat,undefined);
 const e=translateHook({hook_event_name:'PostModelRequest',session_id:'s',status:'failed',error:'private credentials',prompt:'private prompt'});
 assert.equal(e.state,'error');assert.equal(e.error,undefined);assert.equal(e.prompt,undefined);
 assert.equal(translateHook({hook_event_name:'Interrupt',session_id:'s'}).state,'idle');
});
test('Codex 真实 Hub：notify 与 hooks 共用发现、未知事件仅续命', async () => {
  const { startHub } = await import('../hub/index.mjs');
  const { mkdtemp, rm } = await import('node:fs/promises'); const { tmpdir } = await import('node:os'); const path = await import('node:path'); const { spawn } = await import('node:child_process');
  const dir = await mkdtemp(path.join(tmpdir(), 'petlink-codex-')); let hub;
  async function invoke(args, input) {
    const env = { ...process.env, PETLINK_DATA_DIR: dir }; delete env.NODE_TEST_CONTEXT;
    const start = performance.now();
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('./codex.mjs', import.meta.url)), ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c); child.on('error', reject); child.stdin.on('error', () => {});
      child.on('close', code => { try { assert.equal(code, 0); assert.equal(output, ''); resolve(); } catch (e) { reject(e); } }); child.stdin.end(JSON.stringify(input));
    });
    assert.ok(performance.now() - start <= 800);
  }
  try {
    hub = await startHub({ dataDir: dir, port: 0 });
    await invoke(['--codex-notify', JSON.stringify({ type: 'agent-turn-complete', 'thread-id': 'notify' })]); assert.equal(hub.store.snapshot().aggregate.state, 'done');
    await invoke([], { hook_event_name: 'UserPromptSubmit', session_id: 'hook' });
    await invoke([], { hook_event_name: 'Unknown', session_id: 'hook' }); assert.equal(hub.store.snapshot().sessions.find(s => s.session === 'hook').state, 'working');
    await invoke([], { hook_event_name: 'Notification', session_id: 'hook' }); assert.equal(hub.store.snapshot().aggregate.state, 'waiting');
  } finally { if (hub) await hub.close(); await rm(dir, { recursive: true, force: true }); }
});
