// 常量与默认设置（仅组长可修改）。

export const EXT_ID = 'backstage';
export const EXT_NAME = '幕后';
export const LOG_PREFIX = '[Backstage]';

/** message.extra / chat_metadata / extension_settings 里使用的键 */
export const STORE_KEY = 'backstage';
export const SCHEMA_VERSION = 1;
export const SNAPSHOT_VERSION = 1;

/** setExtensionPrompt 使用的注入键 */
export const INJECT_KEY_MAIN = 'backstage_main';     // 暗流 + 普通强度引导，深度 settings.injectDepth
export const INJECT_KEY_PUSH = 'backstage_push';     // "尽快引爆"时的引导，深度 0

export const LIMITS = Object.freeze({
    knows: 5,
    signalText: 80,
    planCards: 3,
    fadedRunsBeforeDelete: 3,
    signalMaxAgeRuns: 2,       // 迹象最多存活的推演次数（noChange 沿用时也计入）
    chronicleMax: 80,          // 事件记录保存上限，超出时删最早的
    chronicleShow: 25,         // 推演时展示最近多少条（另加与活跃暗线、在场人物相关的较早事件）
    loreRequestsMax: 5,        // 每轮最多点名几条世界书
    loreWantRuns: 5,           // 点名的条目保留几轮（期间再次点名则续期）
    loreBudgetMin: 10000,
    loreBudgetMax: 300000,
    beatsMin: 2,
    beatsMax: 8,
});

/** 推演资料的来源层，按优先顺序排列（constant 仅为兼容 v1.5.1 的旧快照保留，新推演不再产生） */
export const LORE_LAYERS = Object.freeze(['pinned', 'constant', 'triggered', 'backstage', 'requested']);

export const BEAT_STATUSES = Object.freeze(['pending', 'active', 'done', 'skipped']);

export const VOICES = Object.freeze(['here', 'rumor', 'undercurrent']);
export const THREAD_STAGES = Object.freeze(['seeded', 'growing', 'ripe', 'resolving', 'faded']);
export const VISIBILITIES = Object.freeze(['hidden', 'hinted', 'known']);
export const INTENSITIES = Object.freeze(['seed', 'normal', 'push']);
export const LIVES = Object.freeze(['alive', 'missing', 'dead']);
export const LONG_ACTION_STATUSES = Object.freeze(['ongoing', 'done', 'abandoned']);
export const CLOCK_PRECISIONS = Object.freeze(['exact', 'approx', 'unknown']);

/** @type {import('./types.js').Settings} */
export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    api: Object.freeze({ mode: 'direct', url: '', key: '', model: '' }),
    profileId: '',
    maxTokens: 2000,
    recentRounds: 3,          // 推演读取最近几轮对话（一轮 = 一条 AI 回复加它前面的用户输入）
    maxCharacters: 12,
    maxSignals: 3,
    injectUndercurrent: true,
    injectDepth: 1,
    memory: Object.freeze({ enabled: false, worldbook: '', limit: 8 }),
    lore: Object.freeze({ budget: 100000, pinned: Object.freeze([]), unpinned: Object.freeze([]), catalog: true }),
    review: Object.freeze({ enabled: true, apiMode: 'same', url: '', key: '', model: '', bigJumpDays: 2 }),
    ui: Object.freeze({ composerButton: true }),
});
