---
description: 发送 cc-notify 测试通知（紧急 + 完成两种）
---

用 Bash 依次发送两条测试事件，让用户听到两种不同的提示音与语音：

1. 紧急（需要权限/输入）：
   `echo '{"hook_event_name":"Notification","message":"测试：需要你确认"}' | node "${CLAUDE_PLUGIN_ROOT}/handler.js" --event Notification`

2. 完成：
   `echo '{"hook_event_name":"Stop","message":"测试：任务完成"}' | node "${CLAUDE_PLUGIN_ROOT}/handler.js" --event Stop`

执行后告诉用户：紧急应为「叮—叮」急促双音 + 「克劳德需要你操作」；完成应为上行琴音 + 「任务完成了」。若没声音，提示检查系统音量，或用 /cc-notify:status 查看配置。
