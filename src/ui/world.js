// v1.5 世界模型的显示用整理：事件记录（大事记）、检查与审核记录、推演读了哪些资料、世界书预算。纯函数。
// 所有新字段都可能缺省（旧数据）：缺省时按空处理，时间缺省显示"时间不明"。

import { LORE_LAYERS } from '../constants.js';

/** @typedef {import('../types.js').SimState} SimState */
/** @typedef {import('../types.js').ChronicleEntry} ChronicleEntry */
/** @typedef {import('../types.js').Stamp} Stamp */

/** "第 3 天傍晚"；没有天数时为"时间不明" */
export function stampText(stamp) {
    if (!stamp || !Number.isInteger(stamp.day)) return '时间不明';
    return `第 ${stamp.day} 天${stamp.slot ? ` ${stamp.slot}` : ''}`;
}

/**
 * @typedef {Object} EventView
 * @property {string} id
 * @property {string} when        "第 3 天 傍晚" / "时间不明"
 * @property {string} text
 * @property {string[]} people    仍在的相关人物名
 * @property {string[]} threads   仍在的相关暗线标题
 * @property {boolean} known
 * @property {string} knownWhen   主角得知的时间（已知时）
 */

/**
 * 大事记：按发生时间倒序（同一天按写入先后倒序，时间不明的排在最后）。
 * @param {SimState} state
 * @returns {EventView[]}
 */
export function chronicleView(state) {
    const names = new Map((state?.characters ?? []).map(c => [c.id, c.name]));
    const titles = new Map((state?.threads ?? []).map(t => [t.id, t.title]));
    const list = (Array.isArray(state?.chronicle) ? state.chronicle : [])
        .filter(e => e && String(e.text ?? '').trim())
        .map((e, index) => ({ e, index }));
    list.sort((a, b) => dayOf(b.e) - dayOf(a.e) || b.index - a.index);
    return list.map(({ e }) => ({
        id: String(e.id ?? ''),
        when: stampText(e.at),
        text: String(e.text).trim(),
        people: (e.characterIds ?? []).map(id => names.get(id)).filter(Boolean),
        threads: (e.threadIds ?? []).map(id => titles.get(id)).filter(Boolean),
        known: e.known === true,
        knownWhen: e.known === true && e.knownAt ? stampText(e.knownAt) : '',
    }));
}

const dayOf = e => (Number.isInteger(e?.at?.day) ? e.at.day : -Infinity);

/**
 * 与某个人物或某条暗线相关的事件，已知 / 未知分开，各自按时间倒序。
 * @param {SimState} state
 * @param {{ characterId?: string, threadId?: string }} target
 * @returns {{ known: EventView[], unknown: EventView[] }}
 */
export function relatedEvents(state, target) {
    const ids = new Set((Array.isArray(state?.chronicle) ? state.chronicle : [])
        .filter(e => (target.characterId && e?.characterIds?.includes(target.characterId))
            || (target.threadId && e?.threadIds?.includes(target.threadId)))
        .map(e => String(e.id ?? '')));
    const all = chronicleView(state).filter(v => ids.has(v.id));
    return { known: all.filter(v => v.known), unknown: all.filter(v => !v.known) };
}

// ---------- 检查与审核 ----------

export const REVIEW_KIND_LABEL = {
    clock: '时间前进',
    event: '新发生的事',
    action_done: '完成长期行动',
    knows: '人物新得知',
    mark_known: '主角得知',
    reference: '引用',
    other: '其他',
};

/**
 * @param {import('../types.js').ReviewRecord|null|undefined} review
 * @returns {null|{
 *   reviewed: number, approved: number, error: string|null,
 *   rejected: Array<{ kind: string, summary: string, by: string, reason: string }>,
 *   byProgram: number, byReviewer: number, model: string,
 * }}
 */
export function reviewView(review) {
    if (!review || typeof review !== 'object') return null;
    const rejected = (Array.isArray(review.rejected) ? review.rejected : []).map(r => ({
        kind: REVIEW_KIND_LABEL[r?.item?.kind] ?? '其他',
        summary: String(r?.item?.summary ?? '').trim() || '（没有说明）',
        by: r?.by === 'reviewer' ? '审核员' : '程序检查',
        reason: String(r?.reason ?? '').trim() || '没有写原因',
    }));
    return {
        reviewed: Number(review.reviewed) || 0,
        approved: Number(review.approved) || 0,
        error: review.error ? String(review.error) : null,
        rejected,
        byProgram: rejected.filter(r => r.by === '程序检查').length,
        byReviewer: rejected.filter(r => r.by === '审核员').length,
        model: review.usage?.model ? String(review.usage.model) : '',
    };
}

