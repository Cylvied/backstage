import { test, assert, readFixtureJson } from '../harness.js';
import { emptyState } from '../../src/util.js';
import { parseSimOutput, parseReviewOutput } from '../../src/sim/parse.js';
import { checkPatch, extractReviewItems, applyVerdicts } from '../../src/sim/check.js';
import { applyPatch } from '../../src/sim/apply.js';
import { makeSnapshot, readSnapshot, findBase } from '../../src/state/snapshot-store.js';
import { composeInjection } from '../../src/inject/compose.js';
import { DEFAULT_SETTINGS } from '../../src/constants.js';
const parse = value => parseSimOutput(JSON.stringify(value)).patch;
const merge = (state, value, maxCharacters = 12) => applyPatch(state, checkPatch(state, parse(value)).patch, { maxCharacters });
const sig = eventId => ({ voice: 'here', text: '信使可能抵达', characterId: null, threadId: null, relevance: 3, eventId });
const action = (text, status = 'ongoing') => ({ text, duration: '两天', status, outcome: null });
function seed() {
    return merge(emptyState(), { clock: { day: 3, slot: '上午' }, upsertCharacters: [{ name: '甲',
        currentAction: { text: '读信', duration: '片刻' }, longAction: action('送信') }], upsertThreads: [{ title: '来信' }] });
}
const snapshot = (state, extra = {}) => makeSnapshot({ floor: 0, swipeId: 0, text: '正文', state, ...extra });
const msg = saved => ({ isUser: false, text: '正文', swipeId: 0, extra: { backstage: saved } });

test('倒退时钟整项丢弃，其他内容合并，apply 独立防止倒退', () => {
    const base = seed();
    const patch = parse({ clock: { day: 2, slot: '夜里' }, addEvents: [{ text: '已送达' }] });
    const checked = checkPatch(base, patch);
    assert.equal(checked.patch.clock, null);
    assert.equal(checked.rejected[0].item.kind, 'clock');
    for (const delta of [patch, checked.patch]) {
        const state = applyPatch(base, delta, { maxCharacters: 12 });
        assert.deepEqual(state.clock, base.clock);
        assert.deepEqual(state.chronicle[0].at, { day: 3, slot: '上午' });
    }
});

test('行动同文本沿用 since，换文本重新盖戳，旧无时间不伪造', () => {
    let state = seed();
    const id = state.characters[0].id;
    state = merge(state, { clock: { day: 4 }, upsertCharacters: [{ id, currentAction: { text: '读信', duration: '更久' },
        longAction: action('送信', 'done') }] });
    assert.equal(state.characters[0].currentAction.since.day, 3);
    assert.equal(state.characters[0].longAction.since.day, 3);
    state = merge(state, { clock: { day: 5, slot: '夜里' }, upsertCharacters: [{ id,
        currentAction: { text: '睡觉', duration: '整夜' }, longAction: action('回程') }] });
    assert.deepEqual(state.characters[0].currentAction.since, { day: 5, slot: '夜里' });
    assert.equal(state.characters[0].longAction.since.day, 5);
    delete state.characters[0].longAction.since;
    state = merge(state, { upsertCharacters: [{ id, longAction: action('回程') }] });
    assert.equal(state.characters[0].longAction.since, undefined);
    state = merge(state, { upsertCharacters: [{ id, longAction: null, currentAction: null }] });
    assert.equal(state.characters[0].longAction, null);
});

test('新增事件引用成真实 id 并可注入，markKnown 只盖首次获知时间', () => {
    let state = merge(seed(), { addEvents: [{ text: '信件已送达', characterIds: ['甲'], threadIds: ['来信'] }], signals: [sig('new:0')] });
    const event = state.chronicle[0];
    assert.match(event.id, /^e_/);
    assert.equal(event.known, false);
    assert.equal(event.knownAt, null);
    assert.equal(state.signals[0].eventId, event.id);
    assert.deepEqual(event.characterIds, [state.characters[0].id]);
    assert.ok(composeInjection(state, DEFAULT_SETTINGS).undercurrent.includes('信使可能抵达'));
    const checked = checkPatch(state, parse({ clock: { day: 4 }, markKnown: [event.id, '错误'] }));
    assert.equal(checked.rejected.length, 1);
    state = applyPatch(state, checked.patch, { maxCharacters: 12 });
    assert.equal(state.chronicle[0].known, true);
    assert.equal(state.chronicle[0].knownAt.day, 4);
    state = merge(state, { clock: { day: 6 }, markKnown: [event.id] });
    assert.equal(state.chronicle[0].knownAt.day, 4);
    assert.ok(readSnapshot(msg(snapshot(state))));
});

