'use strict';
const test = require('node:test');
const assert = require('node:assert');
const h = require('../plugins/cc-notify/handler.js');

test('classify: Notification 归为 urgent，带项目名后缀', () => {
  const c = h.classify('Notification', { message: '需要授权', cwd: 'E:/demo' }, h.DEFAULTS);
  assert.equal(c.cls, 'urgent');
  assert.equal(c.title, 'Claude Code 需要你');
  assert.ok(c.body.includes('需要授权'));
  assert.ok(c.body.includes('（项目：demo）'));
  assert.equal(c.speech, h.DEFAULTS.voice_urgent);
});

test('classify: Stop 归为 done', () => {
  const c = h.classify('Stop', { message: '', cwd: '/home/u/proj' }, h.DEFAULTS);
  assert.equal(c.cls, 'done');
  assert.equal(c.title, 'Claude Code 任务完成');
  assert.ok(c.body.includes('（项目：proj）'));
  assert.equal(c.speech, h.DEFAULTS.voice_done);
});

test('classify: 超长 message 截断到 120 字 + 省略号', () => {
  const long = 'x'.repeat(200);
  const c = h.classify('Notification', { message: long }, h.DEFAULTS);
  assert.ok(c.body.startsWith('x'.repeat(120) + '…'));
});
