// 用连接管理器里的独立连接调用模型，不经过主聊天的生成流程。

/** @typedef {import('../types.js').ChatMessage} ChatMessage */

/**
 * @param {{ profileId: string, messages: ChatMessage[], maxTokens: number, signal?: AbortSignal }} args
 * @returns {Promise<{ text: string, model: string, ms: number }>}
 */
export async function call({ profileId, messages, maxTokens, signal }) {
    if (!profileId) throw new Error('还没有选择推演用的连接，请在「幕后」设置里选择一个连接配置。');

    const c = globalThis.SillyTavern.getContext();
    const service = c.ConnectionManagerRequestService;
    if (!service?.sendRequest) throw new Error('当前宿主没有连接管理器接口，无法独立调用模型。');

    const profile = (c.extensionSettings?.connectionManager?.profiles ?? []).find(p => String(p.id) === profileId);
    if (!profile) throw new Error('选择的连接配置已不存在，请重新选择。');

    const started = Date.now();
    let result;
    try {
        result = await service.sendRequest(profileId, messages, maxTokens, {
            stream: false,
            signal: signal ?? null,
            extractData: true,
            includePreset: false,
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        const cause = error?.cause?.message || error?.message || String(error);
        throw new Error(`模型请求失败：${cause}`);
    }

    const text = typeof result === 'string' ? result : String(result?.content ?? '');
    if (!text.trim()) throw new Error('模型返回了空内容。');
    return { text, model: String(profile.model ?? ''), ms: Date.now() - started };
}
