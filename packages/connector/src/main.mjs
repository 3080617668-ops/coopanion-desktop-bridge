import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DesktopAdapter } from './app-tools.mjs';
import { BridgeHost } from './host.mjs';

const args = process.argv.slice(2);
const value = key => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
const stateDir = resolve(value('--state-dir') ?? fileURLToPath(new URL('../../../.bridge-state/', import.meta.url)));
const host = new BridgeHost({ adapter: new DesktopAdapter(), stateDir,
  port: value('--port') ? Number(value('--port')) : 19487 });
try {
  await host.start();
  console.log(`本机 connector 已启动，端口 ${host.port}。配对文件位于所选状态目录的 connection.json；请勿分享该文件。`);
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await host.close(); process.exit(0); };
  host.onShutdown = close;
  process.on('SIGINT', close); process.on('SIGTERM', close);
} catch (error) { console.error(error.message); await host.close(); process.exitCode = 1; }
