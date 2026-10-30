import { test, assert } from '../harness.js';
import { emptyState } from '../../src/util.js';
import { adoptPlan, applyPatch, setGuideIntensity, setGuideStatus } from '../../src/sim/apply.js';

const patch = extra => ({ clock: null, protagonist: null, upsertCharacters: [], removeCharacterIds: [],
    upsertThreads: [], signals: [], noChange: false, ...extra });
const apply = (state, delta = {}, maxCharacters = 12) => applyPatch(state, patch(delta), { maxCharacters });
const character = (id, extra = {}) => ({ id, name: id, aliases: [], location: '', currentAction: null,
    longAction: null, knows: [], life: 'alive', onStage: false, pinned: false, touchedRun: 0, ...extra });
const thread = (id, extra = {}) => ({ id, title: id, characterIds: [], stage: 'seeded', trigger: '', deadline: null,
    visibility: 'hidden', origin: 'sim', guide: null, fadedRuns: 0, ...extra });
const signal = extra => ({ voice: 'here', text: '门外脚步', threadId: null, characterId: null, relevance: 2, ...extra });
const card = extra => ({ title: '故人重逢', goal: '见面', firstSigns: '来信', fit: '旧交', threadId: null,
    suggestedIntensity: 'normal', ...extra });
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}

test('空补丁递增次数，深冻结入参和补丁不被修改', () => {
    const state = freeze(emptyState());
    const delta = freeze(patch({ clock: { day: 2 } }));
    const next = applyPatch(state, delta, { maxCharacters: 12 });
    assert.equal(next.runCount, 1);
    assert.equal(next.clock.day, 2);
    assert.equal(state.clock.day, 1);
    assert.equal(next.clock.precision, 'unknown');
});

test('人物按 id 优先，其次姓名及别名匹配，新对象生成本地 ID', () => {
    const state = emptyState();
    state.characters = [character('c_a', { name: '甲', aliases: ['阿甲'] }), character('c_b', { name: '乙' })];
    const next = apply(state, { upsertCharacters: [{ id: 'c_a', name: '乙', location: '京城' },
        { name: '阿甲', currentAction: { text: '读书', duration: '上午' } }, { id: '伪造', name: '丙' }] });
    assert.equal(next.characters.length, 3);
    assert.equal(next.characters[0].id, 'c_a');
    assert.equal(next.characters[0].currentAction.text, '读书');
    assert.equal(next.characters[0].touchedRun, 1);
    assert.match(next.characters[2].id, /^c_/);
    assert.notEqual(next.characters[2].id, '伪造');
});

test('钉住人物不能被删除、淘汰或模型解除钉住', () => {
    const state = emptyState();
    state.characters = [character('c_a', { pinned: true }), character('c_b', { pinned: true }), character('c_c')];
    const next = apply(state, { upsertCharacters: [{ id: 'c_a', name: '甲', pinned: false }],
        removeCharacterIds: ['c_a', 'c_b', 'c_c'] }, 0);
    assert.deepEqual(next.characters.map(item => item.id), ['c_a', 'c_b']);
    assert.ok(next.characters.every(item => item.pinned));
});

test('淘汰顺序为不在场、无进行中长行动、最久未触及', () => {
    const state = emptyState();
    state.characters = [character('c_stage', { onStage: true }), character('c_long', {
        longAction: { text: '赶路', duration: '两天', status: 'ongoing', outcome: null } }),
    character('c_new', { touchedRun: 5 }), character('c_old', { touchedRun: 1 })];
    assert.deepEqual(apply(state, {}, 3).characters.map(item => item.id), ['c_stage', 'c_long', 'c_new']);
    assert.deepEqual(apply(state, {}, 2).characters.map(item => item.id), ['c_stage', 'c_long']);
    assert.deepEqual(apply(state, {}, 1).characters.map(item => item.id), ['c_stage']);
});

test('本轮触及者更新 touchedRun，认知整体重写且限五条', () => {
    const state = emptyState();
    state.characters = [character('c_a', { knows: ['旧认知'] }), character('c_b')];
    const next = apply(state, { upsertCharacters: [{ name: 'c_a', knows: ['1', '2', '3', '4', '5', '6'] }] }, 1);
    assert.equal(next.characters[0].id, 'c_a');
    assert.deepEqual(next.characters[0].knows, ['1', '2', '3', '4', '5']);
});

