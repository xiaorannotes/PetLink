import { readFile, writeFile, mkdir, mkdtemp, readdir, unlink, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defaultDataDir } from '../shared/index.mjs';
const failure = (code, message) => ({ ok: false, code, message });
// Buffer offsets preserve every existing byte, including CRLF and UTF-8 BOM.
function inspect(bytes) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) throw new Error('配置不是有效 UTF-8');
  if (text.includes('"""') || text.includes("'''")) throw new Error('多行字符串配置需手动接入，未修改文件');
  const bom = text.startsWith('\uFEFF') ? 3 : 0;
  const rows = []; let offset = bom; let top = true; let boundary = bytes.length;
  for (const raw of text.replace(/^\uFEFF/u, '').match(/[^\n]*\n|[^\n]+$/gu) ?? []) {
    const line = raw.replace(/^\uFEFF/u, '').replace(/\r?\n$/u, '');
    if (top && /^\s*\[/u.test(line)) { boundary = offset; top = false; }
    if (top) {
      let quoted = null, escaped = false, balance = 0;
      for (const char of line) {
        if (quoted) {
          if (escaped) { escaped = false; continue; }
          if (quoted === '"' && char === '\\') { escaped = true; continue; }
          if (char === quoted) quoted = null;
        } else if (char === '#') break;
        else if (char === '"' || char === "'") quoted = char;
        else if (char === '[' || char === '{') balance++;
        else if (char === ']' || char === '}') balance--;
      }
      // Refuse ambiguous multiline values rather than inserting inside their contents.
      if (quoted || balance !== 0) {
        if (/^\s*(?:notify|"notify"|'notify')\s*=/u.test(line)) {
          rows.push({ offset, length: Buffer.byteLength(raw), own: false });
          return { rows, boundary, newline: text.includes('\r\n') ? '\r\n' : '\n' };
        }
        throw new Error('顶层存在多行或不完整值，无法安全插入通知配置');
      }
    }
    if (top && /^\s*(?:notify|"notify"|'notify')\s*=/u.test(line)) {
      let own = false;
      const match = line.match(/^\s*notify\s*=\s*(\[.*\])\s*(?:#.*)?$/u);
      if (match) { try { const command = JSON.parse(match[1]); own = Array.isArray(command) && command.length === 3 && command.every(v => typeof v === 'string') && path.basename(command[1]) === 'codex.mjs' && command[2] === '--codex-notify'; } catch {} }
      rows.push({ offset, length: Buffer.byteLength(raw), own, leadingNewline: /# petlink-leading-newline\s*$/u.test(line) });
    }
    offset += Buffer.byteLength(raw);
  }
  return { rows, boundary, newline: text.includes('\r\n') ? '\r\n' : '\n' };
}
export function createConfigManager({ configPath = path.join(homedir(), '.codex/config.toml'), dataDir = defaultDataDir(), nodePath = process.execPath, adapterPath = fileURLToPath(new URL('../adapters/codex.mjs', import.meta.url)) } = {}) {
  const root = path.join(dataDir, 'backups/codex');
  async function read() { try { return { exists: true, bytes: await readFile(configPath) }; } catch (e) { if (e.code === 'ENOENT') return { exists: false, bytes: Buffer.alloc(0) }; throw e; } }
  async function backup(original, eligible) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const dir = await mkdtemp(path.join(root, new Date().toISOString().replace(/:/gu, '-') + '-'));
    await writeFile(path.join(dir, 'config.toml'), original.bytes, { mode: 0o600 });
    await writeFile(path.join(dir, 'metadata.json'), JSON.stringify({ exists: original.exists, configPath: path.resolve(configPath), eligible }), { mode: 0o600 });
  }
  async function save(bytes) {
    await mkdir(path.dirname(configPath), { recursive: true });
    const temporary = `${configPath}.petlink-${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
      if (!(await readFile(temporary)).equals(bytes)) throw new Error('配置写入校验失败，原配置未修改');
      await rename(temporary, configPath);
    } finally { await unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  }
  return {
    async status() { const original = await read(); try { const { rows } = inspect(original.bytes); return { ok: true, exists: original.exists, installed: rows.some(r => r.own), userNotifyExists: rows.some(r => !r.own) }; } catch (e) { return { ...failure('UNSAFE_CONFIG', e.message), exists: original.exists }; } },
    async enable() {
      const original = await read(); let info;
      try { info = inspect(original.bytes); } catch (e) { await backup(original, true); return failure('UNSAFE_CONFIG', e.message); }
      await backup(original, !info.rows.some(r => r.own));
      if (info.rows.some(r => !r.own)) return failure('USER_NOTIFY_EXISTS', '已有用户自定义 notify，未覆盖；请手动协调通知配置');
      if (info.rows.length) return { ok: true };
      const before = original.bytes.subarray(0, info.boundary);
      const needsNewline = before.length > 0 && !(before.length === 3 && before.equals(Buffer.from('\uFEFF'))) && before.at(-1) !== 10;
      const line = `${needsNewline ? info.newline : ''}notify = ${JSON.stringify([nodePath, path.resolve(adapterPath), '--codex-notify'])}${needsNewline ? ' # petlink-leading-newline' : ''}${info.newline}`;
      await save(Buffer.concat([before, Buffer.from(line), original.bytes.subarray(info.boundary)])); return { ok: true };
    },
    async disable() {
      const original = await read(); let info; try { info = inspect(original.bytes); } catch (e) { return failure('UNSAFE_CONFIG', e.message); }
      let bytes = original.bytes;
      for (const row of info.rows.filter(r => r.own).reverse()) {
        let start = row.offset;
        if (row.leadingNewline && start > 0 && bytes[start - 1] === 10) { start--; if (start > 0 && bytes[start - 1] === 13) start--; }
        bytes = Buffer.concat([bytes.subarray(0, start), bytes.subarray(row.offset + row.length)]);
      }
      if (!bytes.equals(original.bytes)) await save(bytes);
      return { ok: true };
    },
    async restore() {
      let names; try { names = await readdir(root); } catch (e) { if (e.code === 'ENOENT') return failure('NO_BACKUP', '没有可还原的备份'); throw e; }
      for (const name of names.sort().reverse()) {
        const dir = path.join(root, name); const meta = JSON.parse(await readFile(path.join(dir, 'metadata.json'), 'utf8'));
        if (!meta.eligible || meta.configPath !== path.resolve(configPath)) continue;
        if (meta.exists) await save(await readFile(path.join(dir, 'config.toml')));
        else await unlink(configPath).catch(e => { if (e.code !== 'ENOENT') throw e; });
        return { ok: true };
      }
      return failure('NO_BACKUP', '没有可还原的备份');
    }
  };
}
const manager = createConfigManager();
export const enable = () => manager.enable();
export const disable = () => manager.disable();
export const restore = () => manager.restore();
export const status = () => manager.status();
