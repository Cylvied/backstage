import { BEAT_STATUSES, CLOCK_PRECISIONS, INTENSITIES, LIVES, LONG_ACTION_STATUSES, LOG_PREFIX,
    SCHEMA_VERSION, SNAPSHOT_VERSION, STORE_KEY, THREAD_STAGES, VISIBILITIES, VOICES } from '../constants.js';
import { emptyState, hashText, shortId } from '../util.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string';
const boolean = value => typeof value === 'boolean';
const strings = value => Array.isArray(value) && value.every(string);
const integer = value => Number.isInteger(value) && value >= 0;
const nullableString = value => value === null || string(value);
const hasStrings = (value, keys) => object(value) && keys.every(key => string(value[key]));
const stamp = value => object(value) && (value.day === null || (Number.isInteger(value.day) && value.day >= 1)) && string(value.slot);
const optionalArray = (value, check) => value === undefined || (Array.isArray(value) && value.every(check));
const usageValid = value => value === null || (object(value) && string(value.model) && Number.isFinite(value.ms) && value.ms >= 0);

function validEvent(value) {
    return hasStrings(value, ['id', 'text']) && value.id.startsWith('e_') && stamp(value.at)
        && strings(value.characterIds) && strings(value.threadIds) && boolean(value.known)
        && (value.knownAt === null || stamp(value.knownAt));
}

function validReview(value) {
    return value === undefined || value === null || (object(value) && integer(value.reviewed) && integer(value.approved)
        && nullableString(value.error) && usageValid(value.usage) && Array.isArray(value.rejected)
        && value.rejected.every(row => object(row) && ['program', 'reviewer'].includes(row.by) && string(row.reason)
            && hasStrings(row.item, ['id', 'summary']) && object(row.item.ref)
            && ['clock', 'event', 'action_done', 'knows', 'mark_known', 'reference', 'other'].includes(row.item.kind)));
}

function validLoreUsed(value) {
    return hasStrings(value, ['world', 'title']) && (string(value.uid) || Number.isFinite(value.uid))
        && ['pinned', 'triggered', 'backstage', 'requested'].includes(value.layer)
        && Number.isFinite(value.tokens) && value.tokens >= 0;
}

function validAction(value, long = false) {
    return value === null || (hasStrings(value, ['text', 'duration']) && (value.since === undefined || stamp(value.since)) && (!long
        || (LONG_ACTION_STATUSES.includes(value.status) && nullableString(value.outcome))));
}

function validGuide(value) {
    if (value === null) return true;
    if (!hasStrings(value, ['goal', 'firstSigns']) || !INTENSITIES.includes(value.intensity)
        || !['active', 'done', 'dropped'].includes(value.status) || !Number.isFinite(value.adoptedAt) || value.adoptedAt < 0
        || (value.reached !== undefined && !boolean(value.reached))
        || (value.beatIndex !== undefined && !integer(value.beatIndex))) return false;
    if (value.beats === undefined || value.beats === null) return true;
    // 替换剩余拍会累积历史，快照不套用新卡的八拍上限。
    return Array.isArray(value.beats) && integer(value.beatIndex) && value.beatIndex < value.beats.length
        && value.beats.every(beat => hasStrings(beat, ['title', 'goal', 'firstSigns'])
            && Boolean(beat.title.trim()) && Boolean(beat.goal.trim()) && BEAT_STATUSES.includes(beat.status))
        && value.beats.filter(beat => beat.status === 'active').length <= 1
        && value.beats.every((beat, index) => beat.status !== 'active' || index === value.beatIndex);
}

