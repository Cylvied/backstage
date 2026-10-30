# 协作日志（只追加，不修改、不删除他人条目）

## 2026-10-30 [claude] [决定] 建立协作约束
- 新建 COLLAB.md / TASKS.md / docs/INTERFACES.md / docs/LOG.md
- 所有成员开工前请先阅读 COLLAB.md

## 2026-10-30 [claude] [决定] 发布第 1 轮头脑风暴
- 任务书：docs/brainstorm/BRIEF.md
- Codex 负责 B1（技术可行性与架构），dsh 负责 B2（产品与叙事设计）
- 参考资料已下载到 refs/（只读，已 gitignore）
- 本轮只写意见书，不写代码

## 2026-10-30 [claude] [决定] 加强共用工作区约束
- COLLAB.md 新增 6.5 节：LOG 只能用 >> 追加、文件名不能只差大小写、refs 只读、依赖与构建只由组长执行等
- 意见书文件名改为 docs/brainstorm/opinion-<名字>.md（原 claude.md 与 CLAUDE.md 撞名）
- 第 1 轮头脑风暴期间，组员只能写自己的意见书，其余文件全部只读

## 2026-10-30 [claude] [完成] 第 1 轮头脑风暴汇总
- Codex、dsh 意见书已交付，均遵守了工作区约束
- 汇总与组长裁定：docs/brainstorm/SUMMARY.md
- 等待用户拍板第 4 节问题后再写接口文档；在此之前组员不要开工

## 2026-10-30 [claude] [决定] 发布第 1 批实现任务
- 用户已拍板：导演第一版不做；注入在深度 1，暗流与引导分块；借鉴人物谱 3 点；可选读取数据库纪要
- 接口文档：docs/INTERFACES.md（v1）；类型：src/types.js
- 技术栈：原生 JS ES 模块，无构建、无依赖；本机无 Node，测试先写不跑
- Codex → T2（docs/tasks/T2-codex.md），dsh → T3（docs/tasks/T3-dsh.md），Claude → T1
- git 规则变更：组员不执行 git 写操作，由组长审查后统一提交（COLLAB.md 第 4 节）

## 2026-10-30 [claude] [决定] 调整 T3 分工
- 用户要求给 dsh 安排量大、格式固定、不易出错的工作
- 提示词（src/prompts/*）与注入文本（src/inject/*）改由 Claude 负责
- dsh 的 T3 改为测试样本库，只写 tests/fixtures/**，见 docs/tasks/T3-dsh.md（已重写）
- Codex：T2 不受影响。tests/fixtures/ 由 dsh 提供，你的测试可以先不依赖它，样本到位后组长再通知

## 2026-10-30 [claude] [决定] 接口补充（给 Codex）
- INTERFACES.md 5.3：scheduler 中 reason='manual' 的任务不参与去重（用户点"重新推演"时必须真的重跑）

## 2026-10-30 [codex] [开始] T2
- 已完整阅读最新 COLLAB.md、TASKS.md、INTERFACES.md、T2 任务书及类型/常量/工具。
- 按既有认领实现 src/state/{snapshot-store,scheduler}.js、src/sim/{parse,apply}.js、src/memory/database-memo.js 及各自测试；不修改 TASKS.md，不执行 git 写操作。
- command -v node 未找到运行时，遵照任务书不安装依赖，测试先编写后静态核查。
- 提醒：fallbackSnapshot 的分支不保证正确是现有契约已知限制，本次按契约返回 stale=true，不自行改变接口。

## 2026-10-30 [claude] [决定] 接口补充（给 Codex）
- INTERFACES.md 5.5：patch.noChange=true 且 patch.signals 为空时，applyPatch 保留上一轮的 signals，不清空

## 2026-10-30 [claude] [决定] 测试现在可以真正运行了（Codex 请注意）
- 不需要 Node：用 macOS 自带的 JavaScriptCore 运行，命令 `sh tests/run.sh tests/state`（或 tests/sim、tests/memory）
- 测试写法改为：`import { test, assert } from '../harness.js';`，**不要用 node:test / node:assert**（jsc 里没有）
- 断言：ok / equal / notEqual / deepEqual / match / doesNotMatch / throws / rejects；支持 async 测试
- 已写好的 node:test 测试只需改 import 两行
- 运行测试是允许的（只在系统临时目录产生文件）；交付时请写明测试结果，而不是"未运行"
- 示例：tests/inject/compose.test.mjs（10/10 通过）

## 2026-10-30 [codex] [完成] T2
- 改动文件：src/state/snapshot-store.js、src/state/scheduler.js、src/sim/parse.js、src/sim/apply.js、src/memory/database-memo.js、tests/state/snapshot-store.test.mjs、tests/state/scheduler.test.mjs、tests/sim/parse.test.mjs、tests/sim/apply.test.mjs、tests/memory/database-memo.test.mjs；另按约定追加本日志。未改 TASKS.md，未执行 git 写操作。
- 测试：采用 ../harness.js；T2 共 49 个用例（快照 10、调度 9、解析 11、合并 13、纪要 6）。最后一次 sh tests/run.sh 全部通过：7 个测试文件、66 个用例（含现有注入 10、提示词 7）；git diff --check 无报错。
- 已落实补充规则：manual 不参与去重（仍遵守同聊天排队任务被新任务替换）；noChange=true 且 signals 为空时保留旧信号，同时递增 runCount 和 fadedRuns。
- 调度采用全局单工作槽（比同聊天串行更保守），cancelAll 后等待原 runJob settle 才启动后续任务，避免不响应取消的旧请求与新请求交叠；因此 llm 层必须保证请求有终态/超时。写回过期判断仍由 index/host 执行，调度器不访问宿主。
- 解析只修字符串外尾逗号，不补猜截断内容；缺省补丁容器为空；数组坏项丢弃并 warning。无有效规划卡时返回失败，显式 cards=[] 合法。未知字段及模型伪造的 touchedRun/fadedRuns 丢弃。
- 合并取舍：已有 pinned=true 不允许模型解除；人物上限按总人数计算，钉住者超额也保留；新人物/线的 ID 始终由程序生成。清理被删对象的悬空引用；采纳到 faded 线时恢复 seeded；同一时刻仅保留一个 active guide。
- 纪要按中文 bigram/英文单词重合评分，正文命中 1 分、keys 命中 2 分，同分保留原顺序；无命中返回空、重复正文去重。
- 已知契约限制：fallbackSnapshot 只作 stale=true 的兜底，可能属于不匹配分支；isSnapshotValid 按当前契约仅校验 AI 消息和正文 hash，不额外验证祖先链。真机分支一致性与异步写回需在 T5 验收。

## 2026-10-30 [claude] [审查意见] T2 第 1 轮
- 结论：整体质量好，需修改后通过。详见 docs/reviews/T2-review-1.md（5 条）
- 用 dsh 的样本库实测发现：只写 id 的更新被整条丢弃。契约已放宽，INTERFACES.md 升到 v1.2（3.7 节），types.js 同步
- tests/harness.js 新增 readFixture / readFixtureJson，用于读取样本库
