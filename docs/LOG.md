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

## 2026-10-30 11:05 [dsh] [完成] T3
- 新建文件（共 93 个，全部在 tests/fixtures/ 下）：
  - `states/` 14 个：wuxia, school, western, urban, mystery, palace, apocalypse, xiuxian（8 题材）+ wuxia-pinned, school-guide, mystery-isolated, western-faded, palace-crowded, apocalypse-dead（6 特殊情况）
  - `inputs/` 5 个：wuxia, school, western, mystery, palace（与同名 state 同题材）
  - `model-outputs/sim/` 40 个 .txt + cases.json（20 正常 / 20 脏，10 种脏类型各 2 个）
  - `model-outputs/plan/` 30 个 .txt + cases.json（10 正常 / 20 脏，10 种脏类型各 2 个）
  - `worldbook/database-memos.json`（30 条纪要 + 10 条干扰）+ database-memos.cases.json（5 个查询）
- 自检（全部用脚本跑过，非目测）：
  - 93 个文件里所有 .json 均能被 `json.load` 解析，无注释、无尾逗号
  - 14 个 state 逐字段比对 src/types.js：顶层键集合完全相等；Character / Thread / Signal / Guide / Clock / Protagonist 的必填键与可选键（touchedRun、fadedRuns）无多无少；枚举值全部来自 src/constants.js；id 均匹配 `^(c|t)_[a-z0-9]{6}$`；threads[].characterIds 与 signals[].threadId/characterId 全部指向本文件真实存在的 id；knows ≤ 5；signal.text ≤ 80；同一文件 active guide ≤ 1；reachable=false 的文件不含 rumor 语态
  - 6 种特殊情况逐个断言：pinned=true 存在 / origin=user 且 guide.status=active / reachable=false / stage=faded 且带 fadedRuns / 人物恰好 14 个 / 同时有 dead 与 missing
  - inputs：recent 4–6 楼、用户与角色严格交替、每楼 50–300 字（实测 50–106）；worldInfo 2–4 条；memos 0–3 条；与同名 state 同题材
  - model-outputs：按 T3 第 3 节的 expectOk 定义写了独立校验器——去 think、取代码块或第一个配平 {...}、修尾逗号后能否得到**形状正确**的完整对象。sim 40 个（36 true / 4 false）、plan 30 个（26 true / 4 false）全部与 cases.json 声明一致；cases.json 的文件列表与磁盘实际文件严格一致
  - 脏样本里所有 id 引用都指向 basedOn 状态里真实存在的对象（如 removeCharacterIds 指向未钉住的阿鹞，不是钉住的三人）
  - worldbook：MEMBER_NAME_PATTERN 能且只能匹配 30 条，编号 1–30 连续；每条纪要内容 87–104 字（在 80–200 内）；10 条干扰项各自是不同形态（人物/物品/地点前缀、缺前缀、编号非数字、带 -备份 后缀、无编号、超范围 -草稿、换前缀）
- 不确定的地方（请组长/Codex 确认，我按最保守的解释实现）：
  1. **`upsertCharacters` / `upsertThreads` 是否必须带 name/title**：types.js 写的是 `Array<Partial<Character> & { name: string }>`，即按 id 更新也要带 name。我全部样本都带了。如果解析器实际允许按 id 更新时省略 name，那这批样本仍然合法（只是比最小要求多一个字段），不影响测试。
  2. **cases.json 里 `expectOk` 对「knows 超 5 条 / text 超 80 字 / 枚举错 / 多余字段」一律判 true**：这是按 T3 第 65 行的明文规定。这几种情况我在 cases.json 的 notes 里都写明了"应截断/丢弃"，方便 Codex 写成断言。
  3. **`dirty-long-01.txt`（plan）的 goal 超长**：T3 没给 PlanCard.goal 的字数上限，所以这个样本只能测"超长文本不崩"，不能测截断。如果之后加了上限，请改它的 expectOk 或 notes。
  4. **`palace-crowded.json` 里人物是 14 个**，超过默认 maxCharacters=12，用于测淘汰；但**钉住的人不计入淘汰**，这个文件里我故意没有钉住任何人，好让淘汰逻辑有得可淘汰。
  5. **截断样本的判定口径**：`dirty-truncated-01/02` 的 expectOk=false，依据是"取第一个 `{` 起的完整对象"会失败（外层没闭合）。如果解析器改成"随便抓一个能解析的子对象"，这两个会被误判成成功——那说明解析器太松，属于被测出来的 bug，不该改样本。
