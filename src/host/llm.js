// 独立调用模型，不经过主聊天的生成流程。两种方式：
// - direct：在插件里直填 API 地址、密钥、模型，由酒馆后端的 custom 源转发（无浏览器跨域问题）
// - profile：使用连接管理器里保存的连接配置

import { normalizeBaseUrl, extractModelIds } from './endpoint.js';

/** @typedef {import('../types.js').ChatMessage} ChatMessage */
/** @typedef {import('../types.js').Settings} Settings */

function ctx() {
    return globalThis.SillyTavern.getContext();
}

/** 密钥放在自定义请求头里，宿主会把它覆盖在默认的 Authorization 之后 */
function directPayloadBase(api) {
    return {
        chat_completion_source: 'custom',
        custom_url: normalizeBaseUrl(api.url),
        custom_include_headers: JSON.stringify(api.key ? { Authorization: `Bearer ${api.key}` } : {}),
    };
}

/**
 * @param {Settings['api']} api
 * @param {ChatMessage[]} messages
 * @param {number} maxTokens
 * @param {AbortSignal|undefined} signal
 */
async function callDirect(api, messages, maxTokens, signal) {
    if (!api.url?.trim()) throw new Error('还没有填写 API 地址，请在「幕后」设置里填写。');
    if (!api.model?.trim()) throw new Error('还没有填写模型名，请在「幕后」设置里填写或点「获取模型」选择。');
    const service = ctx().ChatCompletionService;
    if (typeof service?.processRequest !== 'function') throw new Error('当前宿主不支持插件直连 API，请改用连接配置。');

    const payload = {
        ...directPayloadBase(api),
        model: api.model.trim(),
        messages,
        max_tokens: maxTokens,
        stream: false,
    };
    const result = await service.processRequest(payload, { presetName: undefined }, true, signal ?? null);
    return { text: String(result?.content ?? ''), model: api.model.trim() };
}

async function callProfile(profileId, messages, maxTokens, signal) {
    if (!profileId) throw new Error('还没有选择推演用的连接配置，请在「幕后」设置里选择，或改用直填 API。');
    const c = ctx();
    const service = c.ConnectionManagerRequestService;
    if (!service?.sendRequest) throw new Error('当前宿主没有连接管理器接口，请改用直填 API。');
    const profile = (c.extensionSettings?.connectionManager?.profiles ?? []).find(p => String(p.id) === profileId);
    if (!profile) throw new Error('选择的连接配置已不存在，请重新选择。');
    const result = await service.sendRequest(profileId, messages, maxTokens, {
        stream: false, signal: signal ?? null, extractData: true, includePreset: false,
    });
    return { text: typeof result === 'string' ? result : String(result?.content ?? ''), model: String(profile.model ?? '') };
}

/**
 * @param {{ settings: Settings, messages: ChatMessage[], maxTokens: number, signal?: AbortSignal }} args
 * @returns {Promise<{ text: string, model: string, ms: number }>}
 */
export async function call({ settings, messages, maxTokens, signal }) {
    const started = Date.now();
    let out;
    try {
        out = settings.api.mode === 'profile'
            ? await callProfile(settings.profileId, messages, maxTokens, signal)
            : await callDirect(settings.api, messages, maxTokens, signal);
    } catch (error) {
        if (signal?.aborted) throw error;
        const cause = error?.cause?.message || error?.message || String(error);
        throw new Error(cause.startsWith('还没有') || cause.startsWith('当前宿主') || cause.startsWith('选择的')
            ? cause : `模型请求失败：${cause}`);
    }
    if (!out.text.trim()) throw new Error('模型返回了空内容。');
    return { ...out, ms: Date.now() - started };
}

/**
 * 通过宿主后端拉取直填 API 的模型列表。
 * @param {{ url: string, key: string }} api
 * @returns {Promise<string[]>}
 */
export async function fetchModels(api) {
    if (!api.url?.trim()) throw new Error('请先填写 API 地址。');
    const c = ctx();
    const res = await fetch('/api/backends/chat-completions/status', {
        method: 'POST',
        headers: c.getRequestHeaders(),
        body: JSON.stringify(directPayloadBase(api)),
    });
    if (!res.ok) throw new Error(`获取模型失败：HTTP ${res.status}`);
    const data = await res.json();
    if (data?.error) throw new Error(`获取模型失败：${typeof data.error === 'string' ? data.error : '请检查地址和密钥'}`);
    const ids = extractModelIds(data);
    if (!ids.length) throw new Error('获取到的模型列表是空的，可以直接手动填写模型名。');
    return ids;
}
