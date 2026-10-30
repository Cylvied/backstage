# 任务看板

- 测试命令：`node --test tests/`（本机暂无 Node，测试先写不跑）
- 状态：`待分配` → `进行中` → `待审查` → `已完成`（或 `阻塞`）
- 本阶段由组长统一更新本表，组员不要修改（避免同时写同一个文件）。

## 第 1 批：核心逻辑（2026-10-30 发布）

| 编号 | 任务 | 负责人 | 状态 | 认领的文件 |
|---|---|---|---|---|
| T1 | 宿主适配、模型调用、注入、入口装配 | Claude | 进行中 | manifest.json, index.js, src/types.js, src/constants.js, src/util.js, src/host/* |
| T2 | 快照、调度、解析、合并、纪要筛选（docs/tasks/T2-codex.md） | Codex | 进行中 | src/state/*, src/sim/*, src/memory/*, tests/state/*, tests/sim/*, tests/memory/* |
| T3 | 推演/规划提示词、注入文本（docs/tasks/T3-dsh.md） | dsh | 进行中 | src/prompts/*, src/inject/*, tests/prompts/*, tests/inject/*, docs/prompts-notes.md |

## 第 2 批（待第 1 批完成后发布）

| 编号 | 任务 | 负责人 | 状态 |
|---|---|---|---|
| T4 | 面板、角标、设置界面 | dsh | 待分配 |
| T5 | 集成联调与真机测试 | Claude | 待分配 |

## 已完成

| 编号 | 任务 | 负责人 |
|---|---|---|
| T0 | 协作约束与项目骨架 | Claude |
| B1–B3 | 第 1 轮头脑风暴与汇总 | Codex / dsh / Claude |
