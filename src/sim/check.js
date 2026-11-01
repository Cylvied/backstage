// 程序检查与审核裁决：只处理补丁副本，不访问宿主。

function characterOf(state, update) {
    const names = [update.name, ...(update.aliases ?? [])].filter(Boolean);
    return state.characters.find(item => update.id && item.id === update.id)
        ?? (update.name ? state.characters.find(item => [item.name, ...item.aliases].some(name => names.includes(name))) : undefined);
}

function referenceSet(existing, updates, nameKey) {
    const result = new Set();
    for (const item of existing) {
        result.add(item.id);
        result.add(item[nameKey]);
        for (const alias of item.aliases ?? []) result.add(alias);
    }
    for (const item of updates) {
        if (!item[nameKey]) continue;
        result.add(item[nameKey]);
        for (const alias of item.aliases ?? []) result.add(alias);
    }
    return result;
}

// 删除事件后同步重排 new:N，绝不能把原来的引用移到另一条事实上。
function filterEvents(patch, removed) {
    const indices = new Map();
    patch.addEvents = (patch.addEvents ?? []).filter((event, index) => {
        if (removed.has(index)) return false;
        indices.set(index, indices.size);
        return true;
    });
    patch.signals = (patch.signals ?? []).filter(signal => {
        const match = /^new:(\d+)$/.exec(signal.eventId);
        return !match || !removed.has(Number(match[1]));
    });
    for (const signal of patch.signals ?? []) {
        const match = /^new:(\d+)$/.exec(signal.eventId);
        if (!match) continue;
        const index = indices.get(Number(match[1]));
        signal.eventId = index === undefined ? null : `new:${index}`;
    }
}

/** @returns {{patch:import('../types.js').SimPatch,rejected:import('../types.js').Rejection[]}} */
export function checkPatch(state, patch) {
    const next = structuredClone(patch);
    const rejected = [];
    const reject = (kind, summary, ref, reason) => rejected.push({
        item: { id: `r${rejected.length + 1}`, kind, summary, ref }, by: 'program', reason,
    });
    if (next.clock?.day < state.clock.day) {
        reject('clock', `时间从第 ${state.clock.day} 天退到第 ${next.clock.day} 天`, { list: 'clock' }, '故事天数不能倒退，已忽略整项时钟修改。');
        next.clock = null;
    }
    const characters = referenceSet(state.characters, next.upsertCharacters ?? [], 'name');
    const threads = referenceSet(state.threads, next.upsertThreads ?? [], 'title');
    const events = new Set((state.chronicle ?? []).map(item => item.id));
    const cleanRefs = (row, key, valid, ref) => {
        if (!Array.isArray(row[key])) return;
        row[key] = row[key].filter((id, subIndex) => {
            if (valid.has(id)) return true;
            reject('reference', `引用「${id}」不存在`, { ...ref, field: key, subIndex }, '找不到对应对象，已移除此引用。');
            return false;
        });
    };
    for (const [index, update] of (next.upsertCharacters ?? []).entries()) {
        const previous = characterOf(state, update);
        if (update.knows) update.knows = update.knows.filter((text, subIndex) => {
            if (previous?.knows.includes(text) || !/^知道[：:]/.test(text.trim())
                || /（[^（）]*\S[^（）]*）|\([^()]*\S[^()]*\)/.test(text)) return true;
            reject('knows', `人物「${update.name ?? update.id}」新增认知：${text}`,
                { list: 'upsertCharacters', index, field: 'knows', subIndex }, '新增的已知信息没有括号注明获知渠道。');
            return false;
        });
    }
    for (const [index, thread] of (next.upsertThreads ?? []).entries()) {
        cleanRefs(thread, 'characterIds', characters, { list: 'upsertThreads', index });
    }
    const removedEvents = new Set();
    for (const [index, event] of (next.addEvents ?? []).entries()) {
        if (typeof event.text !== 'string' || !event.text.trim()) {
            reject('event', '新增事件缺少事实文本', { list: 'addEvents', index }, '事件文本为空，无法记录事实。');
            removedEvents.add(index);
            continue;
        }
        cleanRefs(event, 'characterIds', characters, { list: 'addEvents', index });
        cleanRefs(event, 'threadIds', threads, { list: 'addEvents', index });
    }
    for (const [index, signal] of (next.signals ?? []).entries()) {
        for (const [key, valid] of [['characterId', characters], ['threadId', threads], ['eventId', events]]) {
            const id = signal[key];
            if (id == null) continue;
            const match = key === 'eventId' && /^new:(\d+)$/.exec(id);
            const newIndex = match ? Number(match[1]) : -1;
            if (valid.has(id) || (match && newIndex < (next.addEvents ?? []).length && !removedEvents.has(newIndex))) continue;
            reject('reference', `迹象引用「${id}」无效`, { list: 'signals', index, field: key }, '引用不存在或对应新增事件已被移除，已清空此引用。');
            signal[key] = null;
        }
    }
    if (next.markKnown) next.markKnown = next.markKnown.filter((id, index) => {
        if (events.has(id)) return true;
        reject('mark_known', `将事件「${id}」标为主角已知`, { list: 'markKnown', index }, '事件不存在，不能标记为已知。');
        return false;
    });
    if (next.addEvents) filterEvents(next, removedEvents);
    return { patch: next, rejected };
}

