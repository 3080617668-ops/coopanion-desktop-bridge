import http from 'node:http';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { EventCursor } from './events.mjs';

export const VERSION = 1;
export function safeText(value, max = 4000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`文字不能为空且不能超过 ${max} 字符。`);
  if (/^[\p{L}\p{N}_\- ]{1,64}（通过桌宠）说：/u.test(value.trim())) throw new Error('拒绝再次转发已有桥接前缀的消息。');
  return value;
}
function equalToken(received, token) {
  const a = Buffer.from(received ?? ''), b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class BridgeHost {
  constructor({ adapter, stateDir, port = 19487, pollMs = 1800, token = randomBytes(32).toString('hex') }) {
    this.adapter = adapter; this.stateDir = stateDir; this.port = port; this.pollMs = pollMs; this.token = token;
    this.cursor = new EventCursor(); this.epoch = 0; this.journal = {}; this.queue = Promise.resolve(); this.polling = false;
  }
  async start() {
    if (this.stateDir) {
      await mkdir(this.stateDir, { recursive: true, mode: 0o700 });
      try { this.journal = JSON.parse(await readFile(join(this.stateDir, 'dedupe.json'), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw new Error('去重记录损坏，已停止，避免重复执行。'); }
    }
    await this.adapter.app?.catalog();
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 20000 });
    this.server = http.createServer((req, res) => {
      const allowed = this.authorized(req);
      if (!allowed) { res.writeHead(403); res.end(); return; }
      if (req.url === '/coopanion/shutdown' && req.method === 'POST' && this.onShutdown) {
        res.end(JSON.stringify({ stopping: true })); setTimeout(() => this.onShutdown(), 50); return;
      }
      if (req.url === '/coopanion/control' && req.method === 'POST') {
        let body = '', tooLarge = false;
        req.on('data', chunk => {
          body += chunk;
          if (Buffer.byteLength(body) > 20000) { tooLarge = true; req.destroy(); }
        });
        req.on('end', () => {
          if (tooLarge) return;
          this.queue = this.queue.then(async () => {
            try {
              const frame = JSON.parse(body);
              if (!frame || typeof frame.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(frame.id)) throw new Error('无效请求 ID。');
              const data = await this.command(frame.t, frame.args ?? {}, frame.id);
              res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, data }));
            } catch (error) {
              res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: error.message }));
            }
          }).catch(() => { res.destroy(); });
        });
        return;
      }
      if (req.url !== '/coopanion/status' || req.method !== 'GET') { res.writeHead(404); res.end(); return; }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, v: VERSION, connected: Boolean(this.pet), bound: Boolean(this.selected), pinned: this.pinned ?? false }));
    });
    this.server.on('upgrade', (req, socket, head) => {
      if (req.url !== '/coopanion/pet' || !this.authorized(req)) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
      }
      this.wss.handleUpgrade(req, socket, head, ws => this.accept(ws));
    });
    await new Promise((resolve, reject) => {
      this.server.once('error', reject); this.server.listen(this.port, '127.0.0.1', resolve);
    });
    this.port = this.server.address().port;
    if (this.stateDir) await writeFile(join(this.stateDir, 'connection.json'), JSON.stringify({
      v: VERSION, url: `ws://127.0.0.1:${this.port}/coopanion/pet`, token: this.token,
    }, null, 2), { mode: 0o600 });
    this.timer = setInterval(() => void this.poll(), this.pollMs);
    this.timer.unref();
    return this;
  }
  authorized(req) {
    return !req.headers.origin && ['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
      && req.headers.host === `127.0.0.1:${this.port}` && equalToken(req.headers.authorization, this.token);
  }
  accept(ws) {
    if (this.pet) { ws.close(4000, 'another pet is connected'); return; }
    this.pet = ws;
    let greeted = false;
    const timer = setTimeout(() => { if (!greeted) ws.close(4001, 'hello required'); }, 5000);
    ws.on('error', () => {});
    ws.on('close', () => { clearTimeout(timer); if (this.pet === ws) { this.pet = undefined; this.epoch++; } });
    ws.on('message', (raw, binary) => {
      let frame;
      try { if (binary) throw 0; frame = JSON.parse(raw.toString()); if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw 0; }
      catch { ws.close(4003, 'invalid frame'); return; }
      if (!greeted) {
        if (frame.t !== 'hello' || frame.v !== VERSION) { ws.close(4002, 'protocol mismatch'); return; }
        greeted = true; clearTimeout(timer);
        this.queue = this.queue.then(async () => {
          if (this.pet !== ws) return;
          if (this.selected) {
            try { this.cursor.baseline(await this.adapter.snapshot(this.selected)); }
            catch { this.selected = undefined; this.pinned = false; }
          }
          this.notice({ t: 'ready', data: this.status() });
        }).catch(() => ws.close(4004, 'initialization failed'));
        return;
      }
      if (typeof frame.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(frame.id)) { ws.close(4003, 'request id required'); return; }
      this.queue = this.queue.then(async () => {
        if (this.pet !== ws || ws.readyState !== 1) return;
        try {
          const data = await this.command(frame.t, frame.args ?? {}, frame.id);
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'result', id: frame.id, ok: true, data }));
        } catch (error) {
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'result', id: frame.id, ok: false, error: error.message }));
        }
      }).catch(() => {});
    });
  }
  status() { return { v: VERSION, selected: this.selected ?? null, pinned: this.pinned ?? false,
    adapter: 'desktop-app-tools', progress: this.lastStatus ?? '尚未选择聊天', autoFollow: false,
    capabilities: { list: true, newCodex: true, newChatGPTWork: true, newChatGPTClassic: false,
      pin: true, progress: 'snapshot', approval: 'notice-only' } }; }
  notice(frame) { if (this.pet?.readyState === 1) this.pet.send(JSON.stringify(frame)); }
  async bind(session, pinned = true, newConversation = false) {
    const snapshot = await this.adapter.snapshot(session);
    if (snapshot.thread?.id !== session.id) throw new Error('应用返回的聊天与目标不一致，已拒绝绑定。');
    const cursor = new EventCursor(); if (!newConversation) cursor.baseline(snapshot);
    this.epoch++; this.selected = session; this.pinned = pinned; this.cursor = cursor; this.lastStatus = '已绑定';
    this.notice({ t: 'ready', data: this.status() });
    return this.status();
  }
  async command(type, args, id) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('无效参数。');
    switch (type) {
      case 'status': return this.status();
      case 'shutdown':
        if (!this.onShutdown) throw new Error('当前宿主未启用关闭入口。');
        setTimeout(() => this.onShutdown(), 50); return { stopping: true };
      case 'list-sessions': return this.adapter.list();
      case 'pick': {
        const { sessions } = await this.adapter.list();
        const target = sessions.find(s => s.id === args.session && s.kind === args.kind);
        if (!target) throw new Error('目标聊天不在当前列表中，请刷新后重选。');
        return this.bind(target);
      }
      case 'unpin':
        this.epoch++; this.selected = undefined; this.pinned = false; this.lastStatus = '已解除固定，请显式选择聊天';
        this.notice({ t: 'unpinned', data: this.status() }); return this.status();
      case 'new': {
        if (!['codex', 'chatgpt'].includes(args.kind)) throw new Error('请选择聊天类型。');
        safeText(args.prompt); safeText(args.title, 100);
        // Save request intent before mutation; a crash or timeout must not repeat it.
        return this.once(id, type, args, async () => {
          const session = await this.adapter.create(args);
          await this.bind(session, true, true);
          return { ...this.status(), createdThread: { id: session.id, kind: session.kind } };
        });
      }
      case 'say': {
        const text = safeText(args.text);
        if (!this.selected) throw new Error('没有绑定聊天，请先选择；不会自动改投其他聊天。');
        if (args.session !== this.selected.id) throw new Error('目标聊天已变化，本条消息未转发。');
        const session = this.selected;
        return this.once(id, type, { text, session: session.id }, async () => {
          await this.adapter.send(session, text);
          return { accepted: true, session: session.id };
        });
      }
      default: throw new Error('不支持的桥接操作。');
    }
  }
  async persist() {
    if (!this.stateDir) return;
    const path = join(this.stateDir, 'dedupe.json');
    await writeFile(`${path}.tmp`, JSON.stringify(this.journal), { mode: 0o600 });
    await rename(`${path}.tmp`, path);
  }
  async once(id, op, args, fn) {
    const hash = createHash('sha256').update(JSON.stringify({ op, args })).digest('hex');
    if (this.journal[id]) {
      if (this.journal[id].hash !== hash) throw new Error('重复请求 ID 的内容不同，已拒绝。');
      if (this.journal[id].state !== 'accepted') throw new Error('此请求的执行结果未知，请在原应用确认；不会自动重发。');
      return { accepted: true, duplicate: true, session: this.journal[id].session };
    }
    if (Object.keys(this.journal).length >= 10000) throw new Error('去重记录已满，请停止桥接后维护记录。');
    this.journal[id] = { hash, state: 'pending' }; await this.persist();
    try {
      const result = await fn();
      this.journal[id] = { hash, state: 'accepted', session: this.selected?.id }; await this.persist(); return result;
    } catch (error) { this.journal[id] = { hash, state: 'unknown' }; await this.persist(); throw error; }
  }
  async poll() {
    if (this.polling || !this.selected || !this.pet) return;
    this.polling = true;
    const epoch = this.epoch, session = this.selected;
    try {
      const snapshot = await this.adapter.snapshot(session);
      if (epoch !== this.epoch || !this.pet) return;
      for (const event of this.cursor.take(snapshot)) {
        this.lastStatus = event.t === 'reply' ? '收到新回复' : event.t;
        this.notice(event);
      }
    } catch {
      if (epoch === this.epoch && this.lastStatus !== '读取失败') {
        this.lastStatus = '读取失败'; this.notice({ t: 'error', text: '聊天状态读取失败，请在原应用检查后重新选择。' });
      }
    } finally { this.polling = false; }
  }
  async close() {
    clearInterval(this.timer); this.epoch++;
    for (const socket of this.wss?.clients ?? []) socket.terminate();
    await this.queue;
    await new Promise(resolve => this.wss ? this.wss.close(resolve) : resolve());
    await new Promise(resolve => this.server ? this.server.close(resolve) : resolve());
    this.adapter.close?.();
  }
}