test('线索按 id 或标题匹配，不信任新线的外来 ID 和内部计数', () => {
    const state = emptyState();
    state.threads = [thread('t_a', { title: '旧线' })];
    const next = apply(state, { upsertThreads: [{ title: '旧线', stage: 'growing', fadedRuns: 99 },
        { id: '外来', title: '新线' }] });
    assert.equal(next.threads.length, 2);
    assert.equal(next.threads[0].id, 't_a');
    assert.equal(next.threads[0].stage, 'growing');
    assert.equal(next.threads[0].fadedRuns, 0);
    assert.match(next.threads[1].id, /^t_/);
});

test('淡出后连续三次未触及才删除，重新触及重置计数', () => {
    let state = apply(emptyState(), { upsertThreads: [{ title: '淡线', stage: 'faded' }] });
    assert.equal(state.threads[0].fadedRuns, 0);
    state = apply(state);
    state = apply(state);
    assert.equal(state.threads[0].fadedRuns, 2);
    const refreshed = apply(state, { upsertThreads: [{ title: '淡线' }] });
    assert.equal(refreshed.threads[0].fadedRuns, 0);
    assert.equal(apply(state).threads.length, 0);
});

test('noChange 空信号保留上一轮，同时推进淡出计数', () => {
    const state = emptyState();
    state.signals = [signal()];
    state.threads = [thread('t_a', { stage: 'faded' })];
    const next = apply(state, { noChange: true });
    assert.deepEqual(next.signals, state.signals);
    assert.equal(next.runCount, 1);
    assert.equal(next.threads[0].fadedRuns, 1);
    assert.deepEqual(apply(state).signals, []);
    assert.equal(apply(state, { noChange: true, signals: [signal({ text: '新迹象' })] }).signals[0].text, '新迹象');
});

test('删除人物和淡出线索后清理悬空引用', () => {
    const state = emptyState();
    state.characters = [character('c_a')];
    state.threads = [thread('t_old', { stage: 'faded', fadedRuns: 2 }), thread('t_keep', { characterIds: ['c_a'] })];
    const next = apply(state, { removeCharacterIds: ['c_a'], signals: [signal({ characterId: 'c_a', threadId: 't_old' })] });
    assert.deepEqual(next.threads[0].characterIds, []);
    assert.equal(next.signals[0].characterId, null);
    assert.equal(next.signals[0].threadId, null);
});

test('采纳新规划关闭旧引导，挂接现有线不重复创建', () => {
    const first = adoptPlan(emptyState(), card(), 'seed');
    const second = adoptPlan(first, card({ title: '第二条' }), 'push');
    assert.equal(first.threads[0].guide.status, 'active');
    assert.equal(second.threads[0].guide.status, 'dropped');
    assert.equal(second.threads[1].origin, 'user');
    assert.equal(second.threads[1].guide.intensity, 'push');
    const linked = adoptPlan(second, card({ threadId: second.threads[0].id }), 'normal');
    assert.equal(linked.threads.length, 2);
    assert.equal(linked.threads[0].guide.status, 'active');
    assert.equal(linked.threads[1].guide.status, 'dropped');
});

test('采纳到淡出线时恢复为起线，避免立刻被淘汰', () => {
    const state = emptyState();
    state.threads = [thread('t_a', { stage: 'faded', fadedRuns: 2 })];
    const next = adoptPlan(state, card({ threadId: 't_a' }), 'seed');
    assert.equal(next.threads[0].stage, 'seeded');
    assert.equal(next.threads[0].fadedRuns, 0);
});

test('引导状态和强度修改不触碰原对象，未知目标和非法枚举无操作', () => {
    const state = adoptPlan(emptyState(), card(), 'seed');
    const id = state.threads[0].id;
    assert.equal(setGuideStatus(state, id, 'done').threads[0].guide.status, 'done');
    assert.equal(setGuideIntensity(state, id, 'push').threads[0].guide.intensity, 'push');
    assert.equal(state.threads[0].guide.status, 'active');
    assert.equal(state.threads[0].guide.intensity, 'seed');
    assert.deepEqual(setGuideStatus(state, '不存在', 'done'), state);
    assert.deepEqual(setGuideIntensity(state, id, '非法'), state);
    assert.deepEqual(adoptPlan(state, null, 'seed'), state);
});

test('违反 applyPatch 类型契约属于编程错误', () => {
    assert.throws(() => applyPatch(emptyState(), null, { maxCharacters: 12 }));
});
