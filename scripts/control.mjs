import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const command = process.argv[2];
let frame;
if (command === 'status') frame = { t: 'status', args: {} };
else if (command === 'list') frame = { t: 'list-sessions', args: {} };
else if (command === 'unpin') frame = { t: 'unpin', args: {} };
else if (command === 'pick') frame = { t: 'pick', args: { kind: process.argv[3], session: process.argv[4] } };
else if (command === 'json') {
  let input = ''; for await (const chunk of process.stdin) { input += chunk; if (Buffer.byteLength(input) > 20000) throw new Error('请求过大'); }
  frame = JSON.parse(input);
} else throw new Error('用法：control.mjs status|list|unpin|pick <kind> <id>|json（从标准输入读 JSON）');
frame.id ??= randomUUID();
const cfg = JSON.parse(await readFile(fileURLToPath(new URL('../.bridge-state/connection.json', import.meta.url)), 'utf8'));
const url = new URL(cfg.url);
if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !/^[0-9a-f]{64}$/.test(cfg.token)) throw new Error('无效配对文件');
const result = await new Promise((resolve, reject) => {
  const request = http.request({ hostname: '127.0.0.1', port: url.port, path: '/coopanion/control', method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' }, timeout: 45000 }, response => {
    let data = ''; response.on('data', chunk => { data += chunk; });
    response.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('无效桥接响应')); } });
  });
  request.on('timeout', () => request.destroy(new Error('请求超时，结果未知，不要重复发送。')));
  request.on('error', () => reject(new Error('无法连接本机 connector。'))); request.end(JSON.stringify(frame));
});
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
