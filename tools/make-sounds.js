'use strict';
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;

function envelope(i, n, sr) {
  const t = i / sr, dur = n / sr, attack = 0.008, release = 0.15;
  if (t < attack) return t / attack;
  if (t > dur - release) return Math.max(0, (dur - t) / release);
  return 1;
}

function renderNote(buf, startSec, durSec, freq) {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const n = Math.floor(durSec * SAMPLE_RATE);
  const harmonics = [[1, 1.0], [2, 0.25], [3, 0.12]];
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    for (const [mult, amp] of harmonics) s += amp * Math.sin(2 * Math.PI * freq * mult * t);
    s *= envelope(i, n, SAMPLE_RATE) * 0.3;
    const idx = start + i;
    if (idx >= 0 && idx < buf.length) buf[idx] += s;
  }
}

function renderSequence(notes, totalSec) {
  const buf = new Float64Array(Math.ceil(totalSec * SAMPLE_RATE));
  for (const note of notes) renderNote(buf, note.at, note.dur, note.freq);
  return buf;
}

function encodeWav(samples) {
  const n = samples.length;
  const buffer = Buffer.alloc(44 + n * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + n * 2, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24); buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buffer;
}

const URGENT = [
  { at: 0.00, dur: 0.18, freq: 988 }, { at: 0.18, dur: 0.20, freq: 1319 },
  { at: 0.42, dur: 0.18, freq: 988 }, { at: 0.60, dur: 0.20, freq: 1319 }
];
const DONE = [
  { at: 0.00, dur: 0.14, freq: 523 }, { at: 0.14, dur: 0.14, freq: 659 },
  { at: 0.28, dur: 0.14, freq: 784 }, { at: 0.42, dur: 0.28, freq: 1047 }
];

function build(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'urgent.wav'), encodeWav(renderSequence(URGENT, 0.85)));
  fs.writeFileSync(path.join(outDir, 'done.wav'), encodeWav(renderSequence(DONE, 0.75)));
}

if (require.main === module) build(path.join(__dirname, '..', 'plugins', 'cc-notify', 'sounds'));
module.exports = { SAMPLE_RATE, envelope, renderNote, renderSequence, encodeWav, build };
