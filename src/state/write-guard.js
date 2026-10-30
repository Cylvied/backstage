// 写回保护（A2）：推演请求返回时，目标楼的快照可能已经被用户改过（钉住、采纳、换拍……）。
// 纯函数，不访问宿主。

/** @typedef {import('../types.js').Snapshot} Snapshot */

/**
 * 决定推演结果写回时以哪份状态为底。
 *
 * @param {{ jobStartedAt: number, current: Snapshot|null, ok: boolean }} args
 *   jobStartedAt  推演开始的时间戳
 *   current       写回前重新读到的、目标楼当前 swipe 上的**有效**快照（没有则 null）
 *   ok            这次推演是否成功解析出补丁
 * @returns {{ action: 'write' } | { action: 'rebase', snapshot: Snapshot } | { action: 'skip', reason: string }}
 *   write   正常写入（以推演开始时的基底为底）
 *   rebase  推演期间这一楼被写过：把补丁重新合并到 snapshot.state 上，保留它的 parentId 与 edited
 *   skip    推演失败且这一楼已有推演期间写入的快照：不覆盖，只报告失败
 */
export function chooseWriteBase({ jobStartedAt, current, ok }) {
    const touchedDuringJob = !!current && Number.isFinite(current.createdAt) && current.createdAt >= jobStartedAt;
    if (!touchedDuringJob) return { action: 'write' };
    if (!ok) return { action: 'skip', reason: '推演失败，且这一楼在推演期间已被修改，保留现有内容。' };
    return { action: 'rebase', snapshot: current };
}
