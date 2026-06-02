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
   - 选择手机推送渠道：不需要 / Bark / PushDeer / Server酱 / 企业微信 / ntfy。

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
