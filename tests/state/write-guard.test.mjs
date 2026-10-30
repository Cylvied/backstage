import { test, assert } from '../harness.js';
import { chooseWriteBase } from '../../src/state/write-guard.js';

const snap = createdAt => ({ id: 's_x', parentId: 's_p', createdAt, edited: true, state: {} });

test('这一楼还没有快照：正常写入', () => {
    assert.deepEqual(chooseWriteBase({ jobStartedAt: 100, current: null, ok: true }), { action: 'write' });
});

test('这一楼的快照早于推演开始：正常写入（覆盖旧结果）', () => {
    assert.deepEqual(chooseWriteBase({ jobStartedAt: 100, current: snap(50), ok: true }), { action: 'write' });
});

test('推演期间用户改过这一楼：重新合并到用户的版本上', () => {
    const current = snap(150);
    const out = chooseWriteBase({ jobStartedAt: 100, current, ok: true });
    assert.equal(out.action, 'rebase');
    assert.equal(out.snapshot, current);
});

test('推演失败且推演期间用户改过：不覆盖', () => {
    assert.equal(chooseWriteBase({ jobStartedAt: 100, current: snap(150), ok: false }).action, 'skip');
});

test('推演失败但这一楼没被动过：照常写入失败记录', () => {
    assert.equal(chooseWriteBase({ jobStartedAt: 100, current: snap(50), ok: false }).action, 'write');
});
