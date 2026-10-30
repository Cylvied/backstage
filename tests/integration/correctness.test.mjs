import { test, assert } from '../harness.js';
import { emptyState } from '../../src/util.js';
import { DEFAULT_SETTINGS } from '../../src/constants.js';
import { findBase, makeSnapshot, readSnapshot, isSnapshotValid } from '../../src/state/snapshot-store.js';
import { chooseWriteBase } from '../../src/state/write-guard.js';
import { parseSimOutput } from '../../src/sim/parse.js';
import { applyPatch, adoptPlan, advanceBeat, setGuideStatus } from '../../src/sim/apply.js';
import { composeInjection } from '../../src/inject/compose.js';

const signal = extra => ({ voice: 'here', text: '信使可能抵达', threadId: '送信', characterId: null, relevance: 3, ...extra });
const card = { title: '送信', goal: '查明来意', firstSigns: '来信', threadId: null,
    beats: [{ title: '来信', goal: '认出来信人', firstSigns: '信封' },
        { title: '见面', goal: '问清来意', firstSigns: '敲门' }] };
function parsed(value) {
    const result = parseSimOutput(JSON.stringify(value));
    assert.ok(result.ok);
    return result.patch;
}
const apply = (state, value = { noChange: true }) => applyPatch(state, parsed(value), { maxCharacters: 12 });
const seed = () => apply(emptyState(), { upsertThreads: [{ title: '送信', stage: 'growing' }], signals: [signal()] });
const save = (state, extra = {}) => makeSnapshot({ floor: 0, swipeId: 0, text: '正文', state, ...extra });
const message = snapshot => ({ isUser: false, text: '正文', swipeId: 0, extra: { backstage: snapshot } });
const restored = state => readSnapshot(message(save(state))).state;

// 仅模拟 index 的纯函数编排，不代替宿主异步事件和实际写入测试。
function finishJob(base, current, value) {
    const result = parseSimOutput(value);
    const decision = chooseWriteBase({ jobStartedAt: 100, current, ok: result.ok });
    if (decision.action === 'skip') return current;
    const source = decision.action === 'rebase' ? decision.snapshot : base;
    const snapshot = save(result.ok ? applyPatch(source.state, result.patch, { maxCharacters: 12 }) : source.state,
        { parent: base, status: result.ok ? 'ok' : 'failed', error: result.ok ? null : result.error });
    if (decision.action === 'rebase') {
        snapshot.parentId = source.parentId;
        snapshot.edited = source.edited;
    }
    return snapshot;
}

test('重抽排除最后一楼，旧 fallback 不得污染新推演和注入', () => {
    const snapshot = save(seed());
    const view = { chatId: '聊天', length: 1, getMessage: () => message(snapshot), fallbackSnapshot: snapshot };
    assert.ok(composeInjection(snapshot.state, DEFAULT_SETTINGS).undercurrent.includes('信使可能抵达'));
    const base = findBase(view, -1);
    assert.deepEqual(base, { snapshot: null, state: emptyState(), floor: null, stale: false });
    assert.equal(composeInjection(base.state, DEFAULT_SETTINGS).undercurrent, '');
    assert.deepEqual(restored(apply(base.state)).threads, []);
    view.getMessage = () => ({ isUser: false, text: '重写正文', swipeId: 1, extra: {} });
    assert.deepEqual(findBase(view, 0).state, emptyState());
});

test('连续 noChange 经快照往返，迹象第二轮过期且十轮后不再注入', () => {
    let state = restored(seed());
    const bornRun = state.signals[0].bornRun;
    assert.equal(bornRun, state.runCount);
    for (let age = 1; age <= 10; age++) {
        state = restored(apply(state));
        assert.equal(state.runCount, bornRun + age);
        assert.equal(state.signals.length, age < 2 ? 1 : 0);
        assert.equal(composeInjection(state, DEFAULT_SETTINGS).undercurrent.includes('信使可能抵达'), age < 2);
    }
});

test('模型伪造 bornRun 被解析丢弃，新迹象由 apply 盖本轮戳', () => {
    for (const noChange of [true, false]) {
        const delta = parsed({ noChange, signals: [signal({ bornRun: 99999 })] });
        assert.equal(delta.signals[0].bornRun, undefined);
        const state = applyPatch(seed(), delta, { maxCharacters: 12 });
        assert.equal(state.signals[0].bornRun, 2);
        assert.equal(delta.signals[0].bornRun, undefined);
        assert.equal(restored(state).signals[0].bornRun, 2);
    }
});

test('旧迹象可读但缺少 bornRun 时在下次合并过期', () => {
    const state = seed();
    delete state.signals[0].bornRun;
    const old = restored(state);
    assert.equal(old.signals.length, 1);
    assert.deepEqual(restored(apply(old)).signals, []);
    assert.equal(state.signals.length, 1);
});

