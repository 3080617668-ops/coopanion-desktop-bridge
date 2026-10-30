import net from 'node:net';
import { randomUUID } from 'node:crypto';

// Adapter for the installed desktop app's injected capability. Never discover
// other processes' pipes or read credentials. This interface is version specific.
export class AppTools {
  constructor({ pipePath = process.env.CODEX_APP_TOOLS_PIPE_PATH,
    threadId = process.env.CODEX_THREAD_ID, timeoutMs = 60000 } = {}) {
    this.pipePath = pipePath;
    this.threadId = threadId;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.nextId = 0;
    this.buffer = Buffer.alloc(0);
  }
  async connect() {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;
    if (!this.pipePath || !this.threadId) throw new Error('请从桌面端 Skill 启动 connector；缺少应用注入的连接信息。');
    this.connecting = new Promise((resolve, reject) => {
      const socket = net.connect(this.pipePath);
      const timer = setTimeout(() => socket.destroy(new Error('桌面连接超时')), this.timeoutMs);
      socket.once('connect', () => { clearTimeout(timer); this.socket = socket; resolve(); });
      socket.on('data', chunk => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (this.buffer.length >= 4) {
          const size = this.buffer.readUInt32LE();
          if (!size || size > 8 * 1024 * 1024) { socket.destroy(new Error('无效应用响应')); return; }
          if (this.buffer.length < size + 4) break;
          let msg;
          try { msg = JSON.parse(this.buffer.subarray(4, size + 4).toString('utf8')); }
          catch { socket.destroy(new Error('无效应用响应')); return; }
          this.buffer = this.buffer.subarray(size + 4);
          const item = this.pending.get(msg.id);
          if (!item) continue;
          this.pending.delete(msg.id);
          clearTimeout(item.timer);
          msg.error ? item.reject(new Error('桌面应用拒绝请求，请在原应用查看状态。')) : item.resolve(msg.result);
        }
      });
      socket.on('error', () => { clearTimeout(timer); reject(new Error('无法连接桌面应用；请从该应用重新启动 connector。')); });
      socket.on('close', () => {
        clearTimeout(timer);
        this.socket = undefined;
        this.buffer = Buffer.alloc(0);
        for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('桌面连接已断开；发送结果可能未知，请勿自动重发。')); }
        this.pending.clear();
      });
    }).finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
  async request(method, params) {
    await this.connect();
    const id = ++this.nextId;
    const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('桌面请求超时；结果未知，不自动重试。')); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(Buffer.concat([header, payload]));
    });
  }
  async catalog() {
    const result = await this.request('tools/list', { threadStartKind: 'all' });
    this.tools = new Map(result.tools.map(t => [t.name, t]));
    return this.tools;
  }
  async call(name, args) {
    if (!this.tools) await this.catalog();
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`当前桌面版本不提供 ${name}。`);
    const result = await this.request('tools/call', {
      arguments: args, callerSource: 'codex', callId: randomUUID(),
      namespace: tool.namespace, threadId: this.threadId, tool: name,
      turnId: `coopanion-${randomUUID()}`,
    });
    if (!result.success) throw new Error('桌面应用未完成此操作，请在原应用检查；不要重复发送。');
    const texts = (result.contentItems ?? []).filter(i => i.type === 'inputText').map(i => i.text);
    for (const text of texts) { try { return JSON.parse(text); } catch {} }
    throw new Error('桌面响应格式不受支持，操作结果未知。');
  }
  close() { this.socket?.destroy(); }
}

export class DesktopAdapter {
  constructor(app = new AppTools()) { this.app = app; this.sessions = new Map(); }
  async list() {
    const result = await this.app.call('list_threads', { limit: 50 });
    const rows = [...(result.pinnedThreads ?? []), ...(result.threads ?? [])];
    const unique = new Map();
    for (const row of rows) {
      if (!row.id || !['codex', 'chatgpt'].includes(row.kind)) continue;
      const session = { id: row.id, title: row.title || row.id, kind: row.kind,
        hostId: row.hostId, status: row.status, current: row.id === this.app.threadId };
      unique.set(`${row.kind}:${row.id}`, session);
    }
    this.sessions = unique;
    return { sessions: [...unique.values()], partial: Boolean(result.unavailableHosts?.length || result.unavailableSources?.length) };
  }
  async snapshot(session) {
    return this.app.call('read_thread', { threadId: session.id, ...(session.hostId ? { hostId: session.hostId } : {}),
      turnLimit: 1, includeOutputs: false, maxOutputCharsPerItem: 8000 });
  }
  async send(session, text) {
    return this.app.call('send_message_to_thread', { threadId: session.id,
      ...(session.hostId ? { hostId: session.hostId } : {}), prompt: text });
  }
  async create({ kind, prompt, title }) {
    const result = await this.app.call('create_thread', { prompt, title,
      target: kind === 'chatgpt' ? { type: 'chatgptWorkCloud' } : { type: 'projectless' } });
    const id = result.threadId ?? result.conversationId ?? result.chatgptConversationId ?? result.thread?.id ?? result.conversation?.id;
    if (typeof id !== 'string' || !id) throw new Error(`已发出创建请求，但回执暂未识别（字段：${Object.keys(result).join(', ')}）；请在原应用确认后刷新列表，不要重复创建。`);
    return { id, title, kind, hostId: result.hostId };
  }
  close() { this.app.close(); }
}
