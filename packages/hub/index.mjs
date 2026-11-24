import http from 'node:http';
import { EventEmitter } from 'node:events';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, chmod, rename, unlink } from 'node:fs/promises';
import { defaultDataDir, readToken } from '../shared/index.mjs';
export { defaultDataDir } from '../shared/index.mjs';
import path from 'node:path';
import { validateEvent, effectiveSession, aggregateSessions, DEFAULT_RULES } from '../protocol/index.mjs';
export const VERSION = '0.1.0';
export class SessionStore {
  constructor({ now = Date.now, rules = {} } = {}) {
    this.now = now; this.rules = { ...DEFAULT_RULES, ...rules }; this.sessions = new Map(); this.log = []; this.events = new EventEmitter(); this.typing={day:null,today:0,lastSeen:null,lastActive:null}; this.previous = this.aggregate();
  }
  aggregate() { const result=aggregateSessions(this.sessions,this.now(),this.rules);if(result.state==='idle'&&this.typing.lastActive!==null&&this.now()-this.typing.lastActive<10000)return {state:'working',quiet:false};return result; }
  typingSnapshot(){const day=new Date(this.now()).toLocaleDateString('en-CA');if(this.typing.day!==day){this.typing.day=day;this.typing.today=0;}return {today:this.typing.today,connected:this.typing.lastSeen!==null&&this.now()-this.typing.lastSeen<15000};}
  record(entry) { this.log.push({ at: this.now(), ...entry }); if (this.log.length > 100) this.log.shift(); }
  clearLog() { this.log.length = 0; }
  settle() {
    for (const row of this.sessions.values()) {
      const effective = effectiveSession(row, this.now(), this.rules);
      if (row.state === 'working' && effective.suspectedEnded) {
        row.state = 'idle'; row.suspectedEnded = true;
      }
    }
  }
  refresh() {
    this.settle();
    const next = this.aggregate();
    if (JSON.stringify(next) !== JSON.stringify(this.previous)) { this.previous = next; this.events.emit('aggregateChange', next); }
    return next;
  }
  onAggregateChange(callback) { this.events.on('aggregateChange', callback); return () => this.events.off('aggregateChange', callback); }
  accept(input, { synthetic = false } = {}) {
    const result = validateEvent(input);
    if (!result.ok) { this.record({ accepted: false, code: result.code }); return result; }
    const event = result.event;
    if(event.source==='typing'){this.typingSnapshot();this.typing.today+=event.count;this.typing.lastSeen=this.now();if(event.count>0)this.typing.lastActive=this.now();this.record({accepted:true,event});this.events.emit('typingChange');this.refresh();return {ok:true};}
    const key = JSON.stringify([event.source, event.session]);
    const old = this.sessions.get(key);
    if (event.beat && !old) { const rejected = { ok: false, code: 'UNKNOWN_SESSION' }; this.record({ accepted: false, code: rejected.code }); return rejected; }
    this.settle();
    const now = this.now();
    const fingerprint = JSON.stringify([event.state, event.project, event.title]);
    const duplicate = !event.beat && old?.fingerprint === fingerprint && now - old.lastEventAt < this.rules.debounceMs;
    if (event.beat || duplicate) {
      old.lastSeen = now; old.ts = event.ts;
    } else {
      this.sessions.set(key, { source: event.source, session: event.session, state: event.state, ts: event.ts, ...(event.project === undefined ? {} : { project: event.project }), ...(event.title === undefined ? {} : { title: event.title }), lastSeen: now, stateSince: now, lastEventAt: now, fingerprint });
    }
    this.record({ accepted: true, code: duplicate ? 'MERGED' : 'ACCEPTED', event });
    // 心跳只续命；周期检测或读取快照时再刷新派生态。
    if (!event.beat) this.refresh();
    if (!event.beat && !duplicate) this.events.emit('acceptedEvent', event, { synthetic });
    return { ok: true, merged: duplicate };
  }
  snapshot() {
    const aggregate = this.refresh();
    const sessions = [...this.sessions.values()].map(row => {
      const { fingerprint, lastEventAt, ...visible } = effectiveSession(row, this.now(), this.rules);
      return visible;
    });
    return { aggregate, sessions, typing:this.typingSnapshot() };
  }
}
async function loadToken(dataDir) {
  const file = path.join(dataDir, 'token');
  try { await writeFile(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await chmod(file, 0o600);
  return readToken(dataDir);
}
export async function startHub({ dataDir = defaultDataDir(), port = 17321, now = Date.now, rules, sweepMs = 1000 } = {}) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const token = await loadToken(dataDir);
  const store = new SessionStore({ now, rules });
  const countsFile=path.join(dataDir,'typing-counts.json');
  try{const saved=JSON.parse(await readFile(countsFile,'utf8'));if(typeof saved.day==='string'&&Number.isSafeInteger(saved.today)&&saved.today>=0)store.typing={...store.typing,day:saved.day,today:saved.today};}catch{}
  let countsWrite=Promise.resolve();
  store.events.on('typingChange',()=>{const {day,today}=store.typing;countsWrite=countsWrite.catch(()=>{}).then(()=>writeFile(countsFile,JSON.stringify({day,today}),{mode:0o600}));countsWrite.catch(()=>{});});
  const send = (res, status, body, origin) => {
    const headers = { 'content-type': 'application/json; charset=utf-8' };
    if (typeof origin === 'string' && /^(chrome-extension|moz-extension|extension):\/\//.test(origin)) {
      headers['access-control-allow-origin'] = origin;
      headers['access-control-allow-headers'] = 'content-type, x-petlink-token';
      headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    }
    res.writeHead(status, headers);
    res.end(body === null ? '' : JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (req.method === 'OPTIONS') return send(res, 204, null, origin);
    if (req.method === 'GET' && req.url === '/healthz') return send(res, 200, { ok: true, version: VERSION }, origin);
    if (req.method === 'GET' && req.url === '/v1/extension-handshake' && typeof origin === 'string' && /^(chrome-extension|moz-extension|extension):\/\//.test(origin)) {
      return send(res, 200, { ok: true, port: selected, token, version: VERSION }, origin);
    }
    const supplied = req.headers['x-petlink-token'];
    if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) {
      store.record({ accepted: false, code: 'UNAUTHORIZED' }); return send(res, 401, { code: 'UNAUTHORIZED', message: '本机令牌无效' }, origin);
    }
    if (req.method === 'GET' && req.url === '/v1/state') return send(res, 200, store.snapshot(), origin);
    if (req.method !== 'POST' || req.url !== '/v1/event') return send(res, 404, { code: 'NOT_FOUND', message: '接口不存在' }, origin);
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 16384) { store.record({ accepted: false, code: 'BODY_TOO_LARGE' }); send(res, 413, { code: 'BODY_TOO_LARGE', message: '事件内容过大' }, origin); return; } chunks.push(chunk); }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { store.record({ accepted: false, code: 'INVALID_JSON' }); return send(res, 400, { code: 'INVALID_JSON', message: '事件不是有效的 JSON' }, origin); }
      const result = store.accept(input);
      send(res, result.ok ? 200 : 400, result.ok ? result : { ...result, message: '事件校验未通过' }, origin);
    } catch { if (!res.headersSent) send(res, 400, { code: 'REQUEST_FAILED', message: '事件读取失败' }, origin); }
  });
  server.requestTimeout = 5000;
  let selected = port;
  for (;;) {
    try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(selected, '127.0.0.1', () => { server.off('error', reject); resolve(); }); }); break; }
    catch (error) { if (error.code !== 'EADDRINUSE' || selected >= 65535 || selected === 0) throw error; selected++; }
  }
  selected = server.address().port;
  const discovery = path.join(dataDir, 'hub.json');
  const temporary = path.join(dataDir, `hub.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  const metadata = { port: selected, pid: process.pid, version: VERSION };
  try { await writeFile(temporary, JSON.stringify(metadata), { mode: 0o600 }); await rename(temporary, discovery); }
  catch (error) { await new Promise(resolve => server.close(resolve)); await unlink(temporary).catch(() => {}); throw error; }
  const timer = setInterval(() => store.refresh(), sweepMs); timer.unref();
  return {
    port: selected, token, dataDir, store, server,
    onAggregateChange: callback => store.onAggregateChange(callback),
    async close() {
      clearInterval(timer);await countsWrite;
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      try { if (await readFile(discovery, 'utf8') === JSON.stringify(metadata)) await unlink(discovery); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  };
}
