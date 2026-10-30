# cortico-world-desktop-bridge

Coopanion World 扩展，契约 api 6。连接本机桌面 connector，提供文字转发、回复与工作状态通知，以及聊天选择、新建、固定和解除固定面板，不包含语音功能。

开发时在项目根目录运行 `corepack pnpm install`、`pnpm test`、`pnpm build`。将生成的 `install/world` 复制到纯英文路径（本机使用 `C:/CoopanionBridge/world`），再在 Coopanion 中从该目录安装。安装包已包含后端、面板和 WebSocket 客户端，无须复制 node_modules 或开发工作区。宿主提供 Cortico 框架。

配置段：`worlds.desktop-bridge`。默认禁用，`connectionFile` 指向 connector 生成的本机配对文件，`relayPerson` 控制是否自动转交控制台新输入。没有配对配置时仍能安全构造。

聊天选择即固定；解除固定后重新显式选择，不猜测当前鼠标所在聊天。批准在原应用处理。ChatGPT 新建入口为 Work 云端聊天，普通 ChatGPT 新建尚不支持。完整使用、限制及数据流说明见项目根目录 README.md。

工具：`desktop_bridge_status`、`desktop_bridge_send`。事件：`desktop-bridge.started/reply/progress/tool/approval/question/error/receipt`。

Coopanion 可能把接收事件保存到部署事件流并传给已配置模型，请仅输入你愿意交给该模型处理的消息。本扩展不读取登录凭据与 API Key。来源与许可见 THIRD_PARTY_NOTICES.md 和 LICENSE。
