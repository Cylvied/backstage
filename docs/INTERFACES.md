# 接口文档（仅组长可修改）

> 版本 v1.5 · 2026-10-30（v1.5：世界事实、时间戳、事件记录、世界书分层、检查与审核，见第 7 节；v1.4.1：A 批正确性修复，见 docs/plans/v1.5.md 与本文 3.5、5.2、5.5 节的 A 批说明；v1.4：插件内直填 API，见 3.8 节与 5.10 节；v1.3：剧情参谋对话、分阶段引导，见 3.9 节、5.5 节、5.10 节；v1.1：提示词与注入文本改由 Claude 负责，dsh 改为测试样本库；v1.2：放宽 SimPatch 的 name/title 要求，见 3.7 节） · 产品决定见 `docs/brainstorm/SUMMARY.md`
> 所有类型的权威定义在 `src/types.js`（JSDoc）。本文与 types.js 冲突时以 types.js 为准，并在 LOG 里报告。

插件暂定名 **幕后（Backstage）**，内部 ID `backstage`。

---

## 1. 技术栈与规范

- **原生 JavaScript ES 模块，不需要构建**。宿主用 `import()` 加载 `manifest.json` 里的 `js` 入口（`refs/TauriTavern/src/scripts/extensions.js:542`），相对路径 `import` 直接可用。
- 类型用 **JSDoc** 写，统一引用 `src/types.js` 中的 typedef，例如 `/** @param {import('../types.js').SimState} state */`。
- **不引入任何第三方依赖**，不用 UI 框架，UI 用原生 DOM + CSS。
- 本机**没有 Node**，测试用 macOS 自带的 JavaScriptCore 运行：`sh tests/run.sh`（全部）或 `sh tests/run.sh tests/state`（某个目录）。测试文件命名 `tests/**/*.test.mjs`，写法：`import { test, assert } from '../harness.js';`（**不要用 `node:test`**，jsc 里没有）。断言有 `ok / equal / notEqual / deepEqual / match / doesNotMatch / throws / rejects`。
- jsc 环境没有 `structuredClone`、`AbortController`、`console`，harness 已补了测试用的最小实现；源码里可以正常使用它们（浏览器里都有）。
- **纯函数模块不得访问宿主**（不碰 `SillyTavern`、`window`、`document`、`globalThis`），这样测试才不依赖浏览器。只有 `src/host/`、`src/ui/` 和 `index.js` 可以访问宿主。
- 文件编码 UTF-8，缩进 4 空格，单引号，必须写分号。
- 用户可见的文字一律中文；代码标识符一律英文。
- 日志统一前缀 `[Backstage]`，用 `console.debug/info/warn/error`，不要 `console.log`。

## 2. 目录结构与归属

| 路径 | 职责 | 负责人 |
|---|---|---|
| `manifest.json` | 扩展清单 | Claude |
| `index.js` | 入口：初始化、装配模块、事件接线 | Claude |
| `src/types.js` | 全部 JSDoc 类型 | Claude |
| `src/constants.js` | 键名、默认设置、枚举 | Claude |
| `src/util.js` | 通用小工具（hash、id、clamp 等） | Claude |
| `src/host/host.js` | 宿主适配：读聊天、读角色卡/世界书、保存、事件归一化 | Claude |
| `src/host/llm.js` | 独立连接调用模型 | Claude |
| `src/host/inject.js` | 调 `setExtensionPrompt` 写入 / 清空注入 | Claude |
| `src/state/snapshot-store.js` | 快照的读、写、查找有效祖先、校验 | Codex |
| `src/state/scheduler.js` | 推演任务调度：去重、串行、取消、过期丢弃 | Codex |
| `src/sim/parse.js` | 解析模型输出 → `SimPatch` / `PlanCard[]`，结构校验 | Codex |
| `src/sim/apply.js` | `applyPatch(state, patch)`，纯函数 | Codex |
| `src/memory/database-memo.js` | 数据库纪要的筛选与打分（纯函数部分） | Codex |
| `src/prompts/sim-prompt.js` | 推演提示词组装 | Claude |
| `src/prompts/plan-prompt.js` | 规划提示词组装 | Claude |
| `src/inject/compose.js` | 从状态挑选暗流、生成注入文本（纯函数） | Claude |
| `tests/fixtures/**` | 测试样本库：状态、输入、模型输出、世界书纪要 | dsh |
| `src/ui/*`、`style.css`、`dev/*` | 面板、设置抽屉、楼层角标，以及开发预览页（T4） | Claude（面板会话） |
| `tests/` | 各人测试放在与源码对应的子目录，例如 `tests/state/`；只写自己模块的测试 | 各自 |

