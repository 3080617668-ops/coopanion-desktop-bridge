import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

export class BridgeClient extends EventEmitter {
  constructor({ connectionFile, timeoutMs = 75000 }) {
    super(); this.connectionFile = connectionFile; this.timeoutMs = timeoutMs; this.pending = new Map(); this.status = null;
  }
  async connect() {
    if (this.socket?.readyState === 1 && this.status) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
  async open() {
    if (!this.connectionFile) throw new Error('请先填写 connector 生成的 connection.json 绝对路径。');
    const cfg = JSON.parse(await readFile(this.connectionFile, 'utf8'));
    const url = new URL(cfg.url);
    if (cfg.v !== 1 || url.protocol !== 'ws:' || url.hostname !== '127.0.0.1'
      || url.pathname !== '/coopanion/pet' || url.username || url.password || url.search || url.hash
      || !/^[0-9a-f]{64}$/.test(cfg.token)) throw new Error('连接文件不合格；只允许本机桥接。');
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${cfg.token}` }, maxPayload: 1000000, handshakeTimeout: this.timeoutMs });
      this.socket = ws;
      const timer = setTimeout(() => { reject(new Error('桥接握手超时')); ws.terminate(); }, this.timeoutMs);
      ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 1 })));
      ws.on('error', () => { clearTimeout(timer); reject(new Error('无法连接 connector，请确认它已启动。')); });
      ws.on('close', () => {
        clearTimeout(timer); this.status = null;
        reject(new Error('connector 已断开'));
        for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('连接中断，发送结果未知；请勿自动重发。')); }
        this.pending.clear(); this.emit('disconnected');
      });
      ws.on('message', raw => {
        let frame;
        try { frame = JSON.parse(raw.toString()); } catch { ws.terminate(); return; }
        if (frame.t === 'ready') { this.status = frame.data; clearTimeout(timer); resolve(); }
        if (frame.t === 'unpinned') this.status = frame.data;
        const labels = { 'turn-start': '工作中', 'turn-end': '本轮结束', reply: '收到新回复', progress: '收到进度', tool: '工具执行', approval: '等待批准', question: '等待回答', error: '连接或任务异常' };
        if (this.status && labels[frame.t]) this.status = { ...this.status, progress: labels[frame.t] };
        if (frame.t === 'result') {
          const item = this.pending.get(frame.id);
          if (item) { this.pending.delete(frame.id); clearTimeout(item.timer); frame.ok ? item.resolve(frame.data) : item.reject(new Error(frame.error)); }
        } else this.emit('notice', frame);
      });
    });
  }
  async request(t, args = {}, id = randomUUID()) {
    await this.connect();
    return new Promise((resolve, reject) => {
      if (this.pending.has(id)) { reject(new Error('请求仍在处理中')); return; }
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('请求超时，结果未知；不会自动重发。')); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ t, id, args }));
    });
  }
  close() { this.socket?.terminate(); }
}
