'use strict';
const test = require('node:test');
const assert = require('node:assert');
const m = require('../tools/make-sounds.js');

test('encodeWav: 合法 RIFF/WAVE 头与长度', () => {
  const buf = m.encodeWav(new Float64Array(100));
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WAVE');
  assert.equal(buf.toString('ascii', 12, 16), 'fmt ');
  assert.equal(buf.readUInt32LE(24), m.SAMPLE_RATE);  // 采样率
  assert.equal(buf.readUInt16LE(34), 16);             // 位深
  assert.equal(buf.readUInt16LE(22), 1);              // 单声道
  assert.equal(buf.length, 44 + 100 * 2);             // 头 + PCM
});

test('renderSequence: 时长对应采样数', () => {
  const samples = m.renderSequence([{ at: 0, dur: 0.1, freq: 440 }], 0.2);
  assert.equal(samples.length, Math.ceil(0.2 * m.SAMPLE_RATE));
  assert.ok(samples.some((v) => v !== 0));
});
