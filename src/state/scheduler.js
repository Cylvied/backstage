import { LOG_PREFIX } from '../constants.js';

/**
 * 单个工作槽避免取消后尚未结束的请求与新请求交叠。
 * @param {{runJob: (job: import('../types.js').SimJob, signal: AbortSignal) => Promise<void>, log?: Function|object}} options
 */
export function createScheduler({ runJob, log = console }) {
    const queue = [];
    const seen = new Set();
    const listeners = new Set();
    let active = null;
    let lastError = null;

    const keyOf = job => JSON.stringify([job.chatId, job.floor, job.swipeId, job.textHash]);
    const report = error => {
        // 入口传日志函数；也接受 console 风格对象，日志失败不能锁住队列。
        try {
            if (typeof log === 'function') log(`${LOG_PREFIX} 调度异常`, error);
            else log?.warn?.(`${LOG_PREFIX} 调度异常`, error);
        } catch { /* 日志接收方异常不影响推演 */ }
    };
    const status = () => ({
        running: active && !active.controller.signal.aborted ? { ...active.job } : null,
        queued: queue.length,
        lastError,
    });
    const notify = () => {
        for (const listener of [...listeners]) {
            try { listener(status()); } catch (error) { report(error); }
        }
    };

    function pump() {
        if (active || !queue.length) return;
        const entry = queue.shift();
        entry.controller = new AbortController();
        active = entry;
        lastError = null;
        notify();
        Promise.resolve().then(() => {
            if (!entry.controller.signal.aborted) {
                return runJob({ ...entry.job }, entry.controller.signal);
            }
        }).catch(error => {
            if (!entry.controller.signal.aborted) {
                lastError = error instanceof Error ? error.message : String(error);
                if (entry.key) seen.delete(entry.key);
                report(error);
            }
        }).finally(() => {
            active = null;
            notify();
            pump();
        });
    }

    /** @param {import('../types.js').SimJob} job */
    function enqueue(job) {
        if (!job || typeof job.chatId !== 'string' || !job.chatId
            || !Number.isInteger(job.floor) || job.floor < 0
            || !Number.isInteger(job.swipeId) || job.swipeId < 0
            || typeof job.textHash !== 'string' || !job.textHash
            || !['reply', 'manual'].includes(job.reason)) {
            report('忽略无效推演任务');
            return;
        }
        const key = job.reason === 'manual' ? null : keyOf(job);
        if (key && seen.has(key)) return;
        for (let i = queue.length - 1; i >= 0; i--) {
            if (queue[i].job.chatId === job.chatId) {
                if (queue[i].key) seen.delete(queue[i].key);
                queue.splice(i, 1);
            }
        }
        if (key) seen.add(key);
        queue.push({ job: { ...job }, key });
        notify();
        pump();
    }

    function cancelAll() {
        queue.length = 0;
        seen.clear();
        active?.controller.abort();
        lastError = null;
        notify();
    }

    return {
        enqueue,
        cancelAll,
        status,
        onStatus(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
