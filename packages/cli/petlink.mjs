#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverHub } from '../shared/index.mjs';
import { validateEvent } from '../protocol/index.mjs';
const usage = '用法：petlink send --source <来源> --state <状态> [--session <会话>] [--title <标题>] [--project <项目>]\n      petlink state';
const labels = { idle: '空闲', working: '工作中', waiting: '等待确认', done: '完成', error: '出错', offline: '离线' };
export async function run(argv, { out = console.log, err = console.error } = {}) {
  const [command, ...args] = argv; let event;
  if (command === 'send') {
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      const name = args[i]?.slice(2);
      if (!args[i]?.startsWith('--') || !['source', 'state', 'session', 'title', 'project'].includes(name) || options[name] !== undefined || args[i + 1] === undefined || args[i + 1].startsWith('--')) { err(usage); return 2; }
      options[name] = args[i + 1];
    }
    event = { v: 1, session: 'default', ...options, ts: Date.now() };
    if (!validateEvent(event).ok) { err('参数无效。\n' + usage); return 2; }
  } else if (command !== 'state' || args.length) { err(usage); return 2; }
  try {
    const { port, token } = await discoverHub();
    const body = await new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: event ? '/v1/event' : '/v1/state', method: event ? 'POST' : 'GET', headers: { 'x-petlink-token': token, 'content-type': 'application/json' } }, res => {
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('error', reject);
        res.on('end', () => { try { if (res.statusCode !== 200) throw new Error('Hub 拒绝请求'); resolve(JSON.parse(Buffer.concat(chunks))); } catch (e) { reject(e); } });
      });
      req.setTimeout(3000, () => req.destroy(new Error('连接超时'))); req.on('error', reject); req.end(event ? JSON.stringify(event) : undefined);
    });
    if (event) out('状态已发送');
    else { out(`聚合状态：${labels[body.aggregate.state] ?? body.aggregate.state}`); for (const row of body.sessions) out(`${row.source} / ${row.session}：${labels[row.state] ?? row.state}${row.project ? '（' + row.project + '）' : ''}`); }
    return 0;
  } catch { err('无法连接本机 Hub，请先启动 PetLink 并检查本机配置'); return 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = await run(process.argv.slice(2));
