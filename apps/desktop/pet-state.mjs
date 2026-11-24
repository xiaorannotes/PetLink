export const FLOATING_FEEDBACK_PHRASES = Object.freeze([
  '灵感 +1 ✨',
  '码力 +1 ⚡',
  '敲敲 ~ 🐾',
  '顺畅 +1 🌸',
  '专注 +1 💡',
  '好耶 +1 🍑'
]);

export function resolveUserActivity({
  idleSeconds = 0,
  typingIdleSeconds = Infinity,
  awayThresholdSeconds = 300,
  activeThresholdSeconds = 10
} = {}) {
  if (idleSeconds >= awayThresholdSeconds) return 'away';
  if (typingIdleSeconds < activeThresholdSeconds) return 'active';
  return 'idle';
}

export function displayAction({
  state = 'idle',
  mode = 'companion',
  agentWorking = false,
  keyboardIdleSeconds = 0,
  userActivity = null,
  awayThresholdSeconds = null,
  interaction = null
} = {}) {
  if (interaction) return interaction;

  // Priority 1: High-priority AI state events (waiting, error, done, or active agent working)
  // always supersede user activity state (even when user is away).
  if (['waiting', 'error', 'done'].includes(state)) {
    return state;
  }
  if (state === 'working' && agentWorking) {
    return mode === 'agent' ? 'agent-working' : 'working';
  }

  // Priority 2: User activity state (active typing / idle / away) drives companion state
  // only when no high-priority AI event is active.
  if (userActivity === 'away') return 'sleep';
  if (userActivity === 'active') return 'working';
  if (userActivity === 'idle') {
    return state === 'working' && !agentWorking ? 'idle' : state;
  }

  // Fallback for legacy callers that only supply keyboardIdleSeconds
  const threshold = Number.isFinite(awayThresholdSeconds) ? awayThresholdSeconds : 60;
  const maySleep = ['idle', 'offline'].includes(state) || (mode !== 'agent' && !agentWorking);
  if (maySleep && keyboardIdleSeconds >= threshold) return 'sleep';
  if (state === 'working' && mode === 'agent' && agentWorking) return 'agent-working';
  return state;
}
