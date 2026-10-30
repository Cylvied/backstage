# B 批 · Codex：世界事实、时间戳、检查与审核的数据逻辑

> 发布：Claude · 2026-10-30
> 先读：`docs/plans/v1.5.md`（B 批）→ `docs/INTERFACES.md` **第 7 节（全部，最重要）** → `src/types.js`（Stamp、ChronicleEntry、LoreWant、ReviewItem、Rejection、ReviewRecord、LoreUsed、SimPatch 新字段）→ `src/constants.js`（LIMITS 新增项）→ `src/util.js`（`stampOf`、`elapsedText`、`shortId('e')`）

## 你负责的文件

```
src/sim/parse.js
src/sim/apply.js
src/sim/check.js            （新建）
src/state/snapshot-store.js
tests/sim/*.test.mjs
tests/state/*.test.mjs
tests/integration/*.test.mjs
```

组长同时在改 `index.js`、`src/host/*`、`src/memory/lore.js`、`src/prompts/*`、`src/inject/*`、`src/util.js`、`src/types.js`；面板会话在改 `src/ui/*`；dsh 在补 `tests/fixtures/`。不要动这些。dsh 的新样本会陆续到位，你的测试可以先不依赖它们。

## 要做的事

1. **parse.js**：按第 7.5 节扩充 `parseSimOutput`，新增 `parseReviewOutput`。`addEvents` 每项 text 必填；`markKnown`、`loreRequests` 为字符串数组；`signals[].eventId` 为字符串或 null。丢弃模型写来的 `since`、`at`、`known`、`knownAt`、`bornRun`。
2. **check.js**（新建）：`checkPatch`、`extractReviewItems`、`applyVerdicts`，规则见第 7.5 节。**只丢弃出问题的那一项**，不要丢整个人物或整条线。每个被丢弃的项都要生成一条 `Rejection`，`reason` 用中文写清原因（用户会在面板上看到）。
3. **apply.js**：第 7.2、7.3、7.4（loreRequests 部分）、7.6 节的全部规则。
4. **snapshot-store.js**：校验接受并校验所有新字段；**旧快照（没有这些字段）必须仍然有效**。
5. 注意 A 批已有的规则继续成立：迹象 2 轮过期、进行中引导保护、写回保护。迹象的 `eventId` 指向的事件不存在时置 null。

## 测试

- 各函数的单元测试，以及至少这些跨模块场景（`tests/integration/`）：
  - 时间倒退的 clock 被丢弃，其他内容照常合并；
  - 行动文本不变时 since 沿用，换了文本时重新盖戳；
  - 同一补丁新增事件，迹象用 `"new:0"` 引用并被解析成真实 id；
  - markKnown 后事件 known、knownAt 正确；markKnown 不存在的 id 被检查丢弃并记录；
  - 审核驳回一条 addEvents 和一条 action_done 后，只有这两项被去掉；
  - 人物被淘汰后，事件记录仍保留且引用不变；
  - 事件超过 80 条时删最早的；
  - loreRequests 同名续期，5 轮未再点名移除，单轮超过 5 条被截断；
  - 旧快照（无 chronicle、loreWanted、since、review、loreUsed）仍能读取并作为基底继续推演。
- `sh tests/run.sh` 全部通过后交付。

## 交付

在 `docs/LOG.md` 追加 `## <时间> [codex] [完成] B 批`，写明改动文件、测试结果、自己做了决定的地方。不执行 git 写操作。
