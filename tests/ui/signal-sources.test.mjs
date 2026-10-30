import { test, assert, readFixtureJson } from '../harness.js';
import { signalSources, sourceText, injectionSummary, skippedText } from '../../src/ui/signal-sources.js';
import { selectSignals } from '../../src/inject/compose.js';

const on = { injectUndercurrent: true, maxSignals: 3 };

test('picked 与 selectSignals 一致，并补上暗线标题和人物名', () => {
    const state = readFixtureJson('states/wuxia.json');
    const { picked } = signalSources(state, on);
    const expected = selectSignals(state, 3);
    assert.deepEqual(picked.map(p => p.text), expected.map(s => s.text.trim()));
    for (const [i, p] of picked.entries()) {
        const s = expected[i];
        assert.equal(p.thread, state.threads.find(t => t.id === s.threadId)?.title ?? null);
        assert.equal(p.character, state.characters.find(c => c.id === s.characterId)?.name ?? null);
    }
});

test('来路不明的迹象进 orphans，不进 picked', () => {
    const state = readFixtureJson('states/wuxia.json');
    state.signals.push({ voice: 'here', text: '街上有人吵架', threadId: null, characterId: null, relevance: 3 });
    state.signals.push({ voice: 'rumor', text: '有人说起旧事', threadId: 't_gone', characterId: 'c_gone', relevance: 3 });
    const { picked, orphans } = signalSources(state, on);
    assert.equal(orphans.length, 2);
    assert.ok(!picked.some(p => p.text === '街上有人吵架'));
});

test('注入关闭时 picked 为空，threadIds 只含被选中迹象的线', () => {
    const state = readFixtureJson('states/school-guide.json');
    assert.equal(signalSources(state, { ...on, injectUndercurrent: false }).picked.length, 0);
    const { picked, threadIds } = signalSources(state, on);
    assert.deepEqual([...threadIds].sort(), [...new Set(picked.map(p => p.threadId).filter(Boolean))].sort());
});

test('sourceText', () => {
    assert.equal(sourceText({ thread: '码头分账', character: '何九' }), '来自暗线：码头分账 · 来自：何九');
    assert.equal(sourceText({ thread: null, character: '何九' }), '来自：何九');
    assert.equal(sourceText({ thread: null, character: null }), '');
});

const reasons = sum => Object.fromEntries(sum.skipped.map(g => [g.reason, g.items.map(i => i.text)]));

test('injectionSummary：候选数、注入数与 selectSignals 一致，每条没注入的都有原因', () => {
    const state = readFixtureJson('states/school-guide.json');
    const [a, b] = state.signals;
    state.signals.push(
        { voice: 'here', text: '孤儿迹象', threadId: null, characterId: null, relevance: 3, bornRun: 6 },
        { voice: 'undercurrent', text: '第二条暗流', threadId: a.threadId, characterId: null, relevance: 3 },
        { voice: 'here', text: '多出来的一条', threadId: b.threadId, characterId: null, relevance: 1 },
        { voice: 'here', text: '再多一条', threadId: b.threadId, characterId: null, relevance: 1 },
        { voice: 'here', text: '   ', threadId: b.threadId, characterId: null, relevance: 3 });
    const sum = injectionSummary(state, on);
    assert.equal(sum.total, 6);
    assert.equal(sum.injected, selectSignals(state, 3).length);
    assert.equal(sum.injected + sum.skipped.reduce((n, g) => n + g.items.length, 0), sum.total);
    const r = reasons(sum);
    assert.deepEqual(r.orphan, ['孤儿迹象']);
    assert.ok(r.undercurrent.length === 1);
    assert.ok(r.limit.length >= 1);
    assert.equal(sum.skipped.find(g => g.reason === 'orphan').items[0].bornRun, 6);
    assert.match(skippedText(sum), /没挂在暗线、人物或事件上 1 条/);
});

test('injectionSummary：主角隔绝时风闻单独归类；注入关闭时全部归为关闭', () => {
    const state = readFixtureJson('states/school-guide.json');
    state.protagonist.reachable = false;
    state.signals.push({ voice: 'rumor', text: '有人说起旧事', threadId: state.threads[0].id, characterId: null, relevance: 3 });
    assert.deepEqual(reasons(injectionSummary(state, on)).isolated, ['有人说起旧事']);
    const off = injectionSummary(state, { ...on, injectUndercurrent: false });
    assert.equal(off.injected, 0);
    assert.equal(off.disabled, true);
    assert.deepEqual(off.skipped.map(g => g.reason), ['disabled']);
    assert.equal(off.skipped[0].items.length, off.total);
});

test('injectionSummary：上限为 0 时说明是设置成了 0；空状态不出错', () => {
    const state = readFixtureJson('states/school-guide.json');
    const sum = injectionSummary(state, { injectUndercurrent: true, maxSignals: 0 });
    assert.equal(sum.injected, 0);
    assert.match(sum.skipped.find(g => g.reason === 'limit').label, /设为 0/);
    const none = injectionSummary(null, on);
    assert.equal(none.total, 0);
    assert.equal(none.skipped.length, 0);
});
