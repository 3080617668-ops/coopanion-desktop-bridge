import { describeTools, type WorldDefinition } from 'cortico/world.ts';
import { DESKTOP_BRIDGE_DEFAULTS, type DesktopBridgeConfigSection } from './config.ts';
import { DESKTOP_BRIDGE_TOOL_DECLS, DesktopBridgeWorld } from './world.ts';
export const DESKTOP_BRIDGE: WorldDefinition<DesktopBridgeConfigSection> = {
  id: 'desktop-bridge', label: '桌面文字桥接', defaults: () => ({ ...DESKTOP_BRIDGE_DEFAULTS }),
  create: ctx => new DesktopBridgeWorld({ cfg: ctx.cfg, timezone: ctx.timezone }),
  describe: { tools: describeTools(DESKTOP_BRIDGE_TOOL_DECLS, {
    desktop_bridge_status: '读取连接和聊天绑定状态。',
    desktop_bridge_send: '把用户授权的文字交给已选聊天。',
  }),
    events: ['started', 'reply', 'progress', 'tool', 'approval', 'question', 'error', 'receipt'].map(name => ({
      type: `desktop-bridge.${name}`, description: `桌面桥接 ${name} 通知，仅来自绑定聊天或桥接自身。`,
    })),
  },
};