模块之间只通过**本文第 5 节列出的导出函数**互相调用。需要新导出：写 `[接口变更提议]`。

## 3. 数据模型

### 3.1 推演状态 `SimState`

```js
SimState = {
    schemaVersion: 1,
    clock: { day: number, slot: string, precision: 'exact'|'approx'|'unknown' },
        // day 从 1 开始；slot 如"清晨/上午/午后/傍晚/夜里/深夜"，模型自由填写
    protagonist: { location: string, reachable: boolean },
        // 主角处境；reachable=false 表示与外界隔绝（闭关、囚禁、独处），此时不出"风闻"
    characters: Character[],   // 上限 settings.maxCharacters（默认 12），钉住的人不计入淘汰
    threads: Thread[],         // 暗线、伏笔、用户采纳的规划
    signals: Signal[],         // 本轮推演给出的"下一轮可能出现的迹象"候选
    runCount: number,          // 成功 applyPatch 的次数，由 apply 递增
}
```

内部计数字段（由 apply 维护，模型不写，提示词里不展示）：`Character.touchedRun`（最近一次被 patch 涉及时的 runCount）、`Thread.fadedRuns`（进入 faded 后经过的推演次数）。

### 3.2 人物 `Character`

```js
Character = {
    id: string,                 // 'c_' + 短 id，程序生成，模型不负责
    name: string,
    aliases: string[],
    location: string,           // "区域·地点"，自由文本
    currentAction: { text: string, duration: string } | null,  // 此刻在做的事，如 {text:'在客栈盯着往来客商', duration:'今夜之内'}
    longAction: { text: string, duration: string, status: 'ongoing'|'done'|'abandoned', outcome: string|null } | null,
    knows: string[],            // 最多 5 条，每轮整体重写；格式"知道：……（渠道）"或"不知道：……"
    life: 'alive'|'missing'|'dead',
    onStage: boolean,           // 是否在主角当前场景中
    pinned: boolean,            // 用户钉住：不被自动淘汰，推演不得删除
}
```

### 3.3 线 `Thread`

```js
Thread = {
    id: string,                 // 't_' + 短 id
    title: string,              // 一句话事实
    characterIds: string[],
    stage: 'seeded'|'growing'|'ripe'|'resolving'|'faded',
        // 起线 / 延展 / 成形 / 收束 / 淡出。faded 的线保留 3 次推演后由 apply 删除
    trigger: string,            // 引信：什么条件会让它往前走
    deadline: { text: string, missedOutcome: string } | null,   // 可选
    visibility: 'hidden'|'hinted'|'known',   // 主角对它：完全不知 / 有所察觉 / 已知
    origin: 'sim'|'user',
    guide: Guide | null,        // 仅 origin='user' 或用户对某条线点了"开始引导"时非空
}
Guide = {
    intensity: 'seed'|'normal'|'push',   // 只铺垫 / 自然推进 / 尽快引爆
    goal: string,               // 用户想达到的结果
    firstSigns: string,         // 起始迹象
    status: 'active'|'done'|'dropped',
    adoptedAt: number,          // 时间戳
}
```

同一时间最多 **1 条** `guide.status='active'` 的线（第一版限制，降低注入冲突）。

### 3.4 迹象 `Signal`

```js
Signal = {
    voice: 'here'|'rumor'|'undercurrent',   // 此地此刻 / 风闻 / 暗流
    text: string,               // ≤ 80 字，写"可能自然出现的迹象"，不写剧本
    threadId: string | null,
    characterId: string | null,
    relevance: 1|2|3,           // 模型自评与眼前剧情的相关度，3 最高
}
```

### 3.5 快照 `Snapshot`（存储单位）

```js
Snapshot = {
    v: 1,
    id: string,                 // 's_' + 短 id
    parentId: string | null,    // 推演时使用的基底快照 id
    basis: {
        floor: number,          // 所在楼层下标（仅供展示与调试，不作身份）
        swipeId: number,
        textHash: string,       // 该楼该 swipe 正文的 hash（util.hashText）
    },
    status: 'ok'|'failed'|'manual',
        // ok=推演成功；failed=推演失败，state 沿用父快照；manual=没有推演，由用户手动编辑产生
    state: SimState,
    edited: boolean,            // 用户在面板里改过
    createdAt: number,
    error: string | null,
    usage: { model: string, ms: number } | null,
}
```

