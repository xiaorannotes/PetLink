import { validateEvent } from '../protocol/index.mjs';
export const KIND = Object.freeze({ done: 'done', waiting: 'confirm', error: 'remind' });
export const log_sink = notification => console.log(`PetLink 通知：${notification.source} / ${notification.session}：${{ done: '完成', waiting: '等待确认', error: '出错' }[notification.state]}`);
export function isQuietHour(timestamp, quietHours = { start: '22:30', end: '07:00' }) {
  if (quietHours === false) return false;
  const minute = value => { if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(value)) throw new Error('安静时段格式应为 HH:mm'); const [h, m] = value.split(':').map(Number); return h * 60 + m; };
  const start = minute(quietHours.start), end = minute(quietHours.end);
  const date = new Date(timestamp), current = date.getHours() * 60 + date.getMinutes();
  return start > end ? current >= start || current < end : current >= start && current < end;
}
export function createNotifier({ hub, store = hub?.store ?? hub, now = Date.now, quietHours = { start: '22:30', end: '07:00' }, onNotify = log_sink, onSound, webhookUrl, webhookHeaders = {}, logger = console.error, fetchImpl = fetch } = {}) {
  if (!store || typeof (hub ?? store).onAggregateChange !== 'function') throw new Error('通知器需要 Hub 或会话存储');
  isQuietHour(now(), quietHours);
  const seen = new Map(), pending = new Set(), history = [];
  let previous = store.aggregate().state;
  async function deliver(event) {
    for (const callback of [onNotify, onSound]) if (callback) { try { await callback(event); } catch { logger('通知回调失败'); } }
    if (!webhookUrl) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetchImpl(webhookUrl, { method: 'POST', headers: { ...webhookHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ ...event, kind: KIND[event.state] }), signal: AbortSignal.timeout(3000), redirect: 'error' });
        await response.body?.cancel();
        if (!response.ok) throw new Error('Webhook 拒绝请求');
        return;
      } catch { if (attempt === 1) logger('Webhook 发送失败，重试一次后放弃'); }
    }
  }
  const off = (hub ?? store).onAggregateChange(aggregate => {
    const changed = previous !== aggregate.state; previous = aggregate.state;
    if (!changed || !KIND[aggregate.state]) return;
    const rows = [...store.sessions.values()].filter(row => row.state === aggregate.state).sort((a, b) => b.stateSince - a.stateSince);
    const row = rows[0]; if (!row) return;
    const timestamp = now(), key = JSON.stringify([row.source, row.session]);
    const event = { v: 1, source: row.source, session: row.session, state: aggregate.state, ts: row.ts, ...(row.project === undefined ? {} : { project: row.project }), ...(row.title === undefined ? {} : { title: row.title }) };
    if (!validateEvent(event).ok) return;
    const duplicate = seen.has(key) && timestamp - seen.get(key) < 60000;
    const quiet = isQuietHour(timestamp, quietHours);
    history.push({ event, quiet, duplicate, at: timestamp }); if (history.length > 100) history.shift();
    if (duplicate) return;
    seen.set(key, timestamp);
    if (quiet) return;
    const task = deliver(event).catch(() => {}).finally(() => pending.delete(task)); pending.add(task);
  });
  return { history, async flush() { while (pending.size) await Promise.all([...pending]); }, close() { off(); } };
}
