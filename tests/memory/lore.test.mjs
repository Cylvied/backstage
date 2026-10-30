import { test, assert } from '../harness.js';
import { selectLore, fitBudget, keyMatches, backstageText, entryKey, isPinned } from '../../src/memory/lore.js';
import { emptyState } from '../../src/util.js';

const entry = (uid, title, keys = [], extra = {}) => ({ world: 'book', uid, title, content: `${title}的设定`, keys, disabled: false, ...extra });

function state() {
    const s = emptyState();
    s.protagonist = { location: '皇宫·御书房', reachable: true };
    s.characters = [
        { id: 'c_1', name: '孟不尘', aliases: ['孟相'], location: '相府', currentAction: null, longAction: null, knows: [], life: 'alive', onStage: false, pinned: false },
        { id: 'c_2', name: '敖澜', aliases: [], location: '皇宫', currentAction: null, longAction: null, knows: [], life: 'alive', onStage: true, pinned: false },
    ];
    s.threads = [{ id: 't_1', title: '水闸清单送往刑部', characterIds: [], stage: 'growing', trigger: '', deadline: null, visibility: 'hidden', origin: 'sim', guide: null }];
    s.loreWanted = [{ title: '漕帮', sinceRun: 0 }];
    return s;
}

test('关键词匹配：子串不区分大小写，支持正则', () => {
    assert.ok(keyMatches('孟相', '听说孟相回府了'));
    assert.ok(keyMatches('/刑[部司]/', '送往刑部'));
    assert.ok(!keyMatches('', '任何文本'));
    assert.ok(!keyMatches('/[/', '坏正则不抛错'));
});

test('幕后文本只包含不在场人物', () => {
    const text = backstageText(state());
    assert.match(text, /孟不尘/);
    assert.doesNotMatch(text, /敖澜/);
    assert.match(text, /水闸清单/);
});

test('四层按优先顺序排列，同一条目只出现一次', () => {
    const entries = [
        entry(1, '漕帮', ['漕帮']),
        entry(2, '孟不尘', ['孟相']),
        entry(3, '刑部', ['刑部']),
        entry(4, '势力总览', []),
        entry(5, '无关条目', ['海外']),
    ];
    const { candidates, catalog } = selectLore({
        entries,
        triggered: new Set([entryKey('book', 3), entryKey('book', 2)]),
        pinned: [{ world: 'book', uid: 4 }],
        state: state(),
        catalog: true,
    });
    assert.deepEqual(candidates.map(c => `${c.layer}:${c.entry.title}`),
        ['pinned:势力总览', 'triggered:孟不尘', 'triggered:刑部', 'requested:漕帮']);
    assert.deepEqual(catalog, ['无关条目']);
});

test('幕后触发：正文没提到、但镜头外人物命中的条目会被带入', () => {
    const { candidates } = selectLore({ entries: [entry(2, '孟不尘', ['孟相'])], triggered: new Set(), pinned: [], state: state(), catalog: false });
    assert.deepEqual(candidates.map(c => c.layer), ['backstage']);
});

test('关闭目录时不出目录、也不带按需调取', () => {
    const { candidates, catalog } = selectLore({ entries: [entry(1, '漕帮', ['海外'])], triggered: new Set(), pinned: [], state: state(), catalog: false });
    assert.equal(candidates.length, 0);
    assert.deepEqual(catalog, []);
});

test('停用、空内容、数据库导出条目都排除', () => {
    const entries = [
        entry(1, '停用', ['孟相'], { disabled: true }),
        entry(2, '空', ['孟相'], { content: '  ' }),
        entry(3, 'TavernDB-ACU-CustomExport-纪要-1', ['孟相']),
    ];
    const { candidates, catalog } = selectLore({ entries, triggered: new Set(), pinned: [], state: state(), catalog: true });
    assert.equal(candidates.length, 0);
    assert.deepEqual(catalog, []);
});

test('预算截断按整条进行，放不下的跳过但继续尝试后面的', () => {
    const out = fitBudget([{ id: 'a', tokens: 60 }, { id: 'b', tokens: 50 }, { id: 'c', tokens: 30 }], 100);
    assert.deepEqual(out.kept.map(x => x.id), ['a', 'c']);
    assert.deepEqual(out.dropped.map(x => x.id), ['b']);
    assert.equal(out.total, 90);
});

test('世界书常驻条目默认算推演常驻，用户取消后不再带', () => {
    const entries = [
        entry(1, '总纲', [], { constant: true }),
        entry(2, '孟不尘', ['孟相']),
        entry(3, '手选', []),
    ];
    const base = { entries, triggered: new Set([entryKey('book', 2)]), pinned: [{ world: 'book', uid: 3 }], state: state(), catalog: false };
    assert.deepEqual(selectLore(base).candidates.map(c => `${c.layer}:${c.entry.title}`),
        ['pinned:总纲', 'pinned:手选', 'triggered:孟不尘']);
    const out = selectLore({ ...base, unpinned: [{ world: 'book', uid: '1' }] });
    assert.deepEqual(out.candidates.map(c => c.entry.title), ['手选', '孟不尘']);
});

test('isPinned：手选优先；常驻默认勾选；uid 数字与字符串视为同一条', () => {
    const pinned = new Set([entryKey('book', 3)]);
    const unpinned = new Set([entryKey('book', '1')]);
    assert.ok(isPinned({ world: 'book', uid: 3 }, pinned, unpinned));
    assert.ok(isPinned({ world: 'book', uid: 2, constant: true }, pinned, unpinned));
    assert.ok(!isPinned({ world: 'book', uid: 1, constant: true }, pinned, unpinned));
    assert.ok(!isPinned({ world: 'book', uid: 4 }, pinned, unpinned));
});