- 工作区约束：只写了 tests/fixtures/**；未改 TASKS.md / LOG 其他条目 / 任何 src 文件；未执行 git 写操作；未安装依赖；临时脚本都放在系统临时目录且已删除。

## 2026-10-30 [claude] [审查意见] T3 样本库：通过
- 93 个文件全部能被解析器和合并逻辑正确处理：sim 40/40、plan 29/30 与 cases.json 一致，14 个状态全部通过快照校验
- 唯一不一致的 plan/dirty-enum-02 是解析器的问题，不是样本的问题，已作为第 6 条追加到 docs/reviews/T2-review-1.md（Codex 请看）
- 纪要打分与 dsh 预期的前 3 条重合 9/15，关键词打分本身较粗，作为已知局限记录，不算缺陷
- dsh 的自检报告写得很好，列出的 5 个不确定点判断都正确

## 2026-10-30 [codex] [完成] T2 审查修改
- 按 docs/reviews/T2-review-1.md 的 5 条意见及 INTERFACES.md v1.2 完成修改。
- 改动文件：src/sim/parse.js、src/sim/apply.js、tests/sim/parse.test.mjs、tests/sim/apply.test.mjs；新增 tests/sim/fixtures.test.mjs；另追加本日志。未修改接口、类型、fixtures、其他成员文件或 TASKS.md，未执行 git 写操作。
- 有 id 时允许省略 name/title；id=null（及空白 id）按未提供处理；未知 id 且无名称的更新在合并时丢弃，不能通过别名误更新他人。
- pinned/origin/guide 在解析时静默剔除，合并层也不接收模型对这些字段的修改；新线仍默认 origin=sim。用户采纳与手动引导操作不受影响。
- 引用清理前，先按精确 id、再按人物名称/别名或线标题解析引用；重复人物引用合并，无法解析者仍按悬空引用处理。另补充 thinking 标签过滤。
- 样本回归仅读取 model-outputs/sim/ 和 states/：40 个 expectOk 断言全部通过，36 个成功且有 basedOn 的样本均能 applyPatch 后 makeSnapshot；ok-01 原样及在内存中删除 name/title 的版本都验证实际更新两个人物和一条线。当前磁盘 ok-01 已带 name/title，因此保留独立的 id-only 回归，未改样本。
- 测试：sh tests/run.sh 全部通过，8 个测试文件、115 个用例（本轮新增 49 个）；git diff --check -- src/sim tests/sim 无报错。

## 2026-10-30 [codex] [完成] T2 审查修改（补充第 6 条）
- 交付核对时读到组长新追加的第 6 条，已一并完成：suggestedIntensity 非法或缺失时 warning 并回退 normal，不丢弃整张规划卡。
- 本次追加改动：src/sim/parse.js、tests/sim/parse.test.mjs、tests/sim/fixtures.test.mjs；未改 fixtures 或其他成员文件。
- 按第 6 条新增遍历 model-outputs/plan/cases.json，30 个规划样本全部与 expectOk 一致；dirty-enum-02 额外断言保留唯一卡片且强度为 normal。
- 最终 sh tests/run.sh：8 个测试文件、146 个用例全部通过；本轮共新增 80 个用例。git diff --check -- src/sim tests/sim 无报错。此前 115 个通过为追加第 6 条之前的阶段结果，以本条最终结果为准。

## 2026-10-30 [claude] [决定] T2 审查通过，第 1 批完成
- T2 的 6 条审查意见全部落实；8 个测试文件、146 个用例全部通过；推演样本 40/40、规划样本 30/30 与预期一致
- 第 1 批（T1/T2/T3）全部完成。下一步：第 2 批（面板）与真机测试
