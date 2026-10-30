import { test, assert } from '../harness.js';
import { buildSimPrompt } from '../../src/prompts/sim-prompt.js';
import { buildPlanPrompt } from '../../src/prompts/plan-prompt.js';
import { stateForModel } from '../../src/prompts/shared.js';
import { emptyState } from '../../src/util.js';
import { DEFAULT_SETTINGS } from '../../src/constants.js';

const input = {
    userName: '林舟',
    charName: '沈青',
    persona: '一个刚到江南的游医。',
    card: { description: '沈青是客栈掌柜。', personality: '寡言', scenario: '江南小镇' },
    worldInfo: ['镇上有一座废弃的药王庙。'],
    recent: [
        { isUser: true, name: '林舟', text: '我推开客栈的门。' },
        { isUser: false, name: '沈青', text: '沈青抬头看了一眼，没说话。' },
    ],
    memos: [],
};

function populatedState() {
    const s = emptyState();
    s.runCount = 4;
    s.characters = [{
        id: 'c_aaaaaa', name: '老周', aliases: [], location: '镇东·药铺', currentAction: null, longAction: null,
        knows: [], life: 'alive', onStage: false, pinned: false, touchedRun: 3,
    }];
    s.threads = [{
        id: 't_bbbbbb', title: '药王庙夜里有灯', characterIds: ['c_aaaaaa'], stage: 'growing', trigger: '', deadline: null,
        visibility: 'hidden', origin: 'sim', guide: null, fadedRuns: 0,
    }];
    return s;
}

function isChatMessages(messages) {
    return Array.isArray(messages) && messages.length > 0
        && messages.every(m => ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.length > 0);
}

test('推演提示词是合法的消息数组，以 user 结尾', () => {
    const messages = buildSimPrompt({ state: populatedState(), input, settings: DEFAULT_SETTINGS });
    assert.ok(isChatMessages(messages));
    assert.equal(messages[messages.length - 1].role, 'user');
});

test('推演提示词包含资料与输出格式', () => {
    const all = buildSimPrompt({ state: populatedState(), input, settings: DEFAULT_SETTINGS }).map(m => m.content).join('\n');
    assert.match(all, /客栈掌柜/);
    assert.match(all, /药王庙/);
    assert.match(all, /推开客栈的门/);
    assert.match(all, /noChange/);
    assert.match(all, /upsertCharacters/);
    assert.match(all, /c_aaaaaa/);
});

test('不向模型泄露内部计数字段', () => {
    const all = buildSimPrompt({ state: populatedState(), input, settings: DEFAULT_SETTINGS }).map(m => m.content).join('\n');
    assert.doesNotMatch(all, /touchedRun/);
    assert.doesNotMatch(all, /fadedRuns/);
    assert.doesNotMatch(all, /runCount/);
});

test('stateForModel 不修改原状态', () => {
    const s = populatedState();
    stateForModel(s);
    assert.equal(s.characters[0].touchedRun, 3);
    assert.equal(s.threads[0].fadedRuns, 0);
});

test('首次推演使用建档任务说明', () => {
    const all = buildSimPrompt({ state: emptyState(), input, settings: DEFAULT_SETTINGS }).map(m => m.content).join('\n');
    assert.match(all, /第一次推演/);
});

test('规划提示词带上用户想法', () => {
    const messages = buildPlanPrompt({ state: populatedState(), input, request: '想让老周的秘密暴露', settings: DEFAULT_SETTINGS });
    assert.ok(isChatMessages(messages));
    const all = messages.map(m => m.content).join('\n');
    assert.match(all, /想让老周的秘密暴露/);
    assert.match(all, /cards/);
});

test('规划提示词在没有想法时给出默认任务', () => {
    const all = buildPlanPrompt({ state: populatedState(), input, request: '  ', settings: DEFAULT_SETTINGS }).map(m => m.content).join('\n');
    assert.match(all, /用户没有给具体想法/);
});
