// 幕后（Backstage）入口：装配各模块、接线宿主事件。
// 第 1 批只有一个最小设置抽屉；完整面板在第 2 批。

import { EXT_NAME, LOG_PREFIX, STORE_KEY } from './src/constants.js';
import { hashText } from './src/util.js';
import * as host from './src/host/host.js';
import * as llm from './src/host/llm.js';
import * as inject from './src/host/inject.js';
import { findBase, makeSnapshot, readSnapshot, isSnapshotValid } from './src/state/snapshot-store.js';
import { createScheduler } from './src/state/scheduler.js';
import { chooseWriteBase } from './src/state/write-guard.js';
import { parseSimOutput, parsePlanOutput } from './src/sim/parse.js';
import * as applyOps from './src/sim/apply.js';
const { applyPatch, adoptPlan, setGuideStatus, setGuideIntensity } = applyOps;
import { buildSimPrompt } from './src/prompts/sim-prompt.js';
import { buildPlanPrompt } from './src/prompts/plan-prompt.js';
import { buildAdvisorPrompt, splitAdvisorReply } from './src/prompts/advisor-prompt.js';
import { composeInjection } from './src/inject/compose.js';

/** @typedef {import('./src/types.js').SimJob} SimJob */
/** @typedef {import('./src/types.js').SimState} SimState */

const status = { lagging: false, lastError: /** @type {string|null} */ (null), lastRunAt: 0 };
const statusListeners = new Set();
const stateListeners = new Set();

function notifyState() {
    for (const fn of stateListeners) {
        try { fn(); } catch (error) { console.warn(LOG_PREFIX, error); }
    }
}

function notifyStatus() {
    const full = { ...status, scheduler: scheduler.status() };
    for (const fn of statusListeners) {
        try { fn(full); } catch (error) { console.warn(LOG_PREFIX, error); }
    }
}

// ---------- 推演 ----------

/**
 * @param {SimJob} job
 * @param {AbortSignal} signal
 */
async function runJob(job, signal) {
    const settings = host.getSettings();
    if (!settings.enabled) return;
    const jobStartedAt = Date.now();

    const view = host.getChatView();
    const message = view.getMessage(job.floor);
    if (view.chatId !== job.chatId || !message || message.isUser
        || message.swipeId !== job.swipeId || hashText(message.text) !== job.textHash) {
        return; // 任务排队期间聊天已经变了
    }

    const base = findBase(view, job.floor - 1);
    const common = { parent: base.snapshot, floor: job.floor, swipeId: job.swipeId, text: message.text };
    /** @type {import('./src/types.js').SimPatch|null} */
    let patch = null;
    let usage = null;
    let error = null;

    try {
        const input = await host.collectSimInput(job.floor, settings);
        const messages = buildSimPrompt({ state: base.state, input, settings });
        const res = await llm.call({ settings, messages, maxTokens: settings.maxTokens, signal });
        if (signal.aborted) return;
        usage = { model: res.model, ms: res.ms };
        const parsed = parseSimOutput(res.text);
        if (parsed.ok) patch = parsed.patch;
        else error = `模型输出无法解析：${parsed.error}`;
    } catch (e) {
        if (signal.aborted) return;
        error = String(e?.message ?? e);
    }

    // 写回保护：推演期间用户可能改过这一楼（钉住、采纳、换拍），不能被旧请求覆盖
    const nowMessage = host.getChatView().getMessage(job.floor);
    const nowSnap = nowMessage ? readSnapshot(nowMessage) : null;
    const current = nowSnap && isSnapshotValid(nowSnap, nowMessage) ? nowSnap : null;
    const decision = chooseWriteBase({ jobStartedAt, current, ok: !!patch });
    const opts = { maxCharacters: settings.maxCharacters };

    let snapshot;
    if (decision.action === 'skip') {
        status.lastError = error;
        console.warn(LOG_PREFIX, decision.reason, error);
        globalThis.toastr?.warning(`${error}（${decision.reason}）`, `${EXT_NAME}：推演失败`);
        notifyStatus();
        return;
    } else if (decision.action === 'rebase') {
        snapshot = makeSnapshot({ ...common, state: applyPatch(decision.snapshot.state, patch, opts), status: 'ok', error: null, usage });
        snapshot.parentId = decision.snapshot.parentId;
        snapshot.edited = decision.snapshot.edited;
    } else if (patch) {
        snapshot = makeSnapshot({ ...common, state: applyPatch(base.state, patch, opts), status: 'ok', error: null, usage });
    } else {
        snapshot = makeSnapshot({ ...common, state: base.state, status: 'failed', error, usage });
    }

    const written = await host.writeSnapshot(job.floor, job.swipeId, snapshot);
    if (!written) {
        console.info(LOG_PREFIX, '推演结果已过期，丢弃', job);
        return;
    }
    status.lastError = snapshot.status === 'failed' ? snapshot.error : null;
    status.lastRunAt = Date.now();
    if (snapshot.status === 'failed') {
        console.warn(LOG_PREFIX, snapshot.error);
        globalThis.toastr?.warning(snapshot.error, `${EXT_NAME}：推演失败`);
    }
    refreshInjection();
}

