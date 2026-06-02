#!/usr/bin/env node
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const DEFAULTS = {
  sound: true, voice: true, music_on_done: false, music_file: '',
  sound_urgent: 'default', sound_done: 'default',
  beep_fallback: false, visual_fallback: true,
  voice_urgent: '克劳德需要你操作', voice_done: '这轮完成，请查看',
  phone: {
    provider: 'none', bark_key: '', pushdeer_key: '', serverchan_key: '',
    wecom_webhook: '', ntfy_server: 'https://ntfy.sh', ntfy_topic: '',
    feishu_webhook: '', dingtalk_webhook: '', pushplus_token: '',
    tg_bot_token: '', tg_chat_id: ''
  }
};

const URGENT_EVENTS = ['Notification', 'PermissionRequest', 'Elicitation'];
const DONE_EVENTS = ['Stop', 'SubagentStop'];

const USER_CONFIG = path.join(os.homedir(), '.claude', 'cc-notify', 'config.json');
const BUNDLED_CONFIG = path.join(__dirname, 'config.json');
const SOUNDS_DIR = path.join(__dirname, 'sounds');

const SYS = process.platform;

function projectName(payload) {
  const cwd = payload.cwd || process.cwd();
  try { return path.basename(cwd); } catch { return ''; }
}

function classify(event, payload, cfg) {
  cfg = cfg || DEFAULTS;
  let msg = String(payload.message || payload.last_assistant_message || '').trim();
  if (msg.length > 120) msg = msg.slice(0, 120) + '…';
  const proj = projectName(payload);
  const suffix = proj ? `（项目：${proj}）` : '';
  if (URGENT_EVENTS.includes(event)) {
    return { cls: 'urgent', title: 'Claude Code 需要你',
      body: (msg || '正在等待你的确认或输入') + suffix, speech: cfg.voice_urgent };
  }
  if (DONE_EVENTS.includes(event)) {
    return { cls: 'done', title: 'Claude Code 任务完成',
      body: (msg || '当前任务已结束') + suffix, speech: cfg.voice_done };
  }
  return { cls: 'done', title: 'Claude Code: ' + event,
    body: (msg || event) + suffix, speech: cfg.voice_done };
}

function mergeConfig(user) {
  user = user || {};
  return { ...DEFAULTS, ...user, phone: { ...DEFAULTS.phone, ...(user.phone || {}) } };
}

function loadConfig(paths) {
  const list = paths || [USER_CONFIG, BUNDLED_CONFIG];
  for (const p of list) {
    try {
      const raw = fs.readFileSync(p, 'utf8').replace(/^﻿/, ''); // 去掉 Windows 常见的 UTF-8 BOM
      return mergeConfig(JSON.parse(raw));
    } catch { /* 下一个 */ }
  }
  return mergeConfig({});
}

function resolveSound(cfg, cls) {
  const choice = cls === 'urgent' ? cfg.sound_urgent : cfg.sound_done;
  if (cfg.sound === false || choice === 'off') return [];
  if (choice === 'beep') return [{ type: 'beep', cls }];
  if (choice === 'system') return [{ type: 'system', cls }, { type: 'beep', cls }];
  const wav = path.join(SOUNDS_DIR, cls + '.wav');
  if (choice && choice !== 'default') {
    return [{ type: 'file', file: choice }, { type: 'file', file: wav },
      { type: 'system', cls }, { type: 'beep', cls }];
  }
  return [{ type: 'file', file: wav }, { type: 'system', cls }, { type: 'beep', cls }];
}

