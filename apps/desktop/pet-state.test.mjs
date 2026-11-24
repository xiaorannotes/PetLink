import test from 'node:test';
import assert from 'node:assert/strict';
import { displayAction, resolveUserActivity, FLOATING_FEEDBACK_PHRASES } from './pet-state.mjs';

test('real agent work uses its own motion while typing keeps the keyboard animation', () => {
  assert.equal(displayAction({ state: 'working', mode: 'agent', agentWorking: true }), 'agent-working');
  assert.equal(displayAction({ state: 'working', mode: 'agent', agentWorking: false }), 'working');
  assert.equal(displayAction({ state: 'working', mode: 'companion', agentWorking: true }), 'working');
});

test('agent tasks keep their status while idle companion can sleep; touch has priority', () => {
  assert.equal(displayAction({ state: 'working', mode: 'agent', agentWorking: true, keyboardIdleSeconds: 80 }), 'agent-working');
  assert.equal(displayAction({ state: 'waiting', mode: 'agent', keyboardIdleSeconds: 80 }), 'waiting');
  assert.equal(displayAction({ mode: 'agent', keyboardIdleSeconds: 60 }), 'sleep');
  assert.equal(displayAction({ keyboardIdleSeconds: 60 }), 'sleep');
  assert.equal(displayAction({ state: 'working', mode: 'agent', agentWorking: true, interaction: 'pet' }), 'pet');
});

test('R-2 dual-signal fusion: AI done/error/waiting events strictly supersede user away state (even in companion mode)', () => {
  assert.equal(resolveUserActivity({ idleSeconds: 320, typingIdleSeconds: 320 }), 'away');
  assert.equal(resolveUserActivity({ idleSeconds: 45, typingIdleSeconds: 45 }), 'idle');
  assert.equal(resolveUserActivity({ idleSeconds: 2, typingIdleSeconds: 2 }), 'active');

  // Criterion 4: Simulated AI done/error/waiting event while user is away (idle >= 300s)
  for (const mode of ['companion', 'agent']) {
    for (const aiState of ['done', 'error', 'waiting']) {
      assert.equal(
        displayAction({
          state: aiState,
          mode,
          userActivity: 'away',
          keyboardIdleSeconds: 600
        }),
        aiState,
        `AI ${aiState} must supersede away in ${mode} mode`
      );
    }
  }

  // When AI is idle, userActivity drives the pet action
  assert.equal(displayAction({ state: 'idle', mode: 'companion', userActivity: 'active' }), 'working');
  assert.equal(displayAction({ state: 'idle', mode: 'companion', userActivity: 'idle' }), 'idle');
  assert.equal(displayAction({ state: 'idle', mode: 'companion', userActivity: 'away' }), 'sleep');

  // Floating phrases are original and do not copy WindowBuddy
  assert.ok(FLOATING_FEEDBACK_PHRASES.length >= 4);
  assert.ok(FLOATING_FEEDBACK_PHRASES.every(p => !p.includes('功德')));
});
