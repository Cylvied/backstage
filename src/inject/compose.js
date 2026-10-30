// 从推演状态挑选迹象、组装注入文本。纯函数，不访问宿主。
//
// 注入会出现在正文模型看到的最后几条消息里（用 Gemini 时是一个独立的 user 回合），
// 所以开头和结尾都要明确写清：这是幕后备注，不是主角说的话，角色也看不到。

/** @typedef {import('../types.js').SimState} SimState */
/** @typedef {import('../types.js').Signal} Signal */
/** @typedef {import('../types.js').Settings} Settings */

const VOICE_LABEL = { here: '此地此刻', rumor: '风闻', undercurrent: '暗流' };

const STAGE_LABEL = { seeded: '刚埋下', growing: '在发展', ripe: '已成形', resolving: '在收束', faded: '在淡出' };

const PACE = {
    seed: '只铺垫：这一段最多露出一点相关的细节、气氛或人物的小动作，不要让事件真正发生。',
    normal: '自然推进：在合适的时机，让相关的人物或事件往这个方向走一小步，不要跳跃，也不要硬凑。',
    push: '尽快引爆：在不违背逻辑和人物动机的前提下，尽快让这件事正面出现在主角面前。',
};

/** @param {SimState} state */
function activeGuideThread(state) {
    return state.threads.find(t => t.guide?.status === 'active') ?? null;
}

/**
 * 按相关性挑选本轮要注入的迹象。
 * @param {SimState} state
 * @param {number} maxSignals
 * @returns {Signal[]}
 */
export function selectSignals(state, maxSignals) {
    const limit = Math.max(0, Math.min(3, Math.floor(maxSignals || 0)));
    if (!limit) return [];

    const guideId = activeGuideThread(state)?.id ?? null;
    const candidates = (state.signals ?? [])
        .filter(s => s && String(s.text ?? '').trim())
        .filter(s => state.protagonist.reachable || s.voice !== 'rumor')
        .map((s, index) => ({ s, index }))
        .sort((a, b) => {
            const ga = a.s.threadId && a.s.threadId === guideId ? 1 : 0;
            const gb = b.s.threadId && b.s.threadId === guideId ? 1 : 0;
            return (gb - ga) || ((b.s.relevance ?? 1) - (a.s.relevance ?? 1)) || (a.index - b.index);
        })
        .map(x => x.s);

    const picked = [];
    let undercurrents = 0;
    for (const s of candidates) {
        if (picked.length >= limit) break;
        if (s.voice === 'undercurrent') {
            if (undercurrents >= 1) continue;
            undercurrents++;
        }
        picked.push(s);
    }
    return picked;
}

/** @param {Signal[]} signals */
function undercurrentBlock(signals) {
    if (!signals.length) return '';
    return [
        '〔幕后备注｜这不是主角的发言，故事里的角色也看不到这段话〕',
        '以下是镜头之外正在发生的事，只用来把握世界的走向。可以在合适的时候让它们自然露出一点迹象，也可以这一段完全不写。不必兑现，不要直接点破，不要让角色凭空知道自己没有渠道得知的事。',
        ...signals.map(s => `- 【${VOICE_LABEL[s.voice] ?? '暗流'}】${String(s.text).trim()}`),
        '〔幕后备注结束〕',
    ].join('\n');
}

/**
 * 分阶段引导的当前拍；不是分阶段或数据不完整时返回 null。
 * @param {import('../types.js').Guide} guide
 */
export function currentBeat(guide) {
    if (!Array.isArray(guide?.beats) || !guide.beats.length) return null;
    const beat = guide.beats[guide.beatIndex ?? -1];
    return beat && beat.status === 'active' ? beat : null;
}

/** @param {import('../types.js').Thread} thread */
function guideBlock(thread) {
    const g = thread.guide;
    const beat = currentBeat(g);
    const lines = ['〔剧情引导｜来自用户的幕后安排，这不是主角的发言，故事里的角色也看不到这段话〕'];
    if (beat) {
        lines.push(`整体方向：${g.goal || thread.title}`);
        lines.push(`当前阶段（第 ${g.beatIndex + 1} / ${g.beats.length} 拍）：${beat.title}`);
        lines.push(`这一拍要达到：${beat.goal}`);
        if (beat.firstSigns) lines.push(`可以从这些迹象开始：${beat.firstSigns}`);
        lines.push('只推进这一拍。后面的阶段还没到，不要提前演出来，也不要暗示它们。');
    } else {
        lines.push(`方向：${g.goal || thread.title}`);
        if (g.firstSigns) lines.push(`可以从这些迹象开始：${g.firstSigns}`);
    }
    lines.push(`相关暗线：${thread.title}（${STAGE_LABEL[thread.stage] ?? '在发展'}）`);
    lines.push(`节奏：${PACE[g.intensity] ?? PACE.normal}`);
    lines.push('主角的行动始终优先：主角的选择偏离这个方向时，跟随主角，不要强行拉回。不要替主角说话、做决定或安排主角的行动。');
    lines.push('〔剧情引导结束〕');
    return lines.join('\n');
}

/**
 * @param {SimState} state
 * @param {Settings} settings
 * @returns {{ undercurrent: string, guide: string, guidePush: boolean }}
 */
export function composeInjection(state, settings) {
    const signals = settings.injectUndercurrent ? selectSignals(state, settings.maxSignals) : [];
    const thread = activeGuideThread(state);
    return {
        undercurrent: undercurrentBlock(signals),
        guide: thread ? guideBlock(thread) : '',
        guidePush: thread?.guide?.intensity === 'push',
    };
}
