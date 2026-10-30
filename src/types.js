// 全部 JSDoc 类型定义（仅组长可修改）。
// 用法：/** @param {import('../types.js').SimState} state */
// 本文件没有运行时代码，只导出一个空对象，方便被 import。

/**
 * @typedef {'exact'|'approx'|'unknown'} ClockPrecision
 * @typedef {{ day: number, slot: string, precision: ClockPrecision }} Clock
 * @typedef {{ location: string, reachable: boolean }} Protagonist
 */

/**
 * 故事时间戳（v1.5）。由程序按当时的 clock 盖，模型不写。day 为 null 表示开始时间不明（旧数据）。
 * @typedef {{ day: number|null, slot: string }} Stamp
 */

/**
 * @typedef {{ text: string, duration: string, since?: Stamp }} CurrentAction
 * @typedef {'ongoing'|'done'|'abandoned'} LongActionStatus
 * @typedef {{ text: string, duration: string, status: LongActionStatus, outcome: string|null, since?: Stamp }} LongAction
 * @typedef {'alive'|'missing'|'dead'} Life
 */

/**
 * @typedef {Object} Character
 * @property {string} id              'c_' 开头，程序生成
 * @property {string} name
 * @property {string[]} aliases
 * @property {string} location        "区域·地点"
 * @property {CurrentAction|null} currentAction
 * @property {LongAction|null} longAction
 * @property {string[]} knows         最多 5 条，每轮整体重写
 * @property {Life} life
 * @property {boolean} onStage
 * @property {boolean} pinned
 * @property {number} [touchedRun]    内部：最近一次被 patch 涉及时的 runCount
 */

/**
 * @typedef {'seeded'|'growing'|'ripe'|'resolving'|'faded'} ThreadStage
 * @typedef {'hidden'|'hinted'|'known'} Visibility
 * @typedef {'seed'|'normal'|'push'} Intensity
 * @typedef {'active'|'done'|'dropped'} GuideStatus
 */

/**
 * 分阶段引导中的一拍。
 * @typedef {'pending'|'active'|'done'|'skipped'} BeatStatus
 * @typedef {Object} Beat
 * @property {string} title
 * @property {string} goal
 * @property {string} firstSigns
 * @property {BeatStatus} status
 */

/**
 * @typedef {Object} Guide
 * @property {Intensity} intensity
 * @property {string} goal            整体方向（分阶段时是整条长线的目标）
 * @property {string} firstSigns      单步引导的起始迹象；分阶段时以当前拍的为准
 * @property {GuideStatus} status
 * @property {number} adoptedAt
 * @property {Beat[]|null} [beats]    分阶段引导的拍列表；单步引导为 null 或缺省
 * @property {number} [beatIndex]     当前拍的下标（分阶段时有效）
 * @property {boolean} [reached]      推演判断当前拍（或单步目标）似乎已经演完；只作提示，不自动换拍
 */

/**
 * @typedef {Object} Thread
 * @property {string} id              't_' 开头，程序生成
 * @property {string} title           一句话事实
 * @property {string[]} characterIds
 * @property {ThreadStage} stage
 * @property {string} trigger         引信
 * @property {{ text: string, missedOutcome: string }|null} deadline
 * @property {Visibility} visibility
 * @property {'sim'|'user'} origin
 * @property {Guide|null} guide
 * @property {number} [fadedRuns]     内部：进入 faded 后经过的推演次数
 */

/**
 * @typedef {'here'|'rumor'|'undercurrent'} Voice
 * @typedef {Object} Signal
 * @property {Voice} voice
 * @property {string} text            ≤ 80 字
 * @property {string|null} threadId
 * @property {string|null} characterId
 * @property {1|2|3} relevance
 * @property {string|null} [eventId]  v1.5：这条迹象露出的是哪条世界事实（事件记录 id）
 * @property {number} [bornRun]       内部：产生这条迹象时的 runCount，由 apply 盖戳，用于过期
 */

/**
 * 世界事实（v1.5）：镜头外已经发生的事。
 * @typedef {Object} ChronicleEntry
 * @property {string} id              'e_' 开头，程序生成
 * @property {Stamp} at               发生时间，程序按写入时的 clock 盖
 * @property {string} text            一句话事实
 * @property {string[]} characterIds  相关人物（人物被移除后引用保留，不清理）
 * @property {string[]} threadIds     相关暗线（同上）
 * @property {boolean} known          主角是否已知
 * @property {Stamp|null} knownAt     主角得知的时间
 */

/**
 * @typedef {{ title: string, sinceRun: number }} LoreWant   推演点名下一轮需要的世界书条目（按标题）
 */

/**
 * @typedef {Object} SimState
 * @property {1} schemaVersion
 * @property {Clock} clock
 * @property {Protagonist} protagonist
 * @property {Character[]} characters
 * @property {Thread[]} threads
 * @property {Signal[]} signals
 * @property {number} runCount
 * @property {ChronicleEntry[]} [chronicle]   v1.5：事件记录，缺省视为空
 * @property {LoreWant[]} [loreWanted]        v1.5：按需调取的世界书条目，缺省视为空
 */

