// 全部 JSDoc 类型定义（仅组长可修改）。
// 用法：/** @param {import('../types.js').SimState} state */
// 本文件没有运行时代码，只导出一个空对象，方便被 import。

/**
 * @typedef {'exact'|'approx'|'unknown'} ClockPrecision
 * @typedef {{ day: number, slot: string, precision: ClockPrecision }} Clock
 * @typedef {{ location: string, reachable: boolean }} Protagonist
 */

/**
 * @typedef {{ text: string, duration: string }} CurrentAction
 * @typedef {'ongoing'|'done'|'abandoned'} LongActionStatus
 * @typedef {{ text: string, duration: string, status: LongActionStatus, outcome: string|null }} LongAction
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
 * @typedef {Object} Guide
 * @property {Intensity} intensity
 * @property {string} goal
 * @property {string} firstSigns
 * @property {GuideStatus} status
 * @property {number} adoptedAt
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
 */

/**
 * @typedef {Object} PlanCard
 * @property {string} title
 * @property {string} goal
 * @property {string} firstSigns
 * @property {string} fit
 * @property {string|null} threadId
 * @property {Intensity} suggestedIntensity
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
 */

/**
 * @typedef {Object} Settings
 * @property {boolean} enabled
 * @property {string} profileId
 * @property {number} maxTokens
 * @property {number} recentFloors
 * @property {number} maxCharacters
 * @property {number} maxSignals
 * @property {boolean} injectUndercurrent
 * @property {number} injectDepth
 * @property {{ enabled: boolean, worldbook: string, limit: number }} memory
 */

/**
 * @typedef {{ role: 'system'|'user'|'assistant', content: string }} ChatMessage
 */

/**
 * @typedef {Object} SimInput
 * @property {string} userName
 * @property {string} charName
 * @property {string} persona
 * @property {{ description: string, personality: string, scenario: string }} card
 * @property {string[]} worldInfo
 * @property {Array<{ isUser: boolean, name: string, text: string }>} recent   旧 → 新
 * @property {string[]} memos
 */

/**
 * @typedef {{ isUser: boolean, text: string, swipeId: number, extra: Record<string, any> }} ChatMessageView
 * @typedef {Object} ChatView
 * @property {string} chatId
 * @property {number} length
 * @property {(floor: number) => ChatMessageView|null} getMessage
 * @property {Snapshot|null} fallbackSnapshot
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
