// packages/world/src/webui/client.ts
async function mount(ctx) {
  const root = ctx.root;
  const h = (tag, text2) => {
    const node = document.createElement(tag);
    if (text2) node.textContent = text2;
    return node;
  };
  root.append(h("h3", "\u684C\u9762\u6587\u5B57\u6865\u63A5"), h("p", "\u5148\u542F\u52A8 connector \u5E76\u914D\u7F6E\u914D\u5BF9\u6587\u4EF6\uFF0C\u518D\u9009\u62E9\u804A\u5929\u3002\u6279\u51C6\u4E0E\u63D0\u95EE\u8BF7\u56DE\u539F\u5E94\u7528\u5904\u7406\u3002"));
  const message = h("p");
  message.setAttribute("role", "status");
  root.append(message);
  const status = h("pre");
  status.style.whiteSpace = "pre-wrap";
  root.append(status);
  const actions = h("div");
  actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
  root.append(actions);
  const list = h("div");
  root.append(list);
  const run = async (work) => {
    message.textContent = "\u5904\u7406\u4E2D\u2026";
    try {
      await work();
      message.textContent = "\u64CD\u4F5C\u5B8C\u6210";
      await refresh();
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : "\u64CD\u4F5C\u5931\u8D25";
    }
  };
  const button = (parent, label, work) => {
    const node = h("button", label);
    node.className = "btn";
    node.addEventListener("click", async () => {
      node.disabled = true;
      try {
        await run(work);
      } finally {
        node.disabled = false;
      }
    }, { signal: ctx.signal });
    parent.append(node);
  };
  const refresh = async () => {
    const state = await ctx.invoke("state");
    const data = state.status;
    status.textContent = `${state.connected ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5"}
\u804A\u5929\uFF1A${data?.selected?.title ?? "\u672A\u9009\u62E9"}
\u7C7B\u578B\uFF1A${data?.selected?.kind ?? "\u2014"}
${data?.pinned ? "\u5DF2\u56FA\u5B9A" : "\u672A\u56FA\u5B9A"}
\u72B6\u6001\uFF1A${data?.progress ?? state.error ?? "\u7B49\u5F85\u8FDE\u63A5"}`;
    recent.textContent = (state.recent ?? []).slice(-12).map((e) => `${e.type}\uFF1A${e.text}`).join("\n\n");
  };
  button(actions, "\u5237\u65B0\u6D4B\u8BD5", async () => {
    await ctx.invoke("refresh");
  });
  button(actions, "\u9009\u62E9\u804A\u5929", async () => {
    const result = await ctx.invoke("list");
    list.replaceChildren();
    if (result.partial) list.append(h("p", "\u90E8\u5206\u6765\u6E90\u6682\u4E0D\u53EF\u7528\uFF0C\u5217\u8868\u53EF\u80FD\u4E0D\u5B8C\u6574\u3002"));
    if (!result.sessions.length) list.append(h("p", "\u6CA1\u6709\u53EF\u9009\u804A\u5929\u3002"));
    for (const item of result.sessions) {
      const row = h("div");
      row.style.marginTop = "6px";
      list.append(row);
      button(row, `[${item.kind}] ${item.title}${item.current ? "\uFF08\u542F\u52A8\u52A9\u624B\u7684\u804A\u5929\uFF09" : ""}`, async () => {
        await ctx.invoke("pick", [item.id, item.kind]);
        list.replaceChildren();
      });
    }
  });
  button(actions, "\u56FA\u5B9A\u5F53\u524D\u7ED1\u5B9A", async () => {
    const state = await ctx.invoke("status");
    if (!state.selected) throw new Error("\u8BF7\u5148\u9009\u62E9\u804A\u5929\u3002");
    await ctx.invoke("pick", [state.selected.id, state.selected.kind]);
  });
  button(actions, "\u89E3\u9664\u56FA\u5B9A", async () => {
    await ctx.invoke("unpin");
  });
  root.append(h("h4", "\u65B0\u5EFA\u804A\u5929"));
  const kind = h("select");
  for (const [value, label] of [["codex", "Codex \u672C\u673A\u804A\u5929"], ["chatgpt", "ChatGPT Work \u4E91\u7AEF\u804A\u5929"]]) {
    const option = h("option", label);
    option.value = value;
    kind.append(option);
  }
  root.append(kind, h("p", "ChatGPT \u65B0\u5EFA\u5165\u53E3\u521B\u5EFA\u7684\u662F Work \u4E91\u7AEF\u804A\u5929\uFF0C\u4E0D\u662F\u666E\u901A ChatGPT \u804A\u5929\u3002"));
  const title = h("input");
  title.placeholder = "\u804A\u5929\u6807\u9898";
  title.maxLength = 100;
  title.setAttribute("aria-label", "\u804A\u5929\u6807\u9898");
  root.append(title);
  const prompt = h("textarea");
  prompt.placeholder = "\u7B2C\u4E00\u6761\u6D88\u606F\uFF08\u70B9\u51FB\u65B0\u5EFA\u5373\u63D0\u4EA4\uFF09";
  prompt.maxLength = 4e3;
  prompt.setAttribute("aria-label", "\u65B0\u804A\u5929\u7B2C\u4E00\u6761\u6D88\u606F");
  root.append(prompt);
  button(root, "\u65B0\u5EFA\u5E76\u63D0\u4EA4", async () => {
    if (!title.value.trim() || !prompt.value.trim()) throw new Error("\u8BF7\u586B\u5199\u6807\u9898\u548C\u7B2C\u4E00\u6761\u6D88\u606F\u3002");
    await ctx.invoke("new", [kind.value, title.value, prompt.value]);
    title.value = "";
    prompt.value = "";
  });
  root.append(h("h4", "\u53D1\u9001\u5230\u5DF2\u7ED1\u5B9A\u804A\u5929"));
  const text = h("textarea");
  text.placeholder = "\u8981\u4EA4\u7ED9\u76EE\u6807\u804A\u5929\u7684\u6587\u5B57";
  text.maxLength = 4e3;
  text.setAttribute("aria-label", "\u6865\u63A5\u6D88\u606F");
  root.append(text);
  button(root, "\u53D1\u9001", async () => {
    await ctx.invoke("send", [text.value]);
    text.value = "";
  });
  root.append(h("h4", "\u6700\u8FD1\u901A\u77E5\uFF08\u4EC5\u5185\u5B58\uFF09"));
  const recent = h("pre");
  recent.style.whiteSpace = "pre-wrap";
  root.append(recent);
  await refresh();
  let polling = false;
  ctx.interval(() => {
    if (polling) return;
    polling = true;
    void refresh().catch(() => {
    }).finally(() => {
      polling = false;
    });
  }, 2e3);
}
var client_default = { panels: { bridge: { mount } } };
export {
  client_default as default
};
