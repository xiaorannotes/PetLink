import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
export function defaultDataDir(env = process.env, platform = process.platform, home = homedir()) {
  if (env.PETLINK_DATA_DIR) return path.resolve(env.PETLINK_DATA_DIR);
  const base = platform === 'win32' ? (env.APPDATA || path.join(home, 'AppData', 'Roaming')) : platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : (env.XDG_DATA_HOME || path.join(home, '.local', 'share'));
  return path.join(base, 'petlink');
}
export async function readToken(dataDir = defaultDataDir()) {
  const token = (await readFile(path.join(dataDir, 'token'), 'utf8')).trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('本机令牌文件格式无效');
  return token;
}
export async function discoverHub(dataDir = defaultDataDir()) {
  const { port } = JSON.parse(await readFile(path.join(dataDir, 'hub.json'), 'utf8'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Hub 端口无效');
  return { port, token: await readToken(dataDir) };
}