function validState(state) {
    if (!object(state) || state.schemaVersion !== SCHEMA_VERSION || !integer(state.runCount)
        || !object(state.clock) || !Number.isInteger(state.clock.day) || state.clock.day < 1
        || !string(state.clock.slot) || !CLOCK_PRECISIONS.includes(state.clock.precision)
        || !object(state.protagonist) || !string(state.protagonist.location) || !boolean(state.protagonist.reachable)
        || !Array.isArray(state.characters) || !Array.isArray(state.threads) || !Array.isArray(state.signals)) return false;
    return optionalArray(state.chronicle, validEvent)
        && optionalArray(state.loreWanted, item => hasStrings(item, ['title']) && integer(item.sinceRun))
        && state.characters.every(item => hasStrings(item, ['id', 'name', 'location']) && strings(item.aliases)
        && strings(item.knows) && item.knows.length <= 5 && LIVES.includes(item.life) && boolean(item.onStage)
        && boolean(item.pinned) && validAction(item.currentAction) && validAction(item.longAction, true)
        && (item.touchedRun === undefined || integer(item.touchedRun)))
        && state.threads.every(item => hasStrings(item, ['id', 'title', 'trigger']) && strings(item.characterIds)
            && THREAD_STAGES.includes(item.stage) && VISIBILITIES.includes(item.visibility)
            && ['sim', 'user'].includes(item.origin) && validGuide(item.guide)
            && (item.deadline === null || hasStrings(item.deadline, ['text', 'missedOutcome']))
            && (item.fadedRuns === undefined || integer(item.fadedRuns)))
        && state.signals.every(item => object(item) && VOICES.includes(item.voice) && string(item.text)
            && Array.from(item.text).length <= 80 && nullableString(item.threadId) && nullableString(item.characterId)
            && [1, 2, 3].includes(item.relevance)
            && (item.eventId === undefined || nullableString(item.eventId))
            && (item.bornRun === undefined || integer(item.bornRun)));
}

function validSnapshot(snapshot) {
    return object(snapshot) && snapshot.v === SNAPSHOT_VERSION && string(snapshot.id) && snapshot.id.startsWith('s_')
        && nullableString(snapshot.parentId) && object(snapshot.basis) && integer(snapshot.basis.floor)
        && integer(snapshot.basis.swipeId) && string(snapshot.basis.textHash)
        && ['ok', 'failed', 'manual'].includes(snapshot.status) && boolean(snapshot.edited)
        && Number.isFinite(snapshot.createdAt) && snapshot.createdAt >= 0 && nullableString(snapshot.error)
        && usageValid(snapshot.usage) && validReview(snapshot.review) && optionalArray(snapshot.loreUsed, validLoreUsed)
        && validState(snapshot.state);
}

/** @returns {import('../types.js').Snapshot|null} */
export function readSnapshot(message) {
    const snapshot = message?.extra?.[STORE_KEY];
    if (snapshot == null) return null;
    if (!validSnapshot(snapshot)) {
        console.warn(`${LOG_PREFIX} 忽略损坏或版本不支持的快照`);
        return null;
    }
    return structuredClone(snapshot);
}

/** @param {import('../types.js').Snapshot} snapshot */
export function isSnapshotValid(snapshot, message) {
    return validSnapshot(snapshot) && message?.isUser === false && string(message.text)
        && snapshot.basis.textHash === hashText(message.text);
}

/** @param {import('../types.js').ChatView} chatView */
export function findBase(chatView, beforeOrAtFloor) {
    if (chatView && typeof chatView.getMessage === 'function' && integer(chatView.length) && Number.isFinite(beforeOrAtFloor)) {
        for (let floor = Math.min(Math.floor(beforeOrAtFloor), chatView.length - 1); floor >= 0; floor--) {
            const message = chatView.getMessage(floor);
            if (!message || message.isUser !== false) continue;
            const snapshot = readSnapshot(message);
            if (isSnapshotValid(snapshot, message)) return { snapshot, state: snapshot.state, floor, stale: false };
        }
    }
    return { snapshot: null, state: emptyState(), floor: null, stale: false };
}

/** @returns {import('../types.js').Snapshot} */
export function makeSnapshot({ parent = null, floor, swipeId, text, state, status = 'ok', error = null, usage = null, review, loreUsed }) {
    const snapshot = { v: SNAPSHOT_VERSION, id: shortId('s'), parentId: parent?.id ?? null,
        basis: { floor, swipeId, textHash: hashText(text) }, status, state: structuredClone(state),
        edited: status === 'manual', createdAt: Date.now(), error, usage: structuredClone(usage),
        ...(review !== undefined ? { review: structuredClone(review) } : {}),
        ...(loreUsed !== undefined ? { loreUsed: structuredClone(loreUsed) } : {}) };
    if (!validSnapshot(snapshot)) throw new TypeError('快照参数不符合接口契约');
    return snapshot;
}
