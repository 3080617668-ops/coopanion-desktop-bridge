# 验证记录

验证日期：2026-10-30。World 版本：0.1.1；桌宠：Coopanion 0.2.13。

- corepack pnpm install 成功，锁文件通过供应链策略检查。
- pnpm test：14/14 通过，覆盖回环 WebSocket、配对、来源限制、目标绑定、去重、防重播和 World 契约。
- pnpm typecheck、pnpm build、官方契约接口检查通过。
- 独立安装包使用当前 Coopanion 自带框架解析器成功加载。
- 已在 Coopanion 中实际安装并激活，面板显示“已连接 / 聊天：未选择”。
- 桌面侧 Codex、ChatGPT Work 与已有普通 ChatGPT 专用聊天收发已验证；普通聊天亦在桌面 APP 中核对两轮 BRIDGE_OK 回复。
- 桌宠面板选择聊天后的完整收发由用户接手，尚未收到最终结果。以上不等于完成桌宠端所有功能验收。
- 普通 ChatGPT 新建尚不支持；ChatGPT 新建入口创建 Work 云端聊天。
- Coopanion 当前安装器的本机目录白名单不接受中文，使用英文目录。0.1.1 安装产物不依赖工作区链接或 node_modules。

测试聊天标识、配对文件、运行状态、日志和截图均不随仓库提供。