/** 角标说明里的一行；没有可说的返回 '' */
export function reviewLine(review) {
    const v = reviewView(review);
    if (!v) return '';
    if (v.error) return `审核失败，已放行：${v.error}${v.rejected.length ? `；程序检查丢弃 ${v.rejected.length} 条` : ''}`;
    const parts = [];
    if (v.reviewed) parts.push(`送审 ${v.reviewed} 条，通过 ${v.approved} 条`);
    if (v.rejected.length) parts.push(`丢弃 ${v.rejected.length} 条`);
    return parts.length ? `检查与审核：${parts.join('，')}` : '';
}

// ---------- 推演读了哪些资料 ----------

// 层的顺序以 constants.js 的 LORE_LAYERS 为准；不认识的层归到最后的"其他"
export const LORE_LAYER_LABEL = {
    pinned: '推演专用常驻',
    constant: '蓝灯常驻',
    triggered: '正文触发',
    backstage: '幕后触发',
    requested: '按需调取',
};

/**
 * @param {import('../types.js').LoreUsed[]|null|undefined} loreUsed
 * @returns {{ total: number, count: number, groups: Array<{ layer: string, label: string, tokens: number, items: Array<{ title: string, world: string, tokens: number }> }> }}
 */
export function loreGroups(loreUsed) {
    const list = Array.isArray(loreUsed) ? loreUsed.filter(Boolean) : [];
    const tokensOf = x => (Number.isFinite(Number(x?.tokens)) ? Math.max(0, Math.round(Number(x.tokens))) : 0);
    const known = new Set(LORE_LAYERS);
    const layers = [...LORE_LAYERS, ...new Set(list.map(x => x.layer).filter(l => !known.has(l)))];
    const groups = layers.map(layer => {
        const items = list.filter(x => x.layer === layer)
            .map(x => ({ title: String(x.title ?? '').trim() || `条目 ${x.uid}`, world: String(x.world ?? ''), tokens: tokensOf(x) }));
        return { layer, label: LORE_LAYER_LABEL[layer] ?? '其他', tokens: items.reduce((n, x) => n + x.tokens, 0), items };
    }).filter(g => g.items.length);
    return { total: groups.reduce((n, g) => n + g.tokens, 0), count: list.length, groups };
}

/** 1234 → "1,234"；12345 → "1.2 万" */
export function tokenText(n) {
    const v = Math.max(0, Math.round(Number(n) || 0));
    if (v < 10000) return v.toLocaleString('en-US');
    const w = Math.round(v / 1000) / 10;
    return `${Number.isInteger(w) ? w : w.toFixed(1)} 万`;
}

// ---------- 世界书预算 ----------

export const LORE_BUDGET = { min: 10000, max: 300000, step: 5000, fallback: 100000 };

/** 100000 → "10 万 token"；15000 → "1.5 万 token" */
export function budgetText(n) {
    return `${tokenText(Math.max(10000, Number(n) || 0))} token`;
}

/** 输入框里的"万"换成 token 数，规整到范围、取整到 step；看不懂时回退 fallback */
export function normalizeBudget(wan, fallback = LORE_BUDGET.fallback) {
    const n = Number(wan);
    if (String(wan ?? '').trim() === '' || !Number.isFinite(n)) return fallback;
    const tokens = Math.round((n * 10000) / LORE_BUDGET.step) * LORE_BUDGET.step;
    return Math.min(LORE_BUDGET.max, Math.max(LORE_BUDGET.min, tokens));
}

/**
 * 世界书条目筛选：按标题或世界书名包含关键词；已选的排在前面。
 * @param {Array<{ world: string, uid: string|number, title: string, tokens: number }>} entries
 * @param {Array<{ world: string, uid: string|number }>} pinned
 * @param {string} query
 * @param {number} [limit]
 */
export function filterLoreEntries(entries, pinned, query, limit = 150) {
    const chosen = new Set((pinned ?? []).map(loreKey));
    const q = String(query ?? '').trim().toLowerCase();
    const hits = (entries ?? []).filter(e => !q || String(e.title ?? '').toLowerCase().includes(q) || String(e.world ?? '').toLowerCase().includes(q));
    const sorted = [...hits.filter(e => chosen.has(loreKey(e))), ...hits.filter(e => !chosen.has(loreKey(e)))];
    return { items: sorted.slice(0, limit), total: hits.length };
}

/** 条目的唯一键：世界书名 + uid（uid 可能是数字也可能是字符串） */
export function loreKey(e) {
    return `${e?.world ?? ''}\u0000${String(e?.uid ?? '')}`;
}

/** 切换某条目是否常驻，返回新数组 */
export function togglePinnedLore(pinned, entry) {
    const key = loreKey(entry);
    const list = Array.isArray(pinned) ? pinned : [];
    return list.some(p => loreKey(p) === key)
        ? list.filter(p => loreKey(p) !== key)
        : [...list, { world: entry.world, uid: entry.uid }];
}
