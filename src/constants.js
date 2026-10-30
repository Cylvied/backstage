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
    beatsMin: 2,
    beatsMax: 8,
});

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
    recentFloors: 4,
    maxCharacters: 12,
    maxSignals: 3,
    injectUndercurrent: true,
    injectDepth: 1,
    memory: Object.freeze({ enabled: false, worldbook: '', limit: 8 }),
});
