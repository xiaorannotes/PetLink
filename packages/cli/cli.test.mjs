import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { run } from './petlink.mjs';
import { startHub } from '../hub/index.mjs';
test('CLI 非法参数退出 2 并打印中文用法', async () => {
  for (const args of [[], ['bad'], ['state', '--extra'], ['send'], ['send', '--source', 'generic', '--state', 'bad'], ['send', '--unknown', 'x']]) {
    const errors = []; assert.equal(await run(args, { err: x => errors.push(x) }), 2); assert.match(errors[0], /用法/u);
  }
});
function invoke(args, dataDir) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PETLINK_DATA_DIR: dataDir }; delete env.NODE_TEST_CONTEXT;
    const proc = spawn(process.execPath, [fileURLToPath(new URL('./petlink.mjs', import.meta.url)), ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; proc.stdout.on('data', c => stdout += c); proc.stderr.on('data', c => stderr += c); proc.on('error', reject); proc.on('close', code => resolve({ code, stdout, stderr }));
  });
}
test('CLI Hub 不在线退出 1', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'petlink-cli-'));
  try { const result = await invoke(['state'], dir); assert.equal(result.code, 1); assert.match(result.stderr, /请先启动/u); } finally { await rm(dir, { recursive: true, force: true }); }
});
test('CLI send 与 state 经真实 Hub', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'petlink-cli-')); let hub;
  try {
    hub = await startHub({ dataDir: dir, port: 0 });
    assert.equal((await invoke(['send', '--source', 'generic', '--state', 'waiting', '--session', 'cli', '--title', '请确认'], dir)).code, 0);
    const result = await invoke(['state'], dir); assert.equal(result.code, 0); assert.match(result.stdout, /聚合状态：等待确认/u); assert.match(result.stdout, /generic \/ cli/u);
  } finally { if (hub) await hub.close(); await rm(dir, { recursive: true, force: true }); }
});
