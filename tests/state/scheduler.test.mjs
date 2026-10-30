import { test, assert } from '../harness.js';
import { createScheduler } from '../../src/state/scheduler.js';

const job = (floor = 1, chatId = 'a', reason = 'reply') => ({ chatId, floor, swipeId: 0, textHash: `hash${floor}`, reason });
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const log = { warn() {} };

test('空队列和坏任务不启动工作', () => {
    const scheduler = createScheduler({ runJob: () => { throw new Error('不应运行'); }, log });
    scheduler.enqueue(null);
    scheduler.enqueue({ ...job(), floor: -1 });
    assert.deepEqual(scheduler.status(), { running: null, queued: 0, lastError: null });
});

test('自动任务运行中与完成后均去重，手动重跑不去重', async () => {
    const calls = [];
    const scheduler = createScheduler({ runJob: async value => calls.push(value), log });
    scheduler.enqueue(job());
    scheduler.enqueue(job());
    await tick();
    scheduler.enqueue(job());
    scheduler.enqueue(job(1, 'a', 'manual'));
    await tick();
    scheduler.enqueue(job(1, 'a', 'manual'));
    await tick();
    assert.equal(calls.length, 3);
});

test('同聊天只保留最新排队任务，不取消运行任务', async () => {
    const gate = deferred();
    const calls = [];
    let signal;
    const scheduler = createScheduler({ runJob: async (value, abort) => {
        calls.push(value.floor);
        if (value.floor === 1) { signal = abort; await gate.promise; }
    }, log });
    scheduler.enqueue(job(1));
    await tick();
    scheduler.enqueue(job(2));
    scheduler.enqueue(job(3));
    assert.equal(scheduler.status().queued, 1);
    assert.equal(signal.aborted, false);
    gate.resolve();
    await tick();
    assert.deepEqual(calls, [1, 3]);
    scheduler.enqueue(job(2));
    await tick();
    assert.deepEqual(calls, [1, 3, 2]);
});

test('取消排队仅影响同聊天，其他聊天保留', async () => {
    const gate = deferred();
    const calls = [];
    const scheduler = createScheduler({ runJob: async value => {
        calls.push(`${value.chatId}${value.floor}`);
        if (calls.length === 1) await gate.promise;
    }, log });
    scheduler.enqueue(job(1));
    await tick();
    scheduler.enqueue(job(2, 'b'));
    scheduler.enqueue(job(3));
    scheduler.enqueue(job(4));
    gate.resolve();
    await tick();
    assert.deepEqual(calls, ['a1', 'b2', 'a4']);
});

test('cancelAll 中止信号、清队列；旧任务结束前不交叠新请求', async () => {
    const gate = deferred();
    const calls = [];
    let signal;
    const scheduler = createScheduler({ runJob: async (value, abort) => {
        calls.push(value.floor);
        if (calls.length === 1) { signal = abort; await gate.promise; }
    }, log });
    scheduler.enqueue(job(1));
    await tick();
    scheduler.enqueue(job(2));
    scheduler.cancelAll();
    assert.equal(signal.aborted, true);
    assert.equal(scheduler.status().queued, 0);
    scheduler.enqueue(job(3));
    await tick();
    assert.deepEqual(calls, [1]);
    gate.reject(new Error('迟到的取消错误'));
    await tick();
    assert.deepEqual(calls, [1, 3]);
    assert.equal(scheduler.status().lastError, null);
});

test('启动前取消不调用 runJob，取消后同键可再次提交', async () => {
    let count = 0;
    const scheduler = createScheduler({ runJob: async () => { count++; }, log });
    scheduler.enqueue(job());
    scheduler.cancelAll();
    await tick();
    assert.equal(count, 0);
    scheduler.enqueue(job());
    await tick();
    assert.equal(count, 1);
});

test('失败显示错误但不自动重试，显式重提可以运行', async () => {
    let count = 0;
    const scheduler = createScheduler({ runJob: () => { count++; throw new Error('请求失败'); }, log });
    scheduler.enqueue(job());
    await tick();
    assert.equal(scheduler.status().lastError, '请求失败');
    assert.equal(count, 1);
    scheduler.enqueue(job());
    await tick();
    assert.equal(count, 2);
});

test('通知可退订，监听器错误与返回状态修改不干扰队列', async () => {
    let count = 0;
    const calls = [];
    const scheduler = createScheduler({ runJob: async value => calls.push(value.floor), log });
    scheduler.onStatus(() => { throw new Error('面板错误'); });
    const unsubscribe = scheduler.onStatus(() => { count++; });
    const input = job();
    scheduler.enqueue(input);
    input.floor = 50;
    scheduler.status().running.floor = 99;
    await tick();
    assert.deepEqual(calls, [1]);
    assert.ok(count > 0);
    unsubscribe();
    const previous = count;
    scheduler.cancelAll();
    assert.equal(count, previous);
});

test('支持入口的函数式日志，日志抛错不锁住调度槽', async () => {
    let logged = 0;
    const scheduler = createScheduler({ runJob: async () => { throw new Error('失败'); },
        log: () => { logged++; throw new Error('日志失败'); } });
    scheduler.enqueue(job());
    await tick();
    assert.equal(logged, 1);
    assert.equal(scheduler.status().running, null);
    assert.equal(scheduler.status().lastError, '失败');
});
