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

## 2026-10-30 [claude] [决定] 发布 T4 面板任务
- 用户决定：新开一个 Claude 会话做面板，组长负责对接与审查；风格参考 Claude 网页版的极简风格与配色
- 任务书：docs/tasks/T4-panel.md；面板接口：INTERFACES.md 5.10
- index.js 新增 onStateChanged / getFloorInfo / settings；面板模块加载失败时自动退回简易设置抽屉
- manifest.json 引用 style.css
- 面板会话在日志里的署名为 [claude-ui]

## 2026-10-30 11:25 [claude-ui] [完成] T4
- 改动文件（全部新建，未改任何他人文件）：
  - src/ui/panel.js（入口：mountPanel / mountSettings、外框、状态条、标签页、魔杖菜单入口）
  - src/ui/tab-characters.js、src/ui/tab-threads.js、src/ui/tab-note.js、src/ui/tab-plan.js（四个标签页）
  - src/ui/settings.js（设置抽屉 #backstage_settings_v2）
  - src/ui/badges.js（楼层角标）
  - src/ui/state-edits.js（纯函数：togglePin / removeCharacter / updateCharacter / updateThread / removeThread / guideCardForThread / parseList）
  - src/ui/format.js（纯函数：文案、排序、状态条与角标判断、颜色明暗、设置数值范围）
  - src/ui/dom.js、src/ui/theme.js（DOM 小工具；跟随宿主明暗）
  - style.css（所有选择器限定在 #backstage-panel / #backstage_settings_v2 / .bs-badge 下，颜色全部取 --bs-* 变量）
  - tests/ui/state-edits.test.mjs、tests/ui/format.test.mjs（19 个用例）
  - dev/panel-preview.html、dev/preview.js、dev/mock-api.js、dev/serve.py（预览页 + 模拟 api + 不缓存的静态服务器）
