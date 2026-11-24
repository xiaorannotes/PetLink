import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createConfigManager } from './index.mjs';
import { HOOK_STATES } from '../adapters/claude-code.mjs';
async function fixture(t, bytes) {
  const dir = await mkdtemp(path.join(tmpdir(), 'petlink-config-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const settingsPath = path.join(dir, 'settings.json');
  if (bytes !== undefined) await writeFile(settingsPath, bytes);
  return { dir, settingsPath, manager: createConfigManager({ settingsPath, dataDir: dir }) };
}
const original = Buffer.from('{\r\n\t"theme": "暗色", "custom": {"nested":[1,true,null]},\r\n "hooks": {"Stop":[{"matcher":"*","custom":42,"hooks":[{"type":"command","command":"echo 用户"}]}],"Custom":[]}\r\n}\r\n');
test('夹具：保留其他 hooks 与杂字段，幂等启用，停用后逐字节恢复', async t => {
  const { manager, settingsPath, dir } = await fixture(t, original);
  assert.equal((await manager.status()).installed, false);
  assert.equal((await manager.enable()).ok, true);
  const enabled = JSON.parse(await readFile(settingsPath)); const base = JSON.parse(original);
  assert.deepEqual(enabled.custom, base.custom); assert.equal(enabled.theme, base.theme);
  assert.deepEqual(enabled.hooks.Stop[0], base.hooks.Stop[0]); assert.deepEqual(enabled.hooks.Custom, []);
  assert.deepEqual((await manager.status()).events.sort(), Object.keys(HOOK_STATES).sort());
  for (const event of Object.keys(HOOK_STATES)) assert.equal(enabled.hooks[event].at(-1).hooks[0].command.includes('--petlink'), true);
  await manager.enable(); assert.deepEqual(JSON.parse(await readFile(settingsPath)), enabled);
  assert.equal((await readdir(path.join(dir, 'backups/claude-code'))).length, 2);
  assert.equal((await manager.disable()).canRestore, true);
  assert.deepEqual(JSON.parse(await readFile(settingsPath)), base);
  assert.equal((await manager.restore()).ok, true); assert.deepEqual(await readFile(settingsPath), original);
});
test('损坏 JSON 拒绝并保留文件与逐字节备份', async t => {
  const bytes = Buffer.from('{坏配置'); const { manager, settingsPath, dir } = await fixture(t, bytes);
  assert.equal((await manager.enable()).code, 'INVALID_JSON'); assert.deepEqual(await readFile(settingsPath), bytes);
  const [name] = await readdir(path.join(dir, 'backups/claude-code'));
  assert.deepEqual(await readFile(path.join(dir, 'backups/claude-code', name, 'settings.json')), bytes);
});
for (const bytes of [undefined, Buffer.alloc(0)]) test(`最小配置还原：${bytes === undefined ? '不存在' : '空文件'}`, async t => {
  const { manager, settingsPath } = await fixture(t, bytes);
  assert.equal((await manager.disable()).ok, true);
  assert.equal((await manager.enable()).ok, true); await manager.disable(); assert.equal((await manager.restore()).ok, true);
  if (bytes === undefined) await assert.rejects(readFile(settingsPath), { code: 'ENOENT' });
  else assert.deepEqual(await readFile(settingsPath), bytes);
});
test('用户后续修改保护、混合 hook 精确摘除、旧路径更新', async t => {
  const { manager, settingsPath } = await fixture(t, original); await manager.enable();
  let config = JSON.parse(await readFile(settingsPath));
  config.hooks.Stop.at(-1).hooks.push({ type: 'command', command: 'echo 新增' }); config.theme = '浅色';
  await writeFile(settingsPath, JSON.stringify(config)); await manager.enable();
  config = JSON.parse(await readFile(settingsPath));
  assert.equal(config.hooks.Stop.filter(row => row.hooks.some(h => h.command.includes('--petlink'))).length, 1);
  await manager.disable(); config = JSON.parse(await readFile(settingsPath));
  assert.equal(config.hooks.Stop.at(-1).hooks[0].command, 'echo 新增');
  assert.equal((await manager.restore()).code, 'CONFIG_CHANGED'); assert.equal(config.theme, '浅色');
});
test('未启用时空 hooks 结构不写入、不改变字节', async t => {
  for (const text of ['{ "hooks": {} }\n', '{ "hooks": {"Stop": []} }\n']) {
    const { manager, settingsPath } = await fixture(t, Buffer.from(text));
    await manager.disable(); assert.equal(await readFile(settingsPath, 'utf8'), text);
    await manager.enable(); await manager.disable(); assert.equal((await manager.restore()).ok, true); assert.equal(await readFile(settingsPath, 'utf8'), text);
  }
});