**存储位置**：`chat[floor].extra.backstage = Snapshot`。宿主切换 swipe 时会把 `extra` 存回旧 swipe、再恢复新 swipe（`refs/TauriTavern/src/script.js:8332, 8408`），因此快照天然跟着 swipe 走。写入后调用宿主保存（由 host 负责）。

**有效性**：快照有效 ⇔ 所在消息是 AI 消息，且 `basis.textHash === hashText(当前正文)`。正文被编辑或续写后 hash 变化，快照失效。

**基底查找**：从目标楼层往前，找第一个有效快照；找不到则视为初始状态 `emptyState()`。**A 批起不再有兜底快照**（`ChatView.fallbackSnapshot` 已删除）：TauriTavern 的 `getContext().chat` 总是完整的，兜底反而会在重抽时读到正被重抽的旧结果（分支污染）。`stale` 恒为 false（保留字段以免调用方报错）。

**写回保护（A 批）**：推演请求返回、写回目标楼之前，index.js 重新读取该楼当前 swipe 上的快照。若它在推演开始之后被写过（`createdAt` 晚于推演开始，或 `edited=true` 且晚于推演开始），说明用户在推演期间做了钉住、采纳、换拍等操作：此时把本次补丁重新 `applyPatch` 到**该快照的状态**上，结果保留 `edited=true` 与其 `parentId`。判断逻辑是纯函数 `src/state/write-guard.js` 的 `chooseWriteBase`（Claude）。

### 3.6 规划卡 `PlanCard`

```js
PlanCard = {
    title: string,
    goal: string,
    firstSigns: string,
    fit: string,                // 为什么贴合当前故事（呼应了哪条线/哪段关系）
    threadId: string | null,    // 挂在已有线上时填；否则采纳时新建线
    suggestedIntensity: 'seed'|'normal'|'push',
}
```

### 3.7 模型输出补丁 `SimPatch`

推演模型**只输出变化**，程序合并：

```js
SimPatch = {
    clock: Partial<Clock> | null,
    protagonist: Partial<Protagonist> | null,
    upsertCharacters: Array<Partial<Character>>,  // 有 id 时按 id 匹配，name 可省略；无 id（或 id 为 null）时必须有 name，按 name/aliases 匹配，无匹配则新建
    removeCharacterIds: string[],          // 钉住的人忽略此项
    upsertThreads: Array<Partial<Thread>>,        // 同上：有 id 时 title 可省略；无 id 时必须有 title
    signals: Signal[],                     // 整体替换上一轮的 signals
    noChange: boolean,                     // 模型声明本轮镜头外无变化（允许，且应常见）
}
```

