import { test, assert } from '../harness.js';
import { emptyState } from '../../src/util.js';
import { parsePlanOutput, parseSimOutput } from '../../src/sim/parse.js';
import { adoptPlan, advanceBeat, skipBeat, applyPatch, setGuideIntensity, setGuideStatus } from '../../src/sim/apply.js';
import { makeSnapshot, readSnapshot } from '../../src/state/snapshot-store.js';

const beats = (count = 3) => Array.from({ length: count }, (_, i) => ({ title: `拍${i}`, goal: `目标${i}`, firstSigns: `迹象${i}` }));
const card = (extra = {}) => ({ title: '长线', goal: '整体目标', firstSigns: '总迹象', fit: '贴合',
    threadId: null, suggestedIntensity: 'normal', beats: beats(), ...extra });
const initial = () => adoptPlan(emptyState(), card(), 'normal');
const guide = state => state.threads[0].guide;
const id = state => state.threads[0].id;
const parseCard = value => parsePlanOutput(JSON.stringify({ cards: [value] }));
const patch = (state, value) => applyPatch(state, parseSimOutput(JSON.stringify(value)).patch, { maxCharacters: 12 });
function saved(state) {
    return makeSnapshot({ floor: 0, swipeId: 0, text: '正文', state });
}
const read = snapshot => readSnapshot({ extra: { backstage: snapshot } });
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}

test('解析拍时缺省迹象、剔除未知字段及模型状态，坏拍警告并丢弃', () => {
    const warnings = [];
    const original = console.warn;
    console.warn = value => warnings.push(value);
    try {
        const result = parseCard(card({ beats: [null, {}, { title: ' ', goal: '目标' },
            { title: '错', goal: '目标', firstSigns: null },
            { title: '一', goal: '目标', status: 'done', unknown: true }, ...beats(1)] }));
        assert.ok(result.ok);
        assert.equal(result.cards[0].beats.length, 2);
        assert.deepEqual(result.cards[0].beats[0], { title: '一', goal: '目标', firstSigns: '' });
        assert.equal(warnings.length, 4);
    } finally { console.warn = original; }
});

test('有效拍不足两拍或列表非法时退为单步卡', () => {
    for (const value of [[], beats(1), [null, ...beats(1)], null, '错', {}]) {
        const result = parseCard(card({ beats: value }));
        assert.ok(result.ok);
        assert.equal(result.cards[0].beats, undefined);
        assert.equal(guide(adoptPlan(emptyState(), result.cards[0], 'seed')).beats, null);
    }
});

test('解析超过八拍截断，坏拍不占名额', () => {
    const result = parseCard(card({ beats: [null, ...beats(10)] }));
    assert.deepEqual(result.cards[0].beats, beats(8));
});

test('guideReached 接受布尔值，错误类型忽略且补丁其他字段继续解析', () => {
    for (const value of [true, false]) assert.equal(parseSimOutput(JSON.stringify({ guideReached: value })).patch.guideReached, value);
    for (const value of ['true', 1, null, {}, []]) {
        const result = parseSimOutput(JSON.stringify({ guideReached: value, clock: { day: 2 } }));
        assert.ok(result.ok);
        assert.equal(result.patch.guideReached, undefined);
        assert.equal(result.patch.clock.day, 2);
    }
});

test('采纳分阶段卡设置首拍、整体目标、强度且隔离输入', () => {
    const input = freeze(card());
    const state = adoptPlan(freeze(emptyState()), input, 'push');
    assert.deepEqual(guide(state).beats.map(beat => beat.status), ['active', 'pending', 'pending']);
    assert.equal(guide(state).beatIndex, 0);
    assert.equal(guide(state).goal, input.goal);
    assert.equal(guide(state).firstSigns, input.beats[0].firstSigns);
    assert.equal(guide(state).intensity, 'push');
    assert.equal(guide(state).reached, false);
    guide(state).beats[0].goal = '修改副本';
    assert.equal(input.beats[0].goal, '目标0');
});

test('连续完成各拍直至完成引导，末尾索引仍可存入快照', () => {
    let state = initial();
    for (let i = 0; i < 3; i++) {
        const previous = freeze(state);
        state = advanceBeat(previous, id(previous));
        assert.equal(guide(previous).beats[i].status, 'active');
        assert.equal(guide(state).beats[i].status, 'done');
        assert.equal(guide(state).beatIndex, Math.min(i + 1, 2));
        assert.equal(guide(state).firstSigns, `迹象${Math.min(i + 1, 2)}`);
        assert.ok(read(saved(state)));
    }
    assert.equal(guide(state).status, 'done');
    assert.deepEqual(advanceBeat(state, id(state)), state);
});

test('跳过后续拍不换当前拍、不清提示；完成当前拍跨过已跳过拍', () => {
    const state = patch(initial(), { guideReached: true });
    const next = skipBeat(freeze(state), id(state), 1);
    assert.equal(guide(next).beatIndex, 0);
    assert.equal(guide(next).reached, true);
    assert.equal(guide(next).beats[1].status, 'skipped');
    const advanced = advanceBeat(next, id(next));
    assert.equal(guide(advanced).beatIndex, 2);
    assert.equal(guide(advanced).firstSigns, '迹象2');
    assert.equal(guide(advanced).reached, false);
});

