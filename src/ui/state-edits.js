// 面板里的用户编辑：每个函数接收状态，返回新状态，不修改入参。纯函数。
// 由面板包在 api.editState(s => fn(s, ...)) 里使用。

import { LIMITS, LIVES, LONG_ACTION_STATUSES, THREAD_STAGES, VISIBILITIES } from '../constants.js';

/** @typedef {import('../types.js').SimState} SimState */

/**
 * 把多行或逗号分隔的文本拆成列表：去空白、去空行、去重，截到 max 条。
 * @param {string} text
 * @param {number} max
 * @param {RegExp} [separator]
 */
export function parseList(text, max, separator = /\n/) {
    const out = [];
    for (const raw of String(text ?? '').split(separator)) {
        const item = raw.trim();
        if (item && !out.includes(item)) out.push(item);
        if (out.length >= max) break;
    }
    return out;
}

/** @param {SimState} state @param {string} id */
export function togglePin(state, id) {
    const next = structuredClone(state);
    const c = next.characters.find(x => x.id === id);
    if (c) c.pinned = !c.pinned;
    return next;
}

/**
 * 移除人物，同时清掉线和迹象里对他的引用。
 * @param {SimState} state @param {string} id
 */
export function removeCharacter(state, id) {
    const next = structuredClone(state);
    next.characters = next.characters.filter(c => c.id !== id);
    for (const t of next.threads) t.characterIds = (t.characterIds ?? []).filter(cid => cid !== id);
    for (const s of next.signals) if (s.characterId === id) s.characterId = null;
    return next;
}

/**
 * 按表单值更新人物。只接受用户可改的字段，非法枚举值忽略。
 * @param {SimState} state
 * @param {string} id
 * @param {{ name?: string, aliases?: string, location?: string, life?: string, onStage?: boolean,
 *           currentText?: string, currentDuration?: string,
 *           longText?: string, longDuration?: string, longStatus?: string, longOutcome?: string,
 *           knows?: string }} form
 */
export function updateCharacter(state, id, form) {
    const next = structuredClone(state);
    const c = next.characters.find(x => x.id === id);
    if (!c) return next;
    if (typeof form.name === 'string' && form.name.trim()) c.name = form.name.trim();
    if (typeof form.aliases === 'string') c.aliases = parseList(form.aliases, 8, /[,，、\n]/);
    if (typeof form.location === 'string') c.location = form.location.trim();
    if (LIVES.includes(form.life)) c.life = /** @type {any} */ (form.life);
    if (typeof form.onStage === 'boolean') c.onStage = form.onStage;
    if (typeof form.currentText === 'string') {
        const text = form.currentText.trim();
        c.currentAction = text ? { text, duration: String(form.currentDuration ?? '').trim() } : null;
    }
    if (typeof form.longText === 'string') {
        const text = form.longText.trim();
        const status = LONG_ACTION_STATUSES.includes(form.longStatus) ? form.longStatus : (c.longAction?.status ?? 'ongoing');
        const outcome = String(form.longOutcome ?? '').trim();
        c.longAction = text
            ? { text, duration: String(form.longDuration ?? '').trim(), status: /** @type {any} */ (status), outcome: status === 'ongoing' ? null : (outcome || null) }
            : null;
    }
    if (typeof form.knows === 'string') c.knows = parseList(form.knows, LIMITS.knows);
    return next;
}

/**
 * 按表单值更新线。guide 与 origin 不在这里改（走 api.adopt / setGuide*）。
 * @param {SimState} state
 * @param {string} id
 * @param {{ title?: string, stage?: string, visibility?: string, trigger?: string,
 *           deadlineText?: string, missedOutcome?: string }} form
 */
export function updateThread(state, id, form) {
    const next = structuredClone(state);
    const t = next.threads.find(x => x.id === id);
    if (!t) return next;
    if (typeof form.title === 'string' && form.title.trim()) t.title = form.title.trim();
    if (THREAD_STAGES.includes(form.stage) && form.stage !== t.stage) {
        t.stage = /** @type {any} */ (form.stage);
        t.fadedRuns = 0;
    }
    if (VISIBILITIES.includes(form.visibility)) t.visibility = /** @type {any} */ (form.visibility);
    if (typeof form.trigger === 'string') t.trigger = form.trigger.trim();
    if (typeof form.deadlineText === 'string') {
        const text = form.deadlineText.trim();
        t.deadline = text ? { text, missedOutcome: String(form.missedOutcome ?? '').trim() } : null;
    }
    return next;
}

/**
 * 删除线，同时清掉迹象里对它的引用。
 * @param {SimState} state @param {string} id
 */
export function removeThread(state, id) {
    const next = structuredClone(state);
    next.threads = next.threads.filter(t => t.id !== id);
    for (const s of next.signals) if (s.threadId === id) s.threadId = null;
    return next;
}

/**
 * 为已有的线开始引导时，交给 api.adopt 的规划卡。
 * @param {import('../types.js').Thread} thread
 * @param {{ goal: string, firstSigns: string }} form
 * @returns {import('../types.js').PlanCard}
 */
export function guideCardForThread(thread, form) {
    return {
        title: thread.title,
        goal: String(form.goal ?? '').trim() || thread.title,
        firstSigns: String(form.firstSigns ?? '').trim() || thread.trigger || '',
        fit: '',
        threadId: thread.id,
        suggestedIntensity: 'normal',
    };
}