const scheduler = createScheduler({
    runJob,
    log: (...args) => console.debug(LOG_PREFIX, ...args),
});
scheduler.onStatus(() => notifyStatus());

/** @param {'reply'|'manual'} reason */
function enqueueFor(floor, reason) {
    const view = host.getChatView();
    const message = view.getMessage(floor);
    if (!message || message.isUser) return false;
    scheduler.enqueue({
        chatId: view.chatId,
        floor,
        swipeId: message.swipeId,
        textHash: hashText(message.text),
        reason,
    });
    return true;
}

// ---------- 注入 ----------

/** @param {{ type: string }} [event] 生成开始时传入，用来判断这次是不是重写最后一条 AI 回复 */
function refreshInjection(event) {
    const settings = host.getSettings();
    if (!settings.enabled) {
        inject.clear();
        return;
    }
    const view = host.getChatView();
    const lastAi = host.lastAiFloor();
    let target = view.length - 1;
    // 重 roll / 新 swipe / 续写：最后那条 AI 回复要被改写，不能用它自己推出来的状态
    if (event && ['regenerate', 'swipe', 'continue'].includes(event.type) && lastAi === view.length - 1) {
        target = lastAi - 1;
    }
    const base = findBase(view, target);
    inject.apply(composeInjection(base.state, settings), settings);

    // 最新一条 AI 回复还没有有效快照 = 推演落后一轮
    const lastMessage = lastAi >= 0 ? view.getMessage(lastAi) : null;
    const lastSnap = lastMessage ? readSnapshot(lastMessage) : null;
    status.lagging = lastAi >= 0 && !(lastSnap && isSnapshotValid(lastSnap, lastMessage));
    notifyStatus();
    notifyState();
}

// ---------- 用户操作（面板会调用） ----------

/** 当前生效的状态：最后一条 AI 回复（或其之前）的有效快照 */
function currentBase() {
    const view = host.getChatView();
    return { view, base: findBase(view, view.length - 1), lastAi: host.lastAiFloor() };
}

/**
 * 修改当前状态并保存到最后一条 AI 回复上（标记为用户编辑）。
 * @param {(state: SimState) => SimState} mutate
 */
async function editCurrentState(mutate) {
    const { view, base, lastAi } = currentBase();
    if (lastAi < 0) throw new Error('聊天里还没有 AI 回复，无法保存。');
    const message = view.getMessage(lastAi);
    const existing = readSnapshot(message);
    const own = existing && isSnapshotValid(existing, message) ? existing : null;
    const snapshot = makeSnapshot({
        parent: null,
        floor: lastAi,
        swipeId: message.swipeId,
        text: message.text,
        state: mutate(structuredClone(base.state)),
        status: own ? own.status : 'manual',
        error: null,
        usage: own?.usage ?? null,
    });
    // 改的是这一楼自己的快照：沿用它原来的父快照；这一楼还没有快照：父快照就是当前基底
    snapshot.parentId = own ? own.parentId : (base.snapshot?.id ?? null);
    snapshot.edited = true;
    const ok = await host.writeSnapshot(lastAi, message.swipeId, snapshot);
    if (!ok) throw new Error('保存失败：最后一条回复可能刚被修改或切换了。');
    refreshInjection();
    return snapshot.state;
}

/** @param {string} request */
async function plan(request) {
    const settings = host.getSettings();
    const { base } = currentBase();
    const input = await host.collectSimInput(host.getChatView().length - 1, settings);
    const messages = buildPlanPrompt({ state: base.state, input, request, settings });
    const res = await llm.call({ settings, messages, maxTokens: settings.maxTokens });
    const parsed = parsePlanOutput(res.text);
    if (!parsed.ok) throw new Error(`规划结果无法解析：${parsed.error}`);
    return parsed.cards;
}

/** v1.3 新增的合并函数由 Codex 实现；未就绪时给出明确错误，而不是让整个插件加载失败 */
function requireOp(name) {
    const fn = applyOps[name];
    if (typeof fn !== 'function') throw new Error(`当前版本还不支持「${name}」。`);
    return fn;
}

// ---------- 剧情参谋对话 ----------

let advisorBusy = false;

/**
 * @param {string} text
 * @param {{ history?: import('./src/types.js').AdvisorMessage[] }} [options]
 *   传入 history 时表示重试：用户消息已经在记录里，不再重复写入
 */
