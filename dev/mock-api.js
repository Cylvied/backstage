// 开发预览用的模拟 api：形状与 index.js 的 api 一致（INTERFACES 5.10），
// 数据取自 tests/fixtures/states/*.json，注入与采纳直接用项目里的真实纯函数。

import { DEFAULT_SETTINGS } from '../src/constants.js';
import { emptyState } from '../src/util.js';
import { composeInjection } from '../src/inject/compose.js';
import { adoptPlan, setGuideStatus, setGuideIntensity, advanceBeat, skipBeat } from '../src/sim/apply.js';
import { seedStagedGuide } from './mock-beats.js';
import * as advisor from './mock-advisor.js';
import { parsePlanOutput } from '../src/sim/parse.js';

const FIXTURES = '../tests/fixtures';

/**
 * @param {{ fixture: string, status: string, plan: string, saveFails: boolean, advisor: string, guide: string, apiTest: string, profiles: string, orphans: string, skips: string }} opts
 */
export async function createMockApi(opts) {
    let state = opts.fixture === 'empty'
        ? emptyState()
        : await (await fetch(`${FIXTURES}/states/${opts.fixture}.json`)).json();
    if (opts.guide === 'staged' || opts.guide === 'reached') state = seedStagedGuide(state, opts.guide === 'reached');
    // orphans=1：加两条没挂在暗线或人物上的迹象（注入时会被过滤掉）
    if (opts.orphans === '1') {
        state.signals = [...state.signals,
            { voice: 'here', text: '窗外忽然下起雨，走廊里一阵脚步声', threadId: null, characterId: null, relevance: 3 },
            { voice: 'rumor', text: '听说隔壁班有人转学了', threadId: 't_gone00', characterId: null, relevance: 2 }];
    }
    // skips=1：能挂靠但没选上的迹象（超过上限、第二条暗流），外加主角隔绝时被剔除的风闻
    if (opts.skips === '1' && state.threads.length) {
        const [t1, t2 = t1] = state.threads;
        state.protagonist = { ...state.protagonist, reachable: false };
        state.signals = [...state.signals,
            { voice: 'rumor', text: '有人在传，说这事上面早就知道了', threadId: t1.id, characterId: null, relevance: 3 },
            { voice: 'undercurrent', text: '另一头也有人在暗中盘算', threadId: t2.id, characterId: null, relevance: 2 },
            { voice: 'here', text: '桌上多了一张没署名的便条', threadId: t1.id, characterId: null, relevance: 1 },
            { voice: 'here', text: '走廊尽头的灯坏了一盏', threadId: t2.id, characterId: null, relevance: 1 }];
    }
    // 模拟 apply 给迹象盖的产生轮次：样本里没有的，前一半算上一轮、后一半算这一轮
    state.signals = state.signals.map((s, i, all) => ({ bornRun: Math.max(1, state.runCount - (i < all.length / 2 ? 1 : 0)), ...s }));
    let settings = structuredClone(DEFAULT_SETTINGS);

    // 参谋记录按聊天分开存，模拟"跟着聊天走"；预览页的 devSwitchChat() 在两个聊天间切换
    let chatId = 'A';
    const logs = { A: opts.advisor === 'multi' ? advisor.multiTurnHistory(state) : [], B: [] };
    let busy = false;
    // status=setup 模拟刚装好、什么都没填；其他情况预填一个直填 API
    if (opts.status !== 'setup') {
        settings.api = { mode: 'direct', url: 'https://generativelanguage.googleapis.com/v1beta/openai', key: 'AIza-preview-not-a-real-key', model: 'gemini-2.5-flash' };
    }
    settings.enabled = opts.status !== 'off';

    const statusListeners = new Set();
    const stateListeners = new Set();
    const status = {
        lagging: opts.status === 'lagging',
        lastError: opts.status === 'failed' ? '请求超时（30 秒内没有收到回复）' : null,
        lastRunAt: Date.now() - 60000,
        scheduler: { running: opts.status === 'running' ? { floor: 7 } : null, queued: 0, lastError: null },
    };
    const emitStatus = () => statusListeners.forEach(fn => fn(structuredClone(status)));
    const emitState = () => stateListeners.forEach(fn => fn());

    const commit = async next => {
        await delay(120);
        if (opts.saveFails) throw new Error('保存失败：最后一条回复可能刚被修改或切换了。');
        state = next;
        emitState();
        return state;
    };

    const planCasesUrl = `${FIXTURES}/model-outputs/plan/cases.json`;

    return {
        status: () => structuredClone(status),
        onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },
        getState: () => state,
        onStateChanged(fn) { stateListeners.add(fn); return () => stateListeners.delete(fn); },
        runNow() {
            status.scheduler.running = { floor: 7 };
            emitStatus();
            setTimeout(() => {
                status.scheduler.running = null;
                status.lagging = false;
                status.lastError = null;
                status.lastRunAt = Date.now();
                emitStatus();
                emitState();
            }, 1500);
            return true;
        },
        async plan(request) {
            await delay(opts.plan === 'slow' ? 60000 : 900);
            if (opts.plan === 'fail') throw new Error('规划结果无法解析：没有找到 JSON 代码块');
            if (opts.plan === 'empty') return [];
            const cases = await (await fetch(planCasesUrl)).json();
            const hit = cases.find(c => c.file.startsWith('ok-') && c.basedOn === `states/${opts.fixture}.json`) ?? cases.find(c => c.file === 'ok-01.txt');
            const text = await (await fetch(`${FIXTURES}/model-outputs/plan/${hit.file}`)).text();
            const parsed = parsePlanOutput(text);
            if (!parsed.ok) throw new Error(parsed.error);
            console.debug('[Backstage preview] plan request:', request);
            return parsed.cards;
        },
        adopt: (card, intensity) => commit(adoptPlan(state, card, intensity)),
        advanceBeat: id => commit(advanceBeat(state, id)),
        skipBeat: (id, index) => commit(skipBeat(state, id, index)),
        setGuideStatus: (id, value) => commit(setGuideStatus(state, id, value)),
        setGuideIntensity: (id, value) => commit(setGuideIntensity(state, id, value)),
        async editState(mutate) {
            const next = mutate(structuredClone(state));
            if (next === state) throw new Error('mutate 返回了原对象');
            return commit(next);
        },
        previewInjection: () => composeInjection(state, settings),
        getFloorInfo(floor) {
            // state：这一层的推演状态（接口变更提议中的字段）；预览里各层都用当前状态
            const base = { error: null, edited: false, signalCount: state.signals.length, changedCharacters: [], createdAt: Date.now(), usage: { model: 'mock', ms: 3200 }, state };
            switch (floor) {
                case 1: return { ...base, status: 'ok', valid: true, changedCharacters: state.characters.slice(0, 2).map(c => c.name) };
                case 3: return { ...base, status: 'failed', valid: true, error: '模型输出无法解析：缺少 signals' };
                case 5: return { ...base, status: 'ok', valid: true, edited: true };
                case 7: return { ...base, status: 'ok', valid: false };
                default: return null;
            }
        },
        advisor: {
            history: () => logs[chatId],
            busy: () => busy,
            async send(text, { retry = false } = {}) {
                const message = String(text ?? '').trim();
                if (!message) throw new Error('请先输入想和参谋聊的内容。');
                if (busy) throw new Error('参谋还在回复上一条消息。');
                const from = chatId;
                if (!retry) logs[from] = [...logs[from], { role: 'user', text: message, cards: [], at: Date.now() }];
                busy = true;
                emitState();
                await delay(opts.advisor === 'slow' ? 60000 : 1200);
                busy = false;
                if (chatId !== from) { emitState(); return null; }
                const r = advisor.reply(message, state, opts.advisor === 'fail');
                if (!r) {
                    const reason = '请求超时（30 秒内没有收到回复）';
                    logs[from] = [...logs[from], { role: 'assistant', text: '', cards: [], at: Date.now(), error: reason }];
                    emitState();
                    throw new Error(reason);
                }
                const entry = { role: 'assistant', text: r.text, cards: r.cards, at: Date.now() };
                logs[from] = [...logs[from], entry];
                emitState();
                return entry;
            },
            summarize() { return this.send('请把我们到目前为止的讨论整理成方案卡。'); },
            /** 同 index.js：删掉最后一条失败回复，用前面那条用户消息重新请求，不重复写入用户消息 */
            async retry() {
                const log = logs[chatId];
                const last = log.at(-1);
                const user = last?.role === 'assistant' && last.error ? log.at(-2) : null;
                if (!user || user.role !== 'user') throw new Error('没有可以重试的消息。');
                logs[chatId] = log.slice(0, -1);
                emitState();
                return this.send(user.text, { retry: true });
            },
            async clear() {
                if (busy) throw new Error('参谋正在回复，请稍后再清空。');
                logs[chatId] = [];
                emitState();
            },
        },
        /** 仅预览用：切换到另一个聊天 */
        devSwitchChat() {
            chatId = chatId === 'A' ? 'B' : 'A';
            emitState();
            return chatId;
        },
        settings: {
            get: () => settings,
            save(patch) {
                settings = {
                    ...settings,
                    ...patch,
                    memory: { ...settings.memory, ...(patch.memory ?? {}) },
                    api: { ...settings.api, ...(patch.api ?? {}) },
                };
                emitStatus();
                emitState();
                return settings;
            },
            listProfiles: () => (opts.profiles === '0' ? [] : [{ id: 'p_cheap', name: 'Gemini Flash（推演用）' }, { id: 'p_main', name: 'Gemini Pro（正文）' }]),
            // 以下三个同 index.js（v1.4）；apiTest=fail 时获取模型和测试连接都失败
            async fetchModels(a) {
                const cur = a ?? settings.api;
                await delay(600);
                if (!cur.url?.trim()) throw new Error('请先填写 API 地址。');
                if (opts.apiTest === 'fail') throw new Error('获取模型失败：HTTP 401（密钥不对或没有权限）');
                return MODELS;
            },
            async testApi(patch) {
                const merged = patch ? { ...settings, ...patch, api: { ...settings.api, ...(patch.api ?? {}) } } : settings;
                await delay(800);
                if (merged.api.mode === 'profile') {
                    if (!merged.profileId) throw new Error('还没有选择连接配置。');
                } else {
                    if (!merged.api.url.trim()) throw new Error('请先填写 API 地址。');
                    if (!merged.api.model.trim()) throw new Error('请先填写模型。');
                }
                if (opts.apiTest === 'fail') throw new Error('HTTP 401：API key not valid. Please pass a valid API key.');
                return { model: merged.api.mode === 'profile' ? 'gemini-2.5-flash（连接配置）' : merged.api.model, ms: 1240, reply: '收到' };
            },
            isApiReady() {
                return settings.api.mode === 'profile' ? !!settings.profileId : !!(settings.api.url.trim() && settings.api.model.trim());
            },
        },
    };
}

const MODELS = [
    'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite',
    'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-embedding-001', 'gemma-3-27b-it', 'learnlm-2.0-flash-experimental',
];

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
