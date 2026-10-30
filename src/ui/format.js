// 面板用的文案、排序与状态判断。纯函数，不访问宿主，便于测试。

import { reviewLine } from './world.js';

/** @typedef {import('../types.js').SimState} SimState */
/** @typedef {import('../types.js').Character} Character */
/** @typedef {import('../types.js').Thread} Thread */
/** @typedef {import('../types.js').Settings} Settings */

export const STAGE_LABEL = { seeded: '起线', growing: '延展', ripe: '成形', resolving: '收束', faded: '淡出' };
export const VISIBILITY_LABEL = { hidden: '主角不知', hinted: '主角有所察觉', known: '主角已知' };
export const INTENSITY_LABEL = { seed: '只铺垫', normal: '自然推进', push: '尽快引爆' };
export const LIFE_LABEL = { alive: '存活', missing: '失踪', dead: '死亡' };
export const LONG_STATUS_LABEL = { ongoing: '进行中', done: '已完成', abandoned: '已放弃' };
export const GUIDE_STATUS_LABEL = { active: '引导中', done: '引导已完成', dropped: '引导已放弃' };
export const PRECISION_LABEL = { exact: '', approx: '约', unknown: '时间不明' };

const STAGE_ORDER = { ripe: 0, growing: 1, resolving: 2, seeded: 3, faded: 4 };
const LIFE_ORDER = { alive: 0, missing: 1, dead: 2 };

/** @param {import('../types.js').Clock|undefined} clock */
export function clockText(clock) {
    if (!clock) return '';
    if (clock.precision === 'unknown') return PRECISION_LABEL.unknown;
    const prefix = clock.precision === 'approx' ? '约' : '';
    const slot = clock.slot ? ` · ${clock.slot}` : '';
    return `${prefix}第 ${clock.day} 天${slot}`;
}

/**
 * 顶部状态条。
 * @param {{ lagging: boolean, lastError: string|null, lastRunAt: number, scheduler?: { running: any, queued: number, lastError: string|null } }} status
 * @param {{ enabled: boolean, apiReady: boolean }} config  apiReady 来自 api.settings.isApiReady()
 * @returns {{ kind: 'off'|'setup'|'running'|'failed'|'lagging'|'fresh', text: string, detail: string }}
 */
export function statusView(status, config) {
    if (!config.enabled) return { kind: 'off', text: '后台推演已关闭', detail: '' };
    if (!config.apiReady) return { kind: 'setup', text: '需要先配置模型 API', detail: '点「去配置」填写地址和模型' };
    if (status.scheduler?.running) {
        const queued = status.scheduler.queued ? `，另有 ${status.scheduler.queued} 个排队` : '';
        return { kind: 'running', text: '推演中…', detail: queued ? queued.slice(1) : '' };
    }
    const error = status.lastError ?? status.scheduler?.lastError ?? null;
    if (error) return { kind: 'failed', text: '上次推演失败', detail: String(error) };
    if (status.lagging) return { kind: 'lagging', text: '推演落后一轮', detail: '最新回复还没有推演结果' };
    return { kind: 'fresh', text: '已是最新', detail: '' };
}

/**
 * 钉住的在前，其次在场，再按生死；同组保持原顺序。
 * @param {Character[]} characters
 */
export function sortCharacters(characters) {
    return characters
        .map((c, i) => ({ c, i }))
        .sort((a, b) => (Number(b.c.pinned) - Number(a.c.pinned))
            || (Number(b.c.onStage) - Number(a.c.onStage))
            || ((LIFE_ORDER[a.c.life] ?? 0) - (LIFE_ORDER[b.c.life] ?? 0))
            || (a.i - b.i))
        .map(x => x.c);
}

/**
 * 正在引导的在最前，其次用户采纳的，再按阶段（成形 → 淡出）。
 * @param {Thread[]} threads
 */
export function sortThreads(threads) {
    const rank = t => (t.guide?.status === 'active' ? 0 : t.origin === 'user' ? 1 : 2);
    return threads
        .map((t, i) => ({ t, i }))
        .sort((a, b) => (rank(a.t) - rank(b.t))
            || ((STAGE_ORDER[a.t.stage] ?? 9) - (STAGE_ORDER[b.t.stage] ?? 9))
            || (a.i - b.i))
        .map(x => x.t);
}

