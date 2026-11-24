import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startHub } from '../packages/hub/index.mjs';
const labels = { idle: '空闲', working: '工作中', waiting: '等待确认', done: '已完成', error: '出错', offline: '离线' };
const dataDir = await mkdtemp(path.join(tmpdir(), 'petlink-demo-'));
let hub;
try {
  hub = await startHub({ dataDir });
  console.log(`中枢已启动：127.0.0.1:${hub.port}（临时数据目录）`);
  hub.onAggregateChange(value => console.log(`聚合态变化：${labels[value.state]}`));
  const base = `http://127.0.0.1:${hub.port}`;
  const headers = { 'x-petlink-token': hub.token, 'content-type': 'application/json' };
  for (const [source, session, state] of [['claude-code', '演示一', 'working'], ['claude-code', '演示一', 'waiting'], ['claude-code', '演示一', 'done'], ['codex', '演示二', 'working']]) {
    console.log(`发送事件：${source} / ${session} → ${labels[state]}`);
    const response = await fetch(`${base}/v1/event`, { method: 'POST', headers, body: JSON.stringify({ v: 1, source, session, state, ts: Date.now(), project: 'petlink', title: '演示任务' }) });
    if (!response.ok) throw new Error(`发送事件失败：${response.status}`);
  }
  const response = await fetch(`${base}/v1/state`, { headers });
  if (!response.ok) throw new Error(`读取快照失败：${response.status}`);
  const snapshot = await response.json();
  console.log('最终状态快照：\n' + JSON.stringify(snapshot, null, 2));
  if (snapshot.aggregate.state !== 'done' || snapshot.sessions.length !== 2) throw new Error('演示结果未通过检查');
} finally {
  if (hub) await hub.close();
  await rm(dataDir, { recursive: true, force: true });
  console.log('中枢已关闭，临时数据已清理');
}
