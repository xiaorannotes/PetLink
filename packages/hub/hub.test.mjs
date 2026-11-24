import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startHub, SessionStore, defaultDataDir, VERSION } from './index.mjs';
const event = (state = 'working', extra = {}) => ({ v: 1, source: 'claude-code', session: 'a', state, ts: 1000, ...extra });
async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'petlink-test-'));
  let hub;
  try { hub = await startHub({ dataDir, port: 0, ...options }); }
  catch (error) { await rm(dataDir, { recursive: true, force: true }); throw error; }
  t.after(async () => { await hub.close(); await rm(dataDir, { recursive: true, force: true }); });
  const request = (route, body, token = hub.token) => fetch(`http://127.0.0.1:${hub.port}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-petlink-token': token }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  return { hub, request };
}
test('真实 HTTP：回环、健康检查、鉴权和发现文件', async t => {
  const { hub, request } = await fixture(t);
  assert.equal(hub.server.address().address, '127.0.0.1');
  assert.deepEqual(await (await request('/healthz', undefined, '')).json(), { ok: true, version: VERSION });
  for (const route of ['/v1/state', '/v1/event']) assert.equal((await request(route, route.endsWith('event') ? event() : undefined, '')).status, 401);
  assert.equal((await request('/v1/state', undefined, 'wrong-token')).status, 401);
  assert.deepEqual(JSON.parse(await readFile(path.join(hub.dataDir, 'hub.json'))), { port: hub.port, pid: process.pid, version: VERSION });
  assert.match(await readFile(path.join(hub.dataDir, 'token'), 'utf8'), /^[a-f0-9]{64}$/);
  if (process.platform !== 'win32') assert.equal((await stat(path.join(hub.dataDir, 'token'))).mode & 0o777, 0o600);
});
test('真实 HTTP：双会话优先级、完成窗口与即时接管', async t => {
  let now = 1000; const { request, hub } = await fixture(t, { now: () => now });
  const changes = []; const off = hub.onAggregateChange(value => changes.push(value.state));
  for (const state of ['working', 'waiting', 'done']) assert.equal((await request('/v1/event', event(state))).status, 200);
  await request('/v1/event', event('working', { source: 'codex' }));
  let snapshot = await (await request('/v1/state')).json(); assert.equal(snapshot.aggregate.state, 'done'); assert.equal(snapshot.sessions.length, 2);
  now += 8000; assert.equal((await (await request('/v1/state')).json()).aggregate.state, 'working');
  await request('/v1/event', event('done')); await request('/v1/event', event('working'));
  assert.equal((await (await request('/v1/state')).json()).aggregate.state, 'working');
  assert.deepEqual(changes.slice(0, 4), ['working', 'waiting', 'done', 'working']); off();
});
test('真实 HTTP：可注入时间验证陈旧与心跳', async t => {
  let now = 1000; const { hub, request } = await fixture(t, { now: () => now });
  await request('/v1/event', event()); now += 90001;
  assert.equal((await (await request('/v1/state')).json()).aggregate.quiet, true);
  await request('/v1/event', event('error', { beat: true }));
  let snapshot = await (await request('/v1/state')).json(); assert.equal(snapshot.sessions[0].state, 'working'); assert.equal(snapshot.sessions[0].quiet, false);
  now += 600001; snapshot = await (await request('/v1/state')).json(); assert.equal(snapshot.aggregate.state, 'idle'); assert.equal(snapshot.sessions[0].suspectedEnded, true);
  await request('/v1/event', event('waiting')); now += 9999999; assert.equal(hub.store.snapshot().aggregate.state, 'waiting');
});
test('拒绝事件、JSON、大小限制与日志脱敏', async t => {
  const { hub, request } = await fixture(t);
  for (const [input, code] of [[event('working', { title: 'token 秘密' }), 'SENSITIVE_TITLE'], ['{', 'INVALID_JSON']]) {
    const res = await request('/v1/event', input); assert.equal(res.status, 400); assert.equal((await res.json()).code, code);
  }
  assert.equal((await request('/v1/event', 'x'.repeat(16385))).status, 413);
  assert.equal((await request('/missing')).status, 404);
  assert.equal(JSON.stringify(hub.store.log).includes('秘密'), false);
  assert.equal(hub.store.sessions.size, 0);
});
test('会话去抖、心跳不改标题与完成窗口、环形日志清空', () => {
  let now = 1000; const store = new SessionStore({ now: () => now }); let count = 0; store.onAggregateChange(() => count++);
  assert.equal(store.accept(event('idle', { beat: true })).code, 'UNKNOWN_SESSION');
  store.accept(event('done', { title: '完成' })); now += 100;
  assert.equal(store.accept(event('done', { title: '完成' })).merged, true);
  assert.equal([...store.sessions.values()][0].stateSince, 1000);
  store.accept(event('error', { beat: true, title: '其他' })); assert.equal(count, 1); assert.equal(store.snapshot().sessions[0].title, '完成');
  now = 9000; assert.equal(store.snapshot().aggregate.state, 'idle');
  for (let i = 0; i < 105; i++) store.accept({}); assert.equal(store.log.length, 100); assert.equal(store.log[0].code, 'INVALID_VERSION'); store.clearLog(); assert.equal(store.log.length, 0);
});
test('端口占用顺延与令牌重用、停止清理发现文件', async t => {
  const blocker = http.createServer(); await new Promise((resolve, reject) => { blocker.once('error', reject); blocker.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => blocker.close(resolve)));
  const { hub } = await fixture(t, { port: blocker.address().port });
  assert.ok(hub.port > blocker.address().port);
  const second = await startHub({ dataDir: hub.dataDir, port: 0 });
  assert.equal(second.token, hub.token); await second.close();
  await assert.rejects(readFile(path.join(hub.dataDir, 'hub.json')), { code: 'ENOENT' });
});
test('无效令牌文件明确拒绝启动', async t => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'petlink-token-')); t.after(() => rm(dataDir, { recursive: true, force: true }));
  await writeFile(path.join(dataDir, 'token'), 'bad'); await assert.rejects(startHub({ dataDir, port: 0 }), /令牌/);
});
test('平台数据目录规则', () => {
  assert.equal(defaultDataDir({ PETLINK_DATA_DIR: '/tmp/custom' }, 'linux', '/home/test'), path.resolve('/tmp/custom'));
  assert.equal(defaultDataDir({}, 'darwin', '/home/test'), path.join('/home/test','Library','Application Support','petlink'));
  assert.equal(defaultDataDir({ APPDATA: '/roaming' }, 'win32', '/home/test'), path.join('/roaming','petlink'));
  assert.equal(defaultDataDir({ XDG_DATA_HOME: '/data' }, 'linux', '/home/test'), path.join('/data','petlink'));
  assert.equal(defaultDataDir({}, 'linux', '/home/test'), path.join('/home/test','.local','share','petlink'));
});

test('陈旧降级后心跳维持空闲，新的工作事件恢复工作', () => {
  let now = 1000; const store = new SessionStore({ now: () => now });
  store.accept(event()); now += 600001; store.accept(event('working', { beat: true }));
  assert.equal(store.snapshot().sessions[0].state, 'idle');
  assert.equal(store.snapshot().sessions[0].suspectedEnded, true);
  store.accept(event()); assert.equal(store.snapshot().aggregate.state, 'working');
});
test('同名不同来源与心跳保留完成计时', () => {
  let now = 1000; const store = new SessionStore({ now: () => now });
  store.accept(event('done')); store.accept(event('working', { source: 'codex' }));
  now += 7999; store.accept(event('error', { beat: true })); assert.equal(store.snapshot().aggregate.state, 'done');
  now++; assert.equal(store.snapshot().aggregate.state, 'working'); assert.equal(store.sessions.size, 2);
});
