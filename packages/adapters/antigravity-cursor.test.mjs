import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { translateHook as translateAntigravity } from './antigravity.mjs';
import { translateHook as translateCursor } from './cursor.mjs';
import { parseAntigravityStep } from './auto-detector.mjs';
import { createConfigManager as createAntigravityManager } from '../config-manager/antigravity-hooks.mjs';
import { createConfigManager as createCursorManager } from '../config-manager/cursor-hooks.mjs';

test('antigravity translateHook maps lifecycle events to normalized states', () => {
  assert.equal(translateAntigravity({ event: 'UserPromptSubmit', session_id: 'ag-1' }).state, 'working');
  assert.equal(translateAntigravity({ hook_event_name: 'PreToolUse', session_id: 'ag-1' }).state, 'working');
  assert.equal(translateAntigravity({ hook_event_name: 'PermissionRequest', session_id: 'ag-1' }).state, 'waiting');
  assert.equal(translateAntigravity({ hook_event_name: 'Stop', session_id: 'ag-1' }).state, 'done');
  assert.equal(translateAntigravity({ hook_event_name: 'StopFailure', session_id: 'ag-1' }).state, 'error');
});

test('cursor translateHook maps cursor lifecycle events to normalized states', () => {
  assert.equal(translateCursor({ hook_event_name: 'beforeSubmitPrompt', conversation_id: 'cur-1' }).state, 'working');
  assert.equal(translateCursor({ hook_event_name: 'preToolUse', conversation_id: 'cur-1' }).state, 'working');
  assert.equal(translateCursor({ hook_event_name: 'stop', conversation_id: 'cur-1' }).state, 'done');
  assert.equal(translateCursor({ hook_event_name: 'stop', status: 'error', conversation_id: 'cur-1' }).state, 'error');
});

test('parseAntigravityStep extracts metadata-only state transitions from transcript lines', () => {
  assert.equal(parseAntigravityStep(JSON.stringify({ type: 'USER_INPUT', status: 'DONE' })).state, 'working');
  assert.equal(
    parseAntigravityStep(JSON.stringify({ type: 'PLANNER_RESPONSE', status: 'DONE', tool_calls: [{ name: 'ask_question' }] })).state,
    'waiting'
  );
  assert.equal(
    parseAntigravityStep(JSON.stringify({ type: 'PLANNER_RESPONSE', status: 'DONE', tool_calls: [{ name: 'edit_file' }] })).state,
    'working'
  );
  assert.equal(
    parseAntigravityStep(JSON.stringify({ type: 'PLANNER_RESPONSE', status: 'DONE', tool_calls: [] })).state,
    'done'
  );
  assert.equal(
    parseAntigravityStep(JSON.stringify({ type: 'PLANNER_RESPONSE', status: 'ERROR' })).state,
    'error'
  );
});

test('antigravity and cursor config managers enable idempotently and restore cleanly on disable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'petlink-hooks-'));
  const agManager = createAntigravityManager({
    settingsPath: path.join(dir, 'ag', 'settings.json'),
    dataDir: path.join(dir, 'data-ag')
  });
  await agManager.enable();
  await agManager.enable();
  assert.equal((await agManager.status()).installed, true);
  await agManager.disable();
  assert.equal((await agManager.status()).installed, false);

  const curManager = createCursorManager({
    settingsPath: path.join(dir, 'cursor', 'hooks.json'),
    dataDir: path.join(dir, 'data-cursor')
  });
  await curManager.enable();
  await curManager.enable();
  assert.equal((await curManager.status()).installed, true);
  await curManager.disable();
  assert.equal((await curManager.status()).installed, false);
});
