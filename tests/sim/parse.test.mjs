import { test, assert } from '../harness.js';
import { extractJsonBlock, parsePlanOutput, parseSimOutput } from '../../src/sim/parse.js';

const encode = value => JSON.stringify(value);
const card = () => ({ title: '故人来访', goal: '重逢', firstSigns: '有人问路', fit: '旧交在附近',
    threadId: null, suggestedIntensity: 'normal' });
const signal = () => ({ voice: 'here', text: '门外脚步声', threadId: null, characterId: null, relevance: 2 });

test('思考中的 JSON 被忽略，json 代码块优先于闲聊对象', () => {
    assert.deepEqual(extractJsonBlock('<think>{"wrong":1}</think>{"wrong":2}\n```json\n{"noChange":true}\n```'), { noChange: true });
});

test('无代码块时正确处理嵌套对象、转义引号和字符串括号', () => {
    const value = { outer: { text: '他说："{不要结束}"\\', list: [1, 2] } };
    assert.deepEqual(extractJsonBlock(`前言${encode(value)}后记`), value);
});

test('尾逗号容错不改字符串中相同字符', () => {
    assert.deepEqual(extractJsonBlock('{"list":[1,2,],"text":",}",}'), { list: [1, 2], text: ',}' });
});

test('空输入、截断 JSON、未闭合思考段不补猜内容', () => {
    for (const text of ['', null, '闲聊', '{"clock":{"day":2}', '<think>{"noChange":true}',
        '```json\n{"clock":\n```', '{"text":"未完']) {
        assert.equal(extractJsonBlock(text), null);
        assert.equal(parseSimOutput(text).ok, false);
    }
});

test('空对象与错误顶层结构不能冒充有效补丁', () => {
    for (const value of [{}, { unknown: 1 }, { signals: {} }, { noChange: 'true' }, { clock: { day: 0 } }]) {
        assert.equal(parseSimOutput(encode(value)).ok, false);
    }
});

test('noChange 最小补丁补齐空容器，丢弃未知字段', () => {
    const result = parseSimOutput('{"noChange":true,"runCount":100}');
    assert.ok(result.ok);
    assert.deepEqual(result.patch, { clock: null, protagonist: null, upsertCharacters: [],
        removeCharacterIds: [], upsertThreads: [], signals: [], noChange: true });
});

test('坏枚举只丢弃对应数组项，已知字段与限长规则生效', () => {
    const result = parseSimOutput(encode({
        upsertCharacters: [{ name: '甲', life: 'ghost' }, { name: '乙', knows: ['1', '2', '3', '4', '5', '6'], touchedRun: 900 }],
        upsertThreads: [{ title: '错', stage: 'wrong' }, { title: '对', stage: 'seeded', fadedRuns: 900 }],
        signals: [{ ...signal(), voice: 'wrong' }, { ...signal(), text: '😀'.repeat(90), unknown: 1 }],
    }));
    assert.ok(result.ok);
    assert.deepEqual(result.patch.upsertCharacters, [{ name: '乙', knows: ['1', '2', '3', '4', '5'] }]);
    assert.deepEqual(result.patch.upsertThreads, [{ title: '对', stage: 'seeded' }]);
    assert.equal(Array.from(result.patch.signals[0].text).length, 80);
    assert.equal(result.patch.signals[0].unknown, undefined);
});

test('嵌套行动/期限/引导只保留契约字段，非法嵌套丢弃整条', () => {
    const result = parseSimOutput(encode({
        upsertCharacters: [{ name: '甲', longAction: { text: '赶路', duration: '两日', status: 'ongoing', outcome: null, extra: 1 } },
            { name: '乙', currentAction: { text: '缺时长' } }],
        upsertThreads: [{ title: '线', deadline: { text: '明日', missedOutcome: '错过', extra: 1 },
            guide: { intensity: 'seed', goal: '重逢', firstSigns: '脚步', status: 'active', adoptedAt: 10, extra: 1 } }],
    }));
    assert.ok(result.ok);
    assert.equal(result.patch.upsertCharacters.length, 1);
    assert.equal(result.patch.upsertCharacters[0].longAction.extra, undefined);
    assert.equal(result.patch.upsertThreads[0].deadline.extra, undefined);
    assert.equal(result.patch.upsertThreads[0].guide.extra, undefined);
});

test('数组中的 null 和非对象条目安全丢弃', () => {
    const result = parseSimOutput(encode({ upsertCharacters: [null, 42], signals: [null], removeCharacterIds: [null, 'c_a'] }));
    assert.ok(result.ok);
    assert.deepEqual(result.patch.upsertCharacters, []);
    assert.deepEqual(result.patch.removeCharacterIds, ['c_a']);
});

test('规划最多三张，非法卡不占名额，未知字段丢弃', () => {
    const result = parsePlanOutput(encode({ cards: [{ ...card(), suggestedIntensity: 'wrong' },
        ...Array.from({ length: 5 }, (_, index) => ({ ...card(), title: `方案${index}`, unknown: 1 }))] }));
    assert.ok(result.ok);
    assert.equal(result.cards.length, 3);
    assert.equal(result.cards[0].title, '方案0');
    assert.equal(result.cards[0].unknown, undefined);
});

test('规划空数组合法，但缺字段或全部坏卡报告失败', () => {
    assert.deepEqual(parsePlanOutput('{"cards":[]}'), { ok: true, cards: [] });
    for (const text of ['', '{}', '{"cards":null}', '{"cards":[{}]}']) assert.equal(parsePlanOutput(text).ok, false);
});
