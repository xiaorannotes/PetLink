import { readdir, stat, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { homedir } from 'node:os';

const execFileAsync = promisify(execFile);

export const AGENT_DEFINITIONS = Object.freeze({
  antigravity: {
    id: 'antigravity',
    name: 'Antigravity',
    mode: 'hooks+transcript',
    detectPaths: [path.join('.gemini', 'antigravity')],
    processPattern: /antigravity/i
  },
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    mode: 'hooks+logs',
    detectPaths: ['.claude'],
    processPattern: /claude/i
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    mode: 'hooks+logs',
    detectPaths: ['.codex'],
    processPattern: /codex/i
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    mode: 'hooks+app',
    detectPaths: ['.cursor', '/Applications/Cursor.app', path.join('AppData', 'Local', 'Programs', 'cursor')],
    processPattern: /Cursor/i
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    mode: 'app+web',
    detectPaths: ['/Applications/DeepSeek.app', path.join('AppData', 'Local', 'Programs', 'DeepSeek')],
    processPattern: /DeepSeek/i
  },
  'doubao-pro': {
    id: 'doubao-pro',
    name: '豆包专业版',
    mode: 'app+web',
    detectPaths: ['/Applications/Doubao.app', '/Applications/豆包.app', path.join('AppData', 'Local', 'Doubao')],
    processPattern: /Doubao|豆包/i
  },
  muse: {
    id: 'muse',
    name: 'Muse',
    mode: 'app+web',
    detectPaths: ['/Applications/Muse.app', path.join('AppData', 'Local', 'Programs', 'Muse')],
    processPattern: /\bMuse\b/i
  },
  grokbot: {
    id: 'grokbot',
    name: 'Grok / GrokBot',
    mode: 'app+web',
    detectPaths: ['/Applications/Grok.app', path.join('AppData', 'Local', 'Programs', 'Grok')],
    processPattern: /Grok/i
  },
  workbuddy: {
    id: 'workbuddy',
    name: 'WorkBuddy',
    mode: 'app+webhook',
    detectPaths: ['/Applications/WorkBuddy.app', path.join('AppData', 'Local', 'Programs', 'WorkBuddy')],
    processPattern: /WorkBuddy/i
  }
});

// Parse Antigravity transcript.jsonl line metadata only (never reads content or thinking).
export function parseAntigravityStep(line) {
  let row;
  try { row = JSON.parse(line); } catch { return null; }
  if (!row || typeof row !== 'object') return null;
  const ts = row.created_at ? Date.parse(row.created_at) : Date.now();
  if (row.status === 'ERROR') return { state: 'error', ts };
  if (row.type === 'USER_INPUT') return { state: 'working', ts };
  if (row.type === 'PLANNER_RESPONSE') {
    const hasTools = Array.isArray(row.tool_calls) && row.tool_calls.length > 0;
    const asksUser = hasTools && row.tool_calls.some(t => /ask_question|enter_plan_mode/i.test(t?.name || ''));
    if (asksUser) return { state: 'waiting', ts };
    if (hasTools) return { state: 'working', ts };
    if (row.status === 'DONE') return { state: 'done', ts };
  }
  return null;
}

export function detectInstalledPaths(def, home = homedir()) {
  for (const p of def.detectPaths || []) {
    const full = path.isAbsolute(p) ? p : path.join(home, p);
    if (existsSync(full)) return true;
  }
  return false;
}

