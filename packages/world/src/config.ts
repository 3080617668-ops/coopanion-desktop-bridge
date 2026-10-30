import type { ConfigGroup } from 'cortico/core/types.ts';
export interface DesktopBridgeConfigSection { enabled: boolean; connectionFile: string; relayPerson: boolean; }
export const DESKTOP_BRIDGE_DEFAULTS: DesktopBridgeConfigSection = { enabled: false, connectionFile: '', relayPerson: true };
export const DESKTOP_BRIDGE_CONFIG_GROUP: ConfigGroup = {
  id: 'world:desktop-bridge', owner: 'world:desktop-bridge',
  schema: { type: 'object', title: '桌面文字桥接', properties: {
    'worlds.desktop-bridge.connectionFile': { type: 'string', title: '本机配对文件', description: 'connector 生成的 connection.json 绝对路径。修改后重启 World。' },
    'worlds.desktop-bridge.relayPerson': { type: 'boolean', title: '转交新输入的文字', description: '只转发启动后的控制台用户文字，需先选择聊天。', 'x-hot': true },
  } },
};
