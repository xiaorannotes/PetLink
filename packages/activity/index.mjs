import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';

// Physical keycode (UiohookKey) -> standardized layout key_id.
// Strictly physical key location; never inspects Shift/Caps/IME or character text.
export const KEYCODE_TO_KEY_ID = Object.freeze({
  1: 'ESC',
  59: 'F1', 60: 'F2', 61: 'F3', 62: 'F4', 63: 'F5', 64: 'F6',
  65: 'F7', 66: 'F8', 67: 'F9', 68: 'F10', 87: 'F11', 88: 'F12',
  41: 'BACKQUOTE',
  2: '1', 3: '2', 4: '3', 5: '4', 6: '5', 7: '6', 8: '7', 9: '8', 10: '9', 11: '0',
  12: 'MINUS', 13: 'EQUAL', 14: 'BACKSPACE',
  15: 'TAB',
  16: 'Q', 17: 'W', 18: 'E', 19: 'R', 20: 'T', 21: 'Y', 22: 'U', 23: 'I', 24: 'O', 25: 'P',
  26: 'BRACKETLEFT', 27: 'BRACKETRIGHT', 43: 'BACKSLASH',
  58: 'CAPSLOCK',
  30: 'A', 31: 'S', 32: 'D', 33: 'F', 34: 'G', 35: 'H', 36: 'J', 37: 'K', 38: 'L',
  39: 'SEMICOLON', 40: 'QUOTE', 28: 'ENTER',
  42: 'LSHIFT',
  44: 'Z', 45: 'X', 46: 'C', 47: 'V', 48: 'B', 49: 'N', 50: 'M',
  51: 'COMMA', 52: 'PERIOD', 53: 'SLASH', 54: 'RSHIFT',
  29: 'LCTRL', 3675: 'LMETA', 56: 'LALT', 57: 'SPACE',
  3640: 'RALT', 3676: 'RMETA', 3613: 'RCTRL',
  3639: 'PRTSC', 70: 'SCRLK', 3653: 'PAUSE',
  3666: 'INS', 3655: 'HOME', 3657: 'PGUP',
  3667: 'DEL', 3663: 'END', 3665: 'PGDN',
  57416: 'UP', 57419: 'LEFT', 57424: 'DOWN', 57421: 'RIGHT',
  69: 'NUMLOCK', 3637: 'NUM_DIV', 55: 'NUM_MUL', 74: 'NUM_SUB',
  71: 'NUM_7', 72: 'NUM_8', 73: 'NUM_9', 78: 'NUM_ADD',
  75: 'NUM_4', 76: 'NUM_5', 77: 'NUM_6',
  79: 'NUM_1', 80: 'NUM_2', 81: 'NUM_3', 3612: 'NUM_ENTER',
  82: 'NUM_0', 83: 'NUM_DEC'
});

export const DOM_CODE_TO_KEY_ID = Object.freeze({
  Escape: 'ESC',
  F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
  F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12',
  Backquote: 'BACKQUOTE',
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5',
  Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
  Minus: 'MINUS', Equal: 'EQUAL', Backspace: 'BACKSPACE',
  Tab: 'TAB',
  KeyQ: 'Q', KeyW: 'W', KeyE: 'E', KeyR: 'R', KeyT: 'T',
  KeyY: 'Y', KeyU: 'U', KeyI: 'I', KeyO: 'O', KeyP: 'P',
  BracketLeft: 'BRACKETLEFT', BracketRight: 'BRACKETRIGHT', Backslash: 'BACKSLASH',
  CapsLock: 'CAPSLOCK',
  KeyA: 'A', KeyS: 'S', KeyD: 'D', KeyF: 'F', KeyG: 'G',
  KeyH: 'H', KeyJ: 'J', KeyK: 'K', KeyL: 'L',
  Semicolon: 'SEMICOLON', Quote: 'QUOTE', Enter: 'ENTER',
  ShiftLeft: 'LSHIFT',
  KeyZ: 'Z', KeyX: 'X', KeyC: 'C', KeyV: 'V', KeyB: 'B', KeyN: 'N', KeyM: 'M',
  Comma: 'COMMA', Period: 'PERIOD', Slash: 'SLASH', ShiftRight: 'RSHIFT',
  ControlLeft: 'LCTRL', MetaLeft: 'LMETA', AltLeft: 'LALT', Space: 'SPACE',
  AltRight: 'RALT', MetaRight: 'RMETA', ContextMenu: 'MENU', ControlRight: 'RCTRL',
  PrintScreen: 'PRTSC', ScrollLock: 'SCRLK', Pause: 'PAUSE',
  Insert: 'INS', Home: 'HOME', PageUp: 'PGUP',
  Delete: 'DEL', End: 'END', PageDown: 'PGDN',
  ArrowUp: 'UP', ArrowLeft: 'LEFT', ArrowDown: 'DOWN', ArrowRight: 'RIGHT',
  NumLock: 'NUMLOCK', NumpadDivide: 'NUM_DIV', NumpadMultiply: 'NUM_MUL', NumpadSubtract: 'NUM_SUB',
  Numpad7: 'NUM_7', Numpad8: 'NUM_8', Numpad9: 'NUM_9', NumpadAdd: 'NUM_ADD',
  Numpad4: 'NUM_4', Numpad5: 'NUM_5', Numpad6: 'NUM_6',
  Numpad1: 'NUM_1', Numpad2: 'NUM_2', Numpad3: 'NUM_3', NumpadEnter: 'NUM_ENTER',
  Numpad0: 'NUM_0', NumpadDecimal: 'NUM_DEC'
});

