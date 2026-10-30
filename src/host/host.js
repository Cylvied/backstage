// 宿主适配：本插件里唯一直接读写 SillyTavern / TauriTavern 聊天数据的模块。
// 其他模块通过这里导出的函数拿数据，不直接访问宿主。

import { DEFAULT_SETTINGS, LOG_PREFIX, STORE_KEY } from '../constants.js';
import { hashText } from '../util.js';

/** @typedef {import('../types.js').Snapshot} Snapshot */
/** @typedef {import('../types.js').Settings} Settings */
/** @typedef {import('../types.js').SimInput} SimInput */
/** @typedef {import('../types.js').ChatView} ChatView */

function ctx() {
    return globalThis.SillyTavern.getContext();
}

/** 宿主里"AI 消息"的判定：不是用户、不是系统旁注 */
function isAiMessage(message) {
    return !!message && !message.is_user && !message.is_system;
}

// ---------- 设置 ----------

/** @returns {Settings} */
export function getSettings() {
    const all = ctx().extensionSettings;
    const saved = all[STORE_KEY] ?? {};
    const merged = {
        ...structuredClone(DEFAULT_SETTINGS),
        ...saved,
        memory: { ...DEFAULT_SETTINGS.memory, ...(saved.memory ?? {}) },
    };
    all[STORE_KEY] = merged;
    return merged;
}

/** @param {Partial<Settings>} patch */
export function saveSettings(patch) {
    const merged = { ...getSettings(), ...patch };
    if (patch.memory) merged.memory = { ...getSettings().memory, ...patch.memory };
    ctx().extensionSettings[STORE_KEY] = merged;
    ctx().saveSettingsDebounced();
    return merged;
}

/** 连接管理器里的连接列表，供设置界面选择 */
export function listProfiles() {
    const profiles = ctx().extensionSettings?.connectionManager?.profiles ?? [];
    return profiles.map(p => ({ id: String(p.id), name: String(p.name ?? p.id) }));
}

// ---------- 聊天视图 ----------

export function getChatId() {
    return String(ctx().getCurrentChatId?.() ?? '');
}

/** @returns {ChatView} */
export function getChatView() {
    const c = ctx();
    const chat = c.chat ?? [];
    return {
        chatId: getChatId(),
        length: chat.length,
        getMessage(floor) {
            const m = chat[floor];
            if (!m) return null;
            return {
                isUser: !isAiMessage(m),
                text: String(m.mes ?? ''),
                swipeId: Number(m.swipe_id ?? 0),
                extra: m.extra ?? {},
            };
        },
        fallbackSnapshot: c.chatMetadata?.[STORE_KEY]?.lastSnapshot ?? null,
    };
}

/** 最后一条 AI 消息的楼层，没有则 -1 */
export function lastAiFloor() {
    const chat = ctx().chat ?? [];
    for (let i = chat.length - 1; i >= 0; i--) {
        if (isAiMessage(chat[i])) return i;
    }
    return -1;
}

// ---------- 快照写入 ----------

/**
 * 把快照写到某楼当前 swipe 上。写前再次校验该楼仍是同一个 swipe、同一段正文，否则放弃。
 * @param {number} floor
 * @param {number} swipeId
 * @param {Snapshot} snapshot
 * @returns {Promise<boolean>}
 */
export async function writeSnapshot(floor, swipeId, snapshot) {
    const c = ctx();
    const message = c.chat?.[floor];
    if (!isAiMessage(message)) return false;
    if (Number(message.swipe_id ?? 0) !== swipeId) return false;
    if (hashText(message.mes) !== snapshot.basis.textHash) return false;

    message.extra ??= {};
    message.extra[STORE_KEY] = snapshot;
    // 当前 swipe 的副本也同步一份，避免宿主在切换前没来得及回存
    const swipeInfo = message.swipe_info?.[swipeId];
    if (swipeInfo) {
        swipeInfo.extra ??= {};
        swipeInfo.extra[STORE_KEY] = structuredClone(snapshot);
    }

    if (floor === lastAiFloor()) {
        c.chatMetadata[STORE_KEY] = { ...(c.chatMetadata[STORE_KEY] ?? {}), lastSnapshot: snapshot };
    }

    try {
        await c.saveChat();
        return true;
    } catch (error) {
        console.error(LOG_PREFIX, '保存聊天失败', error);
        return false;
    }
}

// ---------- 参谋对话记录（跟着聊天走，不跟 swipe 走） ----------

const ADVISOR_LOG_LIMIT = 60;

/** @returns {import('../types.js').AdvisorMessage[]} */
export function getAdvisorLog() {
    const log = ctx().chatMetadata?.[STORE_KEY]?.advisor;
    return Array.isArray(log) ? structuredClone(log) : [];
}

/** @param {import('../types.js').AdvisorMessage[]} log */
export async function saveAdvisorLog(log) {
    const c = ctx();
    c.chatMetadata[STORE_KEY] = { ...(c.chatMetadata[STORE_KEY] ?? {}), advisor: log.slice(-ADVISOR_LOG_LIMIT) };
    try {
        await c.saveMetadata();
        return true;
    } catch (error) {
        console.error(LOG_PREFIX, '保存参谋对话失败', error);
        return false;
    }
}

// ---------- 推演输入 ----------

