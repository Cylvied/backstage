import { test, assert } from '../harness.js';
import { buildAdvisorPrompt, splitAdvisorReply, ADVISOR_HISTORY_LIMIT } from '../../src/prompts/advisor-prompt.js';
import { emptyState } from '../../src/util.js';

const input = {
    userName: '林舟', charName: '沈青', persona: '', card: { description: '客栈掌柜沈青。', personality: '', scenario: '' },
    worldInfo: [], recent: [{ isUser: false, name: '沈青', text: '沈青擦着柜台。' }], memos: [],
};

test('参谋提示词：资料在前，历史在中，本次消息在最后', () => {
    const history = [
        { role: 'user', text: '接下来怎么走？', cards: [], at: 1 },
        { role: 'assistant', text: '可以从药王庙入手。', cards: [], at: 2 },
    ];
    const messages = buildAdvisorPrompt({ state: emptyState(), input, history, message: '那老周呢？' });
    assert.equal(messages[0].role, 'system');
    assert.match(messages[1].content, /客栈掌柜沈青/);
    assert.equal(messages[messages.length - 1].role, 'user');
    assert.equal(messages[messages.length - 1].content, '那老周呢？');
    assert.ok(messages.some(m => m.role === 'assistant' && m.content === '可以从药王庙入手。'));
});

test('参谋提示词：历史超过上限时只带最近的', () => {
    const history = Array.from({ length: ADVISOR_HISTORY_LIMIT + 6 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `第${i}条`, cards: [], at: i }));
    const all = buildAdvisorPrompt({ state: emptyState(), input, history, message: '新问题' }).map(m => m.content).join('\n');
    assert.doesNotMatch(all, /第0条/);
    assert.match(all, new RegExp(`第${ADVISOR_HISTORY_LIMIT + 5}条`));
});

test('参谋提示词：历史里的方案卡压成摘要，分阶段卡带拍名', () => {
    const history = [{
        role: 'assistant', text: '给你两个方向。', at: 1,
        cards: [{ title: '夜探', goal: '查清药王庙', firstSigns: '', fit: '', threadId: null, suggestedIntensity: 'normal',
            beats: [{ title: '踩点', goal: '', firstSigns: '' }, { title: '潜入', goal: '', firstSigns: '' }] }],
    }];
    const all = buildAdvisorPrompt({ state: emptyState(), input, history, message: '好' }).map(m => m.content).join('\n');
    assert.match(all, /方案1：夜探——查清药王庙，分 2 拍：踩点 → 潜入/);
});

test('参谋提示词：失败的回复不带进历史', () => {
    const history = [{ role: 'assistant', text: '', cards: [], at: 1, error: '超时' }];
    const messages = buildAdvisorPrompt({ state: emptyState(), input, history, message: '再试' });
    assert.equal(messages.length, 4);
});

test('拆分回复：纯文字没有卡片', () => {
    const out = splitAdvisorReply('老周白天在药铺，晚上不在家。');
    assert.equal(out.text, '老周白天在药铺，晚上不在家。');
    assert.deepEqual(out.cards, []);
});

test('拆分回复：文字加方案卡', () => {
    const reply = '可以这样走。\n\n```json\n{"cards":[{"title":"夜探","goal":"查清药王庙","firstSigns":"庙里有灯","fit":"接药王庙那条线","threadId":null,"suggestedIntensity":"normal"}]}\n```';
    const out = splitAdvisorReply(reply);
    assert.equal(out.text, '可以这样走。');
    assert.equal(out.cards.length, 1);
    assert.equal(out.cards[0].title, '夜探');
});

test('拆分回复：去掉思考过程', () => {
    const out = splitAdvisorReply('<think>先想想</think>建议先铺垫。');
    assert.equal(out.text, '建议先铺垫。');
});

test('拆分回复：卡片坏掉时文字照常保留', () => {
    const out = splitAdvisorReply('方向如下。\n```json\n{"cards":[{"title":"缺字段"}]}\n```');
    assert.equal(out.text, '方向如下。');
    assert.deepEqual(out.cards, []);
});
