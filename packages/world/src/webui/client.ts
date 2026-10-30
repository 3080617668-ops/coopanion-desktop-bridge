import type { WebUiClientBundle, WebUiPanelContext } from 'cortico/web/shared/client-panel.ts';
async function mount(ctx: WebUiPanelContext) {
  const root = ctx.root;
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = document.createElement(tag); if (text) node.textContent = text; return node;
  };
  root.append(h('h3', '桌面文字桥接'), h('p', '先启动 connector 并配置配对文件，再选择聊天。批准与提问请回原应用处理。'));
  const message = h('p'); message.setAttribute('role', 'status'); root.append(message);
  const status = h('pre'); status.style.whiteSpace = 'pre-wrap'; root.append(status);
  const actions = h('div'); actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap'; root.append(actions);
  const list = h('div'); root.append(list);
  const run = async (work: () => Promise<void>) => {
    message.textContent = '处理中…';
    try { await work(); message.textContent = '操作完成'; await refresh(); }
    catch (error) { message.textContent = error instanceof Error ? error.message : '操作失败'; }
  };
  const button = (parent: HTMLElement, label: string, work: () => Promise<void>) => {
    const node = h('button', label); node.className = 'btn';
    node.addEventListener('click', async () => { node.disabled = true; try { await run(work); } finally { node.disabled = false; } }, { signal: ctx.signal });
    parent.append(node);
  };
  const refresh = async () => {
    const state = await ctx.invoke<any>('state'); const data = state.status;
    status.textContent = `${state.connected ? '已连接' : '未连接'}\n聊天：${data?.selected?.title ?? '未选择'}\n类型：${data?.selected?.kind ?? '—'}\n${data?.pinned ? '已固定' : '未固定'}\n状态：${data?.progress ?? state.error ?? '等待连接'}`;
    recent.textContent = (state.recent ?? []).slice(-12).map((e: any) => `${e.type}：${e.text}`).join('\n\n');
  };
  button(actions, '刷新测试', async () => { await ctx.invoke('refresh'); });
  button(actions, '选择聊天', async () => {
    const result = await ctx.invoke<any>('list'); list.replaceChildren();
    if (result.partial) list.append(h('p', '部分来源暂不可用，列表可能不完整。'));
    if (!result.sessions.length) list.append(h('p', '没有可选聊天。'));
    for (const item of result.sessions) {
      const row = h('div'); row.style.marginTop = '6px'; list.append(row);
      button(row, `[${item.kind}] ${item.title}${item.current ? '（启动助手的聊天）' : ''}`, async () => {
        await ctx.invoke('pick', [item.id, item.kind]); list.replaceChildren();
      });
    }
  });
  button(actions, '固定当前绑定', async () => {
    const state = await ctx.invoke<any>('status'); if (!state.selected) throw new Error('请先选择聊天。');
    await ctx.invoke('pick', [state.selected.id, state.selected.kind]);
  });
  button(actions, '解除固定', async () => { await ctx.invoke('unpin'); });
  root.append(h('h4', '新建聊天'));
  const kind = h('select');
  for (const [value, label] of [['codex', 'Codex 本机聊天'], ['chatgpt', 'ChatGPT Work 云端聊天']]) {
    const option = h('option', label); option.value = value; kind.append(option);
  }
  root.append(kind, h('p', 'ChatGPT 新建入口创建的是 Work 云端聊天，不是普通 ChatGPT 聊天。'));
  const title = h('input'); title.placeholder = '聊天标题'; title.maxLength = 100; title.setAttribute('aria-label', '聊天标题'); root.append(title);
  const prompt = h('textarea'); prompt.placeholder = '第一条消息（点击新建即提交）'; prompt.maxLength = 4000; prompt.setAttribute('aria-label', '新聊天第一条消息'); root.append(prompt);
  button(root, '新建并提交', async () => {
    if (!title.value.trim() || !prompt.value.trim()) throw new Error('请填写标题和第一条消息。');
    await ctx.invoke('new', [kind.value, title.value, prompt.value]); title.value = ''; prompt.value = '';
  });
  root.append(h('h4', '发送到已绑定聊天'));
  const text = h('textarea'); text.placeholder = '要交给目标聊天的文字'; text.maxLength = 4000; text.setAttribute('aria-label', '桥接消息'); root.append(text);
  button(root, '发送', async () => { await ctx.invoke('send', [text.value]); text.value = ''; });
  root.append(h('h4', '最近通知（仅内存）'));
  const recent = h('pre'); recent.style.whiteSpace = 'pre-wrap'; root.append(recent);
  await refresh(); let polling = false;
  ctx.interval(() => { if (polling) return; polling = true; void refresh().catch(() => {}).finally(() => { polling = false; }); }, 2000);
}
export default { panels: { bridge: { mount } } } satisfies WebUiClientBundle;