模型输出格式：一个 ```` ```json ```` 代码块，内容就是 `SimPatch`。`id` 由模型抄写自输入状态；新对象不写 id。规划同理，输出 `{ "cards": PlanCard[] }`。

**v1.2 补充（解析与合并的容错规则）**：
- `"id": null` 等同于没写 id。有 id 但在状态里找不到、又没有 name/title 的条目，合并时丢弃。
- 模型写的 `pinned`（人物）、`guide`、`origin`（线）一律忽略：这些只能由用户操作改变，防止模型抹掉用户的引导。
- `characterIds`、`signals[].characterId`、`signals[].threadId` 里如果写的是名字/标题而不是 id（常见于同一次输出里新建的对象），合并时按名字/标题换成对应 id；换不了的再按悬空引用处理。

### 3.8 设置 `Settings`

存在 `extension_settings.backstage`，默认值见 `src/constants.js` 的 `DEFAULT_SETTINGS`：

| 键 | 默认 | 说明 |
|---|---|---|
| enabled | true | 总开关 |
| api.mode | 'direct' | v1.4：`direct` 插件内直填 API（默认）；`profile` 使用连接管理器的连接配置 |
| api.url / api.key / api.model | '' | v1.4：直填模式的 OpenAI 兼容地址、密钥、模型。由宿主后端的 custom 源转发，无跨域问题。密钥明文存在扩展设置里（与故事神谕、数据库插件相同） |
| profileId | '' | profile 模式下的连接配置 id |
| maxTokens | 2000 | 推演请求的输出上限 |
| recentFloors | 4 | 推演读取的最近楼层数 |
| maxCharacters | 12 | 人物上限 |
| maxSignals | 3 | 每层暗流上限，0–3 |
| injectUndercurrent | true | 暗流注入开关 |
| injectDepth | 1 | 注入深度 |
| memory.enabled | false | 数据库纪要来源 |
| memory.worldbook | '' | 空 = 角色主世界书 |
| memory.limit | 8 | 纪要条数上限 |

### 3.9 分阶段引导（v1.3）

用户采纳一张带 `beats` 的方案卡，得到一条**分阶段引导**：一次只注入当前这一拍。

```js
Guide += {
    beats: Beat[] | null,       // null 或缺省 = 单步引导（v1.2 的行为不变）
    beatIndex: number,          // 当前拍下标
    reached: boolean,           // 推演判断当前拍似乎已演完，只作提示
}
Beat = { title, goal, firstSigns, status: 'pending'|'active'|'done'|'skipped' }
PlanCard += { beats?: Array<{ title, goal, firstSigns }> }   // 2–8 拍
SimPatch += { guideReached?: boolean }
```

规则：
- **同一时刻最多一拍是 `active`**，就是 `beats[beatIndex]`。`guide.firstSigns` 跟当前拍保持一致。
- **换拍不调用模型**：用户点"完成这一拍"→ 当前拍 `done`，下一个 `pending` 拍变 `active`；没有下一拍 → `guide.status = 'done'`。
- **跳过**：把某个 `pending` 拍设为 `skipped`；跳过的是当前拍时，同时进入下一拍。
- **落拍提示**：推演输出 `guideReached: true` 时，apply 把当前引导的 `reached` 设为 true；换拍、改强度、重新采纳时清为 false。**绝不自动换拍。**
- **找参谋改（替换剩余拍）**：采纳一张分阶段卡时，如果它的 `threadId` 正是当前 active 引导的线、且那条引导也是分阶段的：保留已 `done`/`skipped` 的拍，丢弃其余，追加新卡的拍，新卡第一拍为 `active`。其他情况按普通采纳处理（替换掉旧引导）。
- 强度对整条引导生效，不分拍。

## 4. 一轮的流程

```
[GENERATION_ENDED] AI 消息定稿（排除 dryRun / quiet / impersonate / 失败 / 取消）
  host → index: onReplyFinalized({ chatId, floor, swipeId, text })
  index → scheduler.enqueue(job)
     scheduler: 同 (chatId, floor, swipeId, textHash) 只跑一次；同一聊天串行；新任务到来时取消排队中的旧任务
     job:
       base   = snapshotStore.findBase(chatView, floor - 1)          // 父快照或 emptyState
       input  = host.collectSimInput(floor)                            // 角色卡、人设、世界书、最近楼层、记忆
       msgs   = buildSimPrompt({ state: base.state, input, settings })
       text   = await llm.call({ profileId, messages: msgs, maxTokens, signal })
       patch  = parseSimOutput(text)            // 失败 → 写 status='failed' 的快照，state=base.state
       state  = applyPatch(base.state, patch, { maxCharacters })
       写回前再次校验：聊天没变、该楼该 swipe 的 textHash 没变；否则丢弃
       snapshotStore.write(floor, swipeId, snapshot) → host.save()
  index → refreshInjection()

[GENERATION_STARTED] type ∈ { normal, continue, regenerate, swipe }，非 dryRun / quiet
  target = (regenerate|swipe) ? 最后一条 AI 消息之前 : 最后一条消息
  base   = snapshotStore.findBase(chatView, target)
  text   = composeInjection(base.state, settings)      // { undercurrent, guide, guidePush }
  inject.apply(text)                                    // 同步完成，不等待任何网络请求

[MESSAGE_SWIPED / MESSAGE_EDITED / MESSAGE_DELETED / 面板编辑] → refreshInjection()
[CHAT_CHANGED] → scheduler.cancelAll(); inject.clear(); refreshInjection()
```

**绝不阻塞用户发送**：注入只用已经存在的快照。推演还没跑完时，用基底快照，界面显示"推演落后"。

## 5. 模块导出（契约）

### 5.1 `src/util.js`（Claude）

```js
export function hashText(text: string): string          // FNV-1a 32 位，十六进制
export function shortId(prefix: 'c'|'t'|'s'): string
export function clamp(n: number, min: number, max: number): number
export function emptyState(): SimState
```

### 5.2 `src/state/snapshot-store.js`（Codex）

`chatView` 是 host 提供的只读视图，store 不直接访问宿主：

```js
ChatView = {
    chatId: string,
    length: number,
    getMessage(floor: number): { isUser: boolean, text: string, swipeId: number, extra: object } | null,
}

