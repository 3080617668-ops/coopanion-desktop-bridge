import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { BridgeClient } from '../packages/connector/src/client.mjs';
import http from 'node:http';
const root = fileURLToPath(new URL('../', import.meta.url));
const state = join(root, '.bridge-state');
const file = join(state, 'service.json');
const command = process.argv[2];
if (command === 'start') {
  if (!process.env.CODEX_APP_TOOLS_PIPE_PATH || !process.env.CODEX_THREAD_ID) throw new Error('请在本机桌面助手聊天中使用配套 Skill 启动。');
  await mkdir(state, { recursive: true });
  try {
    const previous = JSON.parse(await readFile(file, 'utf8'));
    process.kill(previous.pid, 0); throw new Error('已有 connector 进程，请先停止。');
  } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error; }
  const allowed = ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'Path',
    'CODEX_APP_TOOLS_PIPE_PATH', 'CODEX_THREAD_ID', 'CODEX_APP_TOOLS_CALLER_HOST_ID'];
  const env = Object.fromEntries(allowed.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
  const child = spawn(process.execPath, [join(root, 'packages/connector/src/main.mjs'), '--state-dir', state], {
    cwd: root, detached: true, stdio: 'ignore', windowsHide: true, env,
  });
  child.unref();
  let ready = false;
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 200));
    const client = new BridgeClient({ connectionFile: join(state, 'connection.json'), timeoutMs: 300 });
    try { await client.connect(); await client.request('status'); ready = true; break; } catch {}
    finally { client.close(); }
  }
  if (!ready) throw new Error('connector 未通过启动验证；请运行 doctor 检查桌面连接。');
  await writeFile(file, JSON.stringify({ pid: child.pid, executable: process.execPath }), { mode: 0o600 });
  console.log('connector 已启动并通过本机握手。配对文件：' + join(state, 'connection.json'));
} else if (command === 'stop') {
  // An authenticated protocol shutdown avoids killing a possibly reused PID.
  const cfg = JSON.parse(await readFile(join(state, 'connection.json'), 'utf8'));
  const url = new URL(cfg.url);
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'ws:' || !/^[0-9a-f]{64}$/.test(cfg.token)) throw new Error('无效本机配对文件。');
  await new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: url.port, path: '/coopanion/shutdown', method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}` }, timeout: 3000 }, res => {
      res.resume(); res.statusCode === 200 ? resolve() : reject(new Error('关闭请求被拒绝。'));
    });
    req.on('timeout', () => req.destroy(new Error('关闭超时'))); req.on('error', reject); req.end();
  });
  await rm(file, { force: true }); console.log('已请求 connector 停止。');
} else throw new Error('用法：node scripts/service.mjs start|stop');
