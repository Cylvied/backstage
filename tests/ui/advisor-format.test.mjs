import { test, assert } from '../harness.js';
import { beatProgress, adoptView, adjustBeatsPrompt, BEAT_MARK } from '../../src/ui/format.js';

const beats = statuses => statuses.map((status, i) => ({ title: `拍${i + 1}`, goal: 'g', firstSigns: 'f', status }));

test('beatProgress：单步引导返回 null', () => {
    assert.equal(beatProgress(null), null);
    assert.equal(beatProgress({ beats: null }), null);
    assert.equal(beatProgress({ beats: [] }), null);
});

test('beatProgress：当前拍、总数、是否最后一拍', () => {
    const p = beatProgress({ beats: beats(['done', 'active', 'pending', 'pending']), beatIndex: 1 });
    assert.equal(p.total, 4);
    assert.equal(p.current, 2);
    assert.equal(p.beat.title, '拍2');
    assert.equal(p.isLast, false);
    assert.equal(p.doneCount, 1);
    const last = beatProgress({ beats: beats(['done', 'skipped', 'active']), beatIndex: 2 });
    assert.equal(last.isLast, true);
    const skippedTail = beatProgress({ beats: beats(['active', 'skipped']), beatIndex: 0 });
    assert.equal(skippedTail.isLast, true, '后面只剩跳过的拍也算最后一拍');
});

test('beatProgress：缺 beatIndex 时按 active 找', () => {
    assert.equal(beatProgress({ beats: beats(['done', 'done', 'active']) }).current, 3);
});

test('adoptView：无引导 / 同一条线 / 替换剩余拍 / 替换别的线', () => {
    const card = { title: 'x', threadId: 't1', beats: [{ title: 'a' }, { title: 'b' }] };
    assert.equal(adoptView(card, null).label, '采纳');
    const staged = { id: 't1', title: '旧线', guide: { beats: beats(['done', 'active']), beatIndex: 1 } };
    assert.equal(adoptView(card, staged).label, '采纳并替换剩余拍');
    assert.equal(adoptView({ ...card, beats: undefined }, staged).label, '采纳');
    const other = { id: 't2', title: '别的线', guide: { beats: null } };
    const v = adoptView(card, other);
    assert.equal(v.label, '替换并采纳');
    assert.match(v.note, /别的线/);
    assert.equal(adoptView({ ...card, threadId: null }, staged).label, '替换并采纳');
});

test('adjustBeatsPrompt 与标记', () => {
    assert.match(adjustBeatsPrompt({ title: '天台' }), /^我想调整当前的分阶段引导「天台」：$/);
    assert.equal(BEAT_MARK.active, '▶');
});
