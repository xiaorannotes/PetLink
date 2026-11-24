import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateHook, HOOK_STATES } from './claude-code.mjs';
import { startHub } from '../hub/index.mjs';
export const adapterPath = fileURLToPath(new URL('./claude-code.mjs', import.meta.url));
export function runAdapter(input, dataDir, args = []) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PETLINK_DATA_DIR: dataDir }; delete env.NODE_TEST_CONTEXT;
    const start = performance.now(); const child = spawn(process.execPath, [adapterPath, ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x); child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr, elapsed: performance.now() - start }));
    child.stdin.on('error', () => {}); if (input !== undefined) child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}
for (const [hook, state] of Object.entries(HOOK_STATES)) test(`映射 ${hook}`, () => {
  const event = translateHook({ hook_event_name: hook, session_id: 'session', cwd: '/private/work/project', prompt: 'secret', title: 'password' }, 123);
  assert.deepEqual(event, { v: 1, source: 'claude-code', session: 'session', state, ts: 123, project: 'project' });
});
test('Windows basename 与无效输入', () => {
  assert.equal(translateHook({ hook_event_name: 'Stop', session_id: 's', cwd: 'C:\\work\\project' }).project, 'project');
  for (const input of [null, {}, { hook_event_name: 'Unknown' }, { hook_event_name: 'Stop', session_id: '/private' }]) assert.equal(translateHook(input), null);
});
test('dry-run 不依赖 Hub、隐私白名单', async () => {
  const result = await runAdapter({ hook_event_name: 'Stop', session_id: 's', cwd: '/private/project', prompt: 'password secret' }, '/missing', ['--dry-run']);
  assert.equal(result.code, 0); assert.equal(result.stderr, ''); assert.equal(JSON.parse(result.stdout).project, 'project'); assert.equal(result.stdout.includes('secret'), false);
});
test('离线、坏输入与 stdin 未关闭均静默且总时限不超过 800ms', async () => {
  for (const input of ['{', {}, { hook_event_name: 'Stop', session_id: 's' }, undefined]) {
    const result = await runAdapter(input, '/missing'); assert.equal(result.code, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, ''); assert.ok(result.elapsed <= 800, `耗时 ${result.elapsed}ms`);
  }
});
test('真实 Hub：四事件鉴权发送和聚合轨迹', async t => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'petlink-adapter-')); let hub;
  t.after(async () => { if (hub) await hub.close(); await rm(dataDir, { recursive: true, force: true }); });
  hub = await startHub({ dataDir, port: 0 }); const changes = []; hub.onAggregateChange(x => changes.push(x.state));
  for (const hook of ['UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd']) {
    const result = await runAdapter({ hook_event_name: hook, session_id: 'demo', cwd: '/private/project' }, dataDir);
    assert.equal(result.code, 0); assert.equal(result.stdout + result.stderr, ''); assert.ok(result.elapsed <= 800);
  }
  assert.deepEqual(changes, ['working', 'waiting', 'done', 'idle']); assert.equal(hub.store.snapshot().sessions[0].state, 'offline'); assert.equal(hub.store.log.length, 4);
  await writeFile(path.join(dataDir, 'token'), 'f'.repeat(64));
  await runAdapter({ hook_event_name: 'Stop', session_id: 'other' }, dataDir); assert.equal(hub.store.log.at(-1).code, 'UNAUTHORIZED');
});
test('Hub 不响应时整体超时，仍静默 exit 0', async t => {
  const http = await import('node:http');
  const dataDir = await mkdtemp(path.join(tmpdir(), 'petlink-stall-'));
  const server = http.createServer(() => {});
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  await writeFile(path.join(dataDir, 'hub.json'), JSON.stringify({ port: server.address().port }));
  await writeFile(path.join(dataDir, 'token'), 'a'.repeat(64));
  const result = await runAdapter({ hook_event_name: 'Stop', session_id: 's' }, dataDir);
  assert.equal(result.code, 0); assert.equal(result.stdout + result.stderr, ''); assert.ok(result.elapsed <= 800, `耗时 ${result.elapsed}ms`);
});
