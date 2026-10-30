import { test, assert } from '../harness.js';
import { buildReviewPrompt } from '../../src/prompts/review-prompt.js';
import { buildSimPrompt } from '../../src/prompts/sim-prompt.js';
import { buildAdvisorPrompt } from '../../src/prompts/advisor-prompt.js';
import { stateForModel, visibleChronicle } from '../../src/prompts/shared.js';
import { emptyState, elapsedText, stampOf } from '../../src/util.js';
import { DEFAULT_SETTINGS } from '../../src/constants.js';

const input = {
    userName: '林舟', charName: '沈青', persona: '', card: { description: '', personality: '', scenario: '' },
    worldInfo: [{ title: '相府', content: '相府在城东。', layer: 'backstage' }],
    loreCatalog: ['漕帮', '刑部'],
    recent: [{ isUser: false, name: '沈青', text: '沈青放下了茶盏。' }],
    memos: [],
};

function state() {
    const s = emptyState();
    s.clock = { day: 5, slot: '傍晚', precision: 'exact' };
    s.characters = [{
        id: 'c_1', name: '孟不尘', aliases: [], location: '相府', life: 'alive', onStage: false, pinned: false, knows: [],
        currentAction: { text: '核账', duration: '两日', since: { day: 3, slot: '清晨' } },
        longAction: null, touchedRun: 2,
    }];
    s.threads = [{ id: 't_1', title: '水闸清单核账', characterIds: ['c_1'], stage: 'growing', trigger: '', deadline: null, visibility: 'hidden', origin: 'sim', guide: null }];
    s.chronicle = Array.from({ length: 30 }, (_, i) => ({
        id: `e_${i}`, at: { day: 1, slot: '' }, text: `旧事${i}`, characterIds: [], threadIds: i === 0 ? ['t_1'] : [], known: false, knownAt: null,
    }));
    return s;
}

test('elapsedText 与 stampOf', () => {
    assert.equal(elapsedText({ day: 3, slot: '清晨' }, { day: 5 }), '始于第 3 天清晨，至今已过 2 天');
    assert.equal(elapsedText(undefined, { day: 5 }), '开始时间不明');
    assert.deepEqual(stampOf({ day: 2, slot: '午后' }), { day: 2, slot: '午后' });
});

test('给模型看的状态：行动带已过多久，不带 since 与内部字段', () => {
    const out = stateForModel(state());
    assert.equal(out.characters[0].currentAction.time, '始于第 3 天清晨，至今已过 2 天');
    assert.equal(out.characters[0].currentAction.since, undefined);
    assert.equal(out.characters[0].touchedRun, undefined);
});

test('事件只展示最近 25 条，加上与活跃暗线相关的较早事件', () => {
    const shown = visibleChronicle(state()).map(e => e.id);
    assert.ok(shown.includes('e_0'));       // 早，但挂在活跃暗线上
    assert.ok(!shown.includes('e_1'));      // 早，且无关
    assert.ok(shown.includes('e_29'));
    assert.equal(shown.length, 26);
});

test('推演提示词：带世界书标题、来源层与目录，要求 addEvents', () => {
    const all = buildSimPrompt({ state: state(), input, settings: DEFAULT_SETTINGS }).map(m => m.content).join('\n');
    assert.match(all, /《相府》（幕后相关）/);
    assert.match(all, /漕帮、刑部/);
    assert.match(all, /addEvents/);
    assert.match(all, /markKnown/);
    assert.match(all, /loreRequests/);
    assert.doesNotMatch(all, /只能写成人物的打算/);
});

test('参谋提示词不列世界书目录', () => {
    const all = buildAdvisorPrompt({ state: state(), input, history: [], message: '怎么走？' }).map(m => m.content).join('\n');
    assert.doesNotMatch(all, /世界书目录/);
});

test('审核提示词：列出待审条目与前后时间，要求 verdicts', () => {
    const items = [
        { id: 'r1', kind: 'event', summary: '清单已送到相府', ref: { list: 'addEvents', index: 0 } },
        { id: 'r2', kind: 'clock', summary: '时间从第 5 天跳到第 9 天', ref: { list: 'clock' } },
    ];
    const messages = buildReviewPrompt({ state: state(), items, input, clockBefore: { day: 5, slot: '傍晚' }, clockAfter: { day: 9, slot: '清晨' } });
    const all = messages.map(m => m.content).join('\n');
    assert.match(all, /r1（新发生的事）：清单已送到相府/);
    assert.match(all, /推演前：第 5 天傍晚；推演后：第 9 天清晨/);
    assert.match(all, /verdicts/);
    assert.equal(messages[messages.length - 1].role, 'user');
});
