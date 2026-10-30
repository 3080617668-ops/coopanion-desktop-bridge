# 来源与许可证

## 官方 World 模板

- 来源：https://github.com/Pal-AI-Lab/Cortico/tree/625904282debe60504117c15ca85df73e1e274db/templates/extension/world
- 固定提交：`625904282debe60504117c15ca85df73e1e274db`
- 许可证：MIT，Copyright (c) 2026 Phantivia。
- 整体复制官方 World 模板后修改，保留原始 LICENSE。框架开发依赖为 `cortico@0.2.10`，实际依赖版本记录在 pnpm-lock.yaml。

## 设计参考

- 桌宠侧：https://github.com/blacksunshy/coopanion-fatfish
- 桌面 Host 侧：https://github.com/blacksunshy/coopanion-connector-dsh/tree/7411a753105ece5e37634a388c39601275bbd26a
- 两仓库声明 AGPL-3.0-or-later。本项目参考其双端桥接思路、会话操作语义和回执机制，没有复制两仓库的实现代码、图片、音频或打包产物，不声称与它们的线协议兼容。

## 桌面适配器

连接方式参照本机 ChatGPT App Tools `26.1023.51421` 已提供的能力：应用注入连接位置、长度前缀 JSON-RPC、工具发现与调用。本项目独立实现客户端，不包含或分发应用自带 server.mjs、二进制或凭据。该接口属于应用内部实现，可能随版本变化；公开的 App Server 是不同接口，不能与之混用。

官方扩展文档：https://github.com/Pal-AI-Lab/Cortico/blob/625904282debe60504117c15ca85df73e1e274db/docs/extensions.md

## npm 依赖

- `ws`：MIT，https://github.com/websockets/ws
- `esbuild`：MIT，https://github.com/evanw/esbuild
- `vitest`：MIT，https://github.com/vitest-dev/vitest
- `tsx`：MIT，https://github.com/privatenumber/tsx
- `typescript`：Apache-2.0，https://github.com/microsoft/TypeScript
- `@types/node`、`@types/ws`：MIT，https://github.com/DefinitelyTyped/DefinitelyTyped

完整依赖及精确版本以 pnpm-lock.yaml 为准，各安装包保留自己的许可证。本项目未使用第三方角色、图片、音乐或语音素材。