let lastActivatedWorldInfo = [];

/**
 * @param {number} uptoFloor  包含此楼
 * @param {Settings} settings
 * @returns {Promise<SimInput>}
 */
export async function collectSimInput(uptoFloor, settings) {
    const c = ctx();
    const chat = c.chat ?? [];
    const fields = c.getCharacterCardFields?.() ?? {};
    const sub = text => String(c.substituteParams?.(text ?? '') ?? text ?? '');

    const recent = [];
    for (let i = Math.min(uptoFloor, chat.length - 1); i >= 0 && recent.length < settings.recentFloors; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        recent.unshift({ isUser: !!m.is_user, name: String(m.name ?? ''), text: String(m.mes ?? '') });
    }

    const memos = settings.memory.enabled ? await readDatabaseMemos(settings, recent) : [];

    return {
        userName: String(c.name1 ?? ''),
        charName: String(c.name2 ?? ''),
        persona: sub(fields.persona),
        card: {
            description: sub(fields.description),
            personality: sub(fields.personality),
            scenario: sub(fields.scenario),
        },
        worldInfo: lastActivatedWorldInfo.map(e => String(e.content ?? '').trim()).filter(Boolean),
        recent,
        memos,
    };
}

/** 读数据库导出到世界书的纪要。打分挑选由 Codex 的 pickMemos 负责。 */
async function readDatabaseMemos(settings, recent) {
    try {
        const c = ctx();
        const bookName = settings.memory.worldbook || primaryWorldbookName();
        if (!bookName) return [];
        const { pickMemos, MEMO_NAME_PATTERN } = await import('../memory/database-memo.js');
        const data = await c.loadWorldInfo(bookName);
        const entries = Object.values(data?.entries ?? {})
            .filter(e => !e.disable)
            .map(e => ({
                name: String(e.comment ?? ''),
                content: String(e.content ?? ''),
                keys: Array.isArray(e.key) ? e.key.map(String) : [],
            }))
            .filter(e => MEMO_NAME_PATTERN.test(e.name));
        if (!entries.length) return [];
        const query = recent.map(r => r.text).join('\n');
        return pickMemos(entries, query, settings.memory.limit);
    } catch (error) {
        console.warn(LOG_PREFIX, '读取数据库纪要失败', error);
        return [];
    }
}

function primaryWorldbookName() {
    const c = ctx();
    const character = c.characters?.[c.characterId];
    return String(character?.data?.extensions?.world ?? '').trim();
}

// ---------- 事件 ----------

/**
 * @typedef {Object} HostHandlers
 * @property {(e: { chatId: string, floor: number, swipeId: number, text: string }) => void} onReplyFinalized
 * @property {(e: { type: string, lastFloor: number }) => void} onGenerationStarting
 * @property {() => void} onChanged
 * @property {(e: { chatId: string }) => void} onChatChanged
 */

/**
 * @param {HostHandlers} handlers
 * @returns {() => void} 取消订阅
 */
export function onHostEvents(handlers) {
    const c = ctx();
    const { eventSource, eventTypes } = c;
    let stoppedSinceStart = false;

    const listeners = [
        [eventTypes.GENERATION_STARTED, (type, _options, dryRun) => {
            if (dryRun || type === 'quiet' || type === 'impersonate') return;
            stoppedSinceStart = false;
            handlers.onGenerationStarting({ type: String(type ?? 'normal'), lastFloor: (ctx().chat?.length ?? 0) - 1 });
        }],
        [eventTypes.GENERATION_STOPPED, () => { stoppedSinceStart = true; }],
        [eventTypes.MESSAGE_RECEIVED, async (messageId, type) => {
            if (type === 'impersonate' || type === 'quiet') return;
            // 流式输出和工具调用期间可能触发多次；等整轮生成结束后再读定稿
            await ctx().waitForGenerationIdle?.();
            if (stoppedSinceStart) return;   // 用户中途停止：不自动推演，可在面板手动触发
            const floor = Number(messageId);
            const message = ctx().chat?.[floor];
            if (!isAiMessage(message) || !String(message.mes ?? '').trim()) return;
            handlers.onReplyFinalized({
                chatId: getChatId(),
                floor,
                swipeId: Number(message.swipe_id ?? 0),
                text: String(message.mes),
            });
        }],
        [eventTypes.MESSAGE_SWIPED, () => handlers.onChanged()],
        [eventTypes.MESSAGE_EDITED, () => handlers.onChanged()],
        [eventTypes.MESSAGE_UPDATED, () => handlers.onChanged()],
        [eventTypes.MESSAGE_DELETED, () => handlers.onChanged()],
        [eventTypes.MESSAGE_SWIPE_DELETED, () => handlers.onChanged()],
        [eventTypes.CHAT_CHANGED, () => {
            lastActivatedWorldInfo = [];
            handlers.onChatChanged({ chatId: getChatId() });
        }],
        [eventTypes.WORLD_INFO_ACTIVATED, (entries) => {
            lastActivatedWorldInfo = Array.isArray(entries) ? entries : [];
        }],
    ].filter(([name]) => !!name);

    for (const [name, fn] of listeners) eventSource.on(name, fn);
    return () => {
        for (const [name, fn] of listeners) eventSource.removeListener(name, fn);
    };
}
