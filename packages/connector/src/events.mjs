import { createHash } from 'node:crypto';

export function project(snapshot) {
  if (!Array.isArray(snapshot.turns)) throw new Error('当前聊天没有受支持的事件结构；不能假装已接通。');
  const status = snapshot.thread?.status;
  const flags = status?.activeFlags ?? [];
  const events = [];
  for (const turn of snapshot.turns) {
    for (const item of turn.items ?? []) {
      const base = { session: snapshot.thread?.id, turn: turn.id };
      if (item.type === 'agentMessage' && typeof item.text === 'string' && item.text.trim()) {
        // Ignore reasoning and tool payloads. Completed assistant text only.
        if (item.phase === 'final_answer' || item.phase === 'final' || turn.status === 'completed') {
          events.push({ ...base, t: 'reply', eventId: `${turn.id}:${item.id}:reply`, text: item.text.slice(0, 8000) });
        } else if (item.phase === 'commentary') {
          events.push({ ...base, t: 'progress', eventId: `${turn.id}:${item.id}:progress`, text: item.text.slice(0, 1000) });
        }
      } else if (['commandExecution', 'mcpToolCall', 'dynamicToolCall', 'fileChange', 'webSearch'].includes(item.type)) {
        events.push({ ...base, t: 'tool', eventId: `${turn.id}:${item.id}:tool`, name: typeof item.tool === 'string' ? item.tool.slice(0, 100) : item.type,
          status: ['inProgress', 'completed', 'failed', 'declined'].includes(item.status) ? item.status : 'observed' });
      }
    }
    if (['completed', 'failed', 'interrupted'].includes(turn.status)) {
      events.push({ t: 'turn-end', session: snapshot.thread?.id, turn: turn.id,
        eventId: `${turn.id}:end`, status: turn.status });
    }
  }
  if (status?.type === 'active') events.push({ t: 'turn-start', session: snapshot.thread?.id,
    eventId: `${snapshot.turns[0]?.id}:start` });
  if (flags.includes('waitingOnApproval')) events.push({ t: 'approval', session: snapshot.thread?.id,
    eventId: `${snapshot.turns[0]?.id}:approval`, text: '原应用正在等待批准，请回原应用处理。' });
  if (flags.includes('waitingOnUserInput')) events.push({ t: 'question', session: snapshot.thread?.id,
    eventId: `${snapshot.turns[0]?.id}:question`, text: '原应用正在等待你的回答，请回原应用处理。' });
  return events;
}
export function fingerprint(event) { return createHash('sha256').update(JSON.stringify(event)).digest('hex'); }

export class EventCursor {
  constructor() { this.seen = new Map(); }
  baseline(snapshot) { this.seen.clear(); this.take(snapshot); }
  take(snapshot) {
    const fresh = [];
    for (const event of project(snapshot)) {
      const hash = fingerprint(event);
      if (this.seen.get(event.eventId) !== hash) { this.seen.set(event.eventId, hash); fresh.push(event); }
    }
    // Bounded in-memory cursor; no conversation text on disk.
    if (this.seen.size > 5000) this.seen = new Map([...this.seen].slice(-2500));
    return fresh;
  }
}