export function isSnapshotValid(snapshot: Snapshot, message): boolean
export function findBase(chatView: ChatView, beforeOrAtFloor: number): { snapshot: Snapshot|null, state: SimState, floor: number|null, stale: boolean }
export function makeSnapshot({ parent: Snapshot|null, floor, swipeId, text, state, status, error, usage }): Snapshot
export function readSnapshot(message): Snapshot | null     // 解析 + 版本检查，坏数据返回 null，不抛错
```

写入宿主由 host 完成：`host.writeSnapshot(floor, swipeId, snapshot)`。

### 5.3 `src/state/scheduler.js`（Codex）

```js
export function createScheduler({ runJob: (job, signal) => Promise<void>, log }): {
    enqueue(job: SimJob): void,          // SimJob = { chatId, floor, swipeId, textHash, reason: 'reply'|'manual' }
    cancelAll(): void,
    status(): { running: SimJob|null, queued: number, lastError: string|null },
    onStatus(listener: (status) => void): () => void,
}
```

去重键 `chatId|floor|swipeId|textHash`；**`reason='manual'` 的任务不参与去重**（用户主动要求重新推演）；同一聊天串行；`enqueue` 新任务时，取消**排队中**的同聊天旧任务（正在跑的不取消，结果由写回校验决定去留）。

### 5.4 `src/sim/parse.js`（Codex）

```js
export function extractJsonBlock(text: string): unknown | null     // 容错：```json 块 > 第一个完整 {...}；去掉 <think>…</think>
export function parseSimOutput(text: string): { ok: true, patch: SimPatch } | { ok: false, error: string }
export function parsePlanOutput(text: string): { ok: true, cards: PlanCard[] } | { ok: false, error: string }
```

校验规则：未知字段丢弃；枚举值非法则丢弃该条并记 warning；`knows` 截到 5 条；`signals.text` 截到 80 字；`cards` 最多 3 张。

### 5.5 `src/sim/apply.js`（Codex）

```js
export function applyPatch(state: SimState, patch: SimPatch, opts: { maxCharacters: number }): SimState   // 纯函数，不修改入参
export function adoptPlan(state: SimState, card: PlanCard, intensity): SimState    // 新建或挂接线并设 guide；先把其他 active guide 设为 dropped
export function setGuideStatus(state: SimState, threadId: string, status: 'done'|'dropped'): SimState
export function setGuideIntensity(state: SimState, threadId: string, intensity): SimState
// v1.3：分阶段引导（规则见 3.9 节）
export function advanceBeat(state: SimState, threadId: string): SimState
export function skipBeat(state: SimState, threadId: string, index: number): SimState
```

v1.3 对已有函数的要求：`adoptPlan` 支持带 `beats` 的卡与"替换剩余拍"；`applyPatch` 处理 `guideReached`；`setGuideIntensity` 清除 `reached`；snapshot-store 的状态校验要接受并校验新字段（旧快照没有这些字段也必须有效）；parse 解析卡片的 `beats`（每拍 title、goal 必填，firstSigns 缺省为空串；有效拍少于 2 个则当作单步卡，超过 8 个截断）和 `guideReached`（非布尔则忽略）。

`patch.noChange=true` 且 `patch.signals` 为空时，保留上一轮的 signals（其余规则照常：runCount 递增、fadedRuns 累计）。

**A 批补充**：
- **迹象过期**：apply 给新写入的每条 signal 盖 `bornRun = 本次的 runCount`。任何时候（包括 noChange 沿用时），`runCount - bornRun >= LIMITS.signalMaxAgeRuns`（2）的迹象被移除。没有 `bornRun` 的旧迹象视为已过期。
- **引导保护**：带 `guide.status='active'` 的线，模型补丁不能把它的 stage 改成 `faded`（保持原 stage，warning），也不会因 fadedRuns 被删除。引导结束（done/dropped）后恢复普通规则。

人物超过上限时，按"未钉住 → 不在场 → longAction 非 ongoing → 最久未出现在 patch 中"淘汰。`faded` 的线连续 3 次推演未被 upsert 则删除（在线对象上记 `fadedRuns`，这是 types.js 里允许的内部字段）。

### 5.6 `src/memory/database-memo.js`（Codex）

```js
export const MEMO_NAME_PATTERN: RegExp       // /^TavernDB-ACU-CustomExport-纪要-\d+$/i
export function pickMemos(entries: Array<{ name: string, content: string, keys: string[] }>, query: string, limit: number): string[]
```

按关键词重合打分（参考 `refs/ST-SevenDaysCal/index.js:6823` 的思路，自己实现，**不要复制代码**），中文用 bigram 分词。读世界书由 host 完成。

### 5.7 `src/prompts/sim-prompt.js`、`src/prompts/plan-prompt.js`（Claude）

```js
export function buildSimPrompt({ state: SimState, input: SimInput, settings: Settings }): ChatMessage[]
export function buildPlanPrompt({ state: SimState, input: SimInput, request: string, settings: Settings }): ChatMessage[]