/** @returns {import('../types.js').ReviewItem[]} */
export function extractReviewItems(state, patch, { bigJumpDays }) {
    const items = [];
    const add = (kind, summary, ref) => items.push({ id: `r${items.length + 1}`, kind, summary, ref });
    if (patch.clock?.day > state.clock.day && patch.clock.day - state.clock.day >= bigJumpDays) {
        add('clock', `故事时间从第 ${state.clock.day} 天推进到第 ${patch.clock.day} 天`, { list: 'clock' });
    }
    for (const [index, event] of (patch.addEvents ?? []).entries()) {
        add('event', `新增幕后事实：${event.text}`, { list: 'addEvents', index });
    }
    for (const [index, update] of (patch.upsertCharacters ?? []).entries()) {
        const previous = characterOf(state, update);
        const name = update.name ?? previous?.name ?? update.id;
        if (update.longAction?.status === 'done' && previous?.longAction?.status !== 'done') {
            add('action_done', `人物「${name}」完成长期行动：${update.longAction.text}`,
                { list: 'upsertCharacters', index, field: 'longAction' });
        }
        for (const [subIndex, text] of (update.knows ?? []).entries()) {
            if (!previous?.knows.includes(text)) add('knows', `人物「${name}」新增认知：${text}`,
                { list: 'upsertCharacters', index, field: 'knows', subIndex });
        }
    }
    for (const [index, id] of (patch.markKnown ?? []).entries()) {
        const event = (state.chronicle ?? []).find(item => item.id === id);
        add('mark_known', `主角得知事件：${event?.text ?? id}`, { list: 'markKnown', index });
    }
    return items;
}

/** @returns {{patch:import('../types.js').SimPatch,rejected:import('../types.js').Rejection[]}} */
export function applyVerdicts(patch, items, verdicts) {
    const next = structuredClone(patch);
    const rejected = [];
    const events = new Set();
    const known = new Set();
    const knows = new Map();
    for (const item of items) {
        // 重复裁决只要有明确驳回就不放行，未知裁决 id 不影响补丁。
        const verdict = verdicts.find(value => value.id === item.id && value.ok === false);
        if (!verdict) continue;
        rejected.push({ item: structuredClone(item), by: 'reviewer', reason: verdict.reason });
        const { index, subIndex } = item.ref;
        if (item.kind === 'clock') next.clock = null;
        else if (item.kind === 'event') events.add(index);
        else if (item.kind === 'mark_known') known.add(index);
        else if (item.kind === 'action_done' && next.upsertCharacters?.[index]) delete next.upsertCharacters[index].longAction;
        else if (item.kind === 'knows') {
            if (!knows.has(index)) knows.set(index, new Set());
            knows.get(index).add(subIndex);
        }
    }
    if (events.size) filterEvents(next, events);
    if (next.markKnown) next.markKnown = next.markKnown.filter((id, index) => !known.has(index));
    for (const [index, removed] of knows) {
        const update = next.upsertCharacters?.[index];
        if (update?.knows) update.knows = update.knows.filter((text, subIndex) => !removed.has(subIndex));
    }
    return { patch: next, rejected };
}
