# T5 · Codex：分阶段引导的解析、合并与校验

> 发布：Claude · 2026-10-30
> 背景：用户希望剧情引导能像"故事神谕"的序列引导一样**分阶段注入**：一条长线分成 2–8 拍，一次只引导当前这一拍。
> 先读：`docs/INTERFACES.md` **3.9 节（规则，最重要）**、5.4 节、5.5 节末尾的 v1.3 要求 → `src/types.js` 里的 `Beat`、`Guide`、`PlanCard`、`SimPatch` → `src/constants.js` 的 `LIMITS.beatsMin/beatsMax`、`BEAT_STATUSES`

## 你负责的文件（只能写这些，和 T2 相同）

```
src/state/snapshot-store.js
src/sim/parse.js
src/sim/apply.js
tests/state/*.test.mjs
tests/sim/*.test.mjs
```

## 要做的事

1. **parse.js**
   - `parsePlanOutput`：解析卡片的 `beats`。每拍 `title`、`goal` 必填，`firstSigns` 缺省为 `''`；坏拍丢弃并 warning；有效拍少于 2 个时**去掉 beats，按单步卡处理**；超过 8 个截断。
   - `parseSimOutput`：解析 `guideReached`，不是布尔值就忽略（不要让整个补丁失败）。
2. **apply.js**
   - `adoptPlan`：带 beats 的卡 → 分阶段引导：第一拍 `active`，其余 `pending`，`beatIndex = 0`，`guide.goal` = 卡的 goal，`guide.firstSigns` = 第一拍的 firstSigns，`reached = false`。实现 3.9 节的"替换剩余拍"。单步卡的行为保持 v1.2 不变（`beats: null`）。
   - 新增 `advanceBeat(state, threadId)`、`skipBeat(state, threadId, index)`，规则见 3.9 节。对单步引导调用 `advanceBeat` 等同于把引导标为 `done`。非法 threadId 或 index 时原样返回（复制后的）状态，不抛错。
   - `applyPatch`：`patch.guideReached === true` 时把当前 active 引导的 `reached` 设为 true。
   - `setGuideIntensity`：同时把 `reached` 清为 false。
   - 换拍后 `guide.firstSigns` 要跟上当前拍。
3. **snapshot-store.js**：状态校验接受并校验 `beats`、`beatIndex`、`reached`（`beats` 存在时 `beatIndex` 必须指向一个存在的拍，且最多一个 `active`）。**没有这些字段的旧快照必须仍然有效。**

## 测试

- 覆盖：采纳分阶段卡、拍数不足退化为单步、截断到 8 拍、连续换拍直到完成、跳过当前拍和跳过后面的拍、替换剩余拍（保留已完成的拍）、`guideReached` 设置与清除、旧快照仍有效、新字段非法时快照无效。
- 运行 `sh tests/run.sh`，**全部通过**后交付。现有 146 个用例不能被改坏。

## 交付

在 `docs/LOG.md` 追加 `## <时间> [codex] [完成] T5`，写明改动文件、测试结果、自己做了决定的地方。不执行 git 写操作，不改其他文件。

## 注意

组长同时在改 `src/inject/compose.js` 和 `src/prompts/*`，另一个 Claude 会话在改 `src/ui/*`。这些都不是你的文件，不要动。
