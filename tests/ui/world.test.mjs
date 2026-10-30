import { test, assert, readFixtureJson } from '../harness.js';
import {
    stampText, chronicleView, relatedEvents, reviewView, reviewLine, loreGroups, tokenText,
    budgetText, normalizeBudget, filterLoreEntries, togglePinnedLore,
} from '../../src/ui/world.js';
import { updateCharacter } from '../../src/ui/state-edits.js';
import { injectionSummary, eventText } from '../../src/ui/signal-sources.js';

const withChronicle = () => {
    const state = readFixtureJson('states/school-guide.json');
    const [c1, c2] = state.characters;
    const [t1] = state.threads;
    state.chronicle = [
        { id: 'e_aaa001', at: { day: 2, slot: '傍晚' }, text: '旧事', characterIds: [c1.id], threadIds: [], known: true, knownAt: { day: 3, slot: '清晨' } },
        { id: 'e_aaa002', at: { day: 4, slot: '午后' }, text: '新事', characterIds: [c1.id, 'c_gone00'], threadIds: [t1.id], known: false, knownAt: null },
        { id: 'e_aaa003', at: { day: 4, slot: '夜里' }, text: '同一天更晚写入', characterIds: [c2.id], threadIds: [t1.id], known: false, knownAt: null },
        { id: 'e_aaa004', at: { day: null, slot: '' }, text: '时间不明的事', characterIds: [], threadIds: [], known: false, knownAt: null },
        { id: 'e_aaa005', at: { day: 1, slot: '' }, text: '   ', characterIds: [], threadIds: [], known: false, knownAt: null },
    ];
    return state;
};

test('stampText：有天数、带时段、时间不明', () => {
    assert.equal(stampText({ day: 3, slot: '傍晚' }), '第 3 天 傍晚');
    assert.equal(stampText({ day: 3, slot: '' }), '第 3 天');
    assert.equal(stampText({ day: null, slot: '傍晚' }), '时间不明');
    assert.equal(stampText(undefined), '时间不明');
});

test('chronicleView：倒序、同天按写入倒序、时间不明垫底、空文本忽略、只列现存的名字', () => {
    const state = withChronicle();
    const v = chronicleView(state);
    assert.deepEqual(v.map(e => e.text), ['同一天更晚写入', '新事', '旧事', '时间不明的事']);
    assert.deepEqual(v[1].people, [state.characters[0].name]);
    assert.deepEqual(v[1].threads, [state.threads[0].title]);
    assert.equal(v[2].known, true);
    assert.equal(v[2].knownWhen, '第 3 天 清晨');
    assert.equal(v[3].when, '时间不明');
});

test('旧数据没有 chronicle：大事记和相关事件为空', () => {
    const state = readFixtureJson('states/school-guide.json');
    delete state.chronicle;
    assert.deepEqual(chronicleView(state), []);
    assert.deepEqual(relatedEvents(state, { characterId: state.characters[0].id }), { known: [], unknown: [] });
});

test('relatedEvents：按人物或暗线挑出，已知和未知分开', () => {
    const state = withChronicle();
    const c = relatedEvents(state, { characterId: state.characters[0].id });
    assert.deepEqual(c.known.map(e => e.text), ['旧事']);
    assert.deepEqual(c.unknown.map(e => e.text), ['新事']);
    const t = relatedEvents(state, { threadId: state.threads[0].id });
    assert.deepEqual(t.unknown.map(e => e.text), ['同一天更晚写入', '新事']);
    assert.equal(t.known.length, 0);
});

test('reviewView / reviewLine：驳回来源、失败放行、旧数据为空', () => {
    assert.equal(reviewView(null), null);
    assert.equal(reviewLine(undefined), '');
    const review = {
        reviewed: 3, approved: 2, error: null, usage: { model: 'm', ms: 1 },
        rejected: [
            { item: { id: 'r1', kind: 'event', summary: '何九已经离城', ref: {} }, by: 'reviewer', reason: '时间不够' },
            { item: { id: 'p1', kind: 'reference', summary: '引用了不存在的人物', ref: {} }, by: 'program', reason: '' },
        ],
    };
    const v = reviewView(review);
    assert.equal(v.byReviewer, 1);
    assert.equal(v.byProgram, 1);
    assert.equal(v.rejected[0].kind, '新发生的事');
    assert.equal(v.rejected[1].by, '程序检查');
    assert.equal(v.rejected[1].reason, '没有写原因');
    assert.equal(reviewLine(review), '检查与审核：送审 3 条，通过 2 条，丢弃 2 条');
    assert.equal(reviewLine({ ...review, error: '超时' }), '审核失败，已放行：超时；程序检查丢弃 2 条');
    assert.equal(reviewLine({ ...review, rejected: [], error: '超时' }), '审核失败，已放行：超时');
    assert.equal(reviewLine({ reviewed: 0, approved: 0, rejected: [], error: null }), '');
});

