import { test, assert, readFixtureJson } from '../harness.js';
import { togglePin, removeCharacter, updateCharacter, updateThread, removeThread, parseList, guideCardForThread } from '../../src/ui/state-edits.js';
import { adoptPlan } from '../../src/sim/apply.js';

const load = name => readFixtureJson(`states/${name}.json`);

test('parseList：去空白、去重、截断', () => {
    assert.deepEqual(parseList(' a \n\nb\na\nc\nd', 3), ['a', 'b', 'c']);
    assert.deepEqual(parseList('甲，乙、丙,甲', 8, /[,，、\n]/), ['甲', '乙', '丙']);
    assert.deepEqual(parseList(undefined, 5), []);
});

test('togglePin 切换钉住且不修改入参', () => {
    const state = load('wuxia-pinned');
    const before = JSON.stringify(state);
    const next = togglePin(state, 'c_wpn001');
    assert.equal(next.characters.find(c => c.id === 'c_wpn001').pinned, false);
    assert.equal(togglePin(next, 'c_wpn001').characters.find(c => c.id === 'c_wpn001').pinned, true);
    assert.equal(JSON.stringify(state), before);
});

test('togglePin：id 不存在时原样返回副本', () => {
    const state = load('wuxia');
    const next = togglePin(state, 'c_nope');
    assert.notEqual(next, state);
    assert.deepEqual(next, state);
});

test('removeCharacter 清掉线和迹象里的引用', () => {
    const state = load('wuxia');
    const next = removeCharacter(state, 'c_wux006');
    assert.ok(!next.characters.some(c => c.id === 'c_wux006'));
    assert.ok(next.threads.every(t => !t.characterIds.includes('c_wux006')));
    assert.ok(next.signals.every(s => s.characterId !== 'c_wux006'));
    assert.equal(next.signals.length, state.signals.length);
    assert.ok(state.characters.some(c => c.id === 'c_wux006'), '入参不变');
});

test('updateCharacter 更新字段，knows 最多 5 条', () => {
    const state = load('school');
    const id = state.characters[0].id;
    const next = updateCharacter(state, id, {
        name: ' 新名字 ', aliases: '甲，乙', location: '操场', life: 'missing', onStage: false,
        currentText: '跑步', currentDuration: '十分钟',
        longText: '', knows: '1\n2\n3\n4\n5\n6',
    });
    const c = next.characters[0];
    assert.equal(c.name, '新名字');
    assert.deepEqual(c.aliases, ['甲', '乙']);
    assert.equal(c.life, 'missing');
    assert.equal(c.onStage, false);
    assert.deepEqual(c.currentAction, { text: '跑步', duration: '十分钟', since: { day: state.clock.day, slot: state.clock.slot } });
    assert.equal(c.longAction, null);
    assert.equal(c.knows.length, 5);
});

test('updateCharacter 忽略非法枚举与空名字，保留 pinned 等字段', () => {
    const state = load('wuxia-pinned');
    const next = updateCharacter(state, 'c_wpn001', { name: '  ', life: 'zombie', pinned: false });
    const c = next.characters.find(x => x.id === 'c_wpn001');
    const old = state.characters.find(x => x.id === 'c_wpn001');
    assert.equal(c.name, old.name);
    assert.equal(c.life, old.life);
    assert.equal(c.pinned, true);
});

test('updateCharacter 长期行动：完成时记录结果，进行中时结果为 null', () => {
    const state = load('school');
    const id = state.characters[0].id;
    const done = updateCharacter(state, id, { longText: '考试', longDuration: '一周', longStatus: 'done', longOutcome: '考过了' });
    assert.deepEqual(done.characters[0].longAction, { text: '考试', duration: '一周', status: 'done', outcome: '考过了', since: { day: state.clock.day, slot: state.clock.slot } });
    const going = updateCharacter(state, id, { longText: '考试', longStatus: 'ongoing', longOutcome: '不该保留' });
    assert.equal(going.characters[0].longAction.outcome, null);
});

test('updateThread 更新字段，不动 guide 与 origin', () => {
    const state = load('school-guide');
    const next = updateThread(state, 't_sgd002', { title: '新标题', stage: 'ripe', visibility: 'known', trigger: '下雨', deadlineText: '', guide: null, origin: 'sim' });
    const t = next.threads.find(x => x.id === 't_sgd002');
    const old = state.threads.find(x => x.id === 't_sgd002');
    assert.equal(t.title, '新标题');
    assert.equal(t.stage, 'ripe');
    assert.equal(t.visibility, 'known');
    assert.equal(t.trigger, '下雨');
    assert.equal(t.deadline, null);
    assert.deepEqual(t.guide, old.guide);
    assert.equal(t.origin, old.origin);
});

test('updateThread 设置期限；非法阶段忽略', () => {
    const state = load('wuxia');
    const id = state.threads[0].id;
    const next = updateThread(state, id, { stage: 'boom', deadlineText: '子时', missedOutcome: '船走了' });
    assert.equal(next.threads[0].stage, state.threads[0].stage);
    assert.deepEqual(next.threads[0].deadline, { text: '子时', missedOutcome: '船走了' });
});

test('removeThread 清掉迹象里的引用', () => {
    const state = load('wuxia');
    const next = removeThread(state, 't_wux001');
    assert.ok(!next.threads.some(t => t.id === 't_wux001'));
    assert.ok(next.signals.every(s => s.threadId !== 't_wux001'));
    assert.equal(next.signals.length, state.signals.length);
});

test('guideCardForThread 交给 adoptPlan 后挂在原线上', () => {
    const state = load('wuxia');
    const thread = state.threads[1];
    const card = guideCardForThread(thread, { goal: '让他们撞上', firstSigns: '' });
    assert.equal(card.threadId, thread.id);
    assert.equal(card.firstSigns, thread.trigger);
    const next = adoptPlan(state, card, 'push');
    assert.equal(next.threads.length, state.threads.length);
    const t = next.threads.find(x => x.id === thread.id);
    assert.equal(t.guide.status, 'active');
    assert.equal(t.guide.intensity, 'push');
    assert.equal(t.guide.goal, '让他们撞上');
});

test('所有样本状态都能经过每种编辑而不出错', () => {
    const names = ['apocalypse-dead', 'apocalypse', 'mystery-isolated', 'mystery', 'palace-crowded', 'palace', 'school-guide', 'school', 'urban', 'western-faded', 'western', 'wuxia-pinned', 'wuxia', 'xiuxian'];
    for (const name of names) {
        let s = load(name);
        const c = s.characters[0];
        const t = s.threads[0];
        s = togglePin(s, c.id);
        s = updateCharacter(s, c.id, { knows: c.knows.join('\n') });
        s = updateThread(s, t.id, { trigger: t.trigger });
        s = removeThread(removeCharacter(s, c.id), t.id);
        assert.equal(s.characters.length, load(name).characters.length - 1, name);
    }
});
