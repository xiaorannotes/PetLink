import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { defaultDataDir, discoverHub, readToken } from './index.mjs';
test('共享发现严格验证端口与令牌，并且只返回回环所需信息', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'petlink-shared-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await assert.rejects(discoverHub(dir), { code: 'ENOENT' });
  await writeFile(path.join(dir, 'token'), 'a'.repeat(64));
  for (const port of [0, 65536, '17321', -1, 1.5]) {
    await writeFile(path.join(dir, 'hub.json'), JSON.stringify({ port })); await assert.rejects(discoverHub(dir), /端口/);
  }
  await writeFile(path.join(dir, 'hub.json'), JSON.stringify({ port: 17321, host: 'example.com' }));
  assert.deepEqual(await discoverHub(dir), { port: 17321, token: 'a'.repeat(64) });
  await writeFile(path.join(dir, 'token'), 'bad'); await assert.rejects(readToken(dir), /令牌/);
  assert.equal(defaultDataDir({ PETLINK_DATA_DIR: dir }), dir);
});
