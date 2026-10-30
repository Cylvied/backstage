import { test, assert, readFixtureJson } from '../harness.js';
import { signalSources, sourceText } from '../../src/ui/signal-sources.js';
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
