import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent, STATES, SOURCES, aggregateSessions, effectiveSession } from './index.mjs';
const valid = { v: 1, source: 'codex', session: '一号', state: 'working', ts: 1000 };
for (const state of STATES) test(`合法状态：${state}`, () => assert.equal(validateEvent({ ...valid, state }).ok, true));
for (const source of SOURCES) test(`合法来源：${source}`, () => assert.equal(validateEvent({ ...valid, source, ...(source==='typing'?{count:0}:{}) }).ok, true));
for (const [field, values, code] of [
  ['v', [undefined, 2, '1'], 'INVALID_VERSION'],
  ['source', [undefined, 'other', 1], 'INVALID_SOURCE'],
  ['session', [undefined, '', ' ', 1, 'a/b'], 'INVALID_SESSION'],
  ['state', [undefined, 'unknown', 1], 'INVALID_STATE'],
  ['ts', [undefined, -1, 1.5, Infinity, '1000'], 'INVALID_TIMESTAMP'],
  ['project', ['/tmp/a', 'a/b', 'a\\b', '.', '..', '', 1, 'C:foo'], 'INVALID_PROJECT'],
  ['title', ['字'.repeat(41), 1, '换\n行'], 'INVALID_TITLE'],
  ['beat', [1, 'true', null], 'INVALID_BEAT']
]) for (const value of values) test(`拒绝字段 ${field}：${String(value)}`, () => assert.equal(validateEvent({ ...valid, [field]: value }).code, code));
for (const title of ['TOKEN=abc', 'apiKey', 'Password', '我的密钥']) test(`拒绝敏感标题：${title}`, () => assert.equal(validateEvent({ ...valid, title }).code, 'SENSITIVE_TITLE'));
test('对象类型与额外字段', () => { for (const input of [null, [], 'a']) assert.equal(validateEvent(input).ok, false); assert.equal(validateEvent({ ...valid, password: '秘密' }).code, 'UNKNOWN_FIELD'); });
test('可选字段与 Unicode 长度', () => assert.equal(validateEvent({ ...valid, project: '项目', title: '🐱'.repeat(40), beat: false }).ok, true));
const row = state => ({ state, lastSeen: 1000, stateSince: 1000 });
const order = ['waiting', 'error', 'done', 'working', 'idle'];
for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) test(`优先级 ${order[i]} > ${order[j]}`, () => assert.equal(aggregateSessions([row(order[j]), row(order[i]), row('offline')], 1000).state, order[i]));
test('完成窗口到期回落且不修改输入', () => { const input = [row('done'), row('working')]; assert.equal(aggregateSessions(input, 8999).state, 'done'); assert.equal(aggregateSessions(input, 9000).state, 'working'); assert.equal(aggregateSessions([row('done')], 9000).state, 'idle'); assert.equal(input[0].state, 'done'); });
test('空表与离线不参与', () => { assert.equal(aggregateSessions([], 1000).state, 'idle'); assert.equal(aggregateSessions(new Map([['a', row('offline')]]), 1000).state, 'idle'); });
test('陈旧边界、等待不降级', () => { assert.equal(effectiveSession(row('working'), 91000).quiet, false); assert.equal(effectiveSession(row('working'), 91001).quiet, true); assert.equal(effectiveSession(row('working'), 601000).state, 'working'); assert.equal(effectiveSession(row('working'), 601001).suspectedEnded, true); assert.equal(effectiveSession(row('waiting'), 9999999).state, 'waiting'); });
