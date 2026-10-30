# Codex：技术可行性与架构

结论：可行。第一版用单次独立请求更新小快照，再按需注入；不引入多代理账本。以下为本地源码审阅，未运行验证；本节出处均相对 `refs/TauriTavern/`。

## 1. 宿主接入

通过 `SillyTavern.getContext()` 的 `eventSource.on(eventTypes.X, handler)` 订阅（`src/scripts/st-context.js:146–147`）。

| 时机 | 事件与出处 |
|---|---|
| AI 回复 | `MESSAGE_RECEIVED(id,type)`：`src/script.js:4545`；此处也处理流式中间消息，不能每次直接推演 |
| 用户发送 | `MESSAGE_SENT(index)`：`src/script.js:7239–7249` |
| 重生成 | `GENERATION_STARTED(type,opts,dryRun)`：`src/script.js:5193`；区分 `swipe/regenerate`，跳过 dryRun |
| 切换 swipe | `MESSAGE_SWIPED(id)`：`src/script.js:12012`；切旧候选不等于新生成 |
| 删楼 | `MESSAGE_DELETED(chat.length)`：`src/script.js:2321`；参数不是被删楼 ID |
| 切聊天 | `CHAT_CHANGED(chatId)`：`src/script.js:9148` |

完成事件只入队，不等待网络；结合 `GENERATION_ENDED`（`src/script.js:4252`）重读最终正文、排除取消/失败并去重。Agent 路径的终态时序需单独验收。

**独立调用选型：**

- 首选 `ConnectionManagerRequestService.sendRequest(profileId,prompt,maxTokens,{signal,includePreset:false})`，按指定连接传模型、端点及凭据引用，直接请求，不调用主聊天 Generate；仅支持 chat completion，依赖连接管理器启用（`src/scripts/extensions/shared.js:287–354`）。
- `generateRaw` 方便但仍读取主配置、共享停止事件和部分临时参数；`generateQuietPrompt` 调用 `Generate('quiet')`，不能当作独立连接（`src/script.js:3786–3818,4762–4805,4889`）。
- `api.agent.startRunWithPromptSnapshot` 可指定 Profile/presentation；`llmConnections` 只管理连接，不是补全接口（`docs/API/Agent.md:21–34`；`docs/API/LlmConnections.md:11–18,55–65`）。Agent 有日志与工具能力，也增加运行生命周期；Session 配置为共享，插件不应擅自覆盖（`docs/API/Agent.md:38–43`）。后台呈现不等于已证明与主聊天完全无竞争。
- 自己 fetch 可隔离请求，但需承担凭据、跨域、协议与错误适配，首版不选。

**注入：**`setExtensionPrompt(key,text,position,depth,scan,role,filter)`；位置含正文前/后、聊天内，聊天深度 0 为末尾，可选消息角色（`src/script.js:10469–10489`；`src/scripts/extension-prompts.js:23–37`）。首版固定短文本、IN_CHAT、深度 1、SYSTEM、scan=false；切聊天/禁用立即置空。`manifest.generate_interceptor` 可接收 `(chat,contextSize,abort,type)`，但不在那里等待 LLM（`src/scripts/extensions.js:2297–2301`）。

**存储：**

| 数据 | 接口及出处 |
|---|---|
| 聊天小配置 | `handle.metadata.setExtension` → `chat_metadata.extensions`，不自动同步页面活对象；`docs/API/Chat.md:152–167` |
| 聊天快照 | `api.chat.current.handle()`、`stableId()`、`store.setJson/getJson`；`docs/API/Chat.md:9–12,112–150,171–178` |
| swipe 附件 | `message.extra` 会与 `swipe_info[swipe_id].extra` 复制同步，并非楼层永久身份；`src/script.js:8332,8408` |
| 全局设置 | `api.extension.store.setJson/getJson`；`docs/API/Extension.md:3–19` |
| 检索数据库 | `api.db.open` 提供向量/图/文本能力，不自动按聊天隔离；首版不用；`docs/API/Database.md:3–22` |

## 2. 最简单的状态一致性

世界引擎已证明楼层数和临时重 roll 标志不可靠（`refs/World/docs/reroll-decouple-fix.md:43–64`）。建议：

1. 每份快照含 schemaVersion、来源键、父快照键、输入摘要、状态、可选方案。来源键＝stableChatId＋有序历史前缀哈希；哈希覆盖角色、正文及当前 swipe_id，排除扩展自身字段。楼号仅用于展示；删 swipe 导致重编号时保守失效。
2. 每聊天串行执行；请求冻结聊天句柄、来源键、父版本和取消令牌。返回时再次校验，过期结果丢弃；同键重复事件不重复调用。写完整快照后才发布，读取也核验来源，不依赖跨文件事务。
3. 新正文后从有效祖先推演；重 roll 的正文生成与随后推演均取目标楼之前的状态，绝不把旧 swipe 的后果当基底。continue/编辑使正文哈希改变，同样重新校验。
4. 切旧 swipe 仅查对应快照；删楼/修改前文使后续链失效；缺失时退至有效祖先并显示待更新。切聊天取消任务、清注入、读取新聊天，禁止异步回调使用新的 current.handle 写旧结果。
5. 新一轮开始时冻结注入，不等后台请求；晚到结果留待下一轮。长历史从 history 分页读取，不能把空槽当空消息（`refs/TauriTavern/docs/API/Chat.md:19,185–205`）。

## 3. 模块与技术栈

五模块：宿主适配器输出事件/历史；状态仓库接收来源键、保存快照；调度器传冻结任务、处理取消去重；推演器接收旧状态与正文、返回校验后的状态/方案；面板与注入器消费快照、提交用户操作。剧情规划共用快照和请求，不另建引擎。

选 TS＋轻量构建、原生 DOM/CSS：任务、快照、接口类型能减少三人协作误用；只需一个面板，无需 UI 框架。组长维护类型与构建，Codex 做状态/调度，dsh 做面板，宿主和请求适配由组长集成；这是后续分工建议。

## 4. 最大风险

- 事件重复/中间输出：验收流式、取消、Agent、快速连续生成。
- 分支串档：验收重 roll、旧 swipe、删楼、改前文、切聊后的迟到结果。
- 持久化边界：聊天导出/分叉是否携带独立 store 不确定，需实测并设计显式导入导出。
- 模型越权或坏 JSON：限制结构/长度，校验失败不提交，默认不自动重试。
- 宿主版本差异：开发指南与 Chat API 对历史窗口描述不同，以部署版本源码及能力探测为准。

## 5. 共同问题

- **Q1** 三件：后台人物/暗线快照；可选择的剧情方案；可撤销的短注入。
- **Q2** 不做多代理、向量记忆库、每轮前置导演。
- **Q3** 每次有效正文完成最多自动调用一次，同时返回状态和可选方案；切旧 swipe 零次。手动规划另行显式触发，不叠加自动调用。
- **Q4** 开关/独立连接、更新时间与失败状态、人物暗线摘要、方案采用/撤销。
- **Q5** 不完全同意“世界引擎的每轮 JSON 更新”暗示其必然不稳；核心风险是可变全局状态和分支归属，单请求本身适合 MVP。

<!-- 完成 -->