function buildPhoneRequest(cfg, c) {
  const p = cfg.phone || {};
  const prov = p.provider || 'none';
  if (prov === 'none') return null;
  const urgent = c.cls === 'urgent';
  const { title, body } = c;

  if (prov === 'bark') {
    const t = encodeURIComponent(title), b = encodeURIComponent(body);
    const level = urgent ? 'timeSensitive' : 'active';
    const extra = urgent ? '&sound=alarm' : '';
    return { method: 'GET',
      url: `https://api.day.app/${p.bark_key}/${t}/${b}?level=${level}&group=ClaudeCode${extra}` };
  }
  if (prov === 'pushdeer') {
    const form = new URLSearchParams({ pushkey: p.pushdeer_key, text: title, desp: body }).toString();
    return { method: 'POST', url: 'https://api2.pushdeer.com/message/push',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form };
  }
  if (prov === 'serverchan') {
    const form = new URLSearchParams({ title, desp: body }).toString();
    return { method: 'POST', url: `https://sctapi.ftqq.com/${p.serverchan_key}.send`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form };
  }
  if (prov === 'wecom') {
    const payload = JSON.stringify({ msgtype: 'text', text: { content: `${title}\n${body}` } });
    return { method: 'POST', url: p.wecom_webhook,
      headers: { 'Content-Type': 'application/json' }, body: payload };
  }
  if (prov === 'ntfy') {
    const server = (p.ntfy_server || 'https://ntfy.sh').replace(/\/+$/, '');
    return { method: 'POST', url: `${server}/${p.ntfy_topic}`,
      headers: { Priority: urgent ? '5' : '3', Tags: urgent ? 'warning' : 'white_check_mark' },
      body: `${title}\n${body}` };
  }
  if (prov === 'feishu') {
    const payload = JSON.stringify({ msg_type: 'text', content: { text: `${title}\n${body}` } });
    return { method: 'POST', url: p.feishu_webhook,
      headers: { 'Content-Type': 'application/json' }, body: payload };
  }
  if (prov === 'dingtalk') {
    const payload = JSON.stringify({ msgtype: 'text', text: { content: `${title}\n${body}` } });
    return { method: 'POST', url: p.dingtalk_webhook,
      headers: { 'Content-Type': 'application/json' }, body: payload };
  }
  if (prov === 'pushplus') {
    const payload = JSON.stringify({ token: p.pushplus_token, title, content: body, template: 'txt' });
    return { method: 'POST', url: 'https://www.pushplus.plus/send',
      headers: { 'Content-Type': 'application/json' }, body: payload };
  }
  if (prov === 'telegram') {
    const payload = JSON.stringify({ chat_id: p.tg_chat_id, text: `${title}\n${body}` });
    return { method: 'POST', url: `https://api.telegram.org/bot${p.tg_bot_token}/sendMessage`,
      headers: { 'Content-Type': 'application/json' }, body: payload };
  }
  return null;
}

function planActions(event, payload, cfg) {
  const c = classify(event, payload, cfg);
  const sound = resolveSound(cfg, c.cls);
  const pureBeep = sound.length === 1 && sound[0].type === 'beep';
  return {
    event, class: c.cls, title: c.title, body: c.body, speech: c.speech,
    sound,
    voice: !!cfg.voice,
    music: { on: c.cls === 'done' && !!cfg.music_on_done, file: cfg.music_file || '' },
    beep_fallback: !!cfg.beep_fallback && sound.length > 0 && !pureBeep,
    visual: !!cfg.visual_fallback && c.cls === 'urgent',
    phone: buildPhoneRequest(cfg, c)
  };
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve({});
    let data = '';
    const done = () => { try { resolve(data.trim() ? JSON.parse(data) : {}); } catch { resolve({}); } };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', done);
    setTimeout(done, 1500);
  });
}

module.exports = { DEFAULTS, mergeConfig, loadConfig, classify, resolveSound, buildPhoneRequest, planActions };

// ── 副作用执行函数 ────────────────────────────────────────────────────────────

function run(cmd, args, timeout) {
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd, args, { windowsHide: true, stdio: 'ignore' });
      const t = setTimeout(() => { try { p.kill(); } catch {} resolve(false); }, timeout || 12000);
      p.on('exit', (code) => { clearTimeout(t); resolve(code === 0); });
      p.on('error', () => { clearTimeout(t); resolve(false); });
    } catch { resolve(false); }
  });
}

function playFile(file) {
  if (SYS === 'win32')
    return run('powershell', ['-NoProfile', '-Command',
      `(New-Object Media.SoundPlayer '${file}').PlaySync()`], 15000);
  if (SYS === 'darwin') return run('afplay', [file], 15000);
  return run('paplay', [file], 15000).then((ok) => ok || run('aplay', [file], 15000));
}

function playSystemSound(cls) {
  if (SYS === 'win32') {
    const snd = cls === 'urgent' ? 'Exclamation' : 'Asterisk';
    return run('powershell', ['-NoProfile', '-Command',
      `[System.Media.SystemSounds]::${snd}.Play(); Start-Sleep -Milliseconds 600`]);
  }
  if (SYS === 'darwin')
    return run('afplay', ['/System/Library/Sounds/' + (cls === 'urgent' ? 'Sosumi.aiff' : 'Glass.aiff')]);
  return run('paplay', ['/usr/share/sounds/freedesktop/stereo/' +
    (cls === 'urgent' ? 'dialog-warning.oga' : 'complete.oga')]);
}

