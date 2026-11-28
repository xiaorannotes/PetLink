import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createActivityStore } from '../../packages/activity/index.mjs';
import {
  createActivityReporter,
  generateDeviceId,
  getShanghaiTimeParts,
  ACTIVITY_REPORT_URL
} from './activity-reporter.mjs';

test('generateDeviceId produces petlink- plus 8 hex chars', () => {
  const id1 = generateDeviceId();
  const id2 = generateDeviceId();
  assert.match(id1, /^petlink-[0-9a-f]{8}$/);
  assert.match(id2, /^petlink-[0-9a-f]{8}$/);
  assert.notEqual(id1, id2);
});

test('getShanghaiTimeParts always uses Asia/Shanghai date and 0-23 hour', () => {
  // 2026-11-28T16:35:00Z is 2026-11-29 00:35 Asia/Shanghai
  const parts = getShanghaiTimeParts(Date.parse('2026-11-28T16:35:00Z'));
  assert.deepEqual(parts, { date: '2026-11-29', hour: 0, minute: 35 });

  // 2026-11-28T06:12:00Z is 2026-11-28 14:12 Asia/Shanghai
  const afternoon = getShanghaiTimeParts(Date.parse('2026-11-28T06:12:00Z'));
  assert.deepEqual(afternoon, { date: '2026-11-28', hour: 14, minute: 12 });
});

test('reads hourly totals from SQLite activityStore and reports all non-empty hours of today', async () => {
  let clock = Date.parse('2026-11-28T01:50:00Z'); // 09:50 Asia/Shanghai
  const store = createActivityStore({ dbPath: ':memory:', now: () => clock });
  try {
    // Earlier hours already in SQLite (e.g. before reporter started): hour 8 and hour 9
    store.recordBatch({ keystrokes: 200, clicks: 150, hour: 8, ts: clock });
    store.recordBatch({ keystrokes: 438, clicks: 312, hour: 9, ts: clock });

    const requests = [];
    const cfg = { enabled: true, token: 'secret-token-123', deviceId: 'petlink-abcd1234' };
    const reporter = createActivityReporter({
      getConfig: () => cfg,
      getHourlyActivity: date => store.todaySnapshot({ day: date }).hourly,
      now: () => clock,
      fetchFn: async (url, init) => {
        requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
    });

    // Record activity in two distinct minutes of hour 9
    reporter.recordActivity(Date.parse('2026-11-28T01:50:00Z')); // 09:50
    reporter.recordActivity(Date.parse('2026-11-28T01:51:00Z')); // 09:51

    const res = await reporter.reportNow({ force: true, allowEmpty: true });
    assert.equal(res.ok, true);
    assert.equal(res.count, 2);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, ACTIVITY_REPORT_URL);
    assert.equal(requests[0].headers.Authorization, 'Bearer secret-token-123');
    assert.deepEqual(requests[0].body, {
      items: [
        {
          device_id: 'petlink-abcd1234',
          date: '2026-11-28',
          hour: 8,
          keys: 200,
          clicks: 150,
          active_minutes: 1
        },
        {
          device_id: 'petlink-abcd1234',
          date: '2026-11-28',
          hour: 9,
          keys: 438,
          clicks: 312,
          active_minutes: 2
        }
      ]
    });
    assert.equal(reporter.getStatus().state, 'ok');
    assert.equal(reporter.getStatus().message, '已上报 09:50');

    // No SQLite or active_minutes change -> periodic reportNow skips redundant call
    const skipped = await reporter.reportNow();
    assert.equal(skipped.skipped, true);
    assert.equal(requests.length, 1);

    // Sum matches local SQLite totals (638 keys, 462 clicks)
    const totalKeys = requests[0].body.items.reduce((s, x) => s + x.keys, 0);
    const totalClicks = requests[0].body.items.reduce((s, x) => s + x.clicks, 0);
    assert.equal(totalKeys, 638);
    assert.equal(totalClicks, 462);
  } finally {
    store.close();
  }
});