/**
 * @typedef {Object} Snapshot
 * @property {1} v
 * @property {string} id              's_' 开头
 * @property {string|null} parentId
 * @property {{ floor: number, swipeId: number, textHash: string }} basis
 * @property {'ok'|'failed'|'manual'} status
 * @property {SimState} state
 * @property {boolean} edited
 * @property {number} createdAt
 * @property {string|null} error
 * @property {{ model: string, ms: number }|null} usage
 * @property {ReviewRecord|null} [review]     v1.5：这次推演的检查与审核记录
 * @property {LoreUsed[]} [loreUsed]          v1.5：这次推演读了哪些世界书条目
 */

/**
 * @typedef {'clock'|'event'|'action_done'|'knows'|'mark_known'|'reference'|'other'} ReviewKind
 * @typedef {Object} ReviewItem
 * @property {string} id               'r1'、'r2'……
 * @property {ReviewKind} kind
 * @property {string} summary          给审核员和用户看的一句话
 * @property {Object} ref              定位到补丁中的位置，例如 { list: 'addEvents', index: 0 }
 * @typedef {{ item: ReviewItem, by: 'program'|'reviewer', reason: string }} Rejection
 * @typedef {Object} ReviewRecord
 * @property {Rejection[]} rejected    被丢弃的条目（程序检查或审核员）
 * @property {number} reviewed         送审条目数（0 表示本轮没调用审核员）
 * @property {number} approved         审核通过数
 * @property {string|null} error       审核员调用失败的原因（失败时放行，记录在此）
 * @property {{ model: string, ms: number }|null} usage
 */

/**
 * @typedef {'pinned'|'triggered'|'backstage'|'requested'} LoreLayer
 * @typedef {{ world: string, uid: string|number, title: string, layer: LoreLayer, tokens: number }} LoreUsed
 */

/**
 * @typedef {Object} PlanCard
 * @property {string} title
 * @property {string} goal
 * @property {string} firstSigns
 * @property {string} fit
 * @property {string|null} threadId
 * @property {Intensity} suggestedIntensity
 * @property {Array<{ title: string, goal: string, firstSigns: string }>} [beats]   分阶段方案：2–8 拍；单步方案缺省
 */

/**
 * @typedef {Object} SimPatch
 * @property {Partial<Clock>|null} clock
 * @property {Partial<Protagonist>|null} protagonist
 * @property {Array<Partial<Character>>} upsertCharacters   有 id 时 name 可省略；无 id 时必须有 name
 * @property {string[]} removeCharacterIds
 * @property {Array<Partial<Thread>>} upsertThreads          有 id 时 title 可省略；无 id 时必须有 title
 * @property {Signal[]} signals
 * @property {boolean} noChange
 * @property {boolean} [guideReached]  推演判断当前引导的这一拍（或单步目标）似乎已经演完
 * @property {Array<{ text: string, characterIds?: string[], threadIds?: string[] }>} [addEvents]  v1.5：本轮镜头外新发生的事实
 * @property {string[]} [markKnown]     v1.5：主角在正文里得知了哪些事件（事件 id）
 * @property {string[]} [loreRequests]  v1.5：下一轮需要调取的世界书条目标题，最多 5 个
 */

/**
 * @typedef {Object} Settings
 * @property {boolean} enabled
 * @property {{ mode: 'direct'|'profile', url: string, key: string, model: string }} api
 *   推演与参谋用的模型。direct = 插件内直填（默认）；profile = 使用 profileId 指向的连接配置
 * @property {string} profileId
 * @property {number} maxTokens
 * @property {number} recentFloors
 * @property {number} maxCharacters
 * @property {number} maxSignals
 * @property {boolean} injectUndercurrent
 * @property {number} injectDepth
 * @property {{ enabled: boolean, worldbook: string, limit: number }} memory
 * @property {{ budget: number, pinned: Array<{ world: string, uid: string|number }>, catalog: boolean }} lore   v1.5
 * @property {{ enabled: boolean, apiMode: 'same'|'direct', url: string, key: string, model: string, bigJumpDays: number }} review   v1.5
 */

/**
 * @typedef {{ role: 'system'|'user'|'assistant', content: string }} ChatMessage
 */

/**
 * 参谋对话的一条记录，存在 chat_metadata.backstage.advisor。
 * @typedef {Object} AdvisorMessage
 * @property {'user'|'assistant'} role
 * @property {string} text            文字部分（已去掉方案卡代码块）
 * @property {PlanCard[]} cards       参谋附的方案卡，没有则为空数组
 * @property {number} at              时间戳
 * @property {string} [error]         仅 assistant：这次回复失败的原因
 */

/**
 * @typedef {Object} SimInput
 * @property {string} userName
 * @property {string} charName
 * @property {string} persona
 * @property {{ description: string, personality: string, scenario: string }} card
 * @property {Array<{ title: string, content: string, layer: LoreLayer }>} worldInfo   v1.5：带标题与来源层
 * @property {string[]} loreCatalog   v1.5：本轮没有带入的条目标题目录（供模型按需点名）
 * @property {Array<{ isUser: boolean, name: string, text: string }>} recent   旧 → 新
 * @property {string[]} memos
 */

/**
 * @typedef {{ isUser: boolean, text: string, swipeId: number, extra: Record<string, any> }} ChatMessageView
 * @typedef {Object} ChatView
 * @property {string} chatId
 * @property {number} length
 * @property {(floor: number) => ChatMessageView|null} getMessage
 */

/**
 * @typedef {Object} SimJob
 * @property {string} chatId
 * @property {number} floor
 * @property {number} swipeId
 * @property {string} textHash
 * @property {'reply'|'manual'} reason
 */

export {};
