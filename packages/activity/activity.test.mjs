import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createActivityStore, startActivityCollector, KEYCODE_TO_KEY_ID } from './index.mjs';

test('R-1 accuracy & privacy: 100 keystrokes and 50 clicks recorded with 0% error and no sequence/content fields', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'petlink-activity-'));
  const mirrorDir = await mkdtemp(path.join(tmpdir(), 'petlink-mirror-'));
  const mirrorFile = path.join(mirrorDir, 'activity.sqlite');
  let now = new Date('2026-11-23T14:20:00+08:00').getTime();
  const store = createActivityStore({
    dataDir: dir,
    mirrorPaths: [mirrorFile],
    now: () => now
  });

  try {
    const hook = new EventEmitter();
    hook.start = () => {};
    hook.stop = () => {};

    let floatingFeedbacks = 0;
    const stop = startActivityCollector({
      hook,
      store,
      onKeystroke: () => { floatingFeedbacks++; },
      setTimer: () => ({ unref() {} }),
      clearTimer: () => {}
    });

    // Type "SECRET" in reverse/non-alphabetical order as part of 100 keystrokes
    const sequence = [31, 18, 46, 19, 18, 20]; // S, E, C, R, E, T in UiohookKey
    for (let i = 0; i < 100; i++) {
      const keycode = sequence[i % sequence.length];
      const guardedEvent = new Proxy({ keycode }, {
        get(target, prop) {
          if (prop === 'keycode') return target.keycode;
          throw new Error(`Privacy violation: must not read ${String(prop)}`);
        }
      });
      hook.emit('keydown', guardedEvent);
    }

    // 50 mouse clicks
    for (let i = 0; i < 50; i++) {
      hook.emit('mousedown', new Proxy({}, {
        get() { throw new Error('Privacy violation: mouse click coordinates must not be read'); }
      }));
    }

    // 25 wheel events
    for (let i = 0; i < 25; i++) {
      hook.emit('wheel', { clicks: 2 });
    }

    stop();

    const snap = store.todaySnapshot();
    assert.equal(snap.totals.keystrokes, 100);
    assert.equal(snap.totals.clicks, 50);
    assert.equal(snap.totals.wheelSteps, 50);
    assert.equal(floatingFeedbacks, 100);
    assert.equal(snap.hourly[14].keystrokes, 100);
    assert.equal(snap.hourly[14].clicks, 50);
    assert.equal(snap.hourly[14].wheelSteps, 50);

    // Verify privacy schema & alphabetical key_id B-tree storage (no insertion order retained)
    assert.equal(snap.privacy.ok, true);
    assert.equal(snap.privacy.withoutRowId, true);
    assert.equal(snap.privacy.noContentColumns, true);
    assert.equal(snap.privacy.noSequenceColumns, true);

    const rawRows = store.db.prepare('SELECT key_id, count FROM daily_key_counts').all();
    assert.deepEqual(rawRows.map(r => r.key_id), ['C', 'E', 'R', 'S', 'T']);
    assert.throws(() => store.db.prepare('SELECT rowid FROM daily_key_counts').all(), /no such column: rowid/);
    assert.throws(() => store.db.prepare('SELECT rowid FROM hourly_activity').all(), /no such column: rowid/);

    // Verify mirror file exists alongside main db
    const mirrorStat = await stat(mirrorFile);
    assert.ok(mirrorStat.size > 0);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
    await rm(mirrorDir, { recursive: true, force: true });
  }
});

test('R-1 activity states: active -> idle -> away (5 minutes / 300s threshold)', () => {
  let now = new Date('2026-11-23T10:00:00+08:00').getTime();
  const store = createActivityStore({
    dbPath: ':memory:',
    now: () => now,
    activeWindowMs: 10000,
    awayThresholdSeconds: 300
  });

  try {
    store.recordKeystroke('A', 1, now);
    assert.equal(store.activityState().state, 'active');

    now += 15000; // 15s without typing/mouse
    assert.equal(store.activityState().state, 'idle');

    now += 284000; // 299s total
    assert.equal(store.activityState().state, 'idle');

    now += 1000; // 300s total (5 minutes)
    assert.equal(store.activityState().state, 'away');

    // Any keystroke wakes immediately back to active
    store.recordKeystroke(57, 1, now);
    assert.equal(store.activityState().state, 'active');
    assert.equal(Object.keys(KEYCODE_TO_KEY_ID).length >= 80, true);
  } finally {
    store.close();
  }
});

test('R-1 mouse/trackpad clicks and wheel still count without triggering active typing state', () => {
  let now = new Date('2026-11-23T11:00:00+08:00').getTime();
  const store = createActivityStore({
    dbPath: ':memory:',
    now: () => now,
    activeWindowMs: 10000,
    awayThresholdSeconds: 300
  });

  try {
    const hook = new EventEmitter();
    hook.start = () => {};
    hook.stop = () => {};

    let activityCalls = 0;
    let keystrokeCalls = 0;
    const stop = startActivityCollector({
      hook,
      store,
      onKeystroke: () => { keystrokeCalls++; },
      onActivity: () => { activityCalls++; },
      setTimer: () => ({ unref() {} }),
      clearTimer: () => {}
    });

    for (let i = 0; i < 30; i++) hook.emit('mousedown', {});
    for (let i = 0; i < 10; i++) hook.emit('wheel', { clicks: 2 });

    let snap = store.todaySnapshot();
    assert.equal(snap.totals.clicks, 30);
    assert.ok(snap.totals.wheelSteps > 0);
    assert.equal(activityCalls, 0);
    assert.equal(keystrokeCalls, 0);
    assert.equal(store.activityState().state, 'idle');

    now += 300000;
    hook.emit('mousedown', {});
    hook.emit('wheel', { clicks: 1 });
    assert.equal(store.activityState().state, 'away');

    hook.emit('keydown', { keycode: 30 });
    assert.equal(store.activityState().state, 'active');
    assert.equal(keystrokeCalls, 1);

    stop();
  } finally {
    store.close();
  }
});
