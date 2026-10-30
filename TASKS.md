# 任务看板

- 测试命令：`sh tests/run.sh`（用 macOS 自带的 JavaScriptCore 运行，不需要 Node）
- 状态：`待分配` → `进行中` → `待审查` → `已完成`（或 `阻塞`）
- 本阶段由组长统一更新本表，组员不要修改（避免同时写同一个文件）。

## 第 1 批：核心逻辑（2026-10-30 发布）

| 编号 | 任务 | 负责人 | 状态 | 认领的文件 |
|---|---|---|---|---|
| T1 | 宿主适配、模型调用、注入、入口装配，以及推演/规划提示词、注入文本 | Claude | 已完成（待真机验证） | manifest.json, index.js, src/types.js, src/constants.js, src/util.js, src/host/*, src/prompts/*, src/inject/*, tests/prompts/*, tests/inject/* |
| T2 | 快照、调度、解析、合并、纪要筛选（docs/tasks/T2-codex.md） | Codex | 已完成 | src/state/*, src/sim/*, src/memory/*, tests/state/*, tests/sim/*, tests/memory/* |
| T3 | 测试样本库（docs/tasks/T3-dsh.md） | dsh | 已完成 | tests/fixtures/** |

## 第 2 批（待第 1 批完成后发布）

| 编号 | 任务 | 负责人 | 状态 |
|---|---|---|---|
| T4 | 面板、设置抽屉、楼层角标（docs/tasks/T4-panel.md） | Claude（面板会话） | 已完成 |
| T5 | 分阶段引导：解析、合并、校验（docs/tasks/T5-codex.md） | Codex | 已完成 |
| T6 | 参谋对话 + 分阶段：提示词、注入、接口（组长） | Claude | 已完成 |
| T4b | 规划页改为参谋对话，暗线页支持分阶段（面板会话） | Claude（面板会话） | 已完成 |
| T7 | 集成联调与真机测试 | Claude + 用户 | 进行中 |

## v1.5 A 批：正确性修复（2026-10-30 发布，方案 docs/plans/v1.5.md）

| 编号 | 任务 | 负责人 | 状态 | 认领的文件 |
|---|---|---|---|---|
| A-Codex | A1 删兜底快照、A4 迹象过期与引导保护、跨模块测试（docs/tasks/A-codex.md） | Codex | 已完成 | src/state/snapshot-store.js, src/sim/*, tests/state/*, tests/sim/*, tests/integration/* |
| A-Claude | A2 写回保护、A3 正文定稿接线、提示词 | Claude | 已完成 | index.js, src/host/*, src/state/write-guard.js, src/prompts/*, src/types.js, src/constants.js, tests/state/write-guard.test.mjs |
| A5 | 角标与纸条显示"候选 N · 注入 M" | Claude（面板会话） | 已完成 | src/ui/*, style.css, dev/*, tests/ui/* |

## v1.5 B 批：世界模型升级（2026-10-30 发布，接口 INTERFACES.md 第 7 节）

| 编号 | 任务 | 负责人 | 状态 | 认领的文件 |
|---|---|---|---|---|
| B-Codex | 解析、检查、合并、校验（docs/tasks/B-codex.md） | Codex | 进行中 | src/sim/*, src/state/snapshot-store.js, tests/sim/*, tests/state/*（除 write-guard）, tests/integration/* |
| B-dsh | v1.5 测试样本（docs/tasks/B-dsh.md） | dsh | 进行中 | tests/fixtures/v15/** |
| B-UI | 事件记录、时间、审核记录、资料来源的显示；世界书与审核设置 | Claude（面板会话） | 进行中 | src/ui/*, style.css, dev/*, tests/ui/* |
| B-Claude | 世界书分层与预算、推演/审核提示词、注入、入口编排 | Claude | 进行中 | index.js, src/host/*, src/memory/lore.js, src/prompts/*, src/inject/*, src/types.js, src/constants.js, src/util.js, tests/host/*, tests/memory/*, tests/prompts/*, tests/inject/* |

## 待办（用户真机试用期间，按反馈排序）

| 编号 | 任务 | 说明 |
|---|---|---|
| B-1 | 真机试用与问题修复 | 清单见 docs/TESTING.md，用户边用边反馈 |
| B-2 | Agent 适配层 | 向 TauriTavern Agent 注册扩展工具（读写幕后状态、查看引导）并附一个 Skill，让 Agent Mode 写作时共用同一份幕后状态。等第一版稳定后再做 |
| B-3 | 推演结果的差异视图 | 角标点开可看"这一轮镜头外变了什么"（目前只显示变化人数） |
| B-4 | 剧情导演模式（可选） | 已决定第一版不做；如需要，作为推演的附加输出，不增加调用次数 |

## 已完成

| 编号 | 任务 | 负责人 |
|---|---|---|
| T0 | 协作约束与项目骨架 | Claude |
| B1–B3 | 第 1 轮头脑风暴与汇总 | Codex / dsh / Claude |
