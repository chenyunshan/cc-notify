'use strict';
/*
 * 录制 demo/index.html 为带声音的 MP4（+ 静音 GIF）。
 * 思路：无头 Chrome 经 CDP(Page.startScreencast) 截帧 → ffmpeg 按帧时间戳合成视频
 *       → 把真实 urgent.wav/done.wav 按动画时间轴混成音轨 → 混流为 mp4。
 * 仅用 Node 内置模块（v18+ 的 fetch / v22+ 的全局 WebSocket）+ ffmpeg。
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// ffmpeg 在 PATH 上即可；否则用环境变量 FFMPEG 指定二进制路径。
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEMO_URL = 'file:///' + path.join(ROOT, 'demo', 'index.html').replace(/\\/g, '/');
const FRAMES = path.join(os.tmpdir(), 'ccn-frames');
const SOUNDS = path.join(ROOT, 'plugins', 'cc-notify', 'sounds');
const OUT_MP4 = path.join(ROOT, 'demo', 'cc-notify-demo.mp4');
const OUT_GIF = path.join(ROOT, 'demo', 'cc-notify-demo.gif');

const W = 1180, H = 700;
const PORT = 9222;
const CAPTURE_MS = 15500;  // 截帧时长，足够长以纳入结尾 CTA 卡片
const OUT_SECONDS = 13.5;  // 最终视频时长（音轨补静音到此，混流按此截断）
const URGENT_AT = 3300;    // 与 index.html run() 时间轴对齐（ms）
const DONE_AT = 9300;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[rec]', ...a);

async function fetchJSON(url) {
  const r = await fetch(url);
  return r.json();
}
async function waitPort() {
  for (let i = 0; i < 60; i++) {
    try { await fetchJSON(`http://127.0.0.1:${PORT}/json/version`); return; } catch {}
    await sleep(250);
  }
  throw new Error('Chrome 调试端口未就绪');
}

function cdp(ws) {
  let id = 0; const pending = new Map(); const listeners = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) listeners.forEach(fn => fn(m));
  });
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params }));
  });
  return { send, on: (fn) => listeners.push(fn) };
}

async function capture() {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const userDir = path.join(os.tmpdir(), 'ccn-chrome-' + Date.now());

  log('启动无头 Chrome…');
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
    '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${userDir}`, `--window-size=${W},${H}`, DEMO_URL
  ], { stdio: 'ignore' });

  try {
    await waitPort();
    let target;
    for (let i = 0; i < 40; i++) {
      const list = await fetchJSON(`http://127.0.0.1:${PORT}/json`);
      target = list.find(t => t.type === 'page' && /index\.html/.test(t.url));
      if (target && target.webSocketDebuggerUrl) break;
      await sleep(200);
    }
    if (!target) throw new Error('找不到 demo 页面 target');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const { send, on } = cdp(ws);

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',
      { width: W, height: H, deviceScaleFactor: 1.5, mobile: false });

    const frames = [];
    on((m) => {
      if (m.method === 'Page.screencastFrame') {
        const { data, metadata, sessionId } = m.params;
        frames.push({ ts: metadata.timestamp, buf: Buffer.from(data, 'base64') });
        send('Page.screencastFrameAck', { sessionId });
      }
    });

    log('开始截帧并触发动画…');
    await send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 });
    await send('Runtime.evaluate', { expression: 'run && run()' });
    await sleep(CAPTURE_MS);
    await send('Page.stopScreencast');
    await sleep(150);
    ws.close();

    log(`捕获 ${frames.length} 帧`);
    if (frames.length < 5) throw new Error('截帧太少，录制失败');

    // 写帧 + concat 清单（按时间戳计算每帧时长）
    const list = [];
    const t0 = frames[0].ts;
    for (let i = 0; i < frames.length; i++) {
      const fn = path.join(FRAMES, `f${String(i).padStart(4, '0')}.jpg`);
      fs.writeFileSync(fn, frames[i].buf);
      const dur = i < frames.length - 1 ? Math.max(0.016, frames[i + 1].ts - frames[i].ts) : 0.3;
      list.push(`file '${fn.replace(/\\/g, '/')}'`, `duration ${dur.toFixed(3)}`);
    }
    list.push(`file '${path.join(FRAMES, `f${String(frames.length - 1).padStart(4, '0')}.jpg`).replace(/\\/g, '/')}'`);
    fs.writeFileSync(path.join(FRAMES, 'list.txt'), list.join('\n'));
    return frames.length;
  } finally {
    try { chrome.kill(); } catch {}
  }
}

function ff(args, label) {
  log('ffmpeg ' + label);
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr ? r.stderr.slice(-1200) : r.error); throw new Error('ffmpeg 失败: ' + label); }
}

function encode() {
  const listFile = path.join(FRAMES, 'list.txt');
  const silentMp4 = path.join(FRAMES, 'video.mp4');
  const audioWav = path.join(FRAMES, 'audio.wav');

  ff(['-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', `scale=${W * 1.5}:${H * 1.5}:force_original_aspect_ratio=decrease,fps=30,format=yuv420p`,
    '-movflags', '+faststart', silentMp4], '合成画面');

  const du = (URGENT_AT), dd = (DONE_AT);
  // apad 把音轨补静音到 OUT_SECONDS，避免混流 -shortest 把视频截到「完成音」结束处（丢掉结尾卡片）
  ff(['-y', '-i', path.join(SOUNDS, 'urgent.wav'), '-i', path.join(SOUNDS, 'done.wav'),
    '-filter_complex',
    `[0]adelay=${du}|${du}[a];[1]adelay=${dd}|${dd}[b];[a][b]amix=inputs=2:normalize=0,apad[m]`,
    '-map', '[m]', '-t', String(OUT_SECONDS), '-ar', '44100', audioWav], '合成音轨');

  ff(['-y', '-i', silentMp4, '-i', audioWav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
    '-shortest', OUT_MP4], '混流 MP4');

  // 静音 GIF（给 README 用，缩小尺寸控制体积）
  ff(['-y', '-i', OUT_MP4, '-vf',
    'fps=13,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer',
    OUT_GIF], '导出 GIF');
}

(async () => {
  const n = await capture();
  encode();
  const mp4 = fs.statSync(OUT_MP4).size, gif = fs.statSync(OUT_GIF).size;
  log(`完成：${OUT_MP4} (${(mp4 / 1024).toFixed(0)} KB), ${OUT_GIF} (${(gif / 1024).toFixed(0)} KB), ${n} 帧`);
})().catch((e) => { console.error('[rec] 出错:', e.message); process.exit(1); });
