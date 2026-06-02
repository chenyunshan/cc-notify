---
description: 配置 cc-notify 的声音/语音/音乐与手机推送（交互式）
---

你要帮用户配置 cc-notify。**全程不要让用户手改文件**，用 AskUserQuestion 收集选择，最后由你写入配置并发测试。

步骤：

1. 读取现有配置（若存在）：`~/.claude/cc-notify/config.json`。读不到就用默认：
   sound=true, voice=true, music_on_done=false, phone.provider="none"。

2. 用 AskUserQuestion 依次确认（可合并为一次多问）：
   - 是否开启提示音？（默认 开）
   - 是否开启语音播报？（默认 开）
   - 任务完成时是否播放音乐？（默认 关；若开，再问音乐文件绝对路径，.wav 最稳）
   - 硬件蜂鸣兜底 beep_fallback？（默认 关。开启后紧急/完成会额外用 PC 蜂鸣器响一声；台式机有蜂鸣器时即使系统静音/声卡故障也可能听到。代价：正常机器会「WAV+蜂鸣」双响。）
   - 可视化弹窗兜底 visual_fallback？（默认 关。开启后仅「需要权限/输入」的紧急事件弹一个系统通知/消息框，静音也看得到。）
   - 选择手机推送渠道：不需要 / Bark / PushDeer / Server酱 / 企业微信 / ntfy。
     （请提示用户：手机推送是「静音 / 声卡故障 / 人不在电脑前」时最可靠的兜底，建议至少配一个；ntfy 免费免注册、最易上手。）

3. 若选了手机渠道，向用户索取对应凭据（提示在终端粘贴）：
   - Bark：bark_key
   - PushDeer：pushdeer_key
   - Server酱：serverchan_key
   - 企业微信：wecom_webhook（群机器人 URL）
   - ntfy：ntfy_server（默认 https://ntfy.sh）与 ntfy_topic（自定义唯一字符串）

4. 把结果**合并**写入 `~/.claude/cc-notify/config.json`（不存在则创建目录）。完整结构如下，未涉及的字段保留原值或默认：
   ```json
   {
     "sound": true,
     "voice": true,
     "music_on_done": false,
     "music_file": "",
     "sound_urgent": "default",
     "sound_done": "default",
     "beep_fallback": false,
     "visual_fallback": false,
     "voice_urgent": "克劳德需要你操作",
     "voice_done": "任务完成了",
     "phone": {
       "provider": "none",
       "bark_key": "",
       "pushdeer_key": "",
       "serverchan_key": "",
       "wecom_webhook": "",
       "ntfy_server": "https://ntfy.sh",
       "ntfy_topic": ""
     }
   }
   ```

5. 用 Bash 发一条测试通知确认生效：
   `echo '{"hook_event_name":"Notification","message":"cc-notify 测试通知"}' | node "${CLAUDE_PLUGIN_ROOT}/handler.js" --event Notification`
   告诉用户应当听到提示音 + 语音；若配了手机渠道，应收到一条推送。

6. 简要回报最终配置（不要回显完整密钥，只显示渠道名与是否已填 key）。
