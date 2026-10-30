// 纸条页用：本轮被选中注入的迹象及其来源，以及因为"来路不明"没被注入的迹象。纯函数。
// 挑选逻辑一律用 compose.js 的 selectSignals，这里只负责补上来源名字。

import { selectSignals } from '../inject/compose.js';

export const VOICE_LABEL = { here: '此地此刻', rumor: '风闻', undercurrent: '暗流' };

/**
 * @param {import('../types.js').SimState} state
 * @param {Pick<import('../types.js').Settings, 'injectUndercurrent'|'maxSignals'>} settings
 * @returns {{
 *   picked: Array<{ voice: string, voiceLabel: string, text: string, thread: string|null, character: string|null, threadId: string|null }>,
 *   orphans: import('../types.js').Signal[],
 *   threadIds: Set<string>,
 * }}
 */
export function signalSources(state, settings) {
    const threads = new Map((state?.threads ?? []).map(t => [t.id, t]));
    const characters = new Map((state?.characters ?? []).map(c => [c.id, c]));
    const chosen = settings.injectUndercurrent && state ? selectSignals(state, settings.maxSignals) : [];
    const picked = chosen.map(s => ({
        voice: s.voice,
        voiceLabel: VOICE_LABEL[s.voice] ?? '暗流',
        text: String(s.text).trim(),
        thread: threads.get(s.threadId)?.title ?? null,
        character: characters.get(s.characterId)?.name ?? null,
        threadId: threads.has(s.threadId) ? s.threadId : null,
    }));
    const orphans = (state?.signals ?? []).filter(s => s && String(s.text ?? '').trim()
        && !threads.has(s.threadId) && !characters.has(s.characterId));
    return { picked, orphans, threadIds: new Set(picked.map(p => p.threadId).filter(Boolean)) };
}

/** "来自暗线：标题 · 来自：人物" */
export function sourceText(entry) {
    return [entry.thread ? `来自暗线：${entry.thread}` : '', entry.character ? `来自：${entry.character}` : '']
        .filter(Boolean).join(' · ');
}
