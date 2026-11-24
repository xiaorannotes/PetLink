import { readFile, writeFile, mkdir, mkdtemp, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { defaultDataDir } from '../shared/index.mjs';
import { HOOK_STATES } from '../adapters/claude-code.mjs';
const marked = hook => hook?.type === 'command' && typeof hook.command === 'string' && /(?:^|\s)--petlink(?:\s|$)/u.test(hook.command) && hook.command.includes('claude-code.mjs');
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function parse(bytes) {
  const value = bytes.toString('utf8').trim() ? JSON.parse(bytes.toString('utf8')) : {};
  if (!object(value) || (value.hooks !== undefined && !object(value.hooks))) throw new Error('配置必须是 JSON 对象，hooks 必须是对象');
  for (const rows of Object.values(value.hooks ?? {})) if (!Array.isArray(rows) || rows.some(row => !object(row) || !Array.isArray(row.hooks))) throw new Error('hooks 事件必须包含有效的 hooks 数组');
  return value;
}
function strip(config) {
  const copy = structuredClone(config); let removed = false;
  for (const [event, rows] of Object.entries(copy.hooks ?? {})) {
    copy.hooks[event] = rows.flatMap(row => {
      const hooks = row.hooks.filter(hook => !marked(hook));
      if (hooks.length !== row.hooks.length) removed = true;
      return hooks.length === row.hooks.length ? [row] : hooks.length ? [{ ...row, hooks }] : [];
    });
    if (rows.length && !copy.hooks[event].length) delete copy.hooks[event];
  }
  if (removed && copy.hooks && !Object.keys(copy.hooks).length) delete copy.hooks;
  return copy;
}
function comparable(config) { const copy = strip(config); for (const [event, rows] of Object.entries(copy.hooks ?? {})) if (!rows.length) delete copy.hooks[event]; if (copy.hooks && !Object.keys(copy.hooks).length) delete copy.hooks; return copy; }
const failure = (code, message) => ({ ok: false, code, message });
export function createConfigManager({ settingsPath = path.join(homedir(), '.claude', 'settings.json'), dataDir = defaultDataDir(), nodePath = process.execPath, adapterPath = fileURLToPath(new URL('../adapters/claude-code.mjs', import.meta.url)) } = {}) {
  const root = path.join(dataDir, 'backups', 'claude-code');
  async function read() { try { return { exists: true, bytes: await readFile(settingsPath) }; } catch (e) { if (e.code === 'ENOENT') return { exists: false, bytes: Buffer.alloc(0) }; throw e; } }
  async function latest() {
    let names; try { names = await readdir(root); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    for (const name of names.sort().reverse()) {
      const dir = path.join(root, name);
      const meta = JSON.parse(await readFile(path.join(dir, 'metadata.json'), 'utf8'));
      if (meta.restoreEligible !== false && meta.settingsPath === path.resolve(settingsPath)) return { ...meta, bytes: await readFile(path.join(dir, 'settings.json')) };
    }
    return null;
  }
  async function backup(original) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const dir = await mkdtemp(path.join(root, new Date().toISOString().replace(/:/gu, '-') + '-'));
    await writeFile(path.join(dir, 'settings.json'), original.bytes, { mode: 0o600 });
    await writeFile(path.join(dir, 'metadata.json'), JSON.stringify({ exists: original.exists, settingsPath: path.resolve(settingsPath) }), { mode: 0o600 });
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
      try { config = parse(original.bytes); } catch { return { ...failure('INVALID_JSON', '配置 JSON 损坏，未修改文件'), exists: original.exists, installed: false, events: [] }; }
      const events = Object.entries(config.hooks ?? {}).filter(([, rows]) => rows.some(row => row.hooks.some(marked))).map(([event]) => event);
      return { ok: true, exists: original.exists, installed: events.length > 0, events };
    },
    async enable() {
      const original = await read();
      const backupDir = await backup(original);
      let config;
      try { config = parse(original.bytes); } catch (e) { return failure('INVALID_JSON', '配置 JSON 无效，未修改文件：' + e.message); }
      const installed = !isDeepStrictEqual(config, strip(config));
      // 重复启用仍留存逐字节快照，但还原使用安装前的最近基线。
      if (installed) await writeFile(path.join(backupDir, 'metadata.json'), JSON.stringify({ exists: original.exists, settingsPath: path.resolve(settingsPath), restoreEligible: false }), { mode: 0o600 });
      const next = strip(config); next.hooks ??= {};
      const quote = value => '"' + value.replace(/["\\$`]/gu, '\\$&') + '"';
      const command = `${quote(nodePath.replaceAll('\\','/'))} ${quote(path.resolve(adapterPath).replaceAll('\\','/'))} --petlink`;
      for (const event of Object.keys(HOOK_STATES)) (next.hooks[event] ??= []).push({ hooks: [{ type: 'command', command }] });
      return save(next, original);
    },
    async disable() {
      const original = await read(); let config;
      try { config = parse(original.bytes); } catch { return failure('INVALID_JSON', '配置 JSON 无效，未修改文件'); }
      const next = strip(config);
      if (!isDeepStrictEqual(config, next)) { const result = await save(next, original); if (!result.ok) return result; }
      const base = await latest();
      return { ok: true, canRestore: !!base && isDeepStrictEqual(comparable(next), comparable(parse(base.bytes))) };
    },
    async restore() {
      const base = await latest(); if (!base) return failure('NO_BACKUP', '没有可还原的备份');
      const current = await read();
      try { if (!isDeepStrictEqual(comparable(parse(current.bytes)), comparable(parse(base.bytes)))) return failure('CONFIG_CHANGED', '配置已发生其他修改，为保护用户设置已拒绝还原'); }
      catch { return failure('INVALID_JSON', '配置 JSON 无效，无法安全还原'); }
      await restoreBytes(base); return { ok: true };
    }
  };
}
const manager = createConfigManager();
export const status = () => manager.status();
export const enable = () => manager.enable();
export const disable = () => manager.disable();
export const restore = () => manager.restore();
