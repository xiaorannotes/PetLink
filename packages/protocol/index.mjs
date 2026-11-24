export const STATES = Object.freeze(['idle', 'working', 'waiting', 'done', 'error', 'offline']);
export const SOURCES = Object.freeze(['antigravity', 'claude-code', 'codex', 'cursor', 'deepseek', 'doubao-pro', 'workbuddy', 'grokbot', 'generic', 'muse', 'typing']);
export const DEFAULT_RULES = Object.freeze({ doneMs: 8000, quietMs: 90000, idleMs: 600000, debounceMs: 300 });
const fields = new Set(['v', 'source', 'session', 'state', 'ts', 'project', 'title', 'beat', 'count']);
const failure = code => ({ ok: false, code });
export function validateEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('INVALID_EVENT');
  if (Object.keys(input).some(key => !fields.has(key))) return failure('UNKNOWN_FIELD');
  if (input.v !== 1) return failure('INVALID_VERSION');
  if (!SOURCES.includes(input.source)) return failure('INVALID_SOURCE');
  if (typeof input.session !== 'string' || !input.session.trim() || input.session.length > 256 || /[\x00-\x1f/\\]/u.test(input.session)) return failure('INVALID_SESSION');
  if (!STATES.includes(input.state)) return failure('INVALID_STATE');
  if (!Number.isSafeInteger(input.ts) || input.ts < 0) return failure('INVALID_TIMESTAMP');
  if (input.beat !== undefined && typeof input.beat !== 'boolean') return failure('INVALID_BEAT');
  if(input.source==='typing'&&(!Number.isSafeInteger(input.count)||input.count<0||input.count>1000000||input.beat!==undefined||input.title!==undefined||input.project!==undefined||!['idle','working'].includes(input.state)))return failure('INVALID_TYPING');
  if(input.source!=='typing'&&input.count!==undefined)return failure('INVALID_COUNT');
  if (input.project !== undefined && (typeof input.project !== 'string' || !input.project.trim() || /[/\\:\x00-\x1f]/u.test(input.project) || ['.', '..'].includes(input.project))) return failure('INVALID_PROJECT');
  if (input.title !== undefined) {
    if (typeof input.title !== 'string') return failure('INVALID_TITLE');
    if (/token|key|password|密钥/iu.test(input.title)) return failure('SENSITIVE_TITLE');
    if ([...input.title].length > 40 || /[\x00-\x1f]/u.test(input.title)) return failure('INVALID_TITLE');
  }
  return { ok: true, event: { ...input } };
}
export function effectiveSession(session, now, rules = DEFAULT_RULES) {
  const limits = { ...DEFAULT_RULES, ...rules };
  const age = Math.max(0, now - session.lastSeen);
  let state = session.state;
  let quiet = false;
  let suspectedEnded = session.suspectedEnded ?? false;
  if (state === 'done' && now - session.stateSince >= limits.doneMs) state = 'idle';
  if (state === 'working') {
    if (age > limits.idleMs) { state = 'idle'; suspectedEnded = true; }
    else if (age > limits.quietMs) quiet = true;
  }
  return { ...session, state, quiet, suspectedEnded };
}
export function aggregateSessions(sessions, now = Date.now(), rules = DEFAULT_RULES) {
  const rows = sessions instanceof Map ? [...sessions.values()] : Array.isArray(sessions) ? sessions : Object.values(sessions);
  const active = rows.map(row => effectiveSession(row, now, rules)).filter(row => row.state !== 'offline');
  const state = ['waiting', 'error', 'done', 'working', 'idle'].find(value => active.some(row => row.state === value)) ?? 'idle';
  return { state, quiet: state === 'working' && active.filter(row => row.state === 'working').every(row => row.quiet) };
}
