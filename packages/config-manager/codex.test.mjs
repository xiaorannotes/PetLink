import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createConfigManager } from './codex.mjs';
for (const newline of ['\n', '\r\n']) test(`Codex 保留原始字节 ${JSON.stringify(newline)}`, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'petlink-config-'));
  try {
    const configPath = path.join(dir, 'config.toml'), original = Buffer.from(['# 中文', 'model = "示例"', '', '[projects."/tmp"]', 'trust_level = "trusted"', ''].join(newline));
    await writeFile(configPath, original); const manager = createConfigManager({ configPath, dataDir: dir });
    assert.equal((await manager.enable()).ok, true); const installed = await readFile(configPath, 'utf8');
    assert.equal(installed.replace(/^notify = .*\r?\n/mu, ''), original.toString()); assert.ok(installed.indexOf('notify =') < installed.indexOf('[projects'));
    await manager.enable(); assert.equal(await readFile(configPath, 'utf8'), installed);
    await manager.disable(); assert.deepEqual(await readFile(configPath), original);
    await manager.restore(); assert.deepEqual(await readFile(configPath), original);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Codex 拒绝用户 notify，缺失文件还原为不存在', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'petlink-config-')); const configPath = path.join(dir, 'config.toml');
  try {
    const manager = createConfigManager({ configPath, dataDir: dir });
    await manager.enable(); assert.equal((await manager.status()).installed, true); await manager.restore(); await assert.rejects(readFile(configPath), { code: 'ENOENT' });
    const original = 'notify = ["用户程序"]\n[other]\nx=1\n'; await writeFile(configPath, original);
    assert.equal((await manager.enable()).code, 'USER_NOTIFY_EXISTS'); assert.equal(await readFile(configPath, 'utf8'), original); assert.equal((await manager.status()).userNotifyExists, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
for (const original of ['model = "x"', '\uFEFF[section]\r\nx=1', '\uFEFFmodel = "中文"\n']) test('Codex 无末尾换行和 BOM 原样停用', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'petlink-config-')); const configPath = path.join(dir, 'config.toml');
  try { await writeFile(configPath, original); const manager = createConfigManager({ configPath, dataDir: dir }); assert.equal((await manager.enable()).ok, true); assert.equal((await manager.status()).installed, true); await manager.disable(); assert.equal(await readFile(configPath, 'utf8'), original); } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Codex 不把注释中的标记视为自己的 notify', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'petlink-config-')); const configPath = path.join(dir, 'config.toml');
  try { await writeFile(configPath, 'notify = ["user"] # codex.mjs --codex-notify\n'); const manager = createConfigManager({ configPath, dataDir: dir }); assert.equal((await manager.enable()).code, 'USER_NOTIFY_EXISTS'); } finally { await rm(dir, { recursive: true, force: true }); }
});
test('Codex 保守拒绝多行顶层值，section 内用户 notify 不变', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'petlink-config-')); const configPath = path.join(dir, 'config.toml');
  try {
    const manager = createConfigManager({ configPath, dataDir: dir });
    for (const original of ['items = [\n "x",\n]\n', 'message = """\nnotify = []\n"""\n']) { await writeFile(configPath, original); assert.equal((await manager.enable()).code, 'UNSAFE_CONFIG'); assert.equal(await readFile(configPath, 'utf8'), original); }
    const original = '[section]\nnotify = ["用户"]\n'; await writeFile(configPath, original); assert.equal((await manager.enable()).ok, true); await manager.disable(); assert.equal(await readFile(configPath, 'utf8'), original);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
