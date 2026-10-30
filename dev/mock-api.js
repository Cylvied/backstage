// 开发预览用的模拟 api：形状与 index.js 的 api 一致（INTERFACES 5.10），
// 数据取自 tests/fixtures/states/*.json，注入与采纳直接用项目里的真实纯函数。

import { DEFAULT_SETTINGS } from '../src/constants.js';
import { emptyState } from '../src/util.js';
import { composeInjection } from '../src/inject/compose.js';
import { adoptPlan, setGuideStatus, setGuideIntensity } from '../src/sim/apply.js';
import { parsePlanOutput } from '../src/sim/parse.js';

const FIXTURES = '../tests/fixtures';

/**
 * @param {{ fixture: string, status: string, plan: string, saveFails: boolean }} opts
 */
export async function createMockApi(opts) {
    let state = opts.fixture === 'empty'
        ? emptyState()
        : await (await fetch(`${FIXTURES}/states/${opts.fixture}.json`)).json();
    let settings = structuredClone(DEFAULT_SETTINGS);
    settings.profileId = opts.status === 'setup' ? '' : 'p_cheap';
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
        setGuideStatus: (id, value) => commit(setGuideStatus(state, id, value)),
        setGuideIntensity: (id, value) => commit(setGuideIntensity(state, id, value)),
        async editState(mutate) {
            const next = mutate(structuredClone(state));
            if (next === state) throw new Error('mutate 返回了原对象');
            return commit(next);
        },
        previewInjection: () => composeInjection(state, settings),
        getFloorInfo(floor) {
            const base = { error: null, edited: false, signalCount: state.signals.length, changedCharacters: [], createdAt: Date.now(), usage: { model: 'mock', ms: 3200 } };
            switch (floor) {
                case 1: return { ...base, status: 'ok', valid: true, changedCharacters: state.characters.slice(0, 2).map(c => c.name) };
                case 3: return { ...base, status: 'failed', valid: true, error: '模型输出无法解析：缺少 signals' };
                case 5: return { ...base, status: 'ok', valid: true, edited: true };
                case 7: return { ...base, status: 'ok', valid: false };
                default: return null;
            }
        },
        settings: {
            get: () => settings,
            save(patch) {
                settings = { ...settings, ...patch, memory: { ...settings.memory, ...(patch.memory ?? {}) } };
                emitStatus();
                emitState();
                return settings;
            },
            listProfiles: () => [{ id: 'p_cheap', name: 'Gemini Flash（推演用）' }, { id: 'p_main', name: 'Gemini Pro（正文）' }],
        },
    };
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
