// 推演用世界书的分层挑选（v1.5 B4）。纯函数，不访问宿主。
// 读世界书、计 token、按预算截断由 host 完成；这里只决定"候选有哪些、按什么顺序、各属哪一层"。

/** @typedef {import('../types.js').SimState} SimState */
/** @typedef {import('../types.js').LoreLayer} LoreLayer */

/**
 * @typedef {Object} LoreEntry
 * @property {string} world
 * @property {string|number} uid
 * @property {string} title
 * @property {string} content
 * @property {string[]} keys
 * @property {boolean} disabled
 */

/** 数据库插件导出的表格与纪要条目：纪要另有记忆通道，表格不是设定，都不当世界书资料 */
const EXCLUDED_TITLE = /^TavernDB-ACU-/i;

export const entryKey = (world, uid) => `${world}\u0000${uid}`;

/**
 * 把幕后状态里"镜头外在关心什么"拼成一段文本，用来匹配世界书关键词。
 * @param {SimState} state
 */
export function backstageText(state) {
    const parts = [state.protagonist?.location ?? ''];
    for (const c of state.characters ?? []) {
        if (c.onStage) continue;
        parts.push(c.name, ...(c.aliases ?? []), c.location ?? '');
    }
    for (const t of state.threads ?? []) {
        if (t.stage === 'faded') continue;
        parts.push(t.title, t.trigger ?? '');
        if (t.guide?.status === 'active') parts.push(t.guide.goal ?? '');
    }
    const chronicle = state.chronicle ?? [];
    for (const e of chronicle.slice(-10)) parts.push(e.text);
    return parts.filter(Boolean).join('\n');
}

/**
 * 关键词是否命中。支持宿主的 /正则/flags 写法；其余按不区分大小写的子串匹配。
 * @param {string} key
 * @param {string} text
 */
export function keyMatches(key, text) {
    const k = String(key ?? '').trim();
    if (!k) return false;
    const re = k.match(/^\/(.+)\/([a-z]*)$/i);
    if (re) {
        try { return new RegExp(re[1], re[2]).test(text); } catch { return false; }
    }
    return text.toLowerCase().includes(k.toLowerCase());
}

/**
 * @param {{
 *   entries: LoreEntry[],
 *   triggered: Set<string>,                      // entryKey 集合：本轮正文已触发的条目
 *   pinned: Array<{ world: string, uid: string|number }>,
 *   state: SimState,
 *   catalog: boolean,                            // 是否启用"目录 + 按需调取"
 * }} args
 * @returns {{ candidates: Array<{ entry: LoreEntry, layer: LoreLayer }>, catalog: string[] }}
 *   candidates 按层的优先顺序排列：常驻 → 正文触发 → 幕后触发 → 按需调取；同一条目只出现一次
 *   catalog    其余可用条目的标题（catalog=false 时为空）
 */
export function selectLore({ entries, triggered, pinned, state, catalog }) {
    const usable = entries.filter(e => !e.disabled && String(e.content ?? '').trim() && !EXCLUDED_TITLE.test(e.title ?? ''));
    const pinnedSet = new Set((pinned ?? []).map(p => entryKey(p.world, p.uid)));
    const text = backstageText(state);
    const wanted = new Set(catalog ? (state.loreWanted ?? []).map(w => w.title) : []);

    const taken = new Set();
    const candidates = [];
    const take = (entry, layer) => {
        const k = entryKey(entry.world, entry.uid);
        if (taken.has(k)) return;
        taken.add(k);
        candidates.push({ entry, layer });
    };

    for (const e of usable) if (pinnedSet.has(entryKey(e.world, e.uid))) take(e, 'pinned');
    for (const e of usable) if (triggered.has(entryKey(e.world, e.uid))) take(e, 'triggered');
    if (text) for (const e of usable) if (e.keys.some(k => keyMatches(k, text))) take(e, 'backstage');
    for (const e of usable) if (wanted.has(e.title)) take(e, 'requested');

    const rest = catalog
        ? [...new Set(usable.filter(e => !taken.has(entryKey(e.world, e.uid))).map(e => e.title).filter(Boolean))]
        : [];
    return { candidates, catalog: rest };
}

/**
 * 按预算截断：按顺序整条放入，放不下的跳过（继续尝试后面更小的条目）。
 * @template T
 * @param {Array<T & { tokens: number }>} items
 * @param {number} budget
 * @returns {{ kept: T[], dropped: T[], total: number }}
 */
export function fitBudget(items, budget) {
    const kept = [];
    const dropped = [];
    let total = 0;
    for (const item of items) {
        if (total + item.tokens <= budget) {
            kept.push(item);
            total += item.tokens;
        } else {
            dropped.push(item);
        }
    }
    return { kept, dropped, total };
}