function beep(cls) {
  if (SYS === 'win32') {
    const seq = cls === 'urgent'
      ? '1..2 | %{ [console]::beep(988,160); [console]::beep(1319,160) }'
      : '[console]::beep(523,140); [console]::beep(659,140); [console]::beep(784,140); [console]::beep(1047,260)';
    return run('powershell', ['-NoProfile', '-Command', seq], 6000);
  }
  if (SYS === 'darwin') return run('osascript', ['-e', cls === 'urgent' ? 'beep 3' : 'beep 1'], 6000);
  // linux：终端响铃（多数终端会触发系统提示音）；无控制终端时退回 stderr BEL
  try { fs.writeFileSync('/dev/tty', ''); } catch { try { process.stderr.write(''); } catch {} }
  return Promise.resolve(true);
}

async function playOne(item) {
  try {
    if (item.type === 'file') { if (!fs.existsSync(item.file)) return false; return await playFile(item.file); }
    if (item.type === 'system') return await playSystemSound(item.cls);
    if (item.type === 'beep') return await beep(item.cls);
  } catch { return false; }
  return false;
}

async function playSoundChain(chain) {
  for (const item of chain) { if (await playOne(item)) return; }
}

function speak(text) {
  text = String(text).replace(/['"]/g, '');
  if (SYS === 'win32')
    return run('powershell', ['-NoProfile', '-Command',
      `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${text}')`], 15000);
  if (SYS === 'darwin') return run('say', [text], 15000);
  return run('spd-say', ['-w', text], 15000);
}

function playMusic(file) {
  if (!file) return Promise.resolve(false);
  try { if (!fs.existsSync(file)) return Promise.resolve(false); } catch { return Promise.resolve(false); }
  if (SYS === 'win32') {
    if (file.toLowerCase().endsWith('.wav'))
      return run('powershell', ['-NoProfile', '-Command', `(New-Object Media.SoundPlayer '${file}').PlaySync()`], 60000);
    return run('powershell', ['-NoProfile', '-Command', `Start-Process -FilePath '${file}'`], 8000);
  }
  if (SYS === 'darwin') return run('afplay', [file], 60000);
  return run('paplay', [file], 60000);
}

function httpRequest(reqSpec) {
  return new Promise((resolve) => {
    try {
      const u = new URL(reqSpec.url);
      const lib = u.protocol === 'http:' ? http : https;
      const headers = { ...(reqSpec.headers || {}) };
      if (reqSpec.body) headers['Content-Length'] = Buffer.byteLength(reqSpec.body);
      const req = lib.request(u, { method: reqSpec.method || 'GET', headers, timeout: 8000 },
        (r) => { r.on('data', () => {}); r.on('end', () => resolve(true)); });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
      if (reqSpec.body) req.write(reqSpec.body);
      req.end();
    } catch { resolve(false); }
  });
}

// 可视化兜底：静音/声卡故障时仍能"看到"提醒（跨平台，自动消失）
function showVisual(title, body) {
  const noQuote = (s) => String(s).replace(/"/g, '');
  const noTick = (s) => String(s).replace(/'/g, '');
  if (SYS === 'win32') {
    const ps = 'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;' +
      '$n=New-Object System.Windows.Forms.NotifyIcon;' +
      '$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;' +
      "$n.ShowBalloonTip(5000,'" + noTick(title) + "','" + noTick(body) + "',[System.Windows.Forms.ToolTipIcon]::Info);" +
      'Start-Sleep -Seconds 4;$n.Dispose()';
    return run('powershell', ['-NoProfile', '-Command', ps], 9000);
  }
  if (SYS === 'darwin')
    return run('osascript', ['-e', `display notification "${noQuote(body)}" with title "${noQuote(title)}"`], 6000);
  return run('notify-send', ['-t', '8000', noQuote(title), noQuote(body)], 6000);
}

// ── 主入口 ───────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const ei = argv.indexOf('--event');
  const argEvent = ei >= 0 ? argv[ei + 1] : 'Notification';
  const payload = await readStdin();
  const event = payload.hook_event_name || argEvent;
  const cfg = loadConfig();
  const plan = planActions(event, payload, cfg);

  if (process.env.CC_NOTIFY_DRYRUN === '1') {
    process.stderr.write(JSON.stringify(plan, null, 2) + '\n');
    process.exit(0);
  }

  const phoneP = plan.phone ? httpRequest(plan.phone).catch(() => {}) : Promise.resolve();
  if (plan.sound.length) await playSoundChain(plan.sound).catch(() => {});
  if (plan.beep_fallback) await beep(plan.class).catch(() => {});
  if (plan.visual) await showVisual(plan.title, plan.body).catch(() => {});
  if (plan.voice) await speak(plan.speech).catch(() => {});
  if (plan.music.on) await playMusic(plan.music.file).catch(() => {});
  await Promise.race([phoneP, new Promise((r) => setTimeout(r, 8000))]);
  process.exit(0);
}

if (require.main === module) main();
