export const MEMO_NAME_PATTERN = /^TavernDB-ACU-CustomExport-纪要-\d+$/i;

function tokenize(text) {
    const tokens = new Set();
    for (const match of text.toLowerCase().matchAll(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu)) {
        const word = match[0];
        if (/^\p{Script=Han}+$/u.test(word)) {
            const chars = Array.from(word);
            if (chars.length === 1) tokens.add(word);
            for (let i = 0; i < chars.length - 1; i++) tokens.add(chars[i] + chars[i + 1]);
        } else {
            tokens.add(word);
        }
    }
    return tokens;
}

/**
 * 无命中时不凭空召回；同分保持世界书原顺序。
 * @param {Array<{name: string, content: string, keys: string[]}>} entries
 * @param {string} query
 * @param {number} limit
 * @returns {string[]}
 */
export function pickMemos(entries, query, limit) {
    if (!Array.isArray(entries) || typeof query !== 'string' || !Number.isFinite(limit) || limit < 1) return [];
    const wanted = tokenize(query);
    if (!wanted.size) return [];
    const ranked = [];
    entries.forEach((entry, index) => {
        if (!entry || typeof entry.name !== 'string' || !MEMO_NAME_PATTERN.test(entry.name)
            || typeof entry.content !== 'string' || !entry.content.trim()) return;
        const body = tokenize(entry.content);
        const keys = tokenize(Array.isArray(entry.keys) ? entry.keys.filter(x => typeof x === 'string').join(' ') : '');
        let score = 0;
        for (const token of wanted) {
            if (body.has(token)) score++;
            if (keys.has(token)) score += 2;
        }
        if (score > 0) ranked.push({ content: entry.content, score, index });
    });
    ranked.sort((a, b) => b.score - a.score || a.index - b.index);
    return [...new Set(ranked.map(entry => entry.content))].slice(0, Math.floor(limit));
}
