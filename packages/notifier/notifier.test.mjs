import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { SessionStore } from '../hub/index.mjs';
import { createNotifier, isQuietHour } from './index.mjs';
const event = (state, session = 's') => ({ v: 1, source: 'generic', session, state, ts: 1000 });
test('通知跃迁过滤、同会话跨状态去重与取消订阅', async () => {
  let now = 1000; const store = new SessionStore({ now: () => now }); const notifications = [];
  const notifier = createNotifier({ store, now: () => now, quietHours: false, onNotify: e => notifications.push(e) });
  store.accept(event('working')); store.accept(event('done')); store.accept(event('error')); await notifier.flush(); assert.equal(notifications.length, 1);
  now += 60000; store.accept(event('waiting')); await notifier.flush(); assert.equal(notifications.length, 2);
  store.accept(event('waiting', 'other')); await notifier.flush(); assert.equal(notifications.length, 2);
  notifier.close(); store.accept(event('offline')); store.accept(event('done', 'other')); await notifier.flush(); assert.equal(notifications.length, 2);
});
test('安静时段仍记录跃迁，所有动作均抑制', async () => {
  const now = new Date(2026, 0, 1, 23).getTime(), store = new SessionStore({ now: () => now }); let calls = 0;
  const notifier = createNotifier({ store, now: () => now, onNotify: () => calls++, onSound: () => calls++, webhookUrl: 'http://unused', fetchImpl: () => { calls++; } });
  store.accept(event('waiting')); await notifier.flush(); assert.equal(calls, 0); assert.equal(notifier.history[0].quiet, true); notifier.close();
  assert.equal(isQuietHour(new Date(2026, 0, 1, 7).getTime()), false); assert.equal(isQuietHour(new Date(2026, 0, 1, 22, 30).getTime()), true);
});
test('Webhook 捕获体 kind 映射、自定义头与失败重试', async () => {
  const requests = []; let failures = 0; const logs = [];
  const server = http.createServer(async (req, res) => { const chunks = []; for await (const c of req) chunks.push(c); requests.push({ body: JSON.parse(Buffer.concat(chunks)), header: req.headers['x-test'] }); res.statusCode = failures-- > 0 ? 500 : 200; res.end(); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const store = new SessionStore(); const notifier = createNotifier({ store, quietHours: false, onNotify: () => {}, webhookUrl: `http://127.0.0.1:${server.address().port}`, webhookHeaders: { 'x-test': 'yes' }, logger: x => logs.push(x) });
  try {
    for (const [state, kind] of [['done', 'done'], ['error', 'remind'], ['waiting', 'confirm']]) { store.accept(event(state, state)); await notifier.flush(); assert.equal(requests.at(-1).body.kind, kind); assert.equal(requests.at(-1).header, 'yes'); assert.equal(requests.at(-1).body.v, 1); }
    store.accept(event('offline', 'waiting')); store.accept(event('offline', 'error')); store.accept(event('offline', 'done'));
    failures = 2; const before = requests.length; store.accept(event('done', 'failure')); await notifier.flush(); assert.equal(requests.length - before, 2); assert.equal(logs.length, 1);
  } finally { notifier.close(); await new Promise(resolve => server.close(resolve)); }
});
test('注入传输验证重试与统一事件白名单', async () => {
  const store = new SessionStore(); const requests = [], logs = [];
  const notifier = createNotifier({ store, quietHours: false, onNotify: () => {}, webhookUrl: 'https://example.invalid', logger: e => logs.push(e), fetchImpl: async (url, options) => { requests.push(JSON.parse(options.body)); throw new Error('模拟失败'); } });
  store.accept(event('error')); await notifier.flush(); assert.equal(requests.length, 2); assert.equal(logs.length, 1); assert.deepEqual(requests[0], { ...event('error'), kind: 'remind' }); notifier.close();
});
