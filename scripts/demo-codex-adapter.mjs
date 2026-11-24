import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { startHub } from '../packages/hub/index.mjs';
import { createConfigManager } from '../packages/config-manager/codex.mjs';
import { createNotifier } from '../packages/notifier/index.mjs';
const dir = await mkdtemp(path.join(tmpdir(), 'petlink-codex-demo-'));
const configPath = path.join(dir, 'config.toml'), dataDir = path.join(dir, 'data');
const original = Buffer.from('# 用户配置\r\nmodel = "示例"\r\n[projects.demo]\r\ntrust_level = "trusted"\r\n');
let hub, notifier, server;
async function child(script, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { env: { ...process.env, PETLINK_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; proc.stdout.on('data', c => stdout += c); proc.stderr.on('data', c => stderr += c); proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`子进程失败：${stderr}`)));
  });
}
try {
  await writeFile(configPath, original);
  const received = [];
  server = http.createServer(async (req, res) => { const chunks = []; for await (const c of req) chunks.push(c); received.push(JSON.parse(Buffer.concat(chunks))); res.end('{}'); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  hub = await startHub({ dataDir, port: 0 }); console.log('Hub 与本地 Webhook 捕获服务器已启动');
  notifier = createNotifier({ hub, quietHours: false, onNotify: () => {}, webhookUrl: `http://127.0.0.1:${server.address().port}` });
  const manager = createConfigManager({ configPath, dataDir }); assert.equal((await manager.enable()).ok, true); console.log('Codex 配置已启用并备份');
  const output = await child('../packages/adapters/codex.mjs', ['--codex-notify', JSON.stringify({ type: 'agent-turn-complete', 'thread-id': 'codex-demo', cwd: '/tmp/示例项目' })]);
  assert.equal(output.stdout + output.stderr, ''); assert.equal(hub.store.snapshot().aggregate.state, 'done'); await notifier.flush(); console.log('notify → done 已验证');
  await child('../packages/cli/petlink.mjs', ['send', '--source', 'generic', '--state', 'waiting', '--session', 'cli-demo']);
  assert.equal(hub.store.snapshot().aggregate.state, 'waiting'); await notifier.flush(); assert.deepEqual(received.map(e => e.kind), ['done', 'confirm']); console.log('CLI → waiting；两次 Webhook 的 done / confirm 映射已验证');
  assert.equal((await manager.disable()).ok, true); assert.deepEqual(await readFile(configPath), original);
  assert.equal((await manager.restore()).ok, true); assert.deepEqual(await readFile(configPath), original); console.log('停用与还原均逐字节一致，演示完成');
} catch (error) { console.error(`演示失败：${error.code ?? ''} ${error.message}`); process.exitCode = 1; }
finally { notifier?.close(); if (notifier) await notifier.flush(); if (hub) await hub.close(); if (server?.listening) await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