/** @param {SimState} state */
export function activeGuideThread(state) {
    return state?.threads?.find(t => t.guide?.status === 'active') ?? null;
}

/**
 * 楼层角标。info 为 api.getFloorInfo 的返回值；sum 为这层状态的 injectionSummary（拿不到状态时省略，只显示候选数）。
 * lines 是点开角标后显示的说明，一行一条。
 * @param {any} info
 * @param {{ total: number, injected: number, disabled: boolean, skipped: Array<{ label: string, items: any[] }> }} [sum]
 * @returns {{ kind: 'ok'|'failed'|'edited'|'stale', text: string, title: string, lines: string[] }|null}
 */
export function badgeView(info, sum) {
    if (!info) return null;
    const make = (kind, text, lines) => ({ kind, text, title: lines.join('\n'), lines });
    if (!info.valid) return make('stale', '幕后 · 已失效', ['这条回复改过，推演结果不再适用']);
    if (info.status === 'failed') return make('failed', '幕后 · 失败', [info.error ? `推演失败：${info.error}` : '推演失败']);

    const total = sum ? sum.total : (info.signalCount ?? 0);
    const signalLines = [];
    let tail = null;
    if (sum && total) {
        signalLines.push(`候选 ${total} 条迹象 · 注入 ${sum.injected} 条${sum.disabled ? '（注入已关闭）' : ''}`);
        if (!sum.disabled) for (const g of sum.skipped) signalLines.push(`未注入 ${g.items.length} 条：${g.label}`);
        tail = `注入 ${sum.injected}/${total}`;
    } else if (total) {
        signalLines.push(`候选 ${total} 条迹象`);
        tail = `候选 ${total}`;
    }

    const review = reviewLine(info.review);
    if (review) signalLines.push(review);
    if (info.edited) return make('edited', ['幕后 · 已编辑', tail].filter(Boolean).join(' · '), ['你在面板里修改过这一层的推演', ...signalLines]);
    if (info.status === 'manual') return make('edited', ['幕后 · 手动', tail].filter(Boolean).join(' · '), ['这一层没有推演，由手动编辑产生', ...signalLines]);
    const changed = info.changedCharacters ?? [];
    const head = changed.length ? `推演完成：${changed.length} 人有变化（${changed.join('、')}）`
        : total ? '推演完成' : '推演完成：镜头外无明显变化';
    return make('ok', ['幕后', changed.length ? `${changed.length} 人` : null, tail].filter(Boolean).join(' · '), [head, ...signalLines]);
}

/**
 * 解析 CSS 颜色（rgb/rgba/#hex），判断是不是深色背景。无法判断（透明或看不懂）时返回 null。
 * @param {string} color
 * @returns {boolean|null}
 */
export function isDarkColor(color) {
    const rgb = parseColor(color);
    if (!rgb || rgb.a < 0.1) return null;
    const lin = v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
    return luminance < 0.3;
}

/** @param {string} color */
function parseColor(color) {
    const text = String(color ?? '').trim().toLowerCase();
    let m = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
    if (m) {
        const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
        return { r: +m[1], g: +m[2], b: +m[3], a: alpha };
    }
    m = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (m) {
        const hex = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
        return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
    }
    return null;
}

/** 设置里数字项的取值范围 */
export const SETTING_RANGES = {
    maxTokens: [200, 32000],
    recentFloors: [1, 20],
    maxCharacters: [3, 40],
    maxSignals: [0, 3],
    injectDepth: [0, 10],
    memoryLimit: [1, 20],
    bigJumpDays: [1, 30],
};

/**
 * 把输入框里的数字规整到范围内；看不懂时回退 fallback。
 * @param {keyof typeof SETTING_RANGES} key
 * @param {string|number} raw
 * @param {number} fallback
 */
