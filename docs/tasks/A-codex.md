# A 批 · Codex：分支污染、迹象过期、引导保护、跨模块测试

> 发布：Claude · 2026-10-30
> 背景：你的完整审查（docs/LOG.md）6 条均已核实，方案见 `docs/plans/v1.5.md`「A 批」。谢谢你的复现脚本，它们会变成正式测试。
> 先读：`docs/plans/v1.5.md` A 批 → `docs/INTERFACES.md` 3.5 节（基底查找、写回保护）、5.5 节末尾「A 批补充」→ `src/types.js`（`Signal.bornRun`、`ChatView` 已删 `fallbackSnapshot`）→ `src/constants.js`（`LIMITS.signalMaxAgeRuns`）

## 你负责的文件

```
src/state/snapshot-store.js
src/sim/apply.js
src/sim/parse.js        （如需要）
tests/state/*.test.mjs
tests/sim/*.test.mjs
tests/integration/*.test.mjs   （新建目录，跨模块测试）
```

组长同时在改 `index.js`、`src/host/*`、`src/state/write-guard.js`、`src/prompts/*`；面板会话在改 `src/ui/*`。不要动这些。

## 要做的事

1. **A1 删除兜底快照**（snapshot-store）
   - `findBase` 不再读 `chatView.fallbackSnapshot`；窗口内找不到有效快照就返回 `emptyState()`，`stale` 恒为 false。
   - 删掉相关测试，改为测试"即使传入了 fallbackSnapshot 也不会被使用"。

2. **A4 迹象过期**（apply）
   - 新写入的每条 signal 盖 `bornRun = next.runCount`。
   - 任何时候（含 noChange 沿用）移除 `next.runCount - bornRun >= LIMITS.signalMaxAgeRuns` 的迹象；没有 `bornRun` 的旧迹象视为已过期。
   - parse 丢弃模型写的 `bornRun`（内部字段）。
   - 快照校验接受 `bornRun`（非负整数，可缺省）。

3. **A4 引导保护**（apply）
   - 带 active 引导的线：补丁把 stage 改成 `faded` 时忽略这一项（保留原 stage，warning）；不计 fadedRuns、不删除。
   - 引导结束（done / dropped）后恢复普通规则。

4. **跨模块测试**（`tests/integration/`）：把你审查时的复现脚本改写成正式测试，至少覆盖：
   - 重抽最后一条回复时，基底不会读到正被重抽的那一楼的快照（构造只有该楼有快照、并带 fallbackSnapshot 的 ChatView）。
   - 连续多轮 noChange，迹象在 2 轮后消失。
   - 带 active 引导的线被模型连续标为 faded，线和引导都保留。
   - （写回保护的测试等组长的 `write-guard.js` 交付后再补，组长会在 LOG 通知；先不用写）

## 交付

`sh tests/run.sh` 全部通过后，在 `docs/LOG.md` 追加 `## <时间> [codex] [完成] A 批`，写明改动文件与测试结果。不执行 git 写操作，不改其他文件。
