import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { ToolDef, World, WorldHost, WorldWebUiDecl } from 'cortico/core/types.ts';
import { nowIso } from 'cortico/core/util.ts';
import { BridgeClient } from 'coopanion-connector-desktop/client';
import { DESKTOP_BRIDGE_CONFIG_GROUP, type DesktopBridgeConfigSection } from './config.ts';
const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));
export const DESKTOP_BRIDGE_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  { name: 'desktop_bridge_status', description: '读取桌面桥接的连接与绑定状态。', tags: ['read'], parameters: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'desktop_bridge_send', description: '仅在用户明确要求且该消息尚无转交回执时，将文字交给面板已绑定的聊天。不改变目标，不重发结果未知的消息。', tags: ['write'],
    parameters: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', maxLength: 4000 } }, required: ['text'] } },
];
type Notice = { t: string; text?: string; name?: string; status?: string };
export class DesktopBridgeWorld implements World {
  readonly id = 'desktop-bridge';
  private host?: WorldHost;
  private client?: BridgeClient;
  private timer?: ReturnType<typeof setInterval>;
  private cursor = 0;
  private scanning = false;
  private running = false;
  private lastError = '';
  private recent: { type: string; text: string; at: string }[] = [];
  constructor(private readonly opts: { cfg: DesktopBridgeConfigSection; timezone: string }) {}
  envPromptVars() { return { 'desktop-bridge.status': this.client?.status ? 'connector 已连接，请查看绑定状态。' : '未连接' }; }
  tools(): ToolDef[] {
    return DESKTOP_BRIDGE_TOOL_DECLS.map((decl, index) => ({ ...decl,
      handler: async args => JSON.stringify(index === 0 ? await this.invoke('status', []) : await this.send(String(args.text ?? ''))),
    }));
  }
  webUi(): WorldWebUiDecl {
    return { label: '桌面文字桥接', config: [DESKTOP_BRIDGE_CONFIG_GROUP],
      panels: [{ id: 'bridge', title: '连接与聊天', description: '双向文字桥接，不含语音。' }],
      lamps: [{ label: 'connector', state: this.client?.status ? 'online' : 'offline', hint: this.lastError || '请在桌面助手侧启动 connector' }],
      invoke: async (_panel, method, args) => this.invoke(method, args),
      promptDocs: [{ key: 'worlds.desktop-bridge.envPrompt', title: '桌面桥接 · 环境提示词', description: '文字转交与外部事件处理规则。', path: ENV_PROMPT_FILE,
        role: 'envPrompt', vars: [{ name: 'desktop-bridge.status', description: '当前本机连接状态。' }] }],
    };
  }
  async start(host: WorldHost) {
    this.host = host; this.running = true; this.cursor = host.store.latestCursor();
    await this.push('started', '桌面文字桥接已挂载；请先在面板选择目标聊天。', false);
    if (this.opts.cfg.connectionFile) {
      try { await this.connect(); } catch { this.lastError = '尚未连上 connector，请检查配对文件与启动状态。'; }
    }
    this.timer = setInterval(() => void this.scan().catch(() => { this.lastError = '控制台事件读取失败'; }), 1000);
    this.timer.unref();
  }
  async stop() { this.running = false; clearInterval(this.timer); this.client?.close(); this.client = undefined; }
  private async connect() {
    if (!this.client) {
      this.client = new BridgeClient({ connectionFile: this.opts.cfg.connectionFile });
      this.client.on('notice', (notice: Notice) => { void this.onNotice(notice).catch(() => { this.lastError = '事件投递失败'; }); });
    }
    await this.client.connect(); this.lastError = ''; return this.client;
  }
  private async invoke(method: string, args: unknown[]): Promise<unknown> {
    if (method === 'state') return { connected: Boolean(this.client?.status), status: this.client?.status ?? null, error: this.lastError, recent: this.recent };
    if (!this.running) throw new Error('请先启用 World。');
    const client = await this.connect();
    if (method === 'status' || method === 'refresh') { const status = await client.request('status'); client.status = status; return status; }
    if (method === 'list') return client.request('list-sessions');
    if (method === 'pick') return client.request('pick', { session: args[0], kind: args[1] });
    if (method === 'unpin') return client.request('unpin');
    if (method === 'new') return client.request('new', { kind: args[0], title: args[1], prompt: args[2] });
    if (method === 'send') return this.send(String(args[0] ?? ''));
    throw new Error('不支持的面板操作。');
  }
  private async send(text: string, id = randomUUID()): Promise<unknown> {
    const client = await this.connect(); const session = client.status?.selected?.id;
    if (!session) throw new Error('请先在面板选择聊天。');
    return client.request('say', { text, session }, id);
  }
  private async scan() {
    if (this.scanning || !this.host || !this.running) return;
    this.scanning = true;
    try {
      const latest = this.host.store.latestCursor();
      const upper = Math.min(latest, this.cursor + 200);
      const events = this.host.store.range({ fromCursor: this.cursor + 1, toCursor: upper, limit: 200 });
      for (const event of events) {
        this.cursor = Math.max(this.cursor, event.cursor);
        if (event.type !== 'console.message' || event.origin !== 'internal' || !this.opts.cfg.relayPerson) continue;
        const body = event.meta?.body;
        // console.message.text contains the console PIN marker. Only the raw
        // operator body is allowed across this boundary; never forward text.
        if (!this.client?.status?.selected || typeof body !== 'string' || !body.trim()) continue;
        try { await this.send(body, `console_${event.cursor}_${randomUUID()}`);
          await this.push('receipt', `控制台消息 ${event.cursor} 已交给绑定聊天。`, true);
        } catch { await this.push('error', `控制台消息 ${event.cursor} 未获得接受回执；请在原应用核对，勿自动重发。`, true); }
      }
      this.cursor = Math.max(this.cursor, upper);
    } finally { this.scanning = false; }
  }
  private async onNotice(frame: Notice) {
    if (this.running && ['turn-start', 'turn-end'].includes(frame.t)) {
      await this.push('progress', frame.t === 'turn-start' ? '绑定聊天开始工作。' : '绑定聊天本轮已结束。', false);
      return;
    }
    if (!this.running || !['reply', 'progress', 'tool', 'approval', 'question', 'error'].includes(frame.t)) return;
    const text = frame.t === 'tool' ? `工具：${frame.name ?? 'unknown'}；状态：${frame.status ?? 'observed'}` : frame.text ?? frame.t;
    await this.push(frame.t, text, ['reply', 'approval', 'question', 'error'].includes(frame.t));
  }
  private async push(type: string, text: string, deliver: boolean) {
    this.recent.push({ type, text, at: new Date().toISOString() }); this.recent = this.recent.slice(-40);
    await this.host?.pushEvent({ type: `desktop-bridge.${type}`, ts: nowIso(this.opts.timezone), source: this.id,
      origin: 'external', senderKey: this.id, text }, { deliver, ...(deliver ? { trigger: 'flush' as const } : {}) });
  }
}
