import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { startHub } from '../packages/hub/index.mjs';
import { createConfigManager } from '../packages/config-manager/index.mjs';
const home = await mkdtemp(path.join(tmpdir(), 'petlink-demo-'));
const dataDir = path.join(home, 'data'); const settingsPath = path.join(home, '.claude/settings.json');
const original = Buffer.from('{\r\n  "theme":"暗色", "hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo 用户原有钩子"}]}]}\r\n}\r\n');
let hub;
try {
  await mkdir(path.dirname(settingsPath)); await writeFile(settingsPath, original);
  hub = await startHub({ dataDir, port: 0 }); console.log('Hub 已启动（本地回环）');
  const manager = createConfigManager({ settingsPath, dataDir }); assert.equal((await manager.enable()).ok, true); console.log('适配器已启用，原配置已备份');
  hub.onAggregateChange(value => console.log(`聚合态：${value.state}`));
  for (const hook_event_name of ['UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd']) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('../packages/adapters/claude-code.mjs', import.meta.url))], { env: { ...process.env, HOME: home, USERPROFILE: home, PETLINK_DATA_DIR: dataDir }, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x); child.on('error', reject);
      child.on('close', code => code === 0 && !output ? resolve() : reject(new Error('适配器未静默成功退出')));
      child.stdin.end(JSON.stringify({ hook_event_name, session_id: 'demo', cwd: path.join(home, '示例项目') }));
    });
    assert.equal(hub.store.log.at(-1)?.event?.state, { UserPromptSubmit: 'working', Notification: 'waiting', Stop: 'done', SessionEnd: 'offline' }[hook_event_name]);
  }
  assert.equal(hub.store.log.length, 4); assert.equal((await manager.disable()).canRestore, true); assert.equal((await manager.restore()).ok, true);
  assert.deepEqual(await readFile(settingsPath), original); console.log('已停用并还原：配置逐字节一致');
} catch (error) { console.error('演示失败：' + error.message); process.exitCode = 1; }
finally { if (hub) await hub.close(); await rm(home, { recursive: true, force: true }); }