ChatMessage = { role: 'system'|'user'|'assistant', content: string }
SimInput = {
    userName: string, charName: string,
    persona: string,                   // 用户人设
    card: { description: string, personality: string, scenario: string },
    worldInfo: string[],               // 已激活世界书条目正文
    recent: Array<{ isUser: boolean, name: string, text: string }>,   // 最近 N 楼，旧→新
    memos: string[],                   // 数据库纪要，可能为空
}
```

提示词必须让模型输出第 3.7 节规定的 JSON 格式，并落实 `docs/brainstorm/SUMMARY.md` 中三方共同的推演原则（认知边界、不替主角行动、允许无变化、"可能发生"不写成"已经发生"、时间守恒、人物有自己的生活、不凭空制造冲突）。

### 5.8 `src/inject/compose.js`（Claude）

```js
export function selectSignals(state: SimState, maxSignals: number): Signal[]
    // 规则：按 relevance 降序；undercurrent 最多 1 条；protagonist.reachable=false 时剔除 rumor；
    //       与 active guide 同一条线的信号优先保留；允许返回空数组
export function composeInjection(state: SimState, settings: Settings): { undercurrent: string, guide: string, guidePush: boolean }
    // 空字符串表示该块不注入；guidePush=true 时 guide 放到深度 0
