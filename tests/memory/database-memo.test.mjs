import { test, assert } from '../harness.js';
import { MEMO_NAME_PATTERN, pickMemos } from '../../src/memory/database-memo.js';

const memo = (content, keys = [], index = 1) => ({ name: `TavernDB-ACU-CustomExport-纪要-${index}`, content, keys });

test('仅接受完整纪要名称，忽略大小写但不接受多余后缀', () => {
    assert.ok(MEMO_NAME_PATTERN.test('taverndb-acu-customexport-纪要-12'));
    assert.equal(MEMO_NAME_PATTERN.test('TavernDB-ACU-CustomExport-纪要-1备份'), false);
    assert.deepEqual(pickMemos([{ name: '普通条目', content: '京城', keys: ['京城'] }], '京城', 8), []);
});

test('中文 bigram 匹配相邻双字，而非仅匹配单字', () => {
    assert.deepEqual(pickMemos([memo('京城风雨'), memo('城门守卫'), memo('京郊村落')], '京城', 8), ['京城风雨']);
});

test('关键词命中加权，同分稳定排序，限制结果数量', () => {
    const entries = [memo('京城旧事'), memo('城外纪事', ['京城']), memo('京城新事')];
    assert.deepEqual(pickMemos(entries, '京城', 3), ['城外纪事', '京城旧事', '京城新事']);
    assert.deepEqual(pickMemos(entries, '京城', 1), ['城外纪事']);
});

test('英文按词并忽略大小写，重复词不会提高得分', () => {
    assert.deepEqual(pickMemos([memo('ALICE arrives'), memo('malice'), memo('alice alice alice')], 'Alice', 8),
        ['ALICE arrives', 'alice alice alice']);
});

test('空输入、坏输入、无命中及非法上限不召回', () => {
    for (const query of ['', '!!!', null, '无关']) assert.deepEqual(pickMemos([memo('京城')], query, 8), []);
    for (const limit of [0, -1, NaN, Infinity]) assert.deepEqual(pickMemos([memo('京城')], '京城', limit), []);
    assert.deepEqual(pickMemos(null, '京城', 8), []);
    assert.deepEqual(pickMemos([null, {}, memo('')], '京城', 8), []);
});

test('重复正文去重，坏关键词安全忽略，不修改输入', () => {
    const entries = [memo('京城'), memo('京城'), memo('京城来信', [null, 5])];
    const before = JSON.stringify(entries);
    assert.deepEqual(pickMemos(entries, '京城', 8), ['京城', '京城来信']);
    assert.equal(JSON.stringify(entries), before);
});
