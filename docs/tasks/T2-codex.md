# T2 · Codex：状态、调度、解析与合并

> 发布：Claude · 2026-10-30
> 先读：`COLLAB.md` → `docs/INTERFACES.md`（全文）→ `src/types.js` → `src/constants.js` → `src/util.js`

## 你负责的文件（只能写这些）

```
src/state/snapshot-store.js
src/state/scheduler.js
src/sim/parse.js
src/sim/apply.js
src/memory/database-memo.js
tests/state/*.test.mjs
tests/sim/*.test.mjs
tests/memory/*.test.mjs
```

其他文件全部只读。`src/types.js`、`src/constants.js`、`src/util.js` 由组长维护：需要新类型或常量，写 `[接口变更提议]`，**不要自己加**。

## 要做的事

按 `docs/INTERFACES.md` 第 5.2–5.6 节的导出契约实现。重点：

1. **snapshot-store**：`findBase` 是整个插件正确性的核心。必须覆盖这些情况：
   - 目标楼是用户消息 / AI 消息；
   - AI 消息有快照但正文被编辑过（hash 不符）→ 跳过，继续往前找；
   - 快照损坏或版本不认识 → 当作没有；
   - 整个窗口里都没有有效快照 → 用 `fallbackSnapshot`，`stale=true`；连兜底都没有 → `emptyState()`。
2. **scheduler**：去重、同聊天串行、取消排队中的旧任务、`onStatus` 通知。`runJob` 由组长在 index.js 里提供；你只管调度，不管推演内容。用 `AbortController` 传取消信号。
3. **parse**：模型输出很脏：可能带思考过程、前后有闲聊、JSON 有尾逗号或被截断。在不伪造内容的前提下尽量容错；截断到无法解析时返回 `ok:false`，**不要猜补缺失内容**。
4. **apply**：纯函数，不修改入参（建议先 `structuredClone`）。按 5.5 节的匹配、淘汰、faded 删除规则实现，并维护 `runCount`、`touchedRun`、`fadedRuns`。`pinned` 的人物永不删除。
5. **database-memo**：只做筛选和打分的纯函数；读世界书由组长在 host 里完成。中文用 bigram 分词。

## 测试（必须写，并且要运行）

- 每个模块至少覆盖上面列出的情况，以及空输入、坏输入。
- 写法：`import { test, assert } from '../harness.js';`（**不要用 node:test**）。示例见 `tests/inject/compose.test.mjs`。
- 运行：`sh tests/run.sh tests/state`（或 `tests/sim`、`tests/memory`）。用的是 macOS 自带的 JavaScriptCore，不需要 Node，**不要安装任何东西**。
- 交付前全部测试必须通过。

## 交付

1. 所有文件写完后，用追加方式（`cat >> docs/LOG.md <<'EOF'`）写一条：

   ```
   ## <时间> [codex] [完成] T2
   - 改动文件：（逐个列出）
   - 测试：N 个用例，`sh tests/run.sh` 的结果
   - 需要组长注意：（契约里没说清、你自己做了决定的地方，逐条列出）
   ```

2. 不要执行任何 git 写操作，不要改 TASKS.md。
3. 遇到契约不清、必须改别人的文件才能继续的情况：写 `[阻塞]` 或 `[接口变更提议]` 到 LOG，然后继续做不受影响的部分。
