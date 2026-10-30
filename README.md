# Coopanion 桌面文字桥接

包含官方模板派生的 `cortico-world-desktop-bridge`、本机 `coopanion-connector-desktop` 和助手侧配套 Skill。没有语音合成、朗读或录音，不发布到 npm。

## 当前可用范围

- 已对当前桌面应用验证：列出 ChatGPT/Codex 聊天、绑定指定聊天、Codex 新建并回传测试回复、ChatGPT Work 续聊及回复回传。
- 选择聊天即固定。解除固定会清空两端绑定，必须重新选择；没有可靠的静默窗口导航事件，因此不自动跟随鼠标切换。
- 进度通过选定聊天的只读快照轮询，约 1.8 秒一次。能观察到的短事件可能在轮询间隔内结束；不宣称获得完整实时工具事件流。
- 批准与提问只作通知，请回原应用处理；不自动批准。
- ChatGPT 的“新建”入口请求创建 **Work 云端聊天**。验收时创建成功，但首次返回标识格式未识别；已增加标识适配，后续更新若仍无法识别会明确报错，请刷新选择刚创建的聊天，勿再次点击新建。
- **普通 ChatGPT 新建聊天尚不支持。** 已对现有普通 ChatGPT 专用测试聊天验证续聊、回复回传，并在桌面 APP 界面核对两轮测试回复。
- 本项目使用当前应用注入的 App Tools 内部连接，未接管公开 App Server 或另开模型后端；应用升级可能需要适配。当前注入信息缺失时停止并报错。

## 安装与试用

需要 Node.js ≥22。先在本项目根目录运行：

```powershell
corepack pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm --filter cortico-world-desktop-bridge check:extension
```

当前电脑已经安装依赖并完成这些检查，不必为试用重复下载。

1. 在本机 ChatGPT/Codex 桌面助手中说：“使用 `$coopanion-desktop-bridge` 启动本机 connector。”助手从当前应用启动 `node scripts/service.mjs start`。需要保留原应用运行；普通独立终端通常没有应用注入的连接信息。
2. 打开 **Coopanion → 扩展 → World → 手动安装／本机目录**，选择：

   `C:/CoopanionBridge/world`

   此目录应使用项目 `pnpm build` 生成的 `install/world` 内容。Coopanion 0.2.13 的本机安装路径校验仅接受英文等指定字符，因此不要直接选包含中文的源码路径。独立安装包包含所需运行代码，不需要复制 node_modules。

3. 安装后重启 Coopanion，在 World 总览启用“桌面文字桥接”。配置“本机配对文件”为：

   `C:/CoopanionBridge\.bridge-state\connection.json`

4. 配对文件配置改变后重新启用 World。在“连接与聊天”面板点“刷新测试”，再点“选择聊天”并选择目标。选择即固定。
5. 先用两条验收聊天试发一句普通文字，核对原应用中的目标、收到的消息和面板中的新回复。面板发送到绑定聊天；启用“转交新输入的文字”后，Coopanion 控制台的新用户输入也自动转交。桌宠自己的台词和桌面回复不会自动再次转发。

本机目录是链接安装，请保留上面的英文安装目录。修改源码后运行 `pnpm build`，把 `install/world` 的产物更新到英文安装目录，再重启 Coopanion。0.1.1 起安装包不依赖开发工作区，运行入口为 `dist/index.js`；Cortico 由宿主提供。

## 启停与诊断

在桌面助手的本机执行环境中，从项目根目录运行：

```powershell
pnpm doctor
pnpm start
node scripts/control.mjs status
node scripts/control.mjs list
pnpm stop
```

`doctor` 只显示工具能力、聊天计数和当前聊天是否可见，不输出标题、正文或连接能力值。服务启动器隐藏后台窗口，只有握手验证通过才报告启动成功。

不要自动重试“结果未知”的发送或新建请求；先在原应用核对。端口冲突时不要结束未知进程。应用重启后若连接失效，先停止旧 connector，再从桌面助手重新启动；令牌随启动重新生成，重新连接后需重新选聊天。

## 网络、文件与隐私边界

- Connector 只监听 `127.0.0.1:19487`，WebSocket 为 `/coopanion/pet`；本机控制入口 `/coopanion/control`、状态入口 `/coopanion/status` 和停止入口 `/coopanion/shutdown` 均需本机配对认证。拒绝带 Origin 的浏览器请求、错误 Host 及未配对请求。
- 配对文件是本扩展自己生成的随机本机能力，**不是模型 API Key**。不要上传或分享 `.bridge-state`、`.acceptance` 或其中的 connection.json。没有读取浏览器 Cookie、应用登录令牌或 API Key 的代码。
- `.bridge-state/connection.json` 保存本机地址与配对值；`dedupe.json` 只保存请求内容哈希、处理状态和聊天 ID；`service.json` 保存后台进程元数据。不持久化 connector 收到的聊天正文。
- 选择器通过原应用获取列表，向桌宠仅传必要的标题、ID、来源与状态。列表当前为最近50条加置顶，非全部历史聊天；选择后只观察绑定聊天的新消息，不扫描其他聊天正文。
- 原应用的读取接口会返回所选聊天的最新一轮，连接或重连时只建立基线，不回放旧回复。工具命令、参数值、文件改动正文和推理内容不进入桥接通知。
- Coopanion 自身会按框架规则保存收到的事件，并可能把事件送给它配置的模型。因此输入文字、转交回复和进度文字可能进入 **Coopanion 当前模型服务**。该服务地址由你的现有 Coopanion 配置决定，本扩展不读取它的密钥，也没有新增第三方模型地址。
- 安装依赖访问 npm；开发时下载模板访问 GitHub；聊天模型联网由原应用负责。本扩展没有新增云端转发服务。

## 验证记录

`VALIDATION.md` 列出检查与真实收发结果。0.1.1 已在 Coopanion 0.2.13 完成实际安装、激活和面板连接检查，显示“已连接 / 聊天：未选择”。从桌宠面板选择聊天后的完整收发验收由用户接手，尚未收到最终反馈。

来源和许可见 `THIRD_PARTY_NOTICES.md`；官方模板的 MIT 许可保存在 `LICENSE`。本项目未复制 fatfish 或 DSH connector 的实现代码。