export const VALID_KEY_IDS = new Set([
  ...Object.values(KEYCODE_TO_KEY_ID),
  ...Object.values(DOM_CODE_TO_KEY_ID),
  'MENU'
]);

export function resolveKeyId(input) {
  if (typeof input === 'number') return KEYCODE_TO_KEY_ID[input] || null;
  if (typeof input === 'string') {
    const upper = input.toUpperCase();
    if (VALID_KEY_IDS.has(upper)) return upper;
    if (DOM_CODE_TO_KEY_ID[input]) return DOM_CODE_TO_KEY_ID[input];
  }
  return null;
}

export function localDayBucket(ts) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { day: `${yyyy}-${mm}-${dd}`, hour: d.getHours() };
}

const ALLOWED_TABLES = Object.freeze({
  hourly_activity: ['day', 'hour', 'keystrokes', 'clicks', 'wheel_steps'],
  daily_key_counts: ['day', 'key_id', 'count'],
  daily_ai_stats: ['day', 'working_seconds', 'done_count']
});

export function createActivityStore({
  dataDir,
  dbPath,
  mirrorPaths = [],
  now = Date.now,
  activeWindowMs = 10000,
  awayThresholdSeconds = 300
} = {}) {
  const resolvedPath = dbPath || path.join(dataDir, 'activity.sqlite');
  if (resolvedPath !== ':memory:') {
    mkdirSync(path.dirname(resolvedPath), { recursive: true, mode: 0o700 });
  }
  const db = new DatabaseSync(resolvedPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS hourly_activity (
      day TEXT NOT NULL,
      hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
      keystrokes INTEGER NOT NULL DEFAULT 0 CHECK (keystrokes >= 0),
      clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
      wheel_steps INTEGER NOT NULL DEFAULT 0 CHECK (wheel_steps >= 0),
      PRIMARY KEY (day, hour)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS daily_key_counts (
      day TEXT NOT NULL,
      key_id TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
      PRIMARY KEY (day, key_id)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS daily_ai_stats (
      day TEXT NOT NULL PRIMARY KEY,
      working_seconds INTEGER NOT NULL DEFAULT 0 CHECK (working_seconds >= 0),
      done_count INTEGER NOT NULL DEFAULT 0 CHECK (done_count >= 0)
    ) WITHOUT ROWID;
  `);

  const upsertHourlyStmt = db.prepare(`
    INSERT INTO hourly_activity (day, hour, keystrokes, clicks, wheel_steps)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (day, hour) DO UPDATE SET
      keystrokes = hourly_activity.keystrokes + excluded.keystrokes,
      clicks = hourly_activity.clicks + excluded.clicks,
      wheel_steps = hourly_activity.wheel_steps + excluded.wheel_steps
  `);

  const upsertKeyStmt = db.prepare(`
    INSERT INTO daily_key_counts (day, key_id, count)
    VALUES (?, ?, ?)
    ON CONFLICT (day, key_id) DO UPDATE SET
      count = daily_key_counts.count + excluded.count
  `);

  const upsertAiStmt = db.prepare(`
    INSERT INTO daily_ai_stats (day, working_seconds, done_count)
    VALUES (?, ?, ?)
    ON CONFLICT (day) DO UPDATE SET
      working_seconds = daily_ai_stats.working_seconds + excluded.working_seconds,
      done_count = daily_ai_stats.done_count + excluded.done_count
  `);

  const selectHourlyStmt = db.prepare(`
    SELECT hour, keystrokes, clicks, wheel_steps
    FROM hourly_activity
    WHERE day = ?
    ORDER BY hour ASC
  `);

  const selectKeysStmt = db.prepare(`
    SELECT key_id, count
    FROM daily_key_counts
    WHERE day = ?
    ORDER BY key_id ASC
  `);

  const selectAiStmt = db.prepare(`
    SELECT working_seconds, done_count
    FROM daily_ai_stats
    WHERE day = ?
  `);

  let lastActivityAt = now();
  let lastTypingAt = null;
  let simulatedIdleSeconds = null;

  function syncMirrors() {
    if (resolvedPath === ':memory:' || !mirrorPaths.length) return;
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
    for (const target of mirrorPaths) {
      if (!target || path.resolve(target) === path.resolve(resolvedPath)) continue;
      try {
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(resolvedPath, target);
      } catch {}
    }
  }
  syncMirrors();

  function verifyPrivacySchema() {
    const tables = db.prepare(`
      SELECT name, sql FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `).all();
    if (tables.length !== Object.keys(ALLOWED_TABLES).length) {
      return { ok: false, reason: 'unexpected_table_count' };
    }
    const schemaSummary = {};
    for (const t of tables) {
      const expectedCols = ALLOWED_TABLES[t.name];
      if (!expectedCols) return { ok: false, reason: `unexpected_table:${t.name}` };
      if (!/WITHOUT\s+ROWID/i.test(t.sql || '')) {
        return { ok: false, reason: `table_missing_without_rowid:${t.name}` };
      }
      const cols = db.prepare(`PRAGMA table_info(${t.name})`).all().map(c => c.name);
      if (JSON.stringify(cols) !== JSON.stringify(expectedCols)) {
        return { ok: false, reason: `unexpected_columns:${t.name}:${cols.join(',')}` };
      }
      schemaSummary[t.name] = { columns: cols, withoutRowId: true };
    }
    return {
      ok: true,
      withoutRowId: true,
      noContentColumns: true,
      noSequenceColumns: true,
      tables: schemaSummary
    };
  }

  function recordKeystroke(keyInput, count = 1, ts = now()) {
    const n = Math.max(0, Math.trunc(Number(count) || 0));
    if (n <= 0) return;
    const { day, hour } = localDayBucket(ts);
    upsertHourlyStmt.run(day, hour, n, 0, 0);
    const keyId = resolveKeyId(keyInput);
    if (keyId) {
      upsertKeyStmt.run(day, keyId, n);
    }
    lastActivityAt = ts;
    lastTypingAt = ts;
    simulatedIdleSeconds = null;
  }

  function recordClick(count = 1, ts = now()) {
    const n = Math.max(0, Math.trunc(Number(count) || 0));
    if (n <= 0) return;
    const { day, hour } = localDayBucket(ts);
    upsertHourlyStmt.run(day, hour, 0, n, 0);
  }

  function recordWheel(steps = 1, ts = now()) {
    const n = Math.max(0, Math.trunc(Number(steps) || 0));
    if (n <= 0) return;
    const { day, hour } = localDayBucket(ts);
    upsertHourlyStmt.run(day, hour, 0, 0, n);
  }

  function recordTouch() {
    // Mouse/trackpad touches do not trigger typing or reset keyboard idle time.
  }

  function recordBatch({ keystrokes = 0, clicks = 0, wheelSteps = 0, keys = {}, hour, ts = now() } = {}) {
    const bucket = localDayBucket(ts);
    const targetHour = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : bucket.hour;
    const k = Math.max(0, Math.trunc(Number(keystrokes) || 0));
    const c = Math.max(0, Math.trunc(Number(clicks) || 0));
    const w = Math.max(0, Math.trunc(Number(wheelSteps) || 0));
    if (k > 0 || c > 0 || w > 0) {
      upsertHourlyStmt.run(bucket.day, targetHour, k, c, w);
      if (k > 0) {
        lastActivityAt = ts;
        lastTypingAt = ts;
        simulatedIdleSeconds = null;
      }
    }
    if (keys && typeof keys === 'object') {
      for (const [rawKey, rawCount] of Object.entries(keys)) {
        const keyId = resolveKeyId(rawKey);
        const cnt = Math.max(0, Math.trunc(Number(rawCount) || 0));
        if (keyId && cnt > 0) {
          upsertKeyStmt.run(bucket.day, keyId, cnt);
        }
      }
    }
    syncMirrors();
  }

  function recordAiWorkSeconds(seconds = 1, ts = now()) {
    const s = Math.max(0, Math.trunc(Number(seconds) || 0));
    if (s <= 0) return;
    const { day } = localDayBucket(ts);
    upsertAiStmt.run(day, s, 0);
  }

  function recordAiDone(count = 1, ts = now()) {
    const c = Math.max(0, Math.trunc(Number(count) || 0));
    if (c <= 0) return;
    const { day } = localDayBucket(ts);
    upsertAiStmt.run(day, 0, c);
  }

  function setSimulatedIdleSeconds(seconds) {
    simulatedIdleSeconds = Number.isFinite(seconds) && seconds >= 0 ? Number(seconds) : null;
  }

  function activityState({ systemIdleSeconds: _ignored = null } = {}) {
    const currentTs = now();
    const idleAnchor = lastTypingAt === null ? lastActivityAt : lastTypingAt;
    const keyboardIdleSeconds = simulatedIdleSeconds !== null
      ? simulatedIdleSeconds
      : Math.max(0, (currentTs - idleAnchor) / 1000);
    const typingIdleSeconds = simulatedIdleSeconds !== null
      ? simulatedIdleSeconds
      : lastTypingAt === null
        ? Infinity
        : Math.max(0, (currentTs - lastTypingAt) / 1000);

    let state = 'idle';
    if (keyboardIdleSeconds >= awayThresholdSeconds) {
      state = 'away';
    } else if (typingIdleSeconds < activeWindowMs / 1000) {
      state = 'active';
    }
    return {
      state,
      idleSeconds: Math.round(keyboardIdleSeconds * 10) / 10,
      typingIdleSeconds: Number.isFinite(typingIdleSeconds) ? Math.round(typingIdleSeconds * 10) / 10 : null,
      awayThresholdSeconds
    };
  }

  function todaySnapshot({ day, systemIdleSeconds = null } = {}) {
    const targetDay = day || localDayBucket(now()).day;
    const hoursMap = new Map();
    for (const row of selectHourlyStmt.all(targetDay)) {
      hoursMap.set(Number(row.hour), {
        hour: Number(row.hour),
        keystrokes: Number(row.keystrokes),
        clicks: Number(row.clicks),
        wheelSteps: Number(row.wheel_steps)
      });
    }
    const hourly = [];
    let totalKeystrokes = 0, totalClicks = 0, totalWheelSteps = 0;
    for (let h = 0; h < 24; h++) {
      const item = hoursMap.get(h) || { hour: h, keystrokes: 0, clicks: 0, wheelSteps: 0 };
      totalKeystrokes += item.keystrokes;
      totalClicks += item.clicks;
      totalWheelSteps += item.wheelSteps;
      hourly.push(item);
    }
    const keyCounts = {};
    for (const row of selectKeysStmt.all(targetDay)) {
      keyCounts[row.key_id] = Number(row.count);
    }
    const aiRow = selectAiStmt.get(targetDay);
    const aiStats = {
      workingSeconds: Number(aiRow?.working_seconds || 0),
      doneCount: Number(aiRow?.done_count || 0)
    };
    const activity = activityState({ systemIdleSeconds });
    return {
      day: targetDay,
      dbPath: resolvedPath,
      totals: {
        keystrokes: totalKeystrokes,
        clicks: totalClicks,
        wheelSteps: totalWheelSteps
      },
      hourly,
      keyCounts,
      aiStats,
      activity,
      privacy: verifyPrivacySchema()
    };
  }

  function close() {
    syncMirrors();
    try { db.close(); } catch {}
  }

  return {
    db,
    dbPath: resolvedPath,
    recordKeystroke,
    recordClick,
    recordWheel,
    recordTouch,
    recordBatch,
    recordAiWorkSeconds,
    recordAiDone,
    setSimulatedIdleSeconds,
    activityState,
    todaySnapshot,
    verifyPrivacySchema,
    syncMirrors,
    close
  };
}

export function startActivityCollector({
  hook,
  store,
  onKeystroke = () => {},
  onClick = () => {},
  onActivity = () => {},
  setTimer = setInterval,
  clearTimer = clearInterval
} = {}) {
  let stopped = false;

  const handleKeydown = event => {
    let keycode = null;
    try { keycode = event?.keycode; } catch {}
    store.recordKeystroke(keycode);
    onKeystroke();
    onActivity('keydown');
  };

  const handleMousedown = () => {
    store.recordClick(1);
    onClick();
  };

  const handleWheel = event => {
    let steps = 1;
    try {
      const raw = Math.abs(Math.round(Number(event?.clicks || event?.rotation || 1)));
      if (Number.isFinite(raw) && raw > 0) steps = Math.min(raw, 20);
    } catch {}
    store.recordWheel(steps);
  };

  hook.on('keydown', handleKeydown);
  hook.on('mousedown', handleMousedown);
  hook.on('wheel', handleWheel);

  try {
    hook.start();
  } catch (error) {
    hook.removeListener('keydown', handleKeydown);
    hook.removeListener('mousedown', handleMousedown);
    hook.removeListener('wheel', handleWheel);
    throw error;
  }

  const mirrorTimer = setTimer(() => {
    store.syncMirrors?.();
  }, 5000);
  mirrorTimer.unref?.();

  return () => {
    if (stopped) return;
    stopped = true;
    clearTimer(mirrorTimer);
    hook.removeListener('keydown', handleKeydown);
    hook.removeListener('mousedown', handleMousedown);
    hook.removeListener('wheel', handleWheel);
    try { hook.stop(); } catch {}
    store.syncMirrors?.();
  };
}
