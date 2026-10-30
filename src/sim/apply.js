import { INTENSITIES, LIMITS, LOG_PREFIX } from '../constants.js';
import { shortId, stampOf } from '../util.js';

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

function mergeAction(character, update, key, clock) {
    if (!Object.prototype.hasOwnProperty.call(update, key)) return;
    const old = character[key];
    const action = structuredClone(update[key]);
    if (action) {
        delete action.since;
        if (!old || old.text !== action.text) action.since = stampOf(clock);
        else if (old.since !== undefined) action.since = structuredClone(old.since);
    }
    character[key] = action;
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
    if (patch.clock?.day < next.clock.day) console.warn(`${LOG_PREFIX} 忽略倒退的故事时钟`);
    else if (patch.clock) mergeFields(next.clock, patch.clock, ['day', 'slot', 'precision']);
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
        mergeAction(character, update, 'currentAction', next.clock);
        mergeAction(character, update, 'longAction', next.clock);
        mergeFields(character, update, ['name', 'aliases', 'location', 'knows', 'life', 'onStage']);
        character.knows = character.knows.slice(0, LIMITS.knows);
        character.touchedRun = next.runCount;
    }
    const historicalCharacters = [...next.characters, ...state.characters];
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
        const preventFade = thread.guide?.status === 'active' && update.stage === 'faded';
        if (preventFade) console.warn(`${LOG_PREFIX} 忽略进行中引导的淡出请求`);
        mergeFields(thread, update, ['title', 'characterIds', 'trigger', 'deadline', 'visibility']);
        if (!preventFade) mergeFields(thread, update, ['stage']);
        thread.fadedRuns = 0;
        touched.add(thread.id);
    }
    for (const thread of next.threads) {
        if (thread.guide?.status === 'active' || thread.stage !== 'faded') thread.fadedRuns = 0;
        else if (!touched.has(thread.id)) thread.fadedRuns = (thread.fadedRuns ?? 0) + 1;
    }
    const historicalThreads = [...next.threads, ...state.threads];
    next.threads = next.threads.filter(item => item.guide?.status === 'active'
        || item.stage !== 'faded' || item.fadedRuns < LIMITS.fadedRunsBeforeDelete);
    keepOneGuide(next.threads);
    if (patch.guideReached === true) {
        const guide = next.threads.find(item => item.guide?.status === 'active')?.guide;
        if (guide) guide.reached = true;
    }
    if (!patch.noChange || patch.signals.length) {
        next.signals = structuredClone(patch.signals).map(signal => ({ ...signal, bornRun: next.runCount }));
    }
    next.signals = next.signals.filter(signal => Number.isInteger(signal.bornRun) && signal.bornRun >= 0
        && next.runCount - signal.bornRun < LIMITS.signalMaxAgeRuns);
    // 本轮新建对象尚无模型可知的 ID，先解析名称引用，再清理悬空项。
    const resolveCharacter = ref => next.characters.find(item => item.id === ref)?.id
        ?? next.characters.find(item => item.name === ref || item.aliases.includes(ref))?.id ?? null;
    const resolveThread = ref => next.threads.find(item => item.id === ref)?.id
        ?? next.threads.find(item => item.title === ref)?.id ?? null;
    for (const thread of next.threads) {
        thread.characterIds = [...new Set(thread.characterIds.map(resolveCharacter).filter(id => id !== null))];
    }
    next.chronicle = next.chronicle ?? [];
    const eventIds = [];
    for (const event of patch.addEvents ?? []) {
        const id = shortId('e');
        eventIds.push(id);
        const characterIds = (event.characterIds ?? []).map(ref => historicalCharacters.find(item => item.id === ref)?.id
            ?? historicalCharacters.find(item => item.name === ref || item.aliases.includes(ref))?.id ?? ref);
        const threadIds = (event.threadIds ?? []).map(ref => historicalThreads.find(item => item.id === ref)?.id
            ?? historicalThreads.find(item => item.title === ref)?.id ?? ref);
        next.chronicle.push({ id, text: event.text, at: stampOf(next.clock), characterIds: [...new Set(characterIds)],
            threadIds: [...new Set(threadIds)], known: false, knownAt: null });
    }
    for (const id of patch.markKnown ?? []) {
        const event = next.chronicle.find(item => item.id === id);
        if (event && !event.known) {
            event.known = true;
            event.knownAt = stampOf(next.clock);
        }
    }
    next.chronicle = next.chronicle.slice(-LIMITS.chronicleMax);
    const retainedEvents = new Set(next.chronicle.map(item => item.id));
    for (const signal of next.signals) {
        signal.characterId = resolveCharacter(signal.characterId);
        signal.threadId = resolveThread(signal.threadId);
        if (signal.eventId !== undefined) {
            const match = /^new:(\d+)$/.exec(signal.eventId);
            const id = match ? eventIds[Number(match[1])] : signal.eventId;
            signal.eventId = retainedEvents.has(id) ? id : null;
        }
    }
    next.loreWanted = next.loreWanted ?? [];
    for (const title of [...new Set(patch.loreRequests ?? [])].slice(0, LIMITS.loreRequestsMax)) {
        const entry = next.loreWanted.find(item => item.title === title);
        if (entry) entry.sinceRun = next.runCount;
        else next.loreWanted.push({ title, sinceRun: next.runCount });
    }
    next.loreWanted = next.loreWanted.filter(item => next.runCount - item.sinceRun < LIMITS.loreWantRuns);
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
    const staged = Array.isArray(card.beats) && card.beats.length >= LIMITS.beatsMin;
    const history = staged && thread.guide?.status === 'active' && Array.isArray(thread.guide.beats)
        ? thread.guide.beats.filter(beat => ['done', 'skipped'].includes(beat.status)) : [];
    const beats = staged ? [...history, ...card.beats.slice(0, LIMITS.beatsMax).map((beat, index) => ({
        title: beat.title, goal: beat.goal, firstSigns: beat.firstSigns ?? '', status: index === 0 ? 'active' : 'pending',
    }))] : null;
    thread.guide = { intensity, goal: card.goal, firstSigns: beats ? beats[history.length].firstSigns : card.firstSigns,
        status: 'active', adoptedAt: Date.now(), beats, beatIndex: history.length, reached: false };
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
    if (thread?.guide) {
        thread.guide.intensity = intensity;
        thread.guide.reached = false;
    }
    return next;
}