async function advisorSend(text, options = {}) {
    const message = String(text ?? '').trim();
    if (!message) throw new Error('请先输入想和参谋聊的内容。');
    if (advisorBusy) throw new Error('参谋还在回复上一条消息。');

    const chatId = host.getChatId();
    const settings = host.getSettings();
    const isRetry = Array.isArray(options.history);
    const history = isRetry ? options.history : host.getAdvisorLog();
    if (!isRetry) {
        await host.saveAdvisorLog([...history, { role: 'user', text: message, cards: [], at: Date.now() }]);
    }
    advisorBusy = true;
    notifyState();

    try {
        const { base } = currentBase();
        const input = await host.collectSimInput(host.getChatView().length - 1, settings);
        const messages = buildAdvisorPrompt({ state: base.state, input, history, message });
        const res = await llm.call({ settings, messages, maxTokens: settings.maxTokens });
        if (host.getChatId() !== chatId) return null; // 等回复期间切换了聊天：丢弃，不写进别的聊天
        const reply = splitAdvisorReply(res.text);
        const entry = {
            role: 'assistant',
            text: reply.text || (reply.cards.length ? '' : '（参谋没有给出文字回复）'),
            cards: reply.cards,
            at: Date.now(),
        };
        await host.saveAdvisorLog([...host.getAdvisorLog(), entry]);
        return entry;
    } catch (error) {
        if (host.getChatId() === chatId) {
            const reason = String(error?.message ?? error);
            await host.saveAdvisorLog([...host.getAdvisorLog(), { role: 'assistant', text: '', cards: [], at: Date.now(), error: reason }]);
        }
        throw error;
    } finally {
        advisorBusy = false;
        notifyState();
    }
}

const api = {
    status: () => ({ ...status, scheduler: scheduler.status() }),
    onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },
    getState: () => currentBase().base.state,
    runNow: () => enqueueFor(host.lastAiFloor(), 'manual'),
    plan,
    adopt: (card, intensity) => editCurrentState(s => adoptPlan(s, card, intensity)),
    setGuideStatus: (threadId, value) => editCurrentState(s => setGuideStatus(s, threadId, value)),
    setGuideIntensity: (threadId, value) => editCurrentState(s => setGuideIntensity(s, threadId, value)),
    advanceBeat: threadId => editCurrentState(s => requireOp('advanceBeat')(s, threadId)),
    skipBeat: (threadId, index) => editCurrentState(s => requireOp('skipBeat')(s, threadId, index)),
    editState: editCurrentState,
    previewInjection: () => composeInjection(currentBase().base.state, host.getSettings()),
    onStateChanged(fn) { stateListeners.add(fn); return () => stateListeners.delete(fn); },
    getFloorInfo(floor) {
        const message = host.getChatView().getMessage(floor);
        const snap = message ? readSnapshot(message) : null;
        if (!snap) return null;
        return {
            status: snap.status,
            valid: isSnapshotValid(snap, message),
            error: snap.error,
            edited: snap.edited,
            signalCount: snap.state.signals.length,
            changedCharacters: snap.state.characters.filter(c => c.touchedRun === snap.state.runCount && snap.status === 'ok').map(c => c.name),
            createdAt: snap.createdAt,
            usage: snap.usage,
        };
    },
    advisor: {
        history: () => host.getAdvisorLog(),
        busy: () => advisorBusy,
        send: advisorSend,
        summarize: () => advisorSend('请把我们到目前为止的讨论整理成方案卡。'),
        /** 最后一条是失败回复时：删掉它，用它前面那条用户消息重新请求，不重复写入用户消息 */
        async retry() {
            const log = host.getAdvisorLog();
            const last = log[log.length - 1];
            const userIndex = last?.role === 'assistant' && last.error ? log.length - 2 : -1;
            const userEntry = log[userIndex];
            if (!userEntry || userEntry.role !== 'user') throw new Error('没有可以重试的消息。');
            await host.saveAdvisorLog(log.slice(0, userIndex + 1));
            notifyState();
            return advisorSend(userEntry.text, { history: log.slice(0, userIndex) });
        },
        async clear() {
            if (advisorBusy) throw new Error('参谋正在回复，请稍后再清空。');
            await host.saveAdvisorLog([]);
            notifyState();
        },
    },
    settings: {
        get: () => host.getSettings(),
        save(patch) {
            const merged = host.saveSettings(patch);
            refreshInjection();
            return merged;
        },
        listProfiles: () => host.listProfiles(),
        /** 直填 API：拉取模型列表，参数缺省时用当前设置里的地址和密钥 */
        fetchModels: (api) => llm.fetchModels(api ?? host.getSettings().api),
        /** 发一条很短的请求，确认地址、密钥、模型都可用；patch 可以先带上界面里还没保存的值 */
        async testApi(patch) {
            const base = host.getSettings();
            const settings = patch ? { ...base, ...patch, api: { ...base.api, ...(patch.api ?? {}) } } : base;
            const res = await llm.call({ settings, messages: [{ role: 'user', content: '请只回复两个字：收到' }], maxTokens: 16 });
            return { model: res.model, ms: res.ms, reply: res.text.trim().slice(0, 40) };
        },
        /** 推演用的模型是否已配置好（面板据此显示"需要先配置 API"） */
        isApiReady() {
            const s = host.getSettings();
            return s.api.mode === 'profile' ? !!s.profileId : !!(s.api.url.trim() && s.api.model.trim());
        },
    },
};