export function normalizeNumberSetting(key, raw, fallback) {
    const [min, max] = SETTING_RANGES[key];
    const n = Math.round(Number(raw));
    if (String(raw).trim() === '' || !Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

// ---------- 分阶段引导与参谋（v1.3） ----------

export const BEAT_MARK = { done: '✓', active: '▶', pending: '○', skipped: '⤫' };
export const BEAT_STATUS_LABEL = { done: '已完成', active: '当前', pending: '待演', skipped: '已跳过' };

/** 参谋空状态里可以直接点的示例问题 */
export const ADVISOR_EXAMPLES = ['接下来可以怎么走？', '哪条暗线最该推进？', '帮我把这段剧情排成几个阶段'];

/** 「找参谋改改」预填到输入框的文字 */
export function adjustBeatsPrompt(thread) {
    return `我想调整当前的分阶段引导「${thread?.title ?? ''}」：`;
}

/**
 * 分阶段引导的进度。单步引导返回 null。
 * @param {import('../types.js').Guide|null|undefined} guide
 * @returns {{ total: number, current: number, beat: import('../types.js').Beat|null, isLast: boolean, doneCount: number }|null}
 */
export function beatProgress(guide) {
    const beats = guide?.beats;
    if (!Array.isArray(beats) || !beats.length) return null;
    const index = Number.isInteger(guide.beatIndex) ? guide.beatIndex : beats.findIndex(b => b.status === 'active');
    const beat = beats[index] ?? null;
    const hasNext = beats.some((b, i) => i !== index && b.status === 'pending');
    return {
        total: beats.length,
        current: beat ? index + 1 : beats.length,
        beat,
        isLast: !hasNext,
        doneCount: beats.filter(b => b.status === 'done').length,
    };
}

/**
 * 方案卡的采纳按钮文案与提示：会不会替换当前引导、会不会只替换剩余拍。
 * @param {import('../types.js').PlanCard} card
 * @param {import('../types.js').Thread|null} current  当前 active 引导所在的线
 * @returns {{ label: string, note: string }}
 */
export function adoptView(card, current) {
    if (!current) return { label: '采纳', note: '' };
    const sameThread = Boolean(card.threadId) && card.threadId === current.id;
    const staged = Array.isArray(card.beats) && card.beats.length > 0;
    if (sameThread && staged && beatProgress(current.guide)) {
        return { label: '采纳并替换剩余拍', note: `会保留「${current.title}」已完成和已跳过的拍，替换剩下的拍。` };
    }
    if (sameThread) return { label: '采纳', note: `会更新「${current.title}」现在的引导。` };
    return { label: '替换并采纳', note: `采纳后会替换当前的引导「${current.title}」。` };
}

// ---------- 模型 API（v1.4） ----------

/**
 * 按输入过滤模型列表：忽略大小写，分词后每个词都要出现；完全相同的排最前。
 * @param {string[]} models
 * @param {string} query
 * @param {number} [limit]
 */
export function filterModels(models, query, limit = 200) {
    const q = String(query ?? '').trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const hits = (models ?? []).filter(m => words.every(w => m.toLowerCase().includes(w)));
    hits.sort((a, b) => Number(b.toLowerCase() === q) - Number(a.toLowerCase() === q));
    return hits.slice(0, limit);
}

/** 测试连接成功后的一行说明 */
export function testResultText(res) {
    const secs = Number.isFinite(res?.ms) ? `${(res.ms / 1000).toFixed(1)} 秒` : '';
    return ['可用', res?.model, secs].filter(Boolean).join(' · ');
}

/**
 * 扩展设置抽屉里那一行 API 状态。
 * @param {Settings} settings
 * @param {boolean} ready  api.settings.isApiReady()
 * @param {Array<{ id: string, name: string }>} profiles
 * @returns {{ kind: 'ok'|'setup'|'off', text: string }}
 */
export function apiStatusView(settings, ready, profiles) {
    if (!ready) return { kind: 'setup', text: '需要先配置模型 API' };
    const prefix = settings.enabled ? '已配置' : '已配置（后台推演已关闭）';
    if (settings.api?.mode === 'profile') {
        const name = profiles?.find(p => p.id === settings.profileId)?.name ?? settings.profileId;
        return { kind: settings.enabled ? 'ok' : 'off', text: `${prefix} · 连接配置：${name}` };
    }
    return { kind: settings.enabled ? 'ok' : 'off', text: `${prefix} · ${settings.api?.model ?? ''}` };
}
