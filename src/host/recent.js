// 挑选推演要读的最近几轮对话。纯函数，不访问宿主。
// 一轮 = 一条 AI 回复，加上它前面用户的输入（连发几条都算在这一轮里）。

/** 单次最多读取的消息条数，防止用户连发很多条时无限往前读 */
export const RECENT_MESSAGE_CAP = 60;

/**
 * @param {Array<{ is_user?: boolean, is_system?: boolean, name?: string, mes?: string }|null|undefined>} chat
 * @param {number} uptoFloor  从这一楼（含）往前数
 * @param {number} rounds     读几轮
 * @returns {Array<{ isUser: boolean, name: string, text: string }>} 旧 → 新
 */
export function pickRecentRounds(chat, uptoFloor, rounds) {
    const wanted = Math.max(1, Math.floor(rounds || 1));
    const out = [];
    let aiCount = 0;
    for (let i = Math.min(uptoFloor, chat.length - 1); i >= 0 && out.length < RECENT_MESSAGE_CAP; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        if (!m.is_user) {
            if (aiCount >= wanted) break;   // 再往前就是更早一轮的 AI 回复了
            aiCount++;
        }
        out.unshift({ isUser: !!m.is_user, name: String(m.name ?? ''), text: String(m.mes ?? '') });
    }
    return out;
}