test('跳过当前拍会换拍，全部跳过后完成引导', () => {
    let state = initial();
    for (let i = 0; i < 3; i++) {
        state = skipBeat(state, id(state), i);
        assert.equal(guide(state).beats[i].status, 'skipped');
        assert.ok(read(saved(state)));
    }
    assert.equal(guide(state).status, 'done');
});

test('非法目标、索引、已完成拍及非 active 引导返回独立副本且不变', () => {
    let state = initial();
    state = advanceBeat(state, id(state));
    for (const index of [-1, 3, 1.5, '1', null, undefined, NaN, 0]) {
        const next = skipBeat(freeze(state), id(state), index);
        assert.notEqual(next, state);
        assert.deepEqual(next, state);
    }
    assert.deepEqual(advanceBeat(state, '不存在'), state);
    assert.deepEqual(skipBeat(state, '不存在', 1), state);
    const dropped = setGuideStatus(state, id(state), 'dropped');
    assert.deepEqual(advanceBeat(dropped, id(dropped)), dropped);
    assert.deepEqual(skipBeat(dropped, id(dropped), 1), dropped);
});

test('替换剩余拍保留 done 和 skipped 历史，再追加新卡并清提示', () => {
    let state = initial();
    state = advanceBeat(state, id(state));
    state = skipBeat(state, id(state), 2);
    state = patch(state, { guideReached: true });
    const next = adoptPlan(freeze(state), freeze(card({ threadId: id(state), goal: '新整体目标', beats: beats(8) })), 'seed');
    assert.equal(next.threads.length, 1);
    assert.equal(guide(next).beats.length, 10);
    assert.deepEqual(guide(next).beats.slice(0, 2), [guide(state).beats[0], guide(state).beats[2]]);
    assert.equal(guide(next).beatIndex, 2);
    assert.equal(guide(next).beats[2].status, 'active');
    assert.equal(guide(next).firstSigns, '迹象0');
    assert.equal(guide(next).goal, '新整体目标');
    assert.equal(guide(next).reached, false);
    assert.ok(read(saved(next)));
});

test('非 active 的同线重采纳不保留历史；新线采纳关闭旧引导', () => {
    let state = initial();
    state = advanceBeat(state, id(state));
    const dropped = setGuideStatus(state, id(state), 'dropped');
    const replaced = adoptPlan(dropped, card({ threadId: id(state) }), 'normal');
    assert.equal(guide(replaced).beats.length, 3);
    assert.equal(guide(replaced).beatIndex, 0);
    const other = adoptPlan(state, card(), 'normal');
    assert.equal(guide(other).status, 'dropped');
    assert.equal(other.threads[1].guide.beats.length, 3);
});

test('单步卡替换分阶段引导，旧版单步换拍等于完成', () => {
    const state = initial();
    const single = adoptPlan(state, card({ threadId: id(state), beats: undefined }), 'normal');
    assert.equal(guide(single).beats, null);
    assert.equal(guide(single).firstSigns, '总迹象');
    delete guide(single).beats;
    delete guide(single).beatIndex;
    delete guide(single).reached;
    assert.ok(read(saved(single)));
    assert.deepEqual(skipBeat(single, id(single), 0), single);
    assert.equal(guide(advanceBeat(single, id(single))).status, 'done');
});

test('落拍提示只设置当前引导，false 不撤销提示，不自动换拍，操作后清除', () => {
    const state = initial();
    const reached = patch(freeze(state), { noChange: true, guideReached: true });
    assert.equal(guide(reached).reached, true);
    assert.equal(guide(reached).beatIndex, 0);
    assert.deepEqual(guide(reached).beats, guide(state).beats);
    assert.equal(guide(patch(reached, { guideReached: false })).reached, true);
    assert.equal(guide(setGuideIntensity(reached, id(reached), 'push')).reached, false);
    assert.equal(guide(advanceBeat(reached, id(reached))).reached, false);
    assert.equal(guide(skipBeat(reached, id(reached), 0)).reached, false);
    const done = setGuideStatus(state, id(state), 'done');
    assert.equal(guide(patch(done, { guideReached: true })).reached, false);
    assert.equal(patch(emptyState(), { guideReached: true }).threads.length, 0);
});

test('快照拒绝非法新字段、坏拍、越界、多 active、错位及迹象不一致', () => {
    const mutations = [g => { g.reached = 'true'; }, g => { g.beatIndex = -1; },
        g => { g.beatIndex = 0.5; }, g => { g.beatIndex = 3; }, g => { delete g.beatIndex; },
        g => { g.beats = {}; }, g => { g.beats = []; }, g => { g.beats[1] = null; },
        g => { g.beats[1].title = ''; }, g => { delete g.beats[1].goal; },
        g => { g.beats[1].firstSigns = 42; }, g => { g.beats[1].status = 'bad'; },
        g => { g.beats[1].status = 'active'; }, g => { g.beatIndex = 1; },
        g => { g.firstSigns = '错误迹象'; }];
    for (const mutate of mutations) {
        const snapshot = saved(initial());
        mutate(guide(snapshot.state));
        assert.equal(read(snapshot), null);
    }
});

test('单步快照兼容 null beats 和可选字段，已提供的字段仍校验类型', () => {
    const state = adoptPlan(emptyState(), card({ beats: undefined }), 'normal');
    assert.ok(read(saved(state)));
    for (const fields of [{ reached: null }, { beatIndex: '0' }, { beatIndex: null }]) {
        const snapshot = saved(state);
        Object.assign(guide(snapshot.state), fields);
        assert.equal(read(snapshot), null);
    }
});