- 已验证（内置浏览器，预览页 + 模拟 api，样本取 tests/fixtures/states/*.json；注入、采纳、规划解析用的是项目里的真实纯函数）：
  - 浅色桌面、深色桌面（1280 宽）、浅色手机、深色手机（375 宽）四种组合；四个标签页
  - 手机：页面与面板内容都无横向滚动；面板内所有按钮高度 ≥ 44px（脚本逐个量过）
  - 状态条六种状态（最新 / 推演中 / 落后 / 失败带原因 / 未选连接 / 已关闭）；"立即推演"→推演中→最新
  - 人物：编辑保存、取消、钉住后排到最前、移除需点两次确认；暗线：切换强度、开始引导（已有引导时提示会替换，确认后旧线变为"引导已放弃"）、编辑、删除
  - 规划：加载中、失败显示原因、空结果、采纳（会替换时按钮变为"替换并采纳"并说明）；切换聊天时清空方案卡，进行中的请求结果作废
  - 空状态（emptyState）：三个标签页都有说明；纸条"本轮不注入"
  - 保存失败（editState reject）：显示原因，表单保持打开、输入不丢
  - 设置：选中连接后醒目提示消失、状态条同步；数字项按范围夹紧
  - 楼层角标四种：成功（带变化人数）/ 失败 / 已编辑 / 已失效
  - 截图在共享笔记目录 T4-screens/（浅色桌面、深色桌面、浅色手机、规划标签页、手机端规划失败+未选连接）
- 测试：`sh tests/run.sh` 10 个测试文件、165 个用例全部通过（新增 tests/ui 19 个）
- 预览方法：`python3 dev/serve.py`（端口 8765，仅本机）→ 打开 http://127.0.0.1:8765/dev/panel-preview.html ，顶部可切样本/明暗/状态/规划结果；URL 参数见 dev/preview.js。开发期间用过 8765 端口，已关闭
- 需要组长注意：
  1. 没有真机验证：魔杖菜单项（等 #extensionsMenu 出现后再挂，图标用 fa-masks-theater）、inline-drawer 展开（依赖宿主全局处理）、角标挂载位置（.mes_header_info .flex-container，找不到退回 .ch_name）、主题检测（读 --SmartThemeBlurTintColor，再看 body 背景，最后 prefers-color-scheme）都需要 T5 在 TauriTavern 里确认
  2. 角标和"切换聊天清空方案卡"直接用了 SillyTavern.getContext() 的 eventSource / eventTypes（CHARACTER_MESSAGE_RENDERED、CHAT_CHANGED、MORE_MESSAGES_LOADED、MESSAGE_SWIPED/UPDATED/EDITED/DELETED），没有走 api。若希望面板只通过 api 拿事件，可考虑给 api 加 onChatChanged，我再改
  3. [接口建议，非阻塞] api.plan 在未选连接时会直接调用 llm，报错信息取决于 llm.js；建议 index.js 在 profileId 为空时先抛"需要先选择推演用的连接"。面板这边状态条已有醒目提示，没有额外拦截
  4. "开始引导"（给已有的线加引导）是用 guideCardForThread 生成一张 threadId 指向该线的卡，再调 api.adopt，复用 adoptPlan 的"只留一条引导"逻辑，没有新增接口
  5. 编辑都通过 api.editState，因此保存在最后一条 AI 回复上；没有 AI 回复时 index.js 会 reject，面板显示其原因
  6. style.css 776 行，超过"单文件尽量 400 行"的建议；按区块分节注释，拆分需要 manifest 引用多个 css，所以没拆
  7. 我没有改 TASKS.md（看板写明由组长统一更新）

## 2026-10-30 [claude] [决定] 剧情参谋对话 + 分阶段引导（接口 v1.3）
- 用户决定：规划改成像故事神谕那样可以多轮讨论的参谋对话；引导可以分阶段注入（序列引导）
- 设计见 INTERFACES.md 3.9 节（分阶段规则）与 5.10 节（advisor 接口、advanceBeat/skipBeat）
- 分工：Codex → T5（docs/tasks/T5-codex.md）；面板会话 → T4b；组长 → 参谋提示词、注入文本、接口
- 换拍不调用模型；后台推演只给"这一拍好像演完了"的提示，绝不自动换拍

## 2026-10-30 [codex] [开始] T5
- 已阅读 COLLAB.md、任务看板、T5 任务书、完整接口及近期日志；按既定认领仅修改 src/state/snapshot-store.js、src/sim/parse.js、src/sim/apply.js 和 tests/state/*.test.mjs、tests/sim/*.test.mjs，并追加本日志。
- TASKS.md 已标为进行中，遵照看板要求不修改共享看板；不执行 git 写操作。

## 2026-10-30 [codex] [完成] T5
- 改动文件：src/sim/parse.js、src/sim/apply.js、src/state/snapshot-store.js；新增 tests/sim/beats.test.mjs；另追加本日志。仅修改任务授权文件，未改 TASKS.md，未执行 git 写操作。
- 实现：解析并过滤 beats，缺省 firstSigns 为空串，有效拍不足 2 拍退为单步、超过 8 拍截断；guideReached 非布尔时忽略。采纳、替换剩余拍、advanceBeat、skipBeat、提示设置与清除、当前拍迹象同步及快照校验均已完成；旧版单步快照仍有效。
- 测试：sh tests/run.sh 全部通过，13 个测试文件、195 个用例（包含其他成员同期新增测试）；本任务新增 15 个回归用例，原有测试未修改。git diff --check -- src/sim/parse.js src/sim/apply.js src/state/snapshot-store.js tests/sim/beats.test.mjs 无报错。
- 取舍：8 拍上限仅用于新卡，替换时保留全部 done/skipped 历史，所以累计快照允许超过 8 拍；测试覆盖 10 拍历史。结束时 beatIndex 留在最后处理的有效拍，firstSigns 与该拍一致，避免产生越界快照。
- 取舍：仅当前 active 引导允许换拍/跳拍；已结束引导、已完成/已跳过拍、非法目标或索引不操作且返回副本。跳过未来拍不改变当前提示；guideReached=false 不主动撤销提示，只有换拍、合法调整强度、重新采纳会清除。模型绝不自动换拍。
- 快照除字段类型外还校验 active 拍与 beatIndex 一致、firstSigns 与当前拍一致；不要求已结束/放弃的引导必须存在 active 拍。已完成待组长审查。

## 2026-10-30 [claude] [审查意见] T5 第 1 轮
- 实现完整、测试充分，改 1 处后通过：快照校验不要检查 guide.firstSigns 与当前拍一致（会让用户编辑保存失败）。详见 docs/reviews/T5-review-1.md

## 2026-10-30 12:15 [claude-ui] [完成] T4b
- 改动文件：
  - 新建：src/ui/tab-advisor.js（参谋对话页）、src/ui/plan-card.js（方案卡，从原规划页抽出并支持 beats）、dev/mock-advisor.js（模拟参谋回复与预置多轮对话）、dev/mock-beats.js（预览用的分阶段引导样例数据）、tests/ui/advisor-format.test.mjs
  - 修改：src/ui/panel.js（「规划」→「参谋」标签；切到参谋并预填；重画时保留输入框焦点与光标；新消息自动滚到底；切换聊天时关闭表单、清空参谋草稿）、src/ui/tab-threads.js（分阶段引导）、src/ui/format.js（beatProgress / adoptView / retryText / adjustBeatsPrompt / ADVISOR_EXAMPLES）、src/ui/settings.js（"规划"字样改为"参谋"）、style.css（对话、拍列表、落拍提示）、dev/mock-api.js、dev/preview.js、dev/panel-preview.html
  - 删除：src/ui/tab-plan.js（我自己的文件，被参谋页取代）
- 参谋页：消息列表 + 底部输入框（回车换行，「发送」按钮发送，桌面 Ctrl/⌘+回车也可发送）；用户消息先显示，"参谋在想…"；回复下方方案卡复用原样式，选强度 → 采纳 / 替换并采纳 / 采纳并替换剩余拍（同一条分阶段线时）；分阶段卡显示"分阶段方案 · N 拍"，各拍可展开看目标和起始迹象；失败回复显示原因和「重试」（重发它前面那条用户消息）；「整理成方案」「清空对话」（二次确认）；空状态 3 个可点的示例问题
- 暗线页：分阶段引导显示"第 X / Y 拍"与拍列表（✓ ▶ ○ ⤫，当前拍展开）；「完成这一拍」/ 最后一拍「完成整条引导」；待演的拍可「跳过」（二次确认）；「找参谋改改」切到参谋页并预填"我想调整当前的分阶段引导「…」："；guide.reached 时卡片内显示"这一拍看起来已经演完了"+「进入下一拍」（单步引导为"这条引导看起来已经达成了"+「标为完成」），不弹窗；结束的分阶段引导显示"完成 N / M 拍"
- 已验证（预览页，脚本逐项点过 + 截图）：空对话→点示例→回复带单步和分阶段卡；多轮对话；发送时用户消息立即出现、"参谋在想"、输入框清空且不丢焦点、自动滚到底；失败回复只在对话里显示一次（不重复弹提示条）、重试；整理成方案；二次确认清空；切换聊天显示另一份记录、等待中的回复不会落进新聊天、草稿清空；采纳分阶段卡 → 暗线页逐拍推进、跳过、完成整条、落拍提示；同一条线再采纳分阶段卡 → 保留已完成/已跳过的拍；手机 375 宽浅/深色无横向滚动、所有按钮 ≥ 44px
  - Codex 的 advanceBeat / skipBeat / adoptPlan(beats) 在我做的过程中已落地，预览的模拟 api 最后改为直接调用 src/sim/apply.js 的正式实现，上面的流程用正式实现又跑了一遍
  - 截图：共享笔记目录 T4b-screens/（参谋浅色桌面、参谋深色手机、分阶段暗线卡桌面 / 手机）
- 测试：`sh tests/run.sh` 13 个测试文件、195 个用例全部通过（tests/ui 新增 6 个）
- 需要组长注意：
  1. 参谋输入框按要求回车换行；另加了 Ctrl/⌘+回车发送，不需要可以去掉
  2. 失败回复的「重试」会再发一次同样的用户消息，所以记录里会出现两条相同的用户消息（api.advisor.send 总是先写入用户消息）。如果希望重试不重复，需要 api 提供 retry 或允许 send 不写入用户消息
  3. 「整理成方案」走 api.advisor.summarize，记录里会出现那条固定的用户消息"请把我们到目前为止的讨论整理成方案卡。"，我没有隐藏它
  4. 方案卡的"已采纳"标记只记在面板内存里（刷新页面后不再显示"已采纳"，但引导本身已保存）
  5. 「跳过」只给待演的拍；当前拍要换掉可以用「完成这一拍」或找参谋改。接口允许跳过当前拍，如需要我再加
  6. style.css 现 956 行（上次 776），原因同前
  7. 开发期间用过 8765 端口（dev/serve.py），已关闭

## 2026-10-30 [claude] [审查意见] T4 + T4b：通过
- 组长亲自在预览页检查：参谋对话（浅色桌面）、分阶段暗线卡与落拍提示（深色手机），风格与交互都符合要求
- 采纳面板会话的建议：index.js 新增 api.advisor.retry()（重试不重复写入用户消息），INTERFACES.md 5.10 已更新；请面板会话把「重试」改用它
- Ctrl/⌘+回车发送保留；「整理成方案」的固定消息显示在记录里，保留

## 2026-10-30 12:40 [claude-ui] [完成] T4c
- 改动文件：src/ui/tab-advisor.js、src/ui/format.js、tests/ui/advisor-format.test.mjs、dev/mock-api.js
- 参谋页「重试」改用 api.advisor.retry()：只有最后一条失败回复带「重试」（retry 只处理这种情况），旧的失败回复不再有按钮；重试不再重复写入用户消息
- 发送 / 整理成方案 / 重试统一走一个 run(ctx, request) 辅助函数；判断"失败原因已写进对话"改为比较最后一条记录的时间戳（重试时记录条数不变，原来按条数判断会误弹提示条）
- 删除不再使用的 format.js retryText 及其测试
- dev 模拟 api 新增 advisor.retry()，行为与 index.js 一致（删掉失败回复，用前面的用户消息重新请求，不重复写入；没有可重试的则 reject"没有可以重试的消息。"）
- 已验证（预览页脚本）：多轮对话里重试成功后记录为 u/a 交替无重复；回复总失败时重试后仍只有一条失败回复、无重复提示条；连续两次失败只有最后一条带「重试」；没有可重试时 retry() reject
- 测试：`sh tests/run.sh` 全部通过（13 个文件、194 个用例；tests/ui 少了 retryText 的 1 个用例）

## 2026-10-30 [codex] [完成] T5 审查修改
- 按 docs/reviews/T5-review-1.md 唯一意见，删除快照校验中 guide.firstSigns 与当前拍 firstSigns 的一致性检查，保留字段类型、枚举、索引及 active 拍结构校验；apply.js 换拍同步迹象的逻辑保持不变。
- 改动文件：src/state/snapshot-store.js、tests/sim/beats.test.mjs；另追加本日志。调整原无效快照用例，新增 1 个回归测试，分别验证编辑引导迹象或当前拍迹象导致不一致时，makeSnapshot 仍可保存、readSnapshot 仍可读取，并完整保留编辑内容。
- 验证：sh tests/run.sh 全部通过，13 个测试文件、195 个用例（分阶段测试 16 个）；git diff --check -- src/state/snapshot-store.js tests/sim/beats.test.mjs 无报错。
- 未修改其他成员文件或 TASKS.md，未执行 git 写操作；待组长复审。

## 2026-10-30 [claude] [决定] T5 复审通过，第 2 批完成
- T5 修改正确：编辑引导迹象后快照仍有效；13 个测试文件、195 个用例全部通过
- 第 2 批（T4/T4b/T4c 面板、T5 分阶段、T6 参谋与注入）全部完成。下一步：T7 真机测试（scripts/install.sh）

## 2026-10-30 [claude] [决定] 真机测试发现：需要插件内直填 API（接口 v1.4）
- 用户没有任何连接配置（习惯像数据库、故事神谕那样在插件里直接填 API），原设计的"选连接配置"下拉框是空的
- 新增直填模式（默认）：地址 + 密钥 + 模型，经宿主后端 custom 源转发；已核实 TauriTavern 的 custom 源支持 custom_include_headers 且无密钥不报错
- 新增 settings.fetchModels / testApi / isApiReady；API 未就绪时不自动推演
- 面板会话需在设置抽屉加 API 配置界面（T4d）

## 2026-10-30 13:20 [claude-ui] [完成] T4d
- 改动文件：
  - 新建：src/ui/settings-api.js（「模型 API」一节）、tests/ui/api-settings.test.mjs
  - 修改：src/ui/settings.js（API 节放在最上方；提示改用 isApiReady；新增 revealSettings；修复抽屉无法收起，见下）、src/ui/panel.js（状态条改用 isApiReady，未配置时按钮变「去配置」）、src/ui/format.js（statusView 改收 { enabled, apiReady }；新增 filterModels、testResultText）、style.css、tests/ui/format.test.mjs、dev/mock-api.js、dev/preview.js、dev/panel-preview.html
- 「模型 API」：分段控件「直填 API」（默认）/「使用连接配置」；直填有 API 地址（placeholder 为 Gemini 的 OpenAI 兼容地址，下方说明"填到 /v1 这一层即可"）、密钥（password + 显示/隐藏）、模型（可手填；「获取模型」后在下方出现可点选的列表，在模型框里输入即可筛选，点选即填入并保存）；连接配置模式保留下拉框，没有连接时提示"建议改用直填 API"；「测试连接」带当前表单值调用 testApi，成功显示"可用 · 模型 · 耗时"，失败显示原因；小字说明密钥保存在本地扩展设置
- 保存：输入框边打边存（400ms 延迟），切换方式、点选模型、选连接立即保存；立即保存会并入并取消尚未保存的输入（验证中发现：先打字筛选再点选模型，延迟的旧输入会后到并覆盖所选模型，已修复）
- "是否已配置"统一用 api.settings.isApiReady()：设置顶部提示"需要先配置模型 API"，面板状态条同样文案，按钮变成实心「去配置」→ 关闭面板、打开宿主扩展设置（#extensions-settings-button）、展开「幕后」并滚动过去；找不到设置抽屉时用提示条说明位置
- 顺带修了 T4 的一个缺陷：原先 .bs-set 的 display:flex 直接加在 .inline-drawer-content 上，会盖掉宿主用来收起抽屉的 display:none，真机上「幕后」设置会一直展开、点标题收不起来。现在布局放在内层 div 上
- 已验证（预览页脚本 + 截图）：未配置 → 提示与「去配置」→ 填地址/密钥 → 获取模型 → 筛选 → 点选 → 测试成功、提示消失、状态条变"已是最新"；获取模型失败、测试失败显示原因；连接配置模式 + 没有连接时的提示与测试失败；抽屉展开/收起；浅色桌面、深色手机（375 宽无横向滚动，API 区所有按钮和输入框 ≥ 44px）。截图在共享笔记目录 T4d-screens/
- 测试：`sh tests/run.sh` 15 个测试文件、204 个用例全部通过（tests/ui 新增 4 个、改 1 个）
- 需要组长注意：
  1. 模型框同时是筛选框：拉到列表后在框里输入会筛选，同时这段文字也会作为模型名保存（手填和筛选是同一个框，符合"可手填"的要求）；点选后以点选为准
  2. 「测试连接」不会自动保存；但表单本身是边填边存的，所以测试用的值和保存的值一致
  3. 面板「去配置」依赖宿主的 #extensions-settings-button .drawer-toggle 和 #rm_extensions_block.openDrawer（取自 refs/TauriTavern/src/index.html），需要真机确认
  4. 开发期间用过 8765 端口（dev/serve.py），已关闭

## 2026-10-30 [claude] [决定] 设置搬进面板（T4e）
- 真机发现：主题扩展 Claude Web 2.0 会接管并重排所有扩展的设置抽屉，导致「API 地址」等动态输入框消失
- 用户确认：设置放进面板，给一个设置按钮。完整设置（含模型 API）进面板设置页；扩展抽屉只留开关、API 状态和「打开幕后设置」按钮
- 已交给面板会话（T4e）

## 2026-10-30 14:00 [claude-ui] [完成] T4e
- 改动文件：
  - 新建：src/ui/settings-page.js（面板设置页：模型 API + 推演 / 注入正文 / 数据库纪要）
  - 修改：src/ui/panel.js（头部齿轮按钮、设置视图、mountSettings 改为包一层把"打开幕后设置"接到面板）、src/ui/settings.js（精简抽屉；删除 revealSettings）、src/ui/settings-api.js（控件改用插件自己的样式类）、src/ui/format.js（新增 apiStatusView；状态条说明改为"点「去配置」填写地址和模型"）、style.css（设置相关样式全部移到 #backstage-panel 下；抽屉只留两条小样式）、tests/ui/api-settings.test.mjs、dev/preview.js、dev/panel-preview.html
- 入口：面板头部关闭按钮左边加齿轮按钮（再点一次或「‹ 返回」/ Esc 回到标签页）。进入设置时隐藏标签栏，状态条保留。做成单独视图而不是第五个标签：手机上 4 个标签已经占满一行
- 设置页进入时按最新设置建一次，停留期间不随 onStateChanged 重画（否则每次保存都会冲掉正在填的输入框）；重新打开面板时若仍在设置页，按最新值重建
- 扩展设置抽屉精简为：一句说明（设置在面板里，怎么找到）、「启用后台推演」开关、API 状态一行（已配置 · 模型名 / 已配置 · 连接配置：名称 / 需要先配置模型 API）、「打开幕后设置」按钮（打开面板并进入设置页）。没有任何靠 hidden 切换的区块；状态行和开关在 onStatus / onStateChanged 时直接改自身内容，被主题搬走后仍会更新
- 状态条未配置时的「去配置」改为进入面板设置页
- 已验证（预览页脚本 + 截图）：去配置 → 设置页 → 填地址和模型 → 提示消失、状态条和抽屉状态行同步变为已配置，填写过程中输入框不丢焦点；返回 / 齿轮 / Esc；浅色桌面、深色手机（375 宽无横向滚动，设置页所有按钮和输入框 ≥ 44px）；精简抽屉；mangle=1 模拟主题把抽屉控件拆进独立的 .cwx-row 后，开关、状态行、「打开幕后设置」都仍可用。截图在共享笔记目录 T4e-screens/
- 测试：`sh tests/run.sh` 15 个测试文件、205 个用例全部通过（新增 apiStatusView 1 个）
- 需要组长注意：
  1. mangle 模拟只是粗略版本（拆控件、标签留原处），没有复刻主题按祖先显隐计算每行显隐的逻辑；真机请再看一眼精简抽屉
  2. 抽屉的复选框用 label[for] 关联，被拆开后点文字可能不再切换开关，直接点复选框本身没问题
  3. 开发期间用过 8765 端口（dev/serve.py），已关闭

## 2026-10-30 [claude] [决定] 真机反馈：注入的迹象与暗线无关
- 现象：首轮推演的 2 条迹象都没挂暗线或人物（一条是镜头内的场景细节）；暗线被建成了"需要保密的秘密"这类静态设定
- 修复：推演提示词规定每条迹象必须来自一条暗线或不在场人物，镜头内细节不算迹象；暗线 = 镜头外正在发展、有人推动的事，静态秘密记入人物认知
- compose.js 增加保险：未挂到现存暗线或人物上的迹象一律不注入
- 请面板会话在纸条页标注每条迹象的来源（T4f）

## 2026-10-30 14:30 [claude-ui] [完成] T4f
- 改动文件：新建 src/ui/signal-sources.js、tests/ui/signal-sources.test.mjs；修改 src/ui/tab-note.js、src/ui/tab-threads.js、src/ui/panel.js（ctx.goTab）、style.css、dev/mock-api.js、dev/preview.js
- 纸条页「暗流」：注入原文下面列出本轮被选中的每条迹象：语态标签 + 文本 + 来源（"来自暗线：标题"、"来自：人物"，两者都有就都写）。被选中的迹象直接用 compose.js 的 selectSignals(state, settings.maxSignals)，没有重写挑选逻辑；src/ui/signal-sources.js 只负责把 id 换成标题和名字
- state.signals 里既不指向现存暗线、也不指向现存人物的迹象，在下方用一行次要文字"另有 N 条迹象没有挂在暗线或人物上，未注入"，点开可看原文；全部被过滤时照旧显示"本轮不注入"并附这行说明。暗流注入关闭时不显示这行
- 暗线卡：这条线本轮有迹象被注入时，标题下显示"本轮已透出迹象 ›"，点击切到纸条页
- 预览：orphans=1 额外加两条来路不明的迹象（一条 threadId/characterId 为空，一条指向不存在的线）；默认样本 school-guide 的迹象带来源
- 已验证（预览页脚本）：来源文字正确、未挂靠的迹象不出现在注入原文里、提示行条数正确、全部被过滤时的显示、暗线卡标记与跳转
- 测试：`sh tests/run.sh` 16 个测试文件、209 个用例全部通过（新增 4 个）
- 需要组长注意：被 selectSignals 因其他原因（数量上限、主角隔绝时的风闻、暗流语态最多 1 条）没选上的迹象不在提示行里，提示行只统计"来路不明"的
- 更正：上条 T4f 的用例数应为 210（16 个测试文件，全部通过），不是 209

## 2026-10-30 [claude] [真机] 核心流程验证（第 1 部分）
- 用户确认：插件加载、面板设置配置 API、测试连接、后台推演均成功；修复后迹象与暗线对得上
- 待验证：重 roll / 切 swipe 的状态对应、注入位置（模型请求日志）、参谋对话与分阶段引导

## 2026-10-30 [claude] [决定] 进入真机试用期
- 用户边用边测，发现问题再反馈。测试清单：docs/TESTING.md；待办：TASKS.md「待办」一节
- 组员暂无新任务

## 2026-10-30 [codex] [审查意见] 用户直接要求：全流程复核与幕后事实/认知分离
- 范围：按用户直接要求审查入口、宿主适配、调度/快照、推演解析合并、提示词与注入、面板；未修改运行代码、接口、任务分配或部署。修改文件仅本日志；复现脚本在 /tmp/backstage-review.mjs。
- 验证：sh tests/run.sh 全部通过；另用 JavaScriptCore 独立复现下列回退、迹象寿命、引导淘汰问题。TauriTavern 只读查看当前 #44 角标及人物/纸条/暗线页，未发送消息、重新推演或修改聊天。
- P1：src/state/snapshot-store.js:89-92 在找不到范围内快照时，无条件采用 metadata.lastSnapshot，未限定窗口缺失、楼层上界或分支。复现仅有第 0 楼快照，findBase(view,-1) 仍返回第 0 楼状态；新 swipe 无快照也回退旧 swipe。index.js:126 不处理 stale，重抽排除当前楼的意图被绕过。建议仅在可证明为当前分支且早于目标的窗口缺失情形允许回退；无法验证则初始状态/明确提示。另 parentId 当前仅记录，后续楼快照未验证祖先是否被改动。
- P1：index.js:56-75 的运行任务持有旧基底，src/host/host.js:98-108 写回只核正文 hash/swipe，没有比较快照修订。推演期间钉住人物、采纳方案、换拍等 editCurrentState 写入后，旧任务仍会整份覆盖。手动重新推演也从前一楼取基底，不保留当前楼 edited。此项是代码路径确认，未在真实聊天执行破坏性复现。建议记录任务基底及目标修订，冲突时丢弃/重基，并明确保留用户编辑策略。
- P1（产品规则）：sim-prompt.js:18 禁止正文外事件完成，与 :30 长期行动 done/outcome 互相矛盾。应把已确认幕后事件、候选发展、各人物认知分开；允许有前因/时间/资源依据的幕后完成，认知必须另有传播渠道。现有 parse/apply 只做结构校验，不能称作因果校验；建议先增加事件来源、发生时间及结果与认知传播依据，保留不确定结算。正文作者可以获得必要世界约束，不等于主角获知。
- P2：compose.js:69 把候选 signals 统称“镜头之外正在发生的事”，而 sim-prompt 将其定义成可能发生的迹象，可能将候选升级为事实。应分别标注已确认事实/可选露出方式；visibility 与 knows 目前主要依靠模型遵守，selectSignals 未据它们验证传播渠道。
- P2（已复现）：apply.js:85 noChange + 空 signals 持续保留旧迹象，10 轮后仍注入相同内容；shared.js:10-16 发给推演模型的状态又不含 signals。缺少已呈现/过期/取消记录，主角换地点或事件已落地时仍可能反复提示。建议可撤销的分支内消费状态和寿命，不宜仅依赖正文模型自行忽略。
- P2（已复现）：apply.js:79 自动清理 faded 线不保护 active guide。模型把用户正在引导的线设 faded，随后三轮未更新即删除整条线与用户方案；复现 threads.length=0。建议 active guide 禁止自动淘汰，完成/放弃由用户操作。
- P2（长期一致性）：已完成事件没有独立持久记录，人物长期行动被替换、人物被淘汰、faded 线被清理后，结果可能退出后续模型上下文；默认仅最近 4 楼且纪要默认关闭。历史快照虽仍保存，但输入不会自动检索它们。建议保留精简事件账本/结果归档，避免办成的事随后遗忘或重演。
- P2（宿主适配）：host.js:249 调 ctx().waitForGenerationIdle?.()，但 refs/TauriTavern/src/scripts/st-context.js 仅内部 import 并用于 generateSafely，getContext 返回值未导出此函数，因此可选调用实际不能保证等待定稿。也不能直接补上导出然后在 MESSAGE_RECEIVED 里 await：宿主事件发射器会 await 监听器，而 Generate finally 才 markIdle，会形成互等。建议事件回调立即返回、在独立任务中等定稿并重验聊天/消息身份；需宿主集成测试验证流式、工具续轮和取消情形。
- 真机观察：#44 角标为“推演完成：2 条迹象”，状态栏“已是最新”，纸条却为“本轮不注入”，2 条均因无有效来源被过滤；暗线仍为两条静态秘密。可能是旧提示词生成的存量快照，不能据此判定当前提示词修复无效。建议展示候选数/实际注入数与过滤原因，规则升级后提示重建旧结果；不要把候选数量表述为实际生效。
- 推荐顺序：先修分支回退与用户编辑丢失，再定义事实/认知及事件留存，然后补迹象生命周期、引导保护和宿主集成测试。请组长据此拆分认领任务；本次审查已完成。

## 2026-10-30 [claude] [决定] 发布 v1.5 A 批（正确性修复）
- Codex 审查 6 条全部核实属实；方案 docs/plans/v1.5.md
- Codex → docs/tasks/A-codex.md；面板会话 → A5；组长 → A2 写回保护、A3 正文定稿接线、提示词
- 接口 v1.4.1：删除 ChatView.fallbackSnapshot；Signal 新增 bornRun；迹象最多存活 2 轮；active 引导的线不能被淡出

## 2026-10-30 [claude] [完成] A 批组长部分（A2、A3、提示词）
- A2 写回保护：src/state/write-guard.js 的 chooseWriteBase（纯函数，5 个测试）；index.js runJob 写回前重读目标楼快照，推演期间被改过则把补丁重新合并到用户的版本上；推演失败且被改过则不覆盖
- A3 正文定稿：删除对不存在的 waitForGenerationIdle 的调用，改为等停止按钮消失且该楼正文连续两次检查不变再读定稿（120 秒超时）；同一楼多次 MESSAGE_RECEIVED 只跟一次
- host 不再提供 fallbackSnapshot，也不再写 chat_metadata.backstage.lastSnapshot
- 提示词：进行中引导的线不要标 faded；已露出或无新进展的迹象不要重复
- @Codex：write-guard.js 已交付，可以补写回保护的跨模块测试（tests/integration/），用 chooseWriteBase + applyPatch 模拟"推演期间用户采纳方案"后写回，断言 guide 不丢

## 2026-10-30 [codex] [开始] A 批
- 按 A-Codex 既定认领修复 snapshot-store.js、apply.js，并更新 tests/state/snapshot-store.test.mjs、tests/sim/apply.test.mjs；新增 tests/integration/correctness.test.mjs，将 /tmp/backstage-review.mjs 的复现转为正式断言，并覆盖组长交付的 chooseWriteBase。
- parse 的 signal 白名单已丢弃 bornRun，保留实现并用跨模块测试确认。不修改组长的 write-guard.js 及其测试，不修改看板或执行 git 写操作。

## 2026-10-30 [claude-ui] [接口变更提议] getFloorInfo 返回这一层的 state
- 角标要显示这一层"候选 N · 注入 M"，需要这一层的推演状态（迹象、暗线、人物、主角是否隔绝）。现在 getFloorInfo 只给 signalCount
- 提议：getFloorInfo(floor) 的返回值增加 `state: snap.state`（只读，不要修改）。index.js 一行即可
- 界面已兼容：有 info.state 时角标显示"注入 M/N"并列出原因；没有时退回只显示"候选 N"

## 2026-10-30 [claude-ui] [完成] A5
- 改动文件：src/ui/signal-sources.js（新增 injectionSummary / summaryText / skippedText / skipReasonLabel；signalSources 改为基于它）、src/ui/format.js（badgeView 增加第二个参数 sum，返回 lines）、src/ui/badges.js（点击弹说明浮层）、src/ui/tab-note.js、src/ui/panel.js（角标浮层可指定打开纸条页；顺手把放错位置的一行注释挪回 goAdvisor 上）、style.css、tests/ui/format.test.mjs、tests/ui/signal-sources.test.mjs、dev/mock-api.js、dev/preview.js
- injectionSummary(state, settings)：候选 N = 有文字的迹象；注入 M = selectSignals(state, settings.maxSignals) 的条数（注入关闭时为 0）。没选上的按原因分组：暗流注入已关闭 / 没挂在暗线或人物上 / 主角与外界隔绝，风闻传不进来 / 暗流语态每层最多 1 条 / 超过每层上限（N 条）。挑选本身仍只用 selectSignals，归类只是解释它的结果
- 楼层角标：文字为"幕后 · 2 人 · 注入 M/N"；悬停提示和点开的说明浮层逐行列出"候选 N 条迹象 · 注入 M 条"和每类未注入原因。点击不再直接打开面板，而是弹出说明（手机上没有悬停），浮层里有「打开幕后面板」；最后一条 AI 回复的角标另有「查看纸条」。点外面、Esc、滚动时关闭
- 纸条页：顶部一行"本轮候选 N 条迹象，实际注入 M 条"（注入关闭时注明）；沿用来源列表，每条后面淡色"第 N 轮产生"（有 bornRun 时）；"另有 K 条迹象未注入"可展开，按原因分组列出（只有一类时直接写在标题里，只有"未挂靠"时保持 T4f 原文）
- dev：模拟 api 的 getFloorInfo 带 state；迹象补 bornRun；新增 skips=1（加超过上限、第二条暗流的迹象，并让主角隔绝以覆盖风闻剔除）。dev 里原本就没有用到 fallbackSnapshot
- 已验证（预览页脚本 + 截图）：各原因的条数与分组；注入关闭时的纸条页和角标；浮层开关（再点、点外面、Esc）、「查看纸条」切到纸条页；深色手机 375 宽浮层不出屏、无横向滚动、按钮 44px
- 测试：`sh tests/run.sh` 17 个测试文件、219 个用例全部通过（UI 新增 4 个，改 1 个）
- 需要组长注意：
  1. 角标要显示 M 需要上面的接口提议（getFloorInfo 加 state）；不加的话真机角标只显示"候选 N"
  2. 历史楼层的 M 按当前设置计算（每层上限、注入开关改了，旧楼的数字会跟着变）
  3. 开发期间用过 8765 端口，已关闭

## 2026-10-30 [codex] [完成] A 批
- 改动文件：src/state/snapshot-store.js、src/sim/apply.js、tests/state/snapshot-store.test.mjs、tests/sim/apply.test.mjs；新增 tests/integration/correctness.test.mjs；另追加本日志。仅修改任务授权文件，未改 TASKS.md、组长 write-guard.js 及其测试，未执行 git 写操作。
- A1：findBase 完全移除 fallbackSnapshot 读取；范围内找不到有效快照返回 emptyState，stale 恒为 false。原兜底测试改为验证即使传入有效兜底也忽略。
- A4：新迹象由 apply 盖 bornRun=next.runCount，noChange 沿用不续期；年龄达到 2 或缺少 bornRun 即删除。快照允许旧迹象缺省 bornRun，提供时校验非负整数。parse 的现有 signal 白名单已剔除模型 bornRun，无需修改解析源码；新增测试确认解析剔除及 apply 不信任外来戳。
- A4：active 引导的线拒绝模型 faded 更新并 warning，其他字段仍合并；不累计 fadedRuns、不自动删除。已存在于旧快照中的 faded+active 线也受保护；done/dropped 后恢复普通淡出规则。
- 将 /tmp/backstage-review.mjs 复现转为 10 个正式跨模块测试：重抽/新 swipe 不读旧兜底、连续 noChange 第二轮过期且十轮后无重复注入、迹象盖戳与旧数据、连续 faded 与旧 faded 引导保护、结束后恢复淘汰；另用 chooseWriteBase + parse/apply + snapshot + compose 覆盖推演期间采纳、换拍、钉住以及失败保留，验证重基后引导、edited、parentId 不丢。
- 测试：新增 13 个用例（跨模块 10、合并 2、快照 1），更新 2 个旧用例以符合新契约。sh tests/run.sh 全部通过：18 个测试文件、232 个用例；本任务文件 git diff --check 无报错。
- 验证范围：写回测试模拟 index 的纯函数编排，未直接加载宿主或验证实际异步写入/正文定稿事件；真机接线仍由组长集成验证。迹象已在正文露出的判定沿用组长提示词，本任务按任务书实现两轮寿命，未新增消费字段。待组长审查。

## 2026-10-30 [claude] [决定] A 批审查通过
- Codex：删除兜底快照、迹象两轮过期、active 引导保护，10 个跨模块测试；面板会话：候选/注入显示；组长：写回保护、正文定稿、提示词
- 18 个测试文件、232 个用例全部通过；已重新安装，等待用户真机验证重抽与手动修改

## 2026-10-30 [claude] [决定] 发布 v1.5 B 批（世界模型升级）
- 用户确认：A 批真机验证通过；B 批加入"程序检查 + 按需审核"（不拆多 Agent）
- 接口 v1.5：INTERFACES.md 第 7 节；类型 src/types.js 已更新
- Codex → docs/tasks/B-codex.md；dsh → docs/tasks/B-dsh.md；面板会话 → B-UI；组长 → 世界书分层、提示词、注入、编排

## 2026-10-30 [claude] [完成] B 批组长部分（尚未安装，等 Codex 的 check.js 与 parseReviewOutput）
- 世界书分层：src/memory/lore.js（selectLore / fitBudget / keyMatches / backstageText，7 个测试）；host 读全部启用的世界书（全局、角色主书与附加书、聊天、人设），按 常驻→正文触发→幕后触发→按需调取 排序，按预算整条截断；listLoreEntries 供设置页选择
- 提示词：资料区按层显示世界书并列目录；状态里行动带"始于何时、已过多久"，并展示事件记录；推演规则改为世界事实 / 人物认知 / 露出机会三层，可以写入已完成的事实，时间只进不退；新增审核员提示词 review-prompt.js
- 注入：迹象可以挂在事件上；来自主角尚不知道的事件的迹象标「已发生」并提醒只能经合理渠道透出
- 编排：index.js 推演后依次 checkPatch → extractReviewItems → 审核员（可单独选模型，失败放行）→ applyVerdicts → applyPatch；快照记录 review 与 loreUsed
- index.js 已静态引用 src/sim/check.js 与 parseReviewOutput：Codex 交付前插件无法加载，所以暂不安装

## 2026-10-30 [codex] [开始] B 批
- 按 B-Codex 认领修改 src/sim/parse.js、apply.js、src/state/snapshot-store.js，新建 src/sim/check.js、tests/sim/world-model.test.mjs、tests/integration/world-model.test.mjs；必要时更新本人已有测试。遵照看板要求不改 TASKS.md，不执行 git 写操作。
- 严格采用第 7.5 节的三个 check 导出及 parseReviewOutput 签名；删除 addEvents 项时同步重映射 new:N，避免引用错位。保留 A 批行为与旧快照兼容。

## 2026-10-30 [claude-ui] [完成] B-UI
- 新建：src/ui/world.js（大事记、相关事件、审核记录、资料分组、预算换算、世界书条目筛选，纯函数）、src/ui/chronicle.js（大事记区与卡片里的"相关的事"）、src/ui/settings-lore.js（设置页「世界书」「审核」两节）、tests/ui/world.test.mjs、dev/mock-world.js
- 修改：src/ui/panel.js、tab-threads.js、tab-characters.js、tab-note.js、signal-sources.js、format.js、state-edits.js、settings-api.js、settings-page.js、style.css、tests/ui/format.test.mjs、tests/ui/signal-sources.test.mjs、tests/ui/state-edits.test.mjs、dev/mock-api.js、dev/preview.js、dev/panel-preview.html
- 大事记：「暗线」标签改名「暗线与大事」（窄于 340px 的屏幕只显示「暗线」；标签宽度改为按内容分配，不再折行）。顶部"大事记"按时间倒序（同一天按写入先后，时间不明的排最后），每条：第 N 天时段、事实、相关人物与暗线（只列现存的）、主角已知 / 主角尚不知道（未知的文字弱化）。默认显示 5 条，可展开全部。下面是原暗线卡
- 暗线卡和人物卡加"相关的事"：已知在前、未知弱化并标"主角尚不知道"，最多 4 条，多的提示去大事记看
- 时间：人物卡的此刻、长期行动下面一行 elapsedText（旧数据显示"开始时间不明"）。面板头部的"第 N 天 · 时段"不变
- 人物编辑表单：行动文字没改沿用原 since，改了按当前时钟盖戳（与 7.2 的 apply 规则一致；之前编辑会把 since 丢掉）
- 纸条页：迹象来源行加"指向事实：……（主角尚不知道）"；未挂靠的判断加上事件（与 compose 现在的规则一致），文案改为"没挂在暗线、人物或事件上"
- 纸条页底部"本轮检查与审核"：送审 / 通过 / 被丢弃条数，逐条列出类别、内容、被程序检查丢弃还是被审核员驳回、原因；审核员失败时显示"审核失败，已放行：原因"；没有高风险改动、手动编辑、推演失败、旧数据各有一句说明
- 纸条页底部"本轮推演读了哪些资料"：按 推演专用常驻 / 正文触发 / 幕后触发 / 按需调取 分组（可展开），每条标题、世界书名、token，各组小计和合计
- 这两块取的是"当前状态来自哪一楼"：从聊天最后一楼往前找第一个 getFloorInfo 有效的楼层（最多看 60 层），标题旁注明"第 N 楼的推演"
- 楼层角标说明浮层加一行"检查与审核：送审 N 条，通过 M 条，丢弃 K 条"；审核失败时为"审核失败，已放行：原因；程序检查丢弃 K 条"
- 设置页「世界书」：预算滑块 + 数字（单位万，1–30，步长 0.5），显示"10 万 token"；常驻条目从 listLoreEntries 读取，可搜索、多选（已选排前，最多显示 150 条），显示已选条数和 token 合计、超预算提醒；已选但现在读不到的条目单独提示，可一键清除；「允许推演按需调取条目」开关
- 设置页「审核」：开关（关掉时隐藏下面的选项）、审核用的模型（与推演相同 / 单独直填；直填复用 API 区的地址、密钥、获取模型和测试连接部件）、"时钟前进几天以上需要审核"（1–30，默认 2）、说明文字按任务原文
- settings-api.js 把直填三项、测试连接、分段选择拆成可复用部件；保存一律先并上当前分组再存（saveMerged），不依赖 host.saveSettings 是否逐组合并 lore / review
- dev：world=full/none/legacy（有事件 / 无事件 / 旧数据无任何新字段）、review=rejects/fail/clean/none、lore=empty/fail；模拟 api 增加 listLoreEntries、getFloorInfo 的 review 与 loreUsed
- 已验证（预览页脚本 + 截图）：大事记排序与展开、卡片相关事件、旧数据显示、审核有驳回 / 审核失败 / 资料为空、角标浮层、设置页预算同步、常驻勾选与超预算提醒、清除读不到的条目、搜索、审核直填只写 review 不动主 API、天数超范围规整；深色手机 375 宽无横向滚动，设置页按钮和输入框 ≥ 44px。截图在共享笔记目录 B-UI-screens/
- 测试：`sh tests/run.sh` 21 个测试文件、257 个用例全部通过（UI 新增 world.test 10 个、format 1 个，改 2 个旧用例以适应 since 盖戳）
- 需要组长注意：
  1. 纸条页"本轮"按 getFloorInfo 从最后一楼往前找，没有用 findBase；若两者对不上（比如某层快照有效但不是基底），可考虑在 api 上直接提供当前基底的楼层号
  2. 世界书条目的唯一键是 world + String(uid)，数字和字符串 uid 视为同一条；请 host 侧的 pinned 匹配也这样处理
  3. 开发期间用过 8765 端口，已关闭

## 2026-10-30 15:40 [dsh] [完成] B 批样本
- 新建文件（共 42 个，全部在 `tests/fixtures/v15/` 下；未改动 `tests/fixtures/` 已有的任何文件）：
  - `states/` 6 个：wuxia, palace, mystery, school, western（各带 chronicle / since / loreWanted / eventId）+ legacy.json（旧格式，用于兼容测试）
  - `model-outputs/sim/` 20 个 .txt + cases.json（10 正常 / 10 有问题）
  - `model-outputs/review/` 14 个 .txt + cases.json（7 正常 / 7 脏）
- 自检（全部脚本跑过，非目测）：
  - 8 个 .json 全部 `json.load` 通过；没有 .js/.mjs 文件
  - **时间约束**：所有 `chronicle[].at`、`knownAt`、`currentAction/longAction.since`、`loreWanted.sinceRun`、`signals[].bornRun` 都不晚于该状态的 `clock`（同一天还比了时段先后，时段按 凌晨→…→五更 排序）；chronicle 严格按时间升序
  - **chronicle**：每文件 6–10 条（要求 5–15）；`e_` + 6 位小写字母数字；`known:true` 占比 40%–67%（约一半）；known:true 必有 knownAt、known:false 的 knownAt 必为 null；characterIds/threadIds 全部指向本文件真实存在的对象
  - **since**：人物 currentAction/longAction 的 since 都存在且合法；legacy.json 里一个新字段都没有（与 `states/wuxia.json` 逐字节 JSON 等价）
  - **loreWanted**：每文件 0–3 条，sinceRun ≤ runCount
  - **eventId**：5 个状态各有 2 条迹象带 eventId，且**全部指向 known:false 的事件**（这是任务书要求，第一版有 3 处指错到 known:true，已改）
  - **sim 20 个**：正常 10 个用到了 addEvents / markKnown / loreRequests / 带 eventId 的迹象，其中 12 处用到 `"new:N"` 写法；有问题 10 个覆盖任务书 5 类（clock 倒退 ×2、markKnown 指向不存在事件 ×2、缺渠道的"知道：" ×2、new:N 越界 ×2、模型写程序字段 ×2）
  - **review 14 个**：覆盖 7 类（思考过程、前后闲聊、尾逗号、截断、ok 写成字符串、缺少 id、不存在的 id）
  - cases.json 的文件列表与磁盘实际文件严格一致；`expectRejectedKinds` 只用了 ReviewKind 里的合法值（clock / knows / mark_known / reference）
- 不确定的地方（请组长/Codex 确认）：
  1. **review 的 `expectOk` 口径**：任务书说"正常与脏的各一半"，但脏样本里 think/闲聊/尾逗号/缺 id/多余 id 这几类**JSON 是合法的、能解析**。我把 `expectOk` 定义成"能否解析成合法 verdicts"，所以 7 个脏样本里 5 个是 true、只有 `ok` 写成字符串和截断这 2 个是 false。如果你要的是"脏=失败"，请改这 5 条。
  2. **`ok: "true"` 判 false 的依据**：types.js 写明 `ok: boolean`，字符串是类型违规。如果 `parseReviewOutput` 做了宽松强转，这条会暴露出来——那属于被测出的宽松点，建议不要改样本迁就。
  3. **`dirty-missing-01`（缺 r1/r3 的裁决）判 true**：INTERFACES 7.5 明写"缺少裁决的条目视为通过"，所以缺 id 是内容问题不是解析失败。同理 `dirty-unknownid-01`（多出 r9）也判 true，applyVerdicts 按 id 匹配找不到就忽略。
  4. **`bad-programfield-01/02` 的 `expectRejectedKinds` 我写了空数组**：因为 since/at/known/bornRun 是 parse 阶段就剥掉的程序字段，不属于 checkPatch 的 ReviewKind 范畴。如果你希望它们在 check 阶段也报一类，请告诉我加哪个 kind（现有枚举里没有合适的，可能需要 `other`）。
  5. **`bad-clock-02` 同时有 clock 倒退和合法 addEvents**：我按"只丢弃出问题的那一项"处理，即 clock 被丢、addEvents 保留。如果实现是"clock 倒退就整包拒绝"，这条会暴露差异。
- 工作区约束：只新建 `tests/fixtures/v15/**`；未改已有样本、未改 TASKS.md / LOG 其他条目、未碰 `src/`（`src/sim/parse.js` 与 `src/sim/check.js` 的改动是 Codex 的，我没有动）；未执行 git 写操作；未安装依赖；临时脚本放系统临时目录。

## 2026-10-30 [claude] [审查意见] dsh B 批样本：通过
- 组长脚本复核 0 个问题（JSON 合法、时间不晚于 clock、引用存在、known 与 knownAt 一致、eventId 指向存在的事件）
- dsh 列出的 5 个不确定点均与接口一致，无需修改：review 的 expectOk 按"能否解析出合法 verdicts"；ok:"true" 判失败；缺裁决视为通过、多余 id 忽略；程序字段在 parse 剥掉、不进 ReviewKind；clock 倒退只丢 clock
- @Codex：tests/fixtures/v15/ 已就绪，可用于 B 批回归测试

## 2026-10-30 [codex] [完成] B 批
- 改动文件：src/sim/parse.js、src/sim/apply.js、src/state/snapshot-store.js、tests/sim/fixtures.test.mjs；新增 src/sim/check.js、tests/sim/world-model.test.mjs、tests/integration/world-model.test.mjs；另追加本日志。未修改其他成员文件、样本、接口或 TASKS.md，未执行 git 写操作。
- 已交付与 INTERFACES 7.5 一致的 checkPatch(state, patch)、extractReviewItems(state, patch, { bigJumpDays })、applyVerdicts(patch, items, verdicts)，以及 parseReviewOutput(text)。检查返回副本，逐项剔除倒退 clock、坏引用、空事件、缺渠道的新认知和无效 markKnown，并生成中文 Rejection；高风险覆盖五类；裁决缺失放行、未知 id 忽略、明确驳回只移除对应修改。
- 解析支持 addEvents/markKnown/loreRequests/eventId，剔除程序字段。空白事件文本交由 check 生成可见原因；结构非法事件在 parse 丢弃并 warning。解析、检查或审核删事件时均重映射 new:N；引用被删事件则清空，避免移到其他事件。解析遇到无效 new:N 先保留越界占位供 check 记录原因。
- apply：倒退天数整项 clock 忽略并 warning；行动按 text 变化盖 since，同文本沿用原戳（旧数据缺省仍为时间不明）；新增事件生成 e_ id/at/known=false/knownAt=null；markKnown 仅首次盖 knownAt；事件保留最近 80 条，人物淘汰或线删除不清理历史引用；eventId 不存在或事件被裁掉则 null；loreRequests 按标题去重后最多五项、同名续期、五轮未点名移除。A 批迹象过期、引导保护和写回保护回归均通过。
- 快照校验支持 since、chronicle、loreWanted、eventId、review、loreUsed；所有新字段缺省兼容，Stamp.day=null 支持时间不明。makeSnapshot 可接收 review/loreUsed 并复制校验。保留上轮审查要求：结构检查不以 firstSigns 一致性或历史引用仍存在为条件。
- 测试：新增 51 个用例（world-model 单元及样本回归 43、跨模块 8）；包含 dsh 的 20 个推演样本和 14 个审核样本。本人旧 fixtures 测试的 2 个用例调整为既比对原行动字段、又校验新 since 戳，未弱化原字段断言。最终 sh tests/run.sh：23 个测试文件、308 个用例全部通过；本任务文件 git diff --check 无报错。
- 取舍：兼容 v1.2 名称/别名引用及同轮新建对象；事件中的名称在 apply 转成 id，历史 id 保留。审核员同 id 出现矛盾裁决时明确 false 优先；缺失裁决仍放行。时间先后仅按第 7.2 节天数比较，不猜自由文本时段顺序。程序检查验证的是结构与明确规则，资源/因果充分性仍由审核员和提示词判断。
- 已就绪待组长审查与安装；测试覆盖纯函数链路及既有写回重基回归，未调用真实模型或执行真机部署。

## 2026-10-30 [claude] [进度] B 批 Codex 部分审查中（暂停，等用户叫继续）
- 308 个测试全部通过；index.js 模块图在 jsc 中加载成功（所有 import 对得上）
- v1.5 样本整条链路（解析→检查→模拟审核→合并→快照→注入）：20 个推演样本、14 个审核样本均跑通
- 唯一差异：bad-markknown-01/02 程序检查只记了 mark_known，样本预期 mark_known + reference。属分类口径差异，不是缺陷，待定是否统一
- 下一步：结论审查 → 提交 → scripts/install.sh → 请用户真机测试 B 批

## 2026-10-30 [claude] [决定] B 批审查通过
- Codex：checkPatch / extractReviewItems / applyVerdicts / parseReviewOutput 与接口 7.5 一致；"只丢出问题的那一项"、矛盾裁决 false 优先、缺裁决放行、时间只按天数比较，这些取舍都同意
- 归类差异结论：markKnown 指向不存在的事件只记 mark_known 一类（采纳 Codex 的做法）；dsh 样本里多标的 reference 不改代码，留档
- 整条链路（解析→检查→模拟审核→合并→快照→注入）用 v1.5 样本跑通；index.js 模块图在 jsc 中加载成功
- B 批四方全部完成，安装进 TauriTavern，等待用户真机测试
