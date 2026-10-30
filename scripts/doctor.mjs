import { AppTools, DesktopAdapter } from '../packages/connector/src/app-tools.mjs';
const app = new AppTools();
try {
  const tools = await app.catalog();
  const names = ['list_threads', 'read_thread', 'send_message_to_thread', 'create_thread', 'wait_threads'];
  const adapter = new DesktopAdapter(app);
  const { sessions, partial } = await adapter.list();
  // No titles, contents, pipe paths or credentials in diagnostic output.
  const report = { tools: Object.fromEntries(names.map(n => [n, tools.has(n)])),
    listed: { codex: sessions.filter(s => s.kind === 'codex').length,
      chatgpt: sessions.filter(s => s.kind === 'chatgpt').length, partial },
    currentVisible: sessions.some(s => s.current) };
  if (process.argv.includes('--inspect-current-shape')) {
    const own = sessions.find(s => s.current);
    if (own) {
      const snapshot = await adapter.snapshot(own);
      const shape = value => Array.isArray(value) ? value.slice(0, 1).map(shape)
        : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k,v]) => [k, shape(v)])) : typeof value;
      report.snapshotShape = shape(snapshot);
      report.itemShapes = snapshot.turns?.flatMap(t => (t.items ?? []).map(i => ({ type: i.type, keys: Object.keys(i), role: i.role, phase: i.phase })));
    }
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { app.close(); }
