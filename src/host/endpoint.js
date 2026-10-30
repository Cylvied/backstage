// 直填 API 的地址规范化。纯函数，不访问宿主。
//
// 宿主的 custom 源会在 custom_url 后面自己拼 /chat/completions（发请求）和 /models（拉模型列表），
// 所以这里要把用户填的各种写法统一成"基础地址"。

/**
 * @param {string} input 用户填的地址
 * @returns {string} 基础地址；空输入返回空串
 *
 * 规则：
 * - 去掉首尾空白和结尾的斜杠
 * - 结尾是 /chat/completions 或 /models 的，去掉这一段
 * - 只有域名、没有任何路径的（如 https://api.example.com），补上 /v1
 * - 其余原样保留（如 .../v1、.../v1beta/openai、.../api/paas/v4）
 */
export function normalizeBaseUrl(input) {
    let url = String(input ?? '').trim().replace(/\/+$/, '');
    if (!url) return '';
    url = url.replace(/\/chat\/completions$/i, '').replace(/\/models$/i, '').replace(/\/+$/, '');
    const match = url.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
    if (match && !match[2]) url += '/v1';
    return url;
}

/**
 * 从宿主 /status 返回里取模型 id 列表。兼容 { data: [...] }、{ models: [...] } 和直接数组。
 * @param {unknown} data
 * @returns {string[]}
 */
export function extractModelIds(data) {
    const list = Array.isArray(data) ? data
        : Array.isArray(data?.data) ? data.data
        : Array.isArray(data?.models) ? data.models
        : [];
    const ids = list
        .map(item => (typeof item === 'string' ? item : item?.id ?? item?.name ?? ''))
        .map(id => String(id).replace(/^models\//, '').trim())
        .filter(Boolean);
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}
