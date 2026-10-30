import { test, assert } from '../harness.js';
import { emptyState, hashText } from '../../src/util.js';
import { findBase, isSnapshotValid, makeSnapshot, readSnapshot } from '../../src/state/snapshot-store.js';

const snapshot = (floor = 0, text = '正文') => makeSnapshot({ floor, swipeId: 0, text, state: emptyState() });
const message = (saved = snapshot(), text = '正文') => ({ isUser: false, text, swipeId: 0, extra: { backstage: saved } });
const view = (messages, fallbackSnapshot = null) => ({ chatId: 'a', length: messages.length,
    getMessage: floor => messages[floor], fallbackSnapshot });

test('创建快照保留父版本且隔离入参', () => {
    const state = emptyState();
    const parent = snapshot();
    const saved = makeSnapshot({ parent, floor: 2, swipeId: 1, text: '新正文', state,
        status: 'manual', usage: { model: '模型', ms: 20 } });
    assert.equal(saved.parentId, parent.id);
    assert.equal(saved.basis.textHash, hashText('新正文'));
    assert.equal(saved.edited, true);
    state.clock.day = 9;
    assert.equal(saved.state.clock.day, 1);
});

test('AI 正文匹配才有效，用户消息与编辑后的正文无效', () => {
    const saved = snapshot();
    assert.ok(isSnapshotValid(saved, message(saved)));
    assert.equal(isSnapshotValid(saved, { ...message(saved), isUser: true }), false);
    assert.equal(isSnapshotValid(saved, message(saved, '编辑后')), false);
    assert.equal(isSnapshotValid(null, null), false);
});

test('坏快照、未知版本和坏嵌套状态均忽略', () => {
    for (const bad of [{}, { ...snapshot(), v: 2 }, { ...snapshot(), state: {} },
        { ...snapshot(), state: { ...emptyState(), characters: [null] } }]) {
        assert.equal(readSnapshot(message(bad)), null);
    }
    assert.equal(readSnapshot(null), null);
});

test('读取不暴露持久状态的可变引用', () => {
    const msg = message();
    const read = readSnapshot(msg);
    read.state.clock.day = 5;
    assert.equal(msg.extra.backstage.state.clock.day, 1);
});

test('目标楼可以是用户或 AI，越界上限安全截断', () => {
    const saved = snapshot();
    const chat = view([message(saved), { isUser: true, text: '用户', extra: {} }]);
    for (const floor of [0, 1, 99]) assert.equal(findBase(chat, floor).snapshot.id, saved.id);
});

test('跳过空槽、编辑失效和坏版本，向前找有效祖先', () => {
    const saved = snapshot();
    const chat = view([message(saved), null, message(snapshot(2), '编辑'), message({ ...snapshot(3), v: 9 })]);
    const base = findBase(chat, 3);
    assert.equal(base.floor, 0);
    assert.equal(base.snapshot.id, saved.id);
    assert.equal(base.stale, false);
});

test('无窗口快照采用兜底且标记 stale', () => {
    const saved = snapshot(5);
    const base = findBase(view([null, null], saved), 1);
    assert.equal(base.snapshot.id, saved.id);
    assert.equal(base.stale, true);
    assert.equal(base.floor, 5);
});

test('无兜底、坏兜底、空视图返回新初始状态', () => {
    for (const chat of [null, view([]), view([null], {}), view([message()], null)]) {
        const base = findBase(chat, -1);
        assert.equal(base.snapshot, null);
        assert.deepEqual(base.state, emptyState());
    }
});

test('失败快照沿用父状态仍可作为基底', () => {
    const parent = snapshot();
    const failed = makeSnapshot({ parent, floor: 1, swipeId: 0, text: '正文', state: parent.state,
        status: 'failed', error: '连接失败' });
    assert.equal(findBase(view([message(parent), message(failed)]), 1).snapshot.status, 'failed');
});

test('makeSnapshot 的非法参数作为编程错误报告', () => {
    assert.throws(() => makeSnapshot({ floor: -1, swipeId: 0, text: '', state: emptyState() }));
});