test('连续 faded 补丁和空轮均不能删除 active 引导，其他更新仍生效', () => {
    let state = seed();
    state = adoptPlan(state, { ...card, threadId: state.threads[0].id }, 'normal');
    const line = state.threads.find(t => t.guide?.status === 'active');
    const originalGuide = structuredClone(line.guide);
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = text => warnings.push(text);
    try {
        for (let i = 0; i < 4; i++) {
            state = restored(apply(state, { upsertThreads: [{ id: line.id, stage: 'faded', trigger: `条件${i}` }] }));
            const current = state.threads.find(t => t.id === line.id);
            assert.equal(current.stage, line.stage);
            assert.equal(current.trigger, `条件${i}`);
            assert.equal(current.fadedRuns, 0);
            assert.deepEqual(current.guide, originalGuide);
        }
        assert.equal(warnings.length, 4);
    } finally { console.warn = originalWarn; }
    for (let i = 0; i < 4; i++) state = restored(apply(state));
    assert.ok(state.threads.some(t => t.id === line.id));
    assert.ok(composeInjection(state, DEFAULT_SETTINGS).guide.includes('认出来信人'));
});

test('旧快照中已 faded 的 active 引导也免于计数和淘汰', () => {
    let state = adoptPlan(emptyState(), card, 'normal');
    state.threads[0].stage = 'faded';
    state.threads[0].fadedRuns = 99;
    for (let i = 0; i < 4; i++) state = restored(apply(state));
    assert.equal(state.threads.length, 1);
    assert.equal(state.threads[0].fadedRuns, 0);
    assert.equal(state.threads[0].guide.status, 'active');
});

test('done 或 dropped 引导恢复普通淡出和三轮淘汰规则', () => {
    for (const status of ['done', 'dropped']) {
        let state = adoptPlan(emptyState(), card, 'normal');
        const id = state.threads[0].id;
        state = setGuideStatus(state, id, status);
        state = apply(state, { upsertThreads: [{ id, stage: 'faded' }] });
        assert.equal(state.threads[0].stage, 'faded');
        for (let i = 1; i <= 3; i++) {
            state = restored(apply(state));
            assert.equal(state.threads.length, i < 3 ? 1 : 0);
        }
        assert.equal(composeInjection(state, DEFAULT_SETTINGS).guide, '');
    }
});

test('推演期间采纳方案，写回重基保留引导、编辑标记、父链并合并补丁', () => {
    const base = save(seed());
    const state = adoptPlan(base.state, { ...card, threadId: base.state.threads[0].id }, 'push');
    const current = save(state, { parent: base, status: 'manual' });
    current.createdAt = 101;
    const before = structuredClone(current);
    const result = finishJob(base, readSnapshot(message(current)), JSON.stringify({
        clock: { day: 2 }, upsertThreads: [{ id: state.threads[0].id, stage: 'faded' }],
    }));
    assert.deepEqual(result.state.threads[0].guide, current.state.threads[0].guide);
    assert.equal(result.state.clock.day, 2);
    assert.equal(result.parentId, current.parentId);
    assert.equal(result.edited, true);
    assert.ok(isSnapshotValid(result, message(result)));
    assert.deepEqual(current, before);
    assert.ok(composeInjection(result.state, DEFAULT_SETTINGS).guide.includes('认出来信人'));
});

test('推演期间换拍并钉住人物，旧补丁重基后不丢用户操作', () => {
    const original = adoptPlan(apply(emptyState(), { upsertCharacters: [{ name: '信使' }] }), card, 'normal');
    const base = save(original);
    const state = advanceBeat(base.state, original.threads[0].id);
    state.characters[0].pinned = true;
    const current = save(state, { parent: base, status: 'manual' });
    current.createdAt = 100;
    const result = finishJob(base, current, JSON.stringify({ removeCharacterIds: [state.characters[0].id],
        upsertCharacters: [{ id: state.characters[0].id, location: '门外', pinned: false }] }));
    assert.equal(result.state.characters[0].pinned, true);
    assert.equal(result.state.characters[0].location, '门外');
    assert.equal(result.state.threads[0].guide.beatIndex, 1);
    assert.equal(result.edited, true);
    assert.ok(composeInjection(restored(result.state), DEFAULT_SETTINGS).guide.includes('问清来意'));
});

test('推演失败时写回保护保留期间编辑的快照', () => {
    const base = save(seed());
    const current = save(adoptPlan(base.state, card, 'normal'), { parent: base, status: 'manual' });
    current.createdAt = 101;
    const before = structuredClone(current);
    const result = finishJob(base, current, '截断的 JSON {');
    assert.equal(result, current);
    assert.deepEqual(result, before);
    assert.ok(readSnapshot(message(result)));
});