test('rolls over across midnight and flushes previous day plus new day', async () => {
  let clock = Date.parse('2026-11-28T15:58:00Z'); // 23:58 Asia/Shanghai
  const byDay = {
    '2026-11-28': [{ hour: 23, keystrokes: 50, clicks: 12 }],
    '2026-11-29': [{ hour: 0, keystrokes: 8, clicks: 3 }]
  };
  const requests = [];
  const cfg = { enabled: true, token: 'tok-midnight', deviceId: 'petlink-11223344' };
  const reporter = createActivityReporter({
    getConfig: () => cfg,
    getHourlyActivity: date => byDay[date] || [],
    now: () => clock,
    fetchFn: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
  });

  reporter.recordActivity(clock);
  await reporter.reportNow();
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    device_id: 'petlink-11223344',
    date: '2026-11-28',
    hour: 23,
    keys: 50,
    clicks: 12,
    active_minutes: 1
  });

  // Update 23:59 before midnight, then tick at 00:02 next day
  byDay['2026-11-28'][0].keystrokes = 65;
  clock = Date.parse('2026-11-28T16:02:00Z'); // 2026-11-29 00:02 Asia/Shanghai
  await reporter.reportNow();
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], {
    items: [
      {
        device_id: 'petlink-11223344',
        date: '2026-11-28',
        hour: 23,
        keys: 65,
        clicks: 12,
        active_minutes: 1
      },
      {
        device_id: 'petlink-11223344',
        date: '2026-11-29',
        hour: 0,
        keys: 8,
        clicks: 3,
        active_minutes: 1
      }
    ]
  });
});

test('disabled switch sends nothing; 401 shows invalid token status; network errors retry silently', async () => {
  let clock = Date.parse('2026-11-28T06:10:00Z'); // 14:10 Asia/Shanghai
  let mode = '401';
  let calls = 0;
  const cfg = { enabled: false, token: 'bad-token', deviceId: 'petlink-99887766' };
  const reporter = createActivityReporter({
    getConfig: () => cfg,
    getHourlyActivity: () => [{ hour: 14, keystrokes: 5, clicks: 2 }],
    now: () => clock,
    fetchFn: async () => {
      calls++;
      if (mode === '401') return { ok: false, status: 401, json: async () => ({ ok: false }) };
      if (mode === 'net') throw new Error('ECONNRESET');
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
  });

  await reporter.reportNow();
  assert.equal(calls, 0);
  assert.equal(reporter.getStatus().state, 'disabled');
  assert.equal(reporter.getStatus().message, '未启用');

  cfg.enabled = true;
  await reporter.reportNow();
  assert.equal(calls, 1);
  assert.equal(reporter.getStatus().state, 'invalid_token');
  assert.equal(reporter.getStatus().message, '密钥无效，请检查');

  mode = 'net';
  await reporter.reportNow();
  assert.equal(calls, 2);
  assert.equal(reporter.getStatus().state, 'error');
  assert.equal(reporter.getStatus().message, '上报失败');

  mode = 'ok';
  clock += 5 * 60_000;
  await reporter.reportNow();
  assert.equal(calls, 3);
  assert.equal(reporter.getStatus().state, 'ok');
  assert.equal(reporter.getStatus().message, '已上报 14:15');
});

test('persists and restores active_minutes across restart within the same day', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'petlink-report-test-'));
  const stateFilePath = path.join(dir, 'activity-report-state.json');
  try {
    const clock = Date.parse('2026-11-28T06:20:00Z'); // 14:20 Asia/Shanghai
    const cfg = { enabled: true, token: 'tok', deviceId: 'petlink-aaaabbbb' };
    const sent = [];
    const fetchFn = async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    const getHourlyActivity = () => [{ hour: 14, keystrokes: 42, clicks: 10 }];

    const r1 = createActivityReporter({ getConfig: () => cfg, getHourlyActivity, stateFilePath, now: () => clock, fetchFn });
    r1.recordActivity(clock); // 14:20
    await r1.flush();
    r1.stop();

    const r2 = createActivityReporter({
      getConfig: () => cfg,
      getHourlyActivity,
      stateFilePath,
      now: () => clock + 5 * 60_000, // 14:25
      fetchFn
    });
    r2.recordActivity(clock + 5 * 60_000); // 14:25
    await r2.flush();
    r2.stop();

    assert.equal(sent.length, 2);
    assert.deepEqual(sent[1], {
      device_id: 'petlink-aaaabbbb',
      date: '2026-11-28',
      hour: 14,
      keys: 42,
      clicks: 10,
      active_minutes: 2
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('manual reportNow with allowEmpty sends current hour snapshot when today has zero activity', async () => {
  const clock = Date.parse('2026-11-28T06:30:00Z'); // 14:30 Asia/Shanghai
  const sent = [];
  const cfg = { enabled: true, token: 'tok-manual', deviceId: 'petlink-00112233' };
  const reporter = createActivityReporter({
    getConfig: () => cfg,
    getHourlyActivity: () => [],
    now: () => clock,
    fetchFn: async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
  });

  const res = await reporter.reportNow({ force: true, allowEmpty: true });
  assert.equal(res.ok, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    device_id: 'petlink-00112233',
    date: '2026-11-28',
    hour: 14,
    keys: 0,
    clicks: 0,
    active_minutes: 0
  });
  assert.equal(reporter.getStatus().message, '已上报 14:30');
});
