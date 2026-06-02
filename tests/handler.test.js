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

const fs = require('node:fs');
const os = require('node:os');
const pathmod = require('node:path');

test('mergeConfig: 用户值覆盖默认，phone 深合并', () => {
  const m = h.mergeConfig({ voice: false, phone: { provider: 'bark', bark_key: 'k' } });
  assert.equal(m.voice, false);
  assert.equal(m.sound, true);
  assert.equal(m.phone.provider, 'bark');
  assert.equal(m.phone.bark_key, 'k');
  assert.equal(m.phone.ntfy_server, 'https://ntfy.sh');
});

test('loadConfig: 读到第一个可用文件并合并默认', () => {
  const tmp = pathmod.join(os.tmpdir(), 'ccn-test-' + process.pid + '.json');
  fs.writeFileSync(tmp, JSON.stringify({ sound: false }));
  const c = h.loadConfig([tmp]);
  assert.equal(c.sound, false);
  assert.equal(c.voice, true);
  fs.unlinkSync(tmp);
});

test('loadConfig: 全部读不到时回退 DEFAULTS', () => {
  const c = h.loadConfig(['/nonexistent/a.json', '/nonexistent/b.json']);
  assert.deepEqual(c, h.mergeConfig({}));
});

test('resolveSound: 默认 = WAV → 系统 → beep', () => {
  const chain = h.resolveSound(h.DEFAULTS, 'urgent');
  assert.equal(chain.length, 3);
  assert.equal(chain[0].type, 'file');
  assert.ok(chain[0].file.endsWith(pathmod.join('sounds', 'urgent.wav')));
  assert.equal(chain[1].type, 'system');
  assert.equal(chain[2].type, 'beep');
});

test('resolveSound: sound 总开关关 → 空', () => {
  assert.deepEqual(h.resolveSound(h.mergeConfig({ sound: false }), 'done'), []);
});

test('resolveSound: 单项 off → 空', () => {
  assert.deepEqual(h.resolveSound(h.mergeConfig({ sound_done: 'off' }), 'done'), []);
});

test('resolveSound: beep → 仅 beep', () => {
  const chain = h.resolveSound(h.mergeConfig({ sound_urgent: 'beep' }), 'urgent');
  assert.deepEqual(chain, [{ type: 'beep', cls: 'urgent' }]);
});

test('resolveSound: 自定义路径 → 先自定义，再回退默认链', () => {
  const chain = h.resolveSound(h.mergeConfig({ sound_done: 'C:/my.wav' }), 'done');
  assert.equal(chain[0].type, 'file');
  assert.equal(chain[0].file, 'C:/my.wav');
  assert.ok(chain[1].file.endsWith(pathmod.join('sounds', 'done.wav')));
  assert.equal(chain[2].type, 'system');
  assert.equal(chain[3].type, 'beep');
});
