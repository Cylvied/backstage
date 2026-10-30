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
        api: { ...DEFAULT_SETTINGS.api, ...(saved.api ?? {}) },
        lore: { ...DEFAULT_SETTINGS.lore, ...(saved.lore ?? {}), pinned: [...(saved.lore?.pinned ?? DEFAULT_SETTINGS.lore.pinned)] },
        review: { ...DEFAULT_SETTINGS.review, ...(saved.review ?? {}) },
        ui: { ...DEFAULT_SETTINGS.ui, ...(saved.ui ?? {}) },
    };
    all[STORE_KEY] = merged;
    return merged;
}

/** @param {Partial<Settings>} patch */
export function saveSettings(patch) {
    const merged = { ...getSettings(), ...patch };
    if (patch.memory) merged.memory = { ...getSettings().memory, ...patch.memory };
    if (patch.api) merged.api = { ...getSettings().api, ...patch.api };
    if (patch.lore) merged.lore = { ...getSettings().lore, ...patch.lore };
    if (patch.review) merged.review = { ...getSettings().review, ...patch.review };
    if (patch.ui) merged.ui = { ...getSettings().ui, ...patch.ui };
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
/**
 * @param {number} uptoFloor  包含此楼
 * @param {Settings} settings
 * @param {import('../types.js').SimState} state  当前基底状态（用于"幕后触发"和"按需调取"）
 * @returns {Promise<SimInput & { loreUsed: import('../types.js').LoreUsed[] }>}
 */
export async function collectSimInput(uptoFloor, settings, state) {
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
    const lore = await collectLore(state, settings);

    return {
        userName: String(c.name1 ?? ''),
        charName: String(c.name2 ?? ''),
        persona: sub(fields.persona),
        card: {
            description: sub(fields.description),
            personality: sub(fields.personality),
            scenario: sub(fields.scenario),
        },
        worldInfo: lore.worldInfo,
        loreCatalog: lore.catalog,
        loreUsed: lore.loreUsed,
        recent,
        memos,
    };
}

// ---------- 世界书（v1.5 分层） ----------

/** 当前聊天启用的世界书：全局选中、角色主书与附加书、聊天绑定、人设绑定 */
async function activeBookNames() {
    const c = ctx();
    const names = new Set();
    try {
        const wi = await import('/scripts/world-info.js');
        for (const n of wi.selected_world_info ?? []) names.add(n);
        const character = c.characters?.[c.characterId];
        const fileName = String(character?.avatar ?? '').replace(/\.[^.]+$/, '');
        const extra = wi.world_info?.charLore?.find(e => e.name === fileName);
        for (const n of extra?.extraBooks ?? []) names.add(n);
    } catch (error) {
        console.warn(LOG_PREFIX, '读取全局世界书列表失败，只使用角色与聊天绑定的世界书', error);
    }
    const primary = primaryWorldbookName();
    if (primary) names.add(primary);
    const chatBook = c.chatMetadata?.world_info;
    if (chatBook) names.add(String(chatBook));
    const personaBook = c.powerUserSettings?.persona_description_lorebook;
    if (personaBook) names.add(String(personaBook));
    return [...names].filter(Boolean);
}

/** @returns {Promise<import('../memory/lore.js').LoreEntry[]>} */
async function loadAllEntries() {
    const c = ctx();
    const out = [];
    for (const world of await activeBookNames()) {
        try {
            const data = await c.loadWorldInfo(world);
            for (const e of Object.values(data?.entries ?? {})) {
                out.push({
                    world,
                    uid: e.uid,
                    title: String(e.comment || (Array.isArray(e.key) ? e.key[0] : '') || `条目 ${e.uid}`),
                    content: String(e.content ?? ''),
                    keys: Array.isArray(e.key) ? e.key.map(String) : [],
                    disabled: !!e.disable,
                    constant: !!e.constant,
                });
            }
        } catch (error) {
            console.warn(LOG_PREFIX, `读取世界书「${world}」失败`, error);
        }
    }
    return out;
}

async function countTokens(text) {
    const c = ctx();
    try {
        if (typeof c.getTokenCountAsync === 'function') return await c.getTokenCountAsync(text);
    } catch { /* 退回估算 */ }
    return Math.ceil(String(text).length / 1.6);
}

/**
 * @param {import('../types.js').SimState} state
 * @param {Settings} settings
 */
async function collectLore(state, settings) {
    const { selectLore, fitBudget, entryKey } = await import('../memory/lore.js');
    const entries = await loadAllEntries();
    const triggered = new Set(lastActivatedWorldInfo.map(e => entryKey(e.world, e.uid)));
    const { candidates, catalog } = selectLore({
        entries,
        triggered,
        pinned: settings.lore.pinned,
        state,
        catalog: settings.lore.catalog,
        constant: settings.lore.constant !== false,
    });
    const measured = [];
    for (const cand of candidates) measured.push({ ...cand, tokens: await countTokens(cand.entry.content) });
    const { kept } = fitBudget(measured, settings.lore.budget);
    return {
        worldInfo: kept.map(k => ({ title: k.entry.title, content: k.entry.content.trim(), layer: k.layer })),
        catalog,
        loreUsed: kept.map(k => ({ world: k.entry.world, uid: k.entry.uid, title: k.entry.title, layer: k.layer, tokens: k.tokens })),
    };
}

/** 设置页选择"推演专用常驻条目"用：列出可用条目（token 为估算值） */
export async function listLoreEntries() {
    return (await loadAllEntries())
        .filter(e => !e.disabled && e.content.trim() && !/^TavernDB-ACU-/i.test(e.title))
        .map(e => ({ world: e.world, uid: e.uid, title: e.title, tokens: Math.ceil(e.content.length / 1.6), constant: e.constant }));
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

// ---------- 等待正文定稿 ----------

const SETTLE_INTERVAL_MS = 400;
const SETTLE_TIMEOUT_MS = 120000;

/** 宿主的停止按钮还在显示 = 这一轮生成（含工具续轮、流式输出）还没结束 */
function generationRunning() {
    const stop = document.getElementById('mes_stop');
    return !!stop && getComputedStyle(stop).display !== 'none';
}

/**
 * 等到生成结束、且这一楼的正文连续两次检查都没变，再读定稿。
 * 宿主没有向扩展开放"等待生成空闲"的接口，所以用停止按钮的显隐加正文稳定来判断。
 * @param {number} floor
 * @returns {Promise<{ text: string, swipeId: number }|null>} 这一楼不再是有效的 AI 回复时返回 null
 */
async function waitForFinalText(floor) {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < SETTLE_TIMEOUT_MS) {
        await new Promise(resolve => setTimeout(resolve, SETTLE_INTERVAL_MS));
        const message = ctx().chat?.[floor];
        if (!isAiMessage(message)) return null;
        const now = { text: String(message.mes ?? ''), swipeId: Number(message.swipe_id ?? 0) };
        const stable = last && last.text === now.text && last.swipeId === now.swipeId;
        if (stable && !generationRunning()) return now.text.trim() ? now : null;
        last = now;
    }
    console.warn(LOG_PREFIX, `第 ${floor} 楼的正文在 ${SETTLE_TIMEOUT_MS / 1000} 秒内没有定稿，跳过自动推演`);
    return null;
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
    const pendingFloors = new Set();

    const listeners = [
        [eventTypes.GENERATION_STARTED, (type, _options, dryRun) => {
            if (dryRun || type === 'quiet' || type === 'impersonate') return;
            stoppedSinceStart = false;
            handlers.onGenerationStarting({ type: String(type ?? 'normal'), lastFloor: (ctx().chat?.length ?? 0) - 1 });
        }],
        [eventTypes.GENERATION_STOPPED, () => { stoppedSinceStart = true; }],
        [eventTypes.MESSAGE_RECEIVED, (messageId, type) => {
            if (type === 'impersonate' || type === 'quiet') return;
            const floor = Number(messageId);
            if (!Number.isInteger(floor) || pendingFloors.has(floor)) return; // 工具续轮等会对同一楼多次触发，只跟一次
            pendingFloors.add(floor);
            waitForFinalText(floor)
                .then(final => {
                    if (!final || stoppedSinceStart) return; // 用户中途停止：不自动推演，可在面板手动触发
                    handlers.onReplyFinalized({ chatId: getChatId(), floor, swipeId: final.swipeId, text: final.text });
                })
                .catch(error => console.warn(LOG_PREFIX, '等待正文定稿失败', error))
                .finally(() => pendingFloors.delete(floor));
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