test('loreGroups：按层分组、按层顺序、合计 token；旧数据为空', () => {
    const g = loreGroups([
        { world: 'w', uid: 1, title: '地图', layer: 'pinned', tokens: 1200 },
        { world: 'w', uid: 2, title: '何九', layer: 'backstage', tokens: 300.4 },
        { world: 'w', uid: 3, title: '', layer: 'triggered', tokens: 500 },
        { world: 'w', uid: 4, title: '漕帮', layer: 'pinned', tokens: 800 },
    ]);
    assert.deepEqual(g.groups.map(x => x.label), ['推演专用常驻', '正文触发', '幕后触发']);
    assert.equal(g.groups[0].tokens, 2000);
    assert.equal(g.groups[1].items[0].title, '条目 3');
    assert.equal(g.total, 2800);
    assert.equal(loreGroups(undefined).groups.length, 0);
});

test('tokenText / budgetText / normalizeBudget', () => {
    assert.equal(tokenText(1234), '1,234');
    assert.equal(tokenText(12345), '1.2 万');
    assert.equal(budgetText(100000), '10 万 token');
    assert.equal(budgetText(15000), '1.5 万 token');
    assert.equal(normalizeBudget('10'), 100000);
    assert.equal(normalizeBudget('0.2'), 10000);
    assert.equal(normalizeBudget('99'), 300000);
    assert.equal(normalizeBudget('2.53'), 25000);
    assert.equal(normalizeBudget('abc', 50000), 50000);
});

test('filterLoreEntries / togglePinnedLore：数字与字符串 uid 一视同仁，已选排前', () => {
    const entries = [
        { world: '江湖', uid: 1, title: '漕帮总览', tokens: 900 },
        { world: '江湖', uid: 2, title: '城门地图', tokens: 400 },
        { world: '宫廷', uid: 1, title: '六部', tokens: 300 },
    ];
    const pinned = [{ world: '宫廷', uid: '1' }];
    assert.deepEqual(filterLoreEntries(entries, pinned, '').items.map(e => e.title), ['六部', '漕帮总览', '城门地图']);
    assert.deepEqual(filterLoreEntries(entries, pinned, '江湖').items.map(e => e.title), ['漕帮总览', '城门地图']);
    assert.equal(filterLoreEntries(entries, pinned, '地图').total, 1);
    const added = togglePinnedLore(pinned, entries[0]);
    assert.deepEqual(added, [{ world: '宫廷', uid: '1' }, { world: '江湖', uid: 1 }]);
    assert.deepEqual(togglePinnedLore(added, { world: '宫廷', uid: 1, title: '', tokens: 0 }), [{ world: '江湖', uid: 1 }]);
});

test('人物编辑：行动文字没变沿用 since，换了内容按当前时钟盖戳', () => {
    const state = readFixtureJson('states/school-guide.json');
    const c = state.characters.find(x => x.currentAction) ?? state.characters[0];
    c.currentAction = { text: '在等', duration: '', since: { day: 1, slot: '清晨' } };
    const same = updateCharacter(state, c.id, { currentText: '在等', currentDuration: '一会儿' });
    assert.deepEqual(same.characters.find(x => x.id === c.id).currentAction.since, { day: 1, slot: '清晨' });
    const changed = updateCharacter(state, c.id, { currentText: '走了' });
    assert.deepEqual(changed.characters.find(x => x.id === c.id).currentAction.since, { day: state.clock.day, slot: state.clock.slot });
    assert.equal(c.currentAction.since.day, 1);
});

test('迹象挂在事件上也算有来源，并显示指向的事实', () => {
    const state = withChronicle();
    state.signals = [{ voice: 'here', text: '只挂事件', threadId: null, characterId: null, eventId: 'e_aaa002', relevance: 3 }];
    const sum = injectionSummary(state, { injectUndercurrent: true, maxSignals: 3 });
    assert.ok(!sum.skipped.some(g => g.reason === 'orphan'));
    const entry = [...sum.picked, ...sum.skipped.flatMap(g => g.items)][0];
    assert.equal(eventText(entry), '指向事实：新事（主角尚不知道）');
});
