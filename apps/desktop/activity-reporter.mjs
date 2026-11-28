import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export const ACTIVITY_REPORT_URL = 'https://assist.onoe.cn/api/v1/activity/report';
export const DEFAULT_REPORT_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_REPORT_TIMEOUT_MS = 10_000;

const shanghaiFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

export function generateDeviceId() {
  return `petlink-${randomBytes(4).toString('hex')}`;
}

export function getShanghaiTimeParts(ts = Date.now()) {
  const parts = shanghaiFormatter.formatToParts(new Date(ts));
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute) % 60;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour,
    minute
  };
}

export function formatShanghaiHHmm(ts = Date.now()) {
  const { hour, minute } = getShanghaiTimeParts(ts);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function createActivityReporter({
  getConfig,
  getHourlyActivity,
  stateFilePath = null,
  endpoint = ACTIVITY_REPORT_URL,
  fetchFn = globalThis.fetch,
  now = Date.now,
  setTimer = setInterval,
  clearTimer = clearInterval,
  intervalMs = DEFAULT_REPORT_INTERVAL_MS,
  timeoutMs = DEFAULT_REPORT_TIMEOUT_MS,
  onStatusChange = () => {}
} = {}) {
  if (typeof getConfig !== 'function') {
    throw new Error('createActivityReporter requires getConfig()');
  }
  if (typeof getHourlyActivity !== 'function') {
    throw new Error('createActivityReporter requires getHourlyActivity(date)');
  }

  // Track active minute indices (0..59) per "YYYY-MM-DD#hour" in memory,
  // persisted lightly so restarts within the same day keep accurate active_minutes.
  const activeMinutesByBucket = new Map();
  const lastSentSignature = new Map();

  let lastSeenDate = getShanghaiTimeParts(now()).date;
  let lastSeenHour = getShanghaiTimeParts(now()).hour;
  let pendingPrevDate = null;
  let timer = null;
  let inFlight = null;
  let stopped = false;

  const status = {
    state: 'disabled',
    message: '未启用',
    lastReportAt: null,
    lastError: null
  };

  function bucketKey(date, hour) {
    return `${date}#${hour}`;
  }

  function readConfig() {
    const cfg = getConfig() || {};
    return {
      enabled: !!cfg.enabled,
      token: typeof cfg.token === 'string' ? cfg.token.trim() : '',
      deviceId: typeof cfg.deviceId === 'string' ? cfg.deviceId.trim() : ''
    };
  }

  function pruneOldMinutes(todayDate) {
    for (const key of activeMinutesByBucket.keys()) {
      const date = key.split('#')[0];
      if (date !== todayDate && date !== pendingPrevDate) {
        activeMinutesByBucket.delete(key);
      }
    }
  }

  function restoreState() {
    if (!stateFilePath) return;
    try {
      const raw = JSON.parse(readFileSync(stateFilePath, 'utf8'));
      const todayDate = getShanghaiTimeParts(now()).date;
      if (raw && raw.minutes && typeof raw.minutes === 'object') {
        for (const [key, mins] of Object.entries(raw.minutes)) {
          if (!key.startsWith(`${todayDate}#`) || !Array.isArray(mins)) continue;
          const set = new Set();
          for (const m of mins) {
            if (Number.isInteger(m) && m >= 0 && m <= 59) set.add(m);
          }
          if (set.size > 0) activeMinutesByBucket.set(key, set);
        }
      }
    } catch {
      // Missing or invalid state file is silently ignored.
    }
  }

  function saveState() {
    if (!stateFilePath) return;
    try {
      const todayDate = getShanghaiTimeParts(now()).date;
      pruneOldMinutes(todayDate);
      const minutes = {};
      for (const [key, set] of activeMinutesByBucket.entries()) {
        if (set.size > 0) minutes[key] = [...set].sort((a, b) => a - b);
      }
      mkdirSync(path.dirname(stateFilePath), { recursive: true });
      writeFileSync(stateFilePath, JSON.stringify({ minutes }), { mode: 0o600 });
    } catch {
      // Non-fatal; never disrupt the app.
    }
  }

  function updateStatus(nextState, nextMessage, extra = {}) {
    const changed =
      status.state !== nextState ||
      status.message !== nextMessage ||
      (extra.lastReportAt !== undefined && status.lastReportAt !== extra.lastReportAt);
    status.state = nextState;
    status.message = nextMessage;
    if (extra.lastReportAt !== undefined) status.lastReportAt = extra.lastReportAt;
    if (extra.lastError !== undefined) status.lastError = extra.lastError;
    if (changed) {
      try { onStatusChange(getStatus()); } catch {}
    }
  }

  function syncDisabledStatus() {
    const cfg = readConfig();
    if (!cfg.enabled) {
      updateStatus('disabled', '未启用', { lastError: null });
      return false;
    }
    if (!cfg.token) {
      updateStatus('idle', '请先填写专属密钥', { lastError: null });
      return false;
    }
    if (status.state === 'disabled' || (status.state === 'idle' && status.message === '请先填写专属密钥')) {
      updateStatus('idle', '已启用，等待上报', { lastError: null });
    }
    return true;
  }

  function buildDayItems(date, deviceId) {
    const rows = getHourlyActivity(date);
    if (!Array.isArray(rows)) return [];
    const items = [];
    for (const row of rows) {
      const hour = Number(row?.hour);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
      const keys = Math.max(0, Math.trunc(Number(row?.keystrokes ?? row?.keys) || 0));
      const clicks = Math.max(0, Math.trunc(Number(row?.clicks) || 0));
      if (keys <= 0 && clicks <= 0) continue;
      const recordedMins = activeMinutesByBucket.get(bucketKey(date, hour))?.size || 0;
      const activeMinutes = Math.max(1, Math.min(60, recordedMins));
      items.push({
        device_id: deviceId,
        date,
        hour,
        keys,
        clicks,
        active_minutes: activeMinutes
      });
    }
    return items;
  }

  function checkTimeRollover(ts = now()) {
    const parts = getShanghaiTimeParts(ts);
    const dateChanged = parts.date !== lastSeenDate;
    const hourChanged = dateChanged || parts.hour !== lastSeenHour;
    if (dateChanged) {
      pendingPrevDate = lastSeenDate;
    }
    lastSeenDate = parts.date;
    lastSeenHour = parts.hour;
    return { parts, dateChanged, hourChanged };
  }

  function recordActivity(ts = now()) {
    const { parts, hourChanged } = checkTimeRollover(ts);
    const key = bucketKey(parts.date, parts.hour);
    let set = activeMinutesByBucket.get(key);
    if (!set) {
      set = new Set();
      activeMinutesByBucket.set(key, set);
    }
    set.add(parts.minute);
    if (hourChanged) {
      void reportNow({ reason: 'rollover' });
    }
  }

  async function sendItems(items, cfg, reqTimeoutMs) {
    if (typeof fetchFn !== 'function') {
      return { ok: false, kind: 'error', reason: 'fetch_unavailable' };
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const abortTimer = controller
      ? setTimeout(() => controller.abort(), reqTimeoutMs)
      : null;
    abortTimer?.unref?.();
    try {
      const body = items.length === 1 ? items[0] : { items };
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.token}`
        },
        body: JSON.stringify(body),
        signal: controller?.signal
      });
      if (response.status === 401) {
        return { ok: false, kind: 'invalid_token', status: 401 };
      }
      if (!response.ok) {
        return { ok: false, kind: 'error', status: response.status };
      }
      let json = null;
      try { json = await response.json(); } catch {}
      if (json && json.ok === false) {
        return { ok: false, kind: 'error', status: response.status };
      }
      return { ok: true, status: response.status };
    } catch {
      return { ok: false, kind: 'error', reason: 'network_error' };
    } finally {
      if (abortTimer) clearTimeout(abortTimer);
    }
  }

  function itemSignature(item) {
    return `${item.keys}:${item.clicks}:${item.active_minutes}`;
  }

  async function reportNow({ force = false, allowEmpty = false, timeoutMs: overrideTimeoutMs } = {}) {
    if (inFlight) return inFlight;

    const task = (async () => {
      const ts = now();
      const { parts } = checkTimeRollover(ts);
      saveState();

      if (!syncDisabledStatus()) {
        return { ok: false, skipped: true };
      }
      const cfg = readConfig();
      if (!cfg.deviceId) {
        updateStatus('error', '上报失败', { lastError: 'missing_device_id' });
        return { ok: false, skipped: true };
      }

      const items = [];
      const prevDateSnapshot = pendingPrevDate;
      if (prevDateSnapshot && prevDateSnapshot !== parts.date) {
        items.push(...buildDayItems(prevDateSnapshot, cfg.deviceId));
      }
      items.push(...buildDayItems(parts.date, cfg.deviceId));

      if (!items.length) {
        if (!allowEmpty) {
          return { ok: true, skipped: true };
        }
        items.push({
          device_id: cfg.deviceId,
          date: parts.date,
          hour: parts.hour,
          keys: 0,
          clicks: 0,
          active_minutes: 0
        });
      } else if (!force) {
        const hasAnyChange = items.some(
          item => lastSentSignature.get(bucketKey(item.date, item.hour)) !== itemSignature(item)
        );
        if (!hasAnyChange) {
          return { ok: true, skipped: true };
        }
      }

      const result = await sendItems(items, cfg, overrideTimeoutMs || timeoutMs);
      if (result.ok) {
        for (const item of items) {
          lastSentSignature.set(bucketKey(item.date, item.hour), itemSignature(item));
        }
        if (prevDateSnapshot && pendingPrevDate === prevDateSnapshot) {
          pendingPrevDate = null;
          pruneOldMinutes(parts.date);
        }
        const reportedAt = now();
        updateStatus('ok', `已上报 ${formatShanghaiHHmm(reportedAt)}`, {
          lastReportAt: reportedAt,
          lastError: null
        });
        return { ok: true, count: items.length };
      }

      if (result.kind === 'invalid_token') {
        updateStatus('invalid_token', '密钥无效，请检查', { lastError: 'unauthorized' });
        return { ok: false, kind: 'invalid_token' };
      }

      updateStatus('error', '上报失败', { lastError: result.reason || `http_${result.status || 'err'}` });
      return { ok: false, kind: 'error' };
    })();

    const wrapped = task.finally(() => {
      if (inFlight === wrapped) inFlight = null;
    });
    inFlight = wrapped;
    return wrapped;
  }

  function start() {
    if (stopped || timer) return;
    syncDisabledStatus();
    timer = setTimer(() => {
      void reportNow({ reason: 'interval' });
    }, intervalMs);
    timer?.unref?.();
  }

  function notifyConfigChanged() {
    const ready = syncDisabledStatus();
    if (!ready) return;
    if (status.state === 'invalid_token' || status.state === 'error') {
      updateStatus('idle', '已启用，等待上报', { lastError: null });
    }
    const cfg = readConfig();
    const todayItems = buildDayItems(getShanghaiTimeParts(now()).date, cfg.deviceId || 'pending');
    if (todayItems.length > 0 || pendingPrevDate) {
      void reportNow({ force: true, reason: 'config' });
    }
  }

  async function flush({ timeoutMs: flushTimeoutMs = 3000 } = {}) {
    saveState();
    if (inFlight) {
      await inFlight.catch(() => {});
    }
    return reportNow({ force: false, timeoutMs: flushTimeoutMs });
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    saveState();
  }

  function getStatus() {
    const cfg = readConfig();
    const state = !cfg.enabled ? 'disabled' : status.state;
    const message = !cfg.enabled ? '未启用' : status.message;
    return {
      enabled: cfg.enabled,
      hasToken: !!cfg.token,
      deviceId: cfg.deviceId,
      state,
      message,
      lastReportAt: status.lastReportAt
    };
  }

  restoreState();
  syncDisabledStatus();

  return {
    recordActivity,
    reportNow,
    flush,
    start,
    stop,
    notifyConfigChanged,
    getStatus
  };
}
