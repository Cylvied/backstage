import { INTENSITIES, LIMITS } from '../constants.js';
import { shortId } from '../util.js';

const newCharacter = name => ({ id: shortId('c'), name, aliases: [], location: '',
    currentAction: null, longAction: null, knows: [], life: 'alive', onStage: false, pinned: false });
const newThread = title => ({ id: shortId('t'), title, characterIds: [], stage: 'seeded',
    trigger: '', deadline: null, visibility: 'hidden', origin: 'sim', guide: null, fadedRuns: 0 });

function mergeFields(target, patch, keys) {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) target[key] = structuredClone(patch[key]);
    }
}

function keepOneGuide(threads, preferredId = null) {
    let selected = preferredId;
    for (const thread of threads) {
        if (thread.guide?.status !== 'active') continue;
        if (selected === null) selected = thread.id;
        else if (selected !== thread.id) thread.guide.status = 'dropped';
    }
}

/**
 * @param {import('../types.js').SimState} state
 * @param {import('../types.js').SimPatch} patch 已通过 parseSimOutput 校验的补丁
 * @param {{maxCharacters:number}} opts
 * @returns {import('../types.js').SimState}
 */
export function applyPatch(state, patch, { maxCharacters }) {
    const next = structuredClone(state);
    next.runCount++;
    // noChange 不阻止计数与淡出清理，只允许空信号沿用上一轮。
    if (patch.clock) mergeFields(next.clock, patch.clock, ['day', 'slot', 'precision']);
    if (patch.protagonist) mergeFields(next.protagonist, patch.protagonist, ['location', 'reachable']);
    for (const update of patch.upsertCharacters) {
        const hasName = typeof update.name === 'string' && Boolean(update.name.trim());
        if (!hasName && !next.characters.some(item => update.id && item.id === update.id)) continue;
        const names = new Set([update.name, ...(update.aliases ?? [])]);
        let character = next.characters.find(item => update.id && item.id === update.id)
            ?? next.characters.find(item => [item.name, ...item.aliases].some(name => names.has(name)));
        if (!character) {
            character = newCharacter(update.name);
            next.characters.push(character);
        }
        mergeFields(character, update, ['name', 'aliases', 'location', 'currentAction', 'longAction',
            'knows', 'life', 'onStage']);
        character.knows = character.knows.slice(0, LIMITS.knows);
        character.touchedRun = next.runCount;
    }
    const removals = new Set(patch.removeCharacterIds);
    next.characters = next.characters.filter(item => item.pinned || !removals.has(item.id));
    const limit = Number.isFinite(maxCharacters) ? Math.max(0, Math.floor(maxCharacters)) : 12;
    const candidates = next.characters.filter(item => !item.pinned).sort((a, b) =>
        Number(a.onStage) - Number(b.onStage)
        || Number(a.longAction?.status === 'ongoing') - Number(b.longAction?.status === 'ongoing')
        || (a.touchedRun ?? 0) - (b.touchedRun ?? 0));
    const evicted = new Set(candidates.slice(0, Math.max(0, next.characters.length - limit)).map(item => item.id));
    next.characters = next.characters.filter(item => !evicted.has(item.id));

    const touched = new Set();
    for (const update of patch.upsertThreads) {
        const hasTitle = typeof update.title === 'string' && Boolean(update.title.trim());
        if (!hasTitle && !next.threads.some(item => update.id && item.id === update.id)) continue;
        let thread = next.threads.find(item => update.id && item.id === update.id)
            ?? next.threads.find(item => item.title === update.title);
        if (!thread) {
            thread = newThread(update.title);
            next.threads.push(thread);
        }
        mergeFields(thread, update, ['title', 'characterIds', 'stage', 'trigger', 'deadline', 'visibility']);
        thread.fadedRuns = 0;
        touched.add(thread.id);
    }
    for (const thread of next.threads) {
        if (thread.stage !== 'faded') thread.fadedRuns = 0;
        else if (!touched.has(thread.id)) thread.fadedRuns = (thread.fadedRuns ?? 0) + 1;
    }
    next.threads = next.threads.filter(item => item.stage !== 'faded' || item.fadedRuns < LIMITS.fadedRunsBeforeDelete);
    keepOneGuide(next.threads);
    if (!patch.noChange || patch.signals.length) next.signals = structuredClone(patch.signals);
    // 本轮新建对象尚无模型可知的 ID，先解析名称引用，再清理悬空项。
    const resolveCharacter = ref => next.characters.find(item => item.id === ref)?.id
        ?? next.characters.find(item => item.name === ref || item.aliases.includes(ref))?.id ?? null;
    const resolveThread = ref => next.threads.find(item => item.id === ref)?.id
        ?? next.threads.find(item => item.title === ref)?.id ?? null;
    for (const thread of next.threads) {
        thread.characterIds = [...new Set(thread.characterIds.map(resolveCharacter).filter(id => id !== null))];
    }
    for (const signal of next.signals) {
        signal.characterId = resolveCharacter(signal.characterId);
        signal.threadId = resolveThread(signal.threadId);
    }
    return next;
}

/** @param {import('../types.js').SimState} state @param {import('../types.js').PlanCard} card */
export function adoptPlan(state, card, intensity) {
    const next = structuredClone(state);
    if (!card || typeof card.title !== 'string' || !card.title.trim()
        || typeof card.goal !== 'string' || typeof card.firstSigns !== 'string' || !INTENSITIES.includes(intensity)) return next;
    let thread = next.threads.find(item => card.threadId && item.id === card.threadId);
    if (!thread) {
        thread = newThread(card.title);
        thread.origin = 'user';
        next.threads.push(thread);
    }
    thread.guide = { intensity, goal: card.goal, firstSigns: card.firstSigns, status: 'active', adoptedAt: Date.now() };
    if (thread.stage === 'faded') thread.stage = 'seeded';
    thread.fadedRuns = 0;
    keepOneGuide(next.threads, thread.id);
    return next;
}

/** @param {import('../types.js').SimState} state */
export function setGuideStatus(state, threadId, status) {
    const next = structuredClone(state);
    if (!['done', 'dropped'].includes(status)) return next;
    const thread = next.threads.find(item => item.id === threadId);
    if (thread?.guide) thread.guide.status = status;
    return next;
}

/** @param {import('../types.js').SimState} state */
export function setGuideIntensity(state, threadId, intensity) {
    const next = structuredClone(state);
    if (!INTENSITIES.includes(intensity)) return next;
    const thread = next.threads.find(item => item.id === threadId);
    if (thread?.guide) thread.guide.intensity = intensity;
    return next;
}
