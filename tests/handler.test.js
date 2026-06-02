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

test('loadConfig: 容忍 UTF-8 BOM（Windows 常见）', () => {
  const tmp = pathmod.join(os.tmpdir(), 'ccn-bom-' + process.pid + '.json');
  fs.writeFileSync(tmp, '﻿' + JSON.stringify({ voice: false }));
  const c = h.loadConfig([tmp]);
  assert.equal(c.voice, false);
  assert.equal(c.sound, true);
  fs.unlinkSync(tmp);
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

const URGENT_C = { cls: 'urgent', title: 'T', body: 'B' };
const DONE_C = { cls: 'done', title: 'T', body: 'B' };

test('buildPhoneRequest: none → null', () => {
  assert.equal(h.buildPhoneRequest(h.DEFAULTS, URGENT_C), null);
});

test('buildPhoneRequest: bark urgent 带 alarm 与 timeSensitive', () => {
  const r = h.buildPhoneRequest(h.mergeConfig({ phone: { provider: 'bark', bark_key: 'KEY' } }), URGENT_C);
  assert.equal(r.method, 'GET');
  assert.ok(r.url.startsWith('https://api.day.app/KEY/'));
  assert.ok(r.url.includes('level=timeSensitive'));
  assert.ok(r.url.includes('sound=alarm'));
  assert.ok(r.url.includes('group=ClaudeCode'));
});

test('buildPhoneRequest: pushdeer POST form', () => {
  const r = h.buildPhoneRequest(h.mergeConfig({ phone: { provider: 'pushdeer', pushdeer_key: 'PK' } }), DONE_C);
  assert.equal(r.method, 'POST');
  assert.equal(r.url, 'https://api2.pushdeer.com/message/push');
  assert.ok(r.body.includes('pushkey=PK'));
});

test('buildPhoneRequest: serverchan URL 带 key', () => {
  const r = h.buildPhoneRequest(h.mergeConfig({ phone: { provider: 'serverchan', serverchan_key: 'SK' } }), DONE_C);
  assert.equal(r.url, 'https://sctapi.ftqq.com/SK.send');
});

test('buildPhoneRequest: wecom JSON', () => {
  const r = h.buildPhoneRequest(h.mergeConfig({ phone: { provider: 'wecom', wecom_webhook: 'https://wx/x' } }), DONE_C);
  assert.equal(r.url, 'https://wx/x');
  assert.equal(r.headers['Content-Type'], 'application/json');
  assert.ok(r.body.includes('msgtype'));
});

test('buildPhoneRequest: ntfy 拼 server/topic 与 Priority', () => {
  const r = h.buildPhoneRequest(h.mergeConfig({ phone: { provider: 'ntfy', ntfy_topic: 'mytopic' } }), URGENT_C);
  assert.equal(r.url, 'https://ntfy.sh/mytopic');
  assert.equal(r.headers.Priority, '5');
});

test('planActions: 组合分类/声音/语音/音乐/推送', () => {
  const cfg = h.mergeConfig({ music_on_done: true, music_file: 'm.wav',
    phone: { provider: 'ntfy', ntfy_topic: 't' } });
  const plan = h.planActions('Stop', { message: 'done', cwd: '/a/b' }, cfg);
  assert.equal(plan.class, 'done');
  assert.equal(plan.voice, true);
  assert.equal(plan.music.on, true);
  assert.equal(plan.music.file, 'm.wav');
  assert.ok(Array.isArray(plan.sound));
  assert.equal(plan.phone.url, 'https://ntfy.sh/t');
});

test('planActions: 紧急事件不放完成音乐', () => {
  const cfg = h.mergeConfig({ music_on_done: true, music_file: 'm.wav' });
  const plan = h.planActions('Notification', {}, cfg);
  assert.equal(plan.music.on, false);
});

test('DRYRUN: handler 子进程输出计划到 stderr 且退出 0', () => {
  const { spawnSync } = require('node:child_process');
  const handler = pathmod.join(__dirname, '..', 'plugins', 'cc-notify', 'handler.js');
  const r = spawnSync(process.execPath, [handler, '--event', 'Notification'],
    { input: JSON.stringify({ hook_event_name: 'Notification', message: '需要授权', cwd: 'E:/demo' }),
      env: { ...process.env, CC_NOTIFY_DRYRUN: '1' }, encoding: 'utf8' });
  assert.equal(r.status, 0);
  const plan = JSON.parse(r.stderr);
  assert.equal(plan.class, 'urgent');
  assert.ok(plan.title.includes('需要你'));
});

test('planActions: beep_fallback 默认关 → false', () => {
  assert.equal(h.planActions('Notification', {}, h.DEFAULTS).beep_fallback, false);
});

test('planActions: beep_fallback 开 → urgent 与 done 都额外蜂鸣', () => {
  const cfg = h.mergeConfig({ beep_fallback: true });
  assert.equal(h.planActions('Notification', {}, cfg).beep_fallback, true);
  assert.equal(h.planActions('Stop', {}, cfg).beep_fallback, true);
});

test('planActions: beep_fallback 开 + 纯 beep 模式 → 不重复蜂鸣', () => {
  const cfg = h.mergeConfig({ beep_fallback: true, sound_urgent: 'beep' });
  assert.equal(h.planActions('Notification', {}, cfg).beep_fallback, false);
});

test('planActions: beep_fallback 开 + sound 总关 → false', () => {
  const cfg = h.mergeConfig({ beep_fallback: true, sound: false });
  assert.equal(h.planActions('Notification', {}, cfg).beep_fallback, false);
});

test('planActions: visual_fallback 开 → 仅 urgent 弹窗', () => {
  const cfg = h.mergeConfig({ visual_fallback: true });
  assert.equal(h.planActions('Notification', {}, cfg).visual, true);
  assert.equal(h.planActions('Stop', {}, cfg).visual, false);
});