export function startAutoDetector({
  accept,
  isEnabled = () => true,
  home = homedir(),
  intervalMs = 2000,
  now = Date.now,
  onError = () => {}
} = {}) {
  const agyFiles = new Map();
  const claudeFiles = new Map();
  const appStates = new Map();
  let busy = false;
  let stopped = false;

  async function scanAntigravity() {
    if (!isEnabled('antigravity')) return;
    const brainRoot = path.join(home, '.gemini', 'antigravity', 'brain');
    const dirs = await readdir(brainRoot, { withFileTypes: true }).catch(() => []);
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const tfile = path.join(brainRoot, d.name, '.system_generated', 'logs', 'transcript.jsonl');
      const s = await stat(tfile).catch(() => null);
      if (!s || now() - s.mtimeMs > 86400000) continue;
      if (!agyFiles.has(tfile)) {
        agyFiles.set(tfile, { convId: d.name, offset: Math.max(0, s.size - 65536), partial: '', initial: true });
      }
      const cur = agyFiles.get(tfile);
      if (s.size > cur.offset) {
        const handle = await open(tfile, 'r');
        let buf;
        try {
          buf = Buffer.alloc(Math.min(s.size - cur.offset, 262144));
          const { bytesRead } = await handle.read(buf, 0, buf.length, cur.offset);
          cur.offset += bytesRead;
          buf = buf.subarray(0, bytesRead);
        } finally {
          await handle.close();
        }
        const lines = (cur.partial + buf.toString('utf8')).split('\n');
        cur.partial = lines.pop() || '';
        let lastEvt = null;
        for (const line of lines) {
          const evt = parseAntigravityStep(line);
          if (evt) lastEvt = evt;
        }
        if (lastEvt && (!cur.initial || now() - s.mtimeMs < 30000)) {
          accept({
            v: 1,
            source: 'antigravity',
            session: `agy-${cur.convId.slice(0, 8)}`,
            state: lastEvt.state,
            ts: now()
          });
        }
        cur.initial = false;
      }
    }
  }

  async function scanClaudeLogs() {
    if (!isEnabled('claude-code')) return;
    const projRoot = path.join(home, '.claude', 'projects');
    const dirs = await readdir(projRoot, { withFileTypes: true }).catch(() => []);
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const subPath = path.join(projRoot, d.name);
      const files = await readdir(subPath).catch(() => []);
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const full = path.join(subPath, f);
        const s = await stat(full).catch(() => null);
        if (!s || now() - s.mtimeMs > 3600000) continue;
        const prev = claudeFiles.get(full);
        if (!prev) {
          claudeFiles.set(full, { mtimeMs: s.mtimeMs, state: 'idle' });
        } else if (s.mtimeMs > prev.mtimeMs) {
          prev.mtimeMs = s.mtimeMs;
          prev.state = 'working';
          accept({ v: 1, source: 'claude-code', session: `claude-${f.slice(0, 8)}`, state: 'working', ts: now() });
        } else if (prev.state === 'working' && now() - prev.mtimeMs > 12000) {
          prev.state = 'done';
          accept({ v: 1, source: 'claude-code', session: `claude-${f.slice(0, 8)}`, state: 'done', ts: now() });
        }
      }
    }
  }

  async function scanRunningProcesses() {
    let procList = '';
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist', ['/NH'], { timeout: 1500, windowsHide: true });
        procList = stdout;
      } else {
        const { stdout } = await execFileAsync('ps', ['-axo', 'comm='], { timeout: 1500 });
        procList = stdout;
      }
    } catch {
      return;
    }
    for (const [id, def] of Object.entries(AGENT_DEFINITIONS)) {
      if (!isEnabled(id) || !def.processPattern) continue;
      const running = def.processPattern.test(procList);
      const prev = appStates.get(id);
      if (running && !prev) {
        appStates.set(id, 'idle');
        accept({ v: 1, source: id, session: `auto-${id}`, state: 'idle', ts: now() });
      }
    }
  }

  async function tick() {
    if (busy || stopped) return;
    busy = true;
    try {
      await scanAntigravity();
      await scanClaudeLogs();
      await scanRunningProcesses();
    } catch (e) {
      onError(e);
    } finally {
      busy = false;
    }
  }

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  void tick();

  return {
    registerEnabledSession(source) {
      if (!AGENT_DEFINITIONS[source]) return;
      accept({ v: 1, source, session: `auto-${source}`, state: 'idle', ts: now() });
    },
    stop() {
      stopped = true;
      clearInterval(timer);
    }
  };
}
