import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { BridgeHost } from '../packages/connector/src/host.mjs';
import { BridgeClient } from '../packages/connector/src/client.mjs';
import { EventCursor, project } from '../packages/connector/src/events.mjs';

function snapshot(text = '旧回复', id = 'old', state = 'completed') {
  return { thread: { id: 's1', status: { type: state === 'completed' ? 'idle' : 'active' } },
    turns: [{ id: 'turn1', status: state, items: [{ type: 'agentMessage', id, text, phase: 'final_answer' }] }] };
}
class FakeDesktop {
  sessions = [{ id: 's1', kind: 'codex', title: 'test' }, { id: 's2', kind: 'chatgpt', title: 'test2' }];
  sent = []; created = []; data = snapshot();
  async list() { return { sessions: this.sessions, partial: false }; }
  async snapshot(session) { return { ...this.data, thread: { ...this.data.thread, id: session.id } }; }
  async send(session, text) { this.sent.push({ session, text }); if (this.fail) throw new Error('unknown'); return {}; }
  async create(args) { this.created.push(args); return { id: 'new', kind: args.kind, title: args.title }; }
}
let dir, host, adapter, client;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'coopanion-bridge-')); adapter = new FakeDesktop();
  host = await new BridgeHost({ adapter, stateDir: dir, port: 0, pollMs: 100000 }).start();
  client = new BridgeClient({ connectionFile: join(dir, 'connection.json'), timeoutMs: 2000 }); await client.connect();
});
afterEach(async () => { client?.close(); await host?.close(); await rm(dir, { recursive: true, force: true }); });

describe('real loopback websocket bridge', () => {
  it('handshakes, lists both kinds, pins and clears host binding', async () => {
    expect(client.status.selected).toBeNull();
    expect((await client.request('list-sessions')).sessions).toHaveLength(2);
    await client.request('pick', { session: 's1', kind: 'codex' });
    expect(client.status.selected.id).toBe('s1'); expect(client.status.pinned).toBe(true);
    await client.request('unpin'); expect(client.status.selected).toBeNull();
    await expect(client.request('say', { text: 'hi', session: 's1' })).rejects.toThrow('没有绑定');
  });
  it('sends exactly once and persists only hashes and receipts', async () => {
    await client.request('pick', { session: 's1', kind: 'codex' });
    const args = { text: 'PRIVATE_TEST_BODY', session: 's1' };
    expect(await client.request('say', args, 'message1')).toMatchObject({ accepted: true });
    expect(await client.request('say', args, 'message1')).toMatchObject({ duplicate: true });
    expect(adapter.sent).toHaveLength(1);
    expect(await readFile(join(dir, 'dedupe.json'), 'utf8')).not.toContain('PRIVATE_TEST_BODY');
    await expect(client.request('say', { ...args, text: 'other' }, 'message1')).rejects.toThrow('内容不同');
  });
  it('refuses wrong target, loops, and overlong text', async () => {
    await client.request('pick', { session: 's1', kind: 'codex' });
    await expect(client.request('say', { text: 'hello', session: 's2' })).rejects.toThrow('已变化');
    await expect(client.request('say', { text: '小龙（通过桌宠）说：hello', session: 's1' })).rejects.toThrow('前缀');
    await expect(client.request('say', { text: 'a'.repeat(4001), session: 's1' })).rejects.toThrow('4000');
    expect(adapter.sent).toHaveLength(0);
  });
  it('never repeats a send whose result is unknown', async () => {
    await client.request('pick', { session: 's1', kind: 'codex' }); adapter.fail = true;
    const args = { text: 'run', session: 's1' };
    await expect(client.request('say', args, 'uncertain')).rejects.toThrow();
    await expect(client.request('say', args, 'uncertain')).rejects.toThrow('未知');
    expect(adapter.sent).toHaveLength(1);
  });
  it('does not replay historical replies and delivers only new selected events', async () => {
    const notices = []; client.on('notice', n => notices.push(n));
    await client.request('pick', { session: 's1', kind: 'codex' });
    await host.poll(); expect(notices.filter(n => n.t === 'reply')).toHaveLength(0);
    adapter.data = snapshot('新回复', 'new'); await host.poll();
    await new Promise(r => setTimeout(r, 30));
    expect(notices.filter(n => n.t === 'reply').map(n => n.text)).toEqual(['新回复']);
    await host.poll(); await new Promise(r => setTimeout(r, 30));
    expect(notices.filter(n => n.t === 'reply')).toHaveLength(1);
  });
  it('creates the requested kind once', async () => {
    await client.request('new', { kind: 'chatgpt', title: 'example', prompt: 'hello' }, 'new1');
    expect(adapter.created).toEqual([{ kind: 'chatgpt', title: 'example', prompt: 'hello' }]);
    expect(host.selected.id).toBe('new');
    await client.request('new', { kind: 'chatgpt', title: 'example', prompt: 'hello' }, 'new1');
    expect(adapter.created).toHaveLength(1);
  });
  it('rejects browser origins and missing authorization before websocket upgrade', async () => {
    const tryConnect = headers => new Promise(resolve => {
      const socket = new WebSocket(`ws://127.0.0.1:${host.port}/coopanion/pet`, { headers });
      socket.on('unexpected-response', (_req, res) => { resolve(res.statusCode); res.resume(); socket.terminate(); });
      socket.on('error', () => {}); socket.on('open', () => { resolve(101); socket.terminate(); });
    });
    expect(await tryConnect({})).toBe(403);
    expect(await tryConnect({ Authorization: `Bearer ${host.token}`, Origin: 'https://evil.example' })).toBe(403);
  });
  it('refuses non-local URLs in connection files', async () => {
    const { writeFile } = await import('node:fs/promises');
    const bad = join(dir, 'bad.json');
    await writeFile(bad, JSON.stringify({ v: 1, url: 'ws://example.com/coopanion/pet', token: host.token }));
    await expect(new BridgeClient({ connectionFile: bad }).connect()).rejects.toThrow('只允许本机');
  });
});
describe('event projection', () => {
  it('does not transmit tool arguments, commands, patches, or reasoning', () => {
    const snap = snapshot(); snap.turns[0].items = [
      { type: 'commandExecution', id: 'cmd', command: 'SECRET_COMMAND', status: 'inProgress' },
      { type: 'mcpToolCall', id: 'mcp', arguments: { apiKey: 'SECRET_KEY' } },
      { type: 'reasoning', id: 'r', summary: 'SECRET_REASON' },
    ];
    const output = JSON.stringify(project(snap));
    expect(output).not.toContain('SECRET'); expect(output).toContain('commandExecution');
  });
  it('reports waiting states without automatically resolving approvals', () => {
    const snap = snapshot('', 'none', 'inProgress');
    snap.thread.status.activeFlags = ['waitingOnApproval', 'waitingOnUserInput'];
    expect(project(snap).map(e => e.t)).toEqual(expect.arrayContaining(['approval', 'question']));
  });
  it('keeps final replies observed after baseline', () => {
    const cursor = new EventCursor(); cursor.baseline(snapshot('working', 'a', 'inProgress'));
    expect(cursor.take(snapshot('done', 'b')).some(e => e.text === 'done')).toBe(true);
  });
});
