import { readFile, writeFile, mkdir, mkdtemp, unlink } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { defaultDataDir } from '../shared/index.mjs';
import { HOOK_STATES } from '../adapters/cursor.mjs';

const marked = row => typeof row?.command === 'string' && /(?:^|\s)--petlink(?:\s|$)/u.test(row.command) && row.command.includes('cursor.mjs');
const object = value => value && typeof value === 'object' && !Array.isArray(value);

function parse(bytes) {
  const value = bytes.toString('utf8').trim() ? JSON.parse(bytes.toString('utf8')) : { version: 1, hooks: {} };
  if (!object(value) || (value.hooks !== undefined && !object(value.hooks))) throw new Error('hooks.json 必须是 JSON 对象');
  return value;
}

function strip(config) {
  const copy = structuredClone(config);
  for (const [event, rows] of Object.entries(copy.hooks ?? {})) {
    if (!Array.isArray(rows)) continue;
    copy.hooks[event] = rows.filter(row => !marked(row));
    if (!copy.hooks[event].length) delete copy.hooks[event];
  }
  return copy;
}

const failure = (code, message) => ({ ok: false, code, message });

export function createConfigManager({
  settingsPath = path.join(homedir(), '.cursor', 'hooks.json'),
  dataDir = defaultDataDir(),
  nodePath = process.execPath,
  adapterPath = fileURLToPath(new URL('../adapters/cursor.mjs', import.meta.url))
} = {}) {
  const root = path.join(dataDir, 'backups', 'cursor');
  async function read() { try { return { exists: true, bytes: await readFile(settingsPath) }; } catch (e) { if (e.code === 'ENOENT') return { exists: false, bytes: Buffer.alloc(0) }; throw e; } }
  async function backup(original) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const dir = await mkdtemp(path.join(root, new Date().toISOString().replace(/:/gu, '-') + '-'));
    await writeFile(path.join(dir, 'hooks.json'), original.bytes, { mode: 0o600 });
    return dir;
  }
  async function restoreBytes(original) { if (original.exists) await writeFile(settingsPath, original.bytes); else await unlink(settingsPath).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  async function save(config, original) {
    try { await mkdir(path.dirname(settingsPath), { recursive: true }); await writeFile(settingsPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 }); if (!isDeepStrictEqual(parse(await readFile(settingsPath)), config)) throw new Error('写后内容不一致'); }
    catch (e) { await restoreBytes(original); return failure('WRITE_FAILED', '配置写入校验失败，已回滚：' + e.message); }
    return { ok: true };
  }
  return {
    async status() {
      const original = await read(); let config;
      try { config = parse(original.bytes); } catch { return { ...failure('INVALID_JSON', 'hooks.json 损坏'), exists: original.exists, installed: false, events: [] }; }
      const events = Object.entries(config.hooks ?? {}).filter(([, rows]) => Array.isArray(rows) && rows.some(marked)).map(([event]) => event);
      return { ok: true, exists: original.exists, installed: events.length > 0, events };
    },
    async enable() {
      const original = await read();
      await backup(original);
      let config;
      try { config = parse(original.bytes); } catch (e) { return failure('INVALID_JSON', 'hooks.json 无效：' + e.message); }
      const next = strip(config);
      next.version ??= 1;
      next.hooks ??= {};
      const quote = value => '"' + value.replace(/["\\$`]/gu, '\\$&') + '"';
      const command = `${quote(nodePath.replaceAll('\\', '/'))} ${quote(path.resolve(adapterPath).replaceAll('\\', '/'))} --petlink`;
      for (const event of Object.keys(HOOK_STATES)) (next.hooks[event] ??= []).push({ command });
      return save(next, original);
    },
    async disable() {
      const original = await read(); let config;
      try { config = parse(original.bytes); } catch { return failure('INVALID_JSON', 'hooks.json 无效'); }
      return save(strip(config), original);
    }
  };
}