// ---------- 最小设置抽屉（第 2 批会换成完整面板） ----------

function renderSettings() {
    const root = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!root || document.getElementById('backstage_settings')) return;
    const settings = host.getSettings();
    const options = host.listProfiles()
        .map(p => `<option value="${p.id}" ${p.id === settings.profileId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
        .join('');

    root.insertAdjacentHTML('beforeend', `
<div id="backstage_settings" class="inline-drawer">
  <div class="inline-drawer-toggle inline-drawer-header"><b>${EXT_NAME}</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
  <div class="inline-drawer-content">
    <label class="checkbox_label"><input id="backstage_enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}> 启用后台推演</label>
    <label>推演用的连接 <select id="backstage_profile" class="text_pole"><option value="">（请选择）</option>${options}</select></label>
    <label>每层暗流上限 <input id="backstage_max_signals" class="text_pole" type="number" min="0" max="3" value="${settings.maxSignals}"></label>
    <label class="checkbox_label"><input id="backstage_memory" type="checkbox" ${settings.memory.enabled ? 'checked' : ''}> 读取数据库纪要</label>
    <div class="flex-container">
      <div id="backstage_run" class="menu_button">立即推演</div>
      <div id="backstage_preview" class="menu_button">查看注入内容</div>
    </div>
    <small id="backstage_status"></small>
  </div>
</div>`);

    const $ = id => document.getElementById(id);
    $('backstage_enabled').addEventListener('change', e => { host.saveSettings({ enabled: e.target.checked }); refreshInjection(); });
    $('backstage_profile').addEventListener('change', e => host.saveSettings({ profileId: e.target.value }));
    $('backstage_max_signals').addEventListener('change', e => { host.saveSettings({ maxSignals: Number(e.target.value) || 0 }); refreshInjection(); });
    $('backstage_memory').addEventListener('change', e => host.saveSettings({ memory: { enabled: e.target.checked } }));
    $('backstage_run').addEventListener('click', () => api.runNow() || globalThis.toastr?.info('还没有 AI 回复可以推演。', EXT_NAME));
    $('backstage_preview').addEventListener('click', () => {
        const p = api.previewInjection();
        const text = [p.undercurrent, p.guide].filter(Boolean).join('\n\n') || '（当前没有要注入的内容）';
        globalThis.SillyTavern.getContext().callGenericPopup?.(`<pre style="white-space:pre-wrap;text-align:left">${escapeHtml(text)}</pre>`, 1);
    });

    api.onStatus(s => {
        const el = $('backstage_status');
        if (!el) return;
        el.textContent = s.scheduler.running ? '推演中…'
            : s.lastError ? `上次推演失败：${s.lastError}`
            : s.lagging ? '推演落后一轮（最新回复还没有推演结果）'
            : s.lastRunAt ? '已是最新' : '';
    });
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ---------- 界面挂载 ----------

async function mountUi() {
    try {
        const ui = await import('./src/ui/panel.js');
        ui.mountPanel(api);
        ui.mountSettings(api);
    } catch (error) {
        // 面板模块还没完成或加载失败：退回最小设置抽屉，核心功能不受影响
        console.warn(LOG_PREFIX, '面板加载失败，使用简易设置', error);
        renderSettings();
    }
}

// ---------- 启动 ----------

function init() {
    host.onHostEvents({
        onReplyFinalized: e => {
            // API 没配置好时不自动推演（否则每轮都失败、弹提示），面板状态会提示去配置
            if (host.getSettings().enabled && api.settings.isApiReady()) enqueueFor(e.floor, 'reply');
        },
        onGenerationStarting: e => refreshInjection(e),
        onChanged: () => refreshInjection(),
        onChatChanged: () => {
            scheduler.cancelAll();
            inject.clear();
            refreshInjection();
        },
    });
    globalThis.Backstage = api;
    mountUi();
    refreshInjection();
    console.info(LOG_PREFIX, `已加载（数据键 ${STORE_KEY}）`);
}

try {
    init();
} catch (error) {
    console.error(LOG_PREFIX, '初始化失败', error);
}