```

注入文本必须用明确标签包裹，让 Gemini 能区分这是幕后备注而不是主角的发言。

### 5.9 `src/host/*`（Claude）

```js
// host.js
export function getChatView(): ChatView
export function collectSimInput(uptoFloor: number, settings): Promise<SimInput>
export function writeSnapshot(floor: number, swipeId: number, snapshot: Snapshot): Promise<boolean>   // 写前再校验 swipeId 与 textHash
export function onHostEvents(handlers): () => void     // onReplyFinalized / onGenerationStarting / onChanged / onChatChanged
// llm.js
export function call({ profileId, messages, maxTokens, signal }): Promise<{ text: string, model: string, ms: number }>
// inject.js
export function apply({ undercurrent, guide, guidePush }, settings): void
export function clear(): void
```

### 5.10 面板接口 `api`（Claude 在 index.js 提供，面板只通过它操作）

面板模块 `src/ui/panel.js` 导出两个函数，由 index.js 在启动时调用：

```js
export function mountPanel(api): void      // 挂载主面板与入口按钮
export function mountSettings(api): void   // 在扩展设置区挂载设置抽屉（替代 index.js 的简易抽屉）
```

`api` 的全部成员（同时挂在 `globalThis.Backstage`，便于调试）：

| 成员 | 说明 |
|---|---|
| `status()` | `{ lagging, lastError, lastRunAt, scheduler: { running, queued, lastError } }` |
| `onStatus(fn)` | 状态变化时回调，返回取消函数 |
| `getState()` | 当前生效的 `SimState`（只读，不要直接修改） |
| `onStateChanged(fn)` | 当前状态可能变化时回调（推演完成、切 swipe、编辑、切聊天等），返回取消函数 |
| `runNow()` | 对最新 AI 回复手动推演；没有 AI 回复返回 false |
| `plan(request)` | `Promise<PlanCard[]>`，失败时 reject（错误信息可直接展示） |
| `adopt(card, intensity)` | 采纳方案 → `Promise<SimState>` |
| `setGuideStatus(threadId, 'done'\|'dropped')` | 完成 / 放弃引导 |
| `setGuideIntensity(threadId, intensity)` | 调整引导强度 |
| `editState(mutate)` | `mutate(stateCopy) => newState`，保存为用户编辑；用于钉住、删除、改字段。返回 `Promise<SimState>`，失败 reject |
| `previewInjection()` | `{ undercurrent, guide, guidePush }`，即下一轮将注入的文本 |
| `getFloorInfo(floor)` | 某楼推演信息或 null：`{ status, valid, error, edited, signalCount, changedCharacters, createdAt, usage, state }`（`state` 只读，A 批新增） |
| `settings.get()` / `settings.save(patch)` / `settings.listProfiles()` | 读写设置（`Settings`），列出连接配置 `[{ id, name }]` |
| `settings.fetchModels(api?)` | v1.4：`Promise<string[]>`，用直填的地址和密钥拉模型列表；参数缺省用已保存的设置。失败 reject（信息可直接展示） |
| `settings.testApi(patch?)` | v1.4：发一条极短请求测试配置，`Promise<{ model, ms, reply }>`；`patch` 可带界面上尚未保存的值 |
| `settings.isApiReady()` | v1.4：直填模式下地址和模型都已填写，或 profile 模式下已选连接。未就绪时**不会自动推演** |
| `advanceBeat(threadId)` / `skipBeat(threadId, index)` | v1.3 分阶段引导：完成当前拍进入下一拍 / 跳过某一拍 |
| `advisor.history()` | v1.3 参谋对话记录 `AdvisorMessage[]`（跟着当前聊天保存，切换聊天自动是另一份） |
| `advisor.busy()` | 参谋是否正在回复 |
| `advisor.send(text)` | 发一条消息，`Promise<AdvisorMessage>`；用户消息会先写入记录，可立刻刷新显示；失败时记录里会有一条带 `error` 的回复，并 reject。等待期间切换聊天则 resolve 为 null |
| `advisor.summarize()` | 让参谋把讨论整理成方案卡（等同于发一条固定的消息） |
| `advisor.retry()` | 最后一条是失败回复时重试：删掉失败回复，用它前面那条用户消息重新请求，**不重复写入用户消息**；没有可重试的则 reject |
| `advisor.clear()` | 清空当前聊天的参谋对话 |

参谋回复里的 `cards` 可以直接传给 `adopt(card, intensity)`；带 `beats` 的卡采纳后是分阶段引导。原来的一次性 `plan(request)` 保留，但面板不再使用。

## 6. 错误处理约定

- 纯函数遇到坏输入**返回失败结果，不抛异常**；只有编程错误（违反契约）才抛。
- 推演失败不影响聊天：写一份 `status='failed'` 的快照（state 沿用基底），界面显示失败原因，不自动重试。
- 读到损坏或版本不认识的快照：当作没有快照，记 warning，**不改写原数据**。


---

## 7. v1.5：世界模型升级（B 批）

> 方案背景见 `docs/plans/v1.5.md`。类型以 `src/types.js` 为准。**所有新字段都是可选的：旧快照没有它们也必须有效**，缺省时按"空"或"时间不明"处理。

### 7.1 三层分离

| 层 | 存在哪 | 谁写 |
|---|---|---|
| 世界事实 | `state.chronicle: ChronicleEntry[]` | 模型通过 `patch.addEvents` 提出，检查与审核通过后由 apply 写入并盖戳 |
| 人物认知 | `Character.knows`；主角对事件的认知用 `ChronicleEntry.known/knownAt` | 模型通过 `upsertCharacters[].knows`、`patch.markKnown` |
| 露出机会 | `Signal`，可带 `eventId` 指向一条世界事实 | 模型通过 `patch.signals` |

### 7.2 时间戳（程序盖，模型不写）

- `stampOf(clock)`、`elapsedText(since, clock)` 在 `src/util.js`。
- **时钟只进不退**：apply 合并 `patch.clock` 时，`day` 小于当前值则忽略整个 clock 修改（warning）。
- **行动的 since**：apply 合并人物时，若 `currentAction.text` 与原值不同（或原来为 null），`currentAction.since = stampOf(合并后的 clock)`；文本相同则沿用原 since。`longAction` 同理（按 text 判断）。模型写来的 `since` 一律丢弃。旧数据没有 since 视为时间不明。
- **事件的 at**：`addEvents` 写入时 `at = stampOf(合并后的 clock)`。
- **markKnown**：把对应事件的 `known` 设为 true，`knownAt = stampOf(合并后的 clock)`；已经 known 的忽略；id 不存在的由程序检查丢弃。

### 7.3 事件记录

- `ChronicleEntry.id` 由程序生成（`'e_'` 前缀，util 的 `shortId` 需支持 `'e'`）。
- 保存上限 `LIMITS.chronicleMax`（80），超出删最早的。
- 人物被淘汰、暗线删除后，事件里的引用**不清理**（保留历史）。
- 迹象引用同一补丁里新加的事件：`signals[].eventId` 可写 `"new:N"`（N 为 `addEvents` 的下标），apply 换成真实 id；无法解析时置 null。
- 迹象的来源规则（compose.selectSignals）扩充为：挂在现存的暗线、人物**或事件**上即可。

### 7.4 世界书分层（Claude）

- `src/memory/lore.js`（纯函数）：给定全部条目、已触发条目、幕后状态、常驻设置、点名列表，按层排序产出候选；`src/host/host.js` 负责读世界书、计 token、按预算截断，结果放进 `SimInput.worldInfo`（带 title、layer）与 `SimInput.loreCatalog`。
- 层的顺序与预算截断规则见 `docs/plans/v1.5.md` B4。预算 `settings.lore.budget`，范围 `LIMITS.loreBudgetMin–Max`。
- `patch.loreRequests`：apply 把它并入 `state.loreWanted`（同名续期，`sinceRun = runCount`），超过 `LIMITS.loreWantRuns` 轮未再点名的移除；每轮最多 `LIMITS.loreRequestsMax` 条，多余的丢弃。
- 快照记录 `loreUsed`（读了哪些条目、来自哪层、多少 token）。

### 7.5 检查与审核

推演一轮的完整流程（index.js 编排）：

```
模型输出 → parseSimOutput → checkPatch（程序检查，丢弃不合格条目）
        → extractReviewItems（挑出高风险条目）
        → 有高风险条目且 review.enabled：buildReviewPrompt → 审核员 → parseReviewOutput → applyVerdicts（丢弃被驳回的条目）
        → applyPatch → makeSnapshot（带 review、loreUsed）
```

**`src/sim/check.js`（Codex，纯函数）**

```js
export function checkPatch(state, patch): { patch: SimPatch, rejected: Rejection[] }
    // 程序检查，丢弃并记录：clock.day 倒退；引用不存在的人物/暗线/事件 id（characterIds、threadIds、eventId 中的 id；"new:N" 越界）；
    // markKnown 指向不存在的事件；新增的 knows 里以"知道："开头却没有括号渠道的条目；addEvents 文本为空。
    // 只丢弃出问题的那一项（某条 knows、某个引用），不丢整个对象。返回的 patch 是新对象。
export function extractReviewItems(state, patch, opts: { bigJumpDays: number }): ReviewItem[]
    // 高风险条目：每条 addEvents（kind 'event'）；longAction 由非 done 变为 done（'action_done'）；
    // 人物 knows 中原来没有的新条目（'knows'）；markKnown 每项（'mark_known'）；clock.day 前进 ≥ bigJumpDays（'clock'）。
    // summary 用中文一句话写清是什么，供审核员与用户阅读。
export function applyVerdicts(patch, items, verdicts: Array<{ id, ok, reason }>): { patch: SimPatch, rejected: Rejection[] }
    // 驳回的条目从补丁中移除（clock 被驳回则 clock 置 null；action_done 被驳回则保留原 longAction 不变，即把这次对 longAction 的修改去掉）。
    // 缺少裁决的条目视为通过。
```

**`src/sim/parse.js`（Codex）新增**

```js
export function parseReviewOutput(text): { ok: true, verdicts: Array<{ id: string, ok: boolean, reason: string }> } | { ok: false, error: string }
```

并扩充 `parseSimOutput`：解析 `addEvents`、`markKnown`、`loreRequests`、`signals[].eventId`；丢弃模型写来的 `since`、`at`、`known`、`knownAt`。

**`src/prompts/review-prompt.js`（Claude）**：`buildReviewPrompt({ state, items, input, clockBefore, clockAfter })`，要求输出 `{ "verdicts": [ { "id": "r1", "ok": true, "reason": "" } ] }`。

**审核员失败时放行**：调用或解析失败，所有条目视为通过，`review.error` 记录原因。**驳回后不重新推演。**

### 7.6 apply.js 的 v1.5 要求汇总（Codex）

时钟只进不退；行动 since 盖戳；addEvents 写入并盖戳、上限 80；markKnown；`"new:N"` 解析；loreRequests → loreWanted；旧状态缺 `chronicle`、`loreWanted` 时按空处理。snapshot-store 校验接受并校验全部新字段（`Snapshot.review`、`Snapshot.loreUsed` 也一样）。

### 7.7 面板接口新增（Claude 在 index.js 提供）

| 成员 | 说明 |
|---|---|
| `getFloorInfo(floor)` | 增加 `review`（ReviewRecord 或 null）、`loreUsed`（数组或空） |
| `settings.listLoreEntries()` | `Promise<Array<{ world, uid, title, tokens }>>`：当前角色与聊天可用的世界书条目，供选择"推演专用常驻" |
| `settings.get()/save()` | 新增 `lore`、`review` 两组设置（见 types.js） |
