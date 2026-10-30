// 纸条页和楼层角标用：本轮候选迹象里哪些被注入、来自哪里，没注入的又是为什么。纯函数。
// 挑选逻辑一律用 compose.js 的 selectSignals；这里只给没选上的迹象归类原因、补上来源名字。

import { selectSignals } from '../inject/compose.js';

export const VOICE_LABEL = { here: '此地此刻', rumor: '风闻', undercurrent: '暗流' };

/** 没注入的原因，按展示顺序 */
export const SKIP_REASONS = /** @type {const} */ (['disabled', 'orphan', 'isolated', 'undercurrent', 'limit']);

/** @param {string} reason @param {number} limit */
export function skipReasonLabel(reason, limit) {
    switch (reason) {
        case 'disabled': return '暗流注入已关闭';
        case 'orphan': return '没挂在暗线或人物上';
        case 'isolated': return '主角与外界隔绝，风闻传不进来';
        case 'undercurrent': return '暗流语态每层最多 1 条';
        default: return limit ? `超过每层上限（${limit} 条）` : '每层暗流上限设为 0';
    }
}

/**
 * @typedef {Object} SignalEntry
 * @property {string} voice
 * @property {string} voiceLabel
 * @property {string} text
 * @property {string|null} thread      暗线标题（线存在时）
 * @property {string|null} character   人物名（人物存在时）
 * @property {string|null} threadId    现存暗线的 id
 * @property {number|null} bornRun     产生时的推演轮次
 */

/**
 * @param {import('../types.js').SimState} state
 * @param {Pick<import('../types.js').Settings, 'injectUndercurrent'|'maxSignals'>} settings
 * @returns {{
 *   total: number,
 *   injected: number,
 *   disabled: boolean,
 *   picked: SignalEntry[],
 *   skipped: Array<{ reason: string, label: string, items: SignalEntry[] }>,
 * }}
 */
export function injectionSummary(state, settings) {
    const threads = new Map((state?.threads ?? []).map(t => [t.id, t]));
    const characters = new Map((state?.characters ?? []).map(c => [c.id, c]));
    const candidates = (state?.signals ?? []).filter(s => s && String(s.text ?? '').trim());
    const disabled = !settings.injectUndercurrent;
    const limit = Math.max(0, Math.min(3, Math.floor(settings.maxSignals || 0)));
    const chosen = !disabled && state ? selectSignals(state, settings.maxSignals) : [];
    const chosenSet = new Set(chosen);
    const pickedUndercurrent = chosen.some(s => s.voice === 'undercurrent');

    const entry = s => ({
        voice: s.voice,
        voiceLabel: VOICE_LABEL[s.voice] ?? '暗流',
        text: String(s.text).trim(),
        thread: threads.get(s.threadId)?.title ?? null,
        character: characters.get(s.characterId)?.name ?? null,
        threadId: threads.has(s.threadId) ? s.threadId : null,
        bornRun: Number.isInteger(s.bornRun) ? s.bornRun : null,
    });

    /** @type {Record<string, SignalEntry[]>} */
    const groups = {};
    for (const s of candidates) {
        if (chosenSet.has(s)) continue;
        let reason;
        if (disabled) reason = 'disabled';
        else if (!threads.has(s.threadId) && !characters.has(s.characterId)) reason = 'orphan';
        else if (s.voice === 'rumor' && !state.protagonist?.reachable) reason = 'isolated';
        else if (s.voice === 'undercurrent' && pickedUndercurrent) reason = 'undercurrent';
        else reason = 'limit';
        (groups[reason] ??= []).push(entry(s));
    }

    return {
        total: candidates.length,
        injected: chosen.length,
        disabled,
        picked: chosen.map(entry),
        skipped: SKIP_REASONS.filter(r => groups[r]).map(r => ({ reason: r, label: skipReasonLabel(r, limit), items: groups[r] })),
    };
}

/** "候选 2 · 注入 0" */
export function summaryText(sum) {
    return `候选 ${sum.total} · 注入 ${sum.injected}`;
}

/** "没挂在暗线或人物上 2 条；超过每层上限（3 条）1 条"；全部注入时为空 */
export function skippedText(sum) {
    return sum.skipped.map(g => `${g.label} ${g.items.length} 条`).join('；');
}

/**
 * 旧接口（暗线卡用）：被选中的迹象、来路不明的迹象、本轮透出迹象的线。
 * @param {import('../types.js').SimState} state
 * @param {Pick<import('../types.js').Settings, 'injectUndercurrent'|'maxSignals'>} settings
 */
export function signalSources(state, settings) {
    const sum = injectionSummary(state, settings);
    const threads = new Set((state?.threads ?? []).map(t => t.id));
    const characters = new Set((state?.characters ?? []).map(c => c.id));
    const orphans = (state?.signals ?? []).filter(s => s && String(s.text ?? '').trim()
        && !threads.has(s.threadId) && !characters.has(s.characterId));
    return { picked: sum.picked, orphans, threadIds: new Set(sum.picked.map(p => p.threadId).filter(Boolean)) };
}

/** "来自暗线：标题 · 来自：人物" */
export function sourceText(entry) {
    return [entry.thread ? `来自暗线：${entry.thread}` : '', entry.character ? `来自：${entry.character}` : '']
        .filter(Boolean).join(' · ');
}