function moveToNextBeat(guide) {
    guide.reached = false;
    const index = guide.beats.findIndex((beat, index) => index > guide.beatIndex && beat.status === 'pending');
    if (index < 0) guide.status = 'done';
    else {
        guide.beatIndex = index;
        guide.beats[index].status = 'active';
    }
    guide.firstSigns = guide.beats[guide.beatIndex].firstSigns;
}

/** @param {import('../types.js').SimState} state */
export function advanceBeat(state, threadId) {
    const next = structuredClone(state);
    const guide = next.threads.find(item => item.id === threadId)?.guide;
    if (guide?.status !== 'active') return next;
    if (!guide.beats) {
        guide.status = 'done';
        guide.reached = false;
    } else if (guide.beats[guide.beatIndex]?.status === 'active') {
        guide.beats[guide.beatIndex].status = 'done';
        moveToNextBeat(guide);
    }
    return next;
}

/** @param {import('../types.js').SimState} state */
export function skipBeat(state, threadId, index) {
    const next = structuredClone(state);
    const guide = next.threads.find(item => item.id === threadId)?.guide;
    if (guide?.status !== 'active' || !Array.isArray(guide.beats) || !Number.isInteger(index)) return next;
    const beat = guide.beats[index];
    if (!beat || !(beat.status === 'pending' || (index === guide.beatIndex && beat.status === 'active'))) return next;
    beat.status = 'skipped';
    if (index === guide.beatIndex) moveToNextBeat(guide);
    return next;
}
