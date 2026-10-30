import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>桌面桥接面板校验</title>
<style>body{font:16px system-ui;background:#f4f7fa;color:#142739;margin:30px}main{max-width:860px;margin:auto;background:white;border:1px solid #dae3ec;border-radius:16px;padding:28px}button{padding:9px 14px;border:1px solid #b4c6d6;border-radius:8px;background:#eef7fb;color:#14344d;cursor:pointer}input,textarea,select{display:block;box-sizing:border-box;width:100%;margin:8px 0;padding:10px;border:1px solid #bdcbd7;border-radius:6px;font:inherit}pre{padding:12px;background:#f2f6f9;border-radius:8px;overflow:auto}textarea{min-height:68px}h4{margin-bottom:8px}.note{background:#fff3d0;padding:10px;border-radius:8px}</style>
<main><div class="note">面板外观与交互校验：以下为模拟数据，不会向真实聊天发消息。</div><div id="root"></div></main>
<script type="module">
import bundle from '/webui.js';
const controller=new AbortController(); let selected=null;
const state=()=>({connected:true,status:{selected,pinned:!!selected,progress:selected?'空闲':'尚未选择聊天'},recent:[{type:'receipt',text:'这是一条模拟回执。'}]});
const session={id:'test-codex',kind:'codex',title:'桌宠桥接验收 codex',current:false};
const ctx={root:document.querySelector('#root'),signal:controller.signal,interval:(fn,ms)=>{const id=setInterval(fn,ms);return{dispose:()=>clearInterval(id)}},invoke:async(method,args)=>{
 if(method==='state')return state();if(method==='status'||method==='refresh')return state().status;
 if(method==='list')return{sessions:[session,{id:'test-chatgpt',kind:'chatgpt',title:'桌宠桥接验收'}],partial:false};
 if(method==='pick'){selected={...session,id:args[0],kind:args[1]};return state().status}
 if(method==='unpin'){selected=null;return state().status}
 if(method==='send'&&!selected)throw Error('请先在面板选择聊天。');return{accepted:true};}};
await bundle.panels.bridge.mount(ctx);
</script></html>`;
const server = http.createServer(async (req, res) => {
  if (req.url === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html); }
  else if (req.url === '/webui.js') { res.setHeader('content-type', 'text/javascript'); res.end(await readFile(fileURLToPath(new URL('../packages/world/dist/webui.js', import.meta.url)))); }
  else { res.writeHead(404); res.end(); }
});
server.listen(0, '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}`));
