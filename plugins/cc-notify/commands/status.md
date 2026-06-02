---
description: 查看 cc-notify 当前配置与解析结果
---

帮用户检查 cc-notify 状态：

1. 读取并展示 `~/.claude/cc-notify/config.json`（若不存在，说明在用插件自带默认）。展示各开关（声音/语音/完成音乐）与手机渠道；**不要回显完整密钥**，只显示是否已填。

2. 用 Bash 跑一次 DRYRUN，展示对「完成」事件的解析计划（不会真的发声/推送）：
   - macOS/Linux：`echo '{"hook_event_name":"Stop","message":"状态检查","cwd":"."}' | CC_NOTIFY_DRYRUN=1 node "${CLAUDE_PLUGIN_ROOT}/handler.js" --event Stop`
   - Windows PowerShell：`$env:CC_NOTIFY_DRYRUN=1; '{"hook_event_name":"Stop","message":"状态检查","cwd":"."}' | node "${CLAUDE_PLUGIN_ROOT}/handler.js" --event Stop; Remove-Item Env:CC_NOTIFY_DRYRUN`

3. 把解析出的 class/title/sound 链/phone 是否启用，简要汇报给用户。
