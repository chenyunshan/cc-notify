# cc-notify · Claude Code 通知插件

让 Claude Code 不用盯屏。当它**需要权限 / 等待输入 / 任务完成**时，自动用
**精选提示音 + 语音播报 +（可选）音乐 + （可选）手机推送**提醒你。

- 🔔 两类事件，听感分明：紧急（需要你操作）= 明亮「叮—叮」双音；完成 = 上行琴音。
- 🗣️ 语音播报：紧急说「克劳德需要你操作」，完成说「任务完成了」。
- 📱 手机推送：Bark / PushDeer / Server酱 / 企业微信 / ntfy 任选其一。
- 🪟 跨平台：Windows / macOS / Linux。零运行时依赖（仅用 Node 内置模块）。
- 😴 傻瓜：装好声音/语音即用；手机推送一条命令搞定，全程不用手改文件。

## 安装

在 Claude Code 里执行两行：

```text
/plugin marketplace add chenyunshan/cc-notify
/plugin install cc-notify@cc-notify
```

装好后**声音和语音立即生效**，hooks 已随插件自动注册，无需改任何配置文件。

## 配手机推送（可选）

想在手机上也收到提醒，运行：

```text
/cc-notify:setup
```

我会弹出菜单问你选哪个渠道、粘贴密钥，然后自动写好配置并发一条测试通知确认。

## 命令

| 命令 | 作用 |
|---|---|
| `/cc-notify:setup` | 交互式配置声音/语音/音乐与手机推送（傻瓜，不用改文件） |
| `/cc-notify:test` | 发两条测试通知（紧急 + 完成），两种声音都听一遍 |
| `/cc-notify:status` | 查看当前开关与渠道、解析结果（不回显完整密钥） |

## 配置项

配置文件：`~/.claude/cc-notify/config.json`（由 `/cc-notify:setup` 写入；不存在时用插件自带默认）。

| 字段 | 默认 | 说明 |
|---|---|---|
| `sound` | `true` | 提示音总开关 |
| `voice` | `true` | 语音播报总开关 |
| `music_on_done` | `false` | 任务完成时播放音乐 |
| `music_file` | `""` | 音乐文件绝对路径（`.wav` 最稳） |
| `sound_urgent` | `"default"` | 紧急提示音：`default`(内置WAV) / `system` / `beep` / `off` / 自定义 wav 路径 |
| `sound_done` | `"default"` | 完成提示音：同上 |
| `beep_fallback` | `false` | 硬件蜂鸣兜底：紧急/完成额外用 PC 蜂鸣器响一声（见下「静音 / 声卡故障」） |
| `visual_fallback` | `false` | 可视化弹窗兜底：仅紧急事件弹系统通知（静音也看得到） |
| `voice_urgent` | `"克劳德需要你操作"` | 紧急播报短句 |
| `voice_done` | `"任务完成了"` | 完成播报短句 |
| `phone.provider` | `"none"` | `none`/`bark`/`pushdeer`/`serverchan`/`wecom`/`ntfy` |
| `phone.bark_key` | `""` | Bark 的 key |
| `phone.pushdeer_key` | `""` | PushDeer 的 pushkey |
| `phone.serverchan_key` | `""` | Server酱 的 SendKey |
| `phone.wecom_webhook` | `""` | 企业微信群机器人 Webhook URL |
| `phone.ntfy_server` | `"https://ntfy.sh"` | ntfy 服务器（可自托管） |
| `phone.ntfy_topic` | `""` | ntfy 主题名（自定义唯一字符串） |

提示音播放采用**回退链**：内置 WAV → 系统提示音 → 程序蜂鸣，任何环境都至少有声音。

### 静音 / 声卡故障 怎么办

- **声卡故障 / 缺失**：回退链会自动退到程序蜂鸣（Windows 走 PC 蜂鸣器，有硬件蜂鸣器的机器能听到）。
- **仅静音**（设备正常、音量为 0 或被 mute）：WAV 会「成功」播放但听不到，本地声音无法可靠兜底。此时：
  - 打开 `beep_fallback`：紧急/完成额外用 PC 蜂鸣器响一声（台式机蜂鸣器独立于声卡，静音也可能听到；多数笔记本无蜂鸣器则退回系统提示音）。
  - 打开 `visual_fallback`：紧急事件弹系统通知 / 消息框，静音也看得到。
  - **最可靠**：配置**手机推送**（ntfy / Bark 等）——完全独立于本地音频，静音、坏卡、人不在电脑前都能收到。
- 跨平台实现：蜂鸣 Windows=`console.beep`（PC 蜂鸣器）/ macOS=`osascript beep` / Linux=终端响铃；弹窗 Windows=`msg` / macOS=通知中心 / Linux=`notify-send`。

## 自检

不发声、不推送，只打印解析计划（确认逻辑无误）：

```bash
echo '{"hook_event_name":"Stop","message":"hi"}' | CC_NOTIFY_DRYRUN=1 node plugins/cc-notify/handler.js --event Stop
```

跑单元测试：

```bash
npm test    # 等价于 node --test
```

## 卸载

```text
/plugin uninstall cc-notify@cc-notify
```

hooks 随插件一并移除，干净利落。

## 工作原理

插件向 Claude Code 注册了两个 hook：`Notification`（含权限请求 / 等待输入）与 `Stop`（回合结束 / 任务完成）。事件触发时，`handler.js` 读取事件 JSON 与配置，分类为「紧急 / 完成」，再分发到提示音、语音、（可选）音乐与手机推送。本地提示同步执行，手机推送后台并发，全程超时兜底，**绝不卡住会话**。

---

## English

**cc-notify** is a Claude Code plugin that frees you from watching the screen. When Claude Code **needs permission, waits for input, or finishes a task**, it alerts you with a curated sound, spoken voice, optional music, and an optional phone push.

### Install

```text
/plugin marketplace add chenyunshan/cc-notify
/plugin install cc-notify@cc-notify
```

Sound and voice work immediately — hooks are registered automatically, no config editing needed.

### Configure phone push (optional)

Run `/cc-notify:setup`; it asks which channel you want (Bark / PushDeer / ServerChan / WeCom / ntfy), takes your key, writes the config, and sends a test notification.

### Commands

- `/cc-notify:setup` — interactive setup for sound/voice/music/phone (no file editing).
- `/cc-notify:test` — send two test notifications (urgent + done).
- `/cc-notify:status` — show current settings and the resolved plan.

### Notes

- Cross-platform (Windows / macOS / Linux), zero runtime dependencies (Node built-ins only).
- Config file: `~/.claude/cc-notify/config.json`.
- Sound playback falls back: bundled WAV → system sound → programmatic beep.
- Self-check (no sound/push): `echo '{"hook_event_name":"Stop"}' | CC_NOTIFY_DRYRUN=1 node plugins/cc-notify/handler.js --event Stop`

MIT License.