test('审核只驳回一条事实与行动完成，其余更新保留，new:N 不错位', () => {
    const base = seed();
    const checked = checkPatch(base, parse({ addEvents: [{ text: '驳回' }, { text: '保留' }],
        signals: [sig('new:0'), sig('new:1')], upsertCharacters: [{ id: base.characters[0].id,
            location: '城外', longAction: action('送信', 'done') }] }));
    const items = extractReviewItems(base, checked.patch, { bigJumpDays: 2 });
    const verdicts = parseReviewOutput(JSON.stringify({ verdicts: items.filter(i => i.kind === 'action_done'
        || i.kind === 'event' && i.ref.index === 0).map(i => ({ id: i.id, ok: false, reason: '时间不足' })) })).verdicts;
    const reviewed = applyVerdicts(checked.patch, items, verdicts);
    const state = applyPatch(base, reviewed.patch, { maxCharacters: 12 });
    assert.equal(reviewed.rejected.length, 2);
    assert.deepEqual(state.chronicle.map(e => e.text), ['保留']);
    assert.deepEqual(state.characters[0].longAction, base.characters[0].longAction);
    assert.equal(state.characters[0].location, '城外');
    assert.equal(state.signals[0].eventId, null);
    assert.equal(state.signals[1].eventId, state.chronicle[0].id);
    const saved = snapshot(state, { review: { rejected: reviewed.rejected, reviewed: items.length,
        approved: items.length - 2, error: null, usage: null } });
    assert.ok(readSnapshot(msg(saved)));
});

test('人物淘汰和暗线删除后历史事实及引用仍完整保留', () => {
    let state = seed();
    const c = state.characters[0].id;
    const t = state.threads[0].id;
    state = merge(state, { addEvents: [{ text: '已完成', characterIds: [c], threadIds: [t] }],
        upsertThreads: [{ id: t, stage: 'faded' }] }, 0);
    const event = structuredClone(state.chronicle[0]);
    assert.equal(state.characters.length, 0);
    for (let i = 0; i < 3; i++) state = merge(state, { noChange: true });
    assert.equal(state.threads.length, 0);
    assert.deepEqual(state.chronicle[0], event);
    assert.deepEqual(readSnapshot(msg(snapshot(state))).state.chronicle[0].characterIds, [c]);
});

test('事件上限 80 删除最早记录，同时清理迹象对被删事件的引用', () => {
    const state = merge(emptyState(), { addEvents: Array.from({ length: 82 }, (_, i) => ({ text: `事件${i}` })),
        signals: [sig('new:0'), sig('new:81')] });
    assert.equal(state.chronicle.length, 80);
    assert.equal(state.chronicle[0].text, '事件2');
    assert.equal(state.signals[0].eventId, null);
    assert.equal(state.signals[1].eventId, state.chronicle[79].id);
});

test('世界书每轮最多五条，同名续期，五轮未再点名移除', () => {
    let state = merge(emptyState(), { loreRequests: ['一', '二', '三', '四', '五', '六'] });
    assert.equal(state.loreWanted.length, 5);
    for (let i = 0; i < 4; i++) state = merge(state, { noChange: true });
    assert.equal(state.loreWanted.length, 5);
    state = merge(state, { loreRequests: ['一', '一'] });
    assert.deepEqual(state.loreWanted, [{ title: '一', sinceRun: 6 }]);
    for (let i = 0; i < 5; i++) state = merge(state, { noChange: true });
    assert.deepEqual(state.loreWanted, []);
});

test('旧快照无所有新增字段仍作为基底继续推演', () => {
    const legacy = readFixtureJson('v15/states/legacy.json');
    assert.equal(legacy.chronicle, undefined);
    const saved = snapshot(legacy);
    const base = findBase({ length: 1, getMessage: () => msg(saved) }, 0);
    assert.ok(base.snapshot);
    assert.equal(base.snapshot.review, undefined);
    const next = merge(base.state, { addEvents: [{ text: '新事实' }], loreRequests: ['地图'] });
    assert.equal(next.chronicle.length, 1);
    assert.equal(next.loreWanted.length, 1);
    assert.ok(readSnapshot(msg(snapshot(next))));
});
