import { CLOCK_PRECISIONS, INTENSITIES, LIMITS, LIVES, LOG_PREFIX,
    LONG_ACTION_STATUSES, THREAD_STAGES, VISIBILITIES, VOICES } from '../constants.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const warn = label => console.warn(`${LOG_PREFIX} 丢弃无效${label}`);
const strings = value => Array.isArray(value) && value.every(x => typeof x === 'string');

// 只处理字符串外的尾逗号，避免改动模型正文中的标点。
function parseJson(text) {
    let clean = '';
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (!quoted && char === ',' && /^[\s]*[}\]]/.test(text.slice(i + 1))) continue;
        clean += char;
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
    }
    try { return JSON.parse(clean); } catch { return null; }
}

function firstObject(text) {
    const start = text.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === '{') depth++;
        else if (char === '}' && --depth === 0) return parseJson(text.slice(start, i + 1));
    }
    return null;
}

/** @param {string} text @returns {unknown|null} */
export function extractJsonBlock(text) {
    if (typeof text !== 'string') return null;
    const clean = text.replace(/<(think|thinking)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');
    const blocks = [...clean.matchAll(/```json\s*([\s\S]*?)```/gi)];
    if (blocks.length) {
        for (const block of blocks) {
            const parsed = parseJson(block[1].trim());
            if (parsed !== null) return parsed;
        }
        return null;
    }
    return firstObject(clean);
}

function fields(value, rules) {
    if (!object(value)) throw new Error('对象格式错误');
    const result = {};
    for (const [key, check] of Object.entries(rules)) {
        if (!has(value, key)) continue;
        if (!check(value[key])) throw new Error(`字段 ${key} 格式错误`);
        result[key] = structuredClone(value[key]);
    }
    return result;
}

const string = value => typeof value === 'string';
const boolean = value => typeof value === 'boolean';
const nullableString = value => value === null || string(value);
const enumeration = values => value => values.includes(value);

function action(value, long = false) {
    if (value === null) return null;
    if (!object(value) || !string(value.text) || !string(value.duration)
        || (long && (!LONG_ACTION_STATUSES.includes(value.status) || !nullableString(value.outcome)))) {
        throw new Error('行动格式错误');
    }
    return long ? { text: value.text, duration: value.duration, status: value.status, outcome: value.outcome }
        : { text: value.text, duration: value.duration };
}

function character(value) {
    const result = fields(value, {
        id: nullableString, name: string, aliases: strings, location: string, knows: strings,
        life: enumeration(LIVES), onStage: boolean,
    });
    if (result.id == null || !result.id.trim()) delete result.id;
    if ((!result.id && !result.name?.trim()) || (has(result, 'name') && !result.name.trim())) {
        throw new Error('缺少人物名称');
    }
    if (result.knows) result.knows = result.knows.slice(0, LIMITS.knows);
    if (has(value, 'currentAction')) result.currentAction = action(value.currentAction);
    if (has(value, 'longAction')) result.longAction = action(value.longAction, true);
    return result;
}

function thread(value) {
    const result = fields(value, {
        id: nullableString, title: string, characterIds: strings, stage: enumeration(THREAD_STAGES),
        trigger: string, visibility: enumeration(VISIBILITIES),
    });
    if (result.id == null || !result.id.trim()) delete result.id;
    if ((!result.id && !result.title?.trim()) || (has(result, 'title') && !result.title.trim())) {
        throw new Error('缺少线索标题');
    }
    if (has(value, 'deadline')) {
        if (value.deadline === null) result.deadline = null;
        else {
            if (!object(value.deadline) || !string(value.deadline.text) || !string(value.deadline.missedOutcome)) {
                throw new Error('期限格式错误');
            }
            result.deadline = { text: value.deadline.text, missedOutcome: value.deadline.missedOutcome };
        }
    }
    return result;
}

function signal(value) {
    if (!object(value) || !VOICES.includes(value.voice) || !string(value.text) || !value.text.trim()
        || ![1, 2, 3].includes(value.relevance) || !nullableString(value.threadId) || !nullableString(value.characterId)
        || (has(value, 'eventId') && !nullableString(value.eventId))) {
        throw new Error('迹象格式错误');
    }
    return { voice: value.voice, text: Array.from(value.text).slice(0, LIMITS.signalText).join(''),
        threadId: value.threadId, characterId: value.characterId, relevance: value.relevance,
        ...(has(value, 'eventId') ? { eventId: value.eventId } : {}) };
}

function rows(value, parse, label) {
    const result = [];
    for (const row of value) {
        try { result.push(parse(row)); } catch { warn(label); }
    }
    return result;
}

/** @returns {{ok:true, patch:import('../types.js').SimPatch}|{ok:false,error:string}} */
export function parseSimOutput(text) {
    const value = extractJsonBlock(text);
    if (!object(value)) return { ok: false, error: '未找到完整的推演 JSON 对象' };
    const known = ['clock', 'protagonist', 'upsertCharacters', 'removeCharacterIds', 'upsertThreads', 'signals', 'noChange',
        'guideReached', 'addEvents', 'markKnown', 'loreRequests'];
    if (!known.some(key => has(value, key))) return { ok: false, error: '推演结果不含有效字段' };
    try {
        for (const key of ['upsertCharacters', 'removeCharacterIds', 'upsertThreads', 'signals', 'addEvents', 'markKnown', 'loreRequests']) {
            if (has(value, key) && !Array.isArray(value[key])) throw new Error(`${key} 必须是数组`);
        }
        if (has(value, 'noChange') && !boolean(value.noChange)) throw new Error('noChange 必须是布尔值');
        const clock = value.clock == null ? null : fields(value.clock, {
            day: day => Number.isInteger(day) && day >= 1, slot: string, precision: enumeration(CLOCK_PRECISIONS),
        });
        const protagonist = value.protagonist == null ? null : fields(value.protagonist, { location: string, reachable: boolean });
        const events = [];
        const eventIndices = new Map();
        for (const [index, event] of (value.addEvents ?? []).entries()) {
            try {
                if (!object(event) || !string(event.text)) throw new Error('事件缺少文本');
                const parsed = fields(event, { text: string, characterIds: strings, threadIds: strings });
                eventIndices.set(index, events.length);
                events.push(parsed);
            } catch { warn('事件'); }
        }
        const signals = rows(value.signals ?? [], signal, '迹象');
        for (const item of signals) {
            const match = /^new:(\d+)$/.exec(item.eventId);
            if (!match) continue;
            const index = eventIndices.get(Number(match[1]));
            // 无效引用保留为越界编号，交给程序检查生成可见的驳回记录。
            item.eventId = `new:${index ?? events.length}`;
        }
        return { ok: true, patch: {
            clock, protagonist,
            upsertCharacters: rows(value.upsertCharacters ?? [], character, '人物'),
            removeCharacterIds: (value.removeCharacterIds ?? []).filter(string),
            upsertThreads: rows(value.upsertThreads ?? [], thread, '线索'),
            signals,
            noChange: value.noChange ?? false,
            ...(boolean(value.guideReached) ? { guideReached: value.guideReached } : {}),
            ...(has(value, 'addEvents') ? { addEvents: events } : {}),
            ...(has(value, 'markKnown') ? { markKnown: value.markKnown.filter(string) } : {}),
            ...(has(value, 'loreRequests') ? { loreRequests: value.loreRequests.filter(string) } : {}),
        } };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

/** @returns {{ok:true,verdicts:Array<{id:string,ok:boolean,reason:string}>}|{ok:false,error:string}} */
export function parseReviewOutput(text) {
    const value = extractJsonBlock(text);
    if (!object(value) || !Array.isArray(value.verdicts)) return { ok: false, error: '审核结果缺少 verdicts 数组' };
    if (!value.verdicts.every(item => object(item) && string(item.id) && item.id.trim()
        && boolean(item.ok) && string(item.reason))) return { ok: false, error: '审核裁决字段格式错误' };
    return { ok: true, verdicts: value.verdicts.map(({ id, ok, reason }) => ({ id, ok, reason })) };
}

/** @returns {{ok:true,cards:import('../types.js').PlanCard[]}|{ok:false,error:string}} */
export function parsePlanOutput(text) {
    const value = extractJsonBlock(text);
    if (!object(value) || !Array.isArray(value.cards)) return { ok: false, error: '规划结果缺少 cards 数组' };
    const cards = rows(value.cards, card => {
        if (!object(card) || !['title', 'goal', 'firstSigns', 'fit'].every(key => string(card[key]) && card[key].trim())
            || !nullableString(card.threadId)) {
            throw new Error('规划卡格式错误');
        }
        const result = fields(card, { title: string, goal: string, firstSigns: string, fit: string, threadId: nullableString });
        const validIntensity = INTENSITIES.includes(card.suggestedIntensity);
        if (!validIntensity) console.warn(`${LOG_PREFIX} 规划建议强度无效，采用 normal`);
        result.suggestedIntensity = validIntensity ? card.suggestedIntensity : 'normal';
        if (has(card, 'beats')) {
            if (!Array.isArray(card.beats)) warn('分阶段拍列表');
            else {
                const beats = rows(card.beats, beat => {
                    if (!object(beat) || !['title', 'goal'].every(key => string(beat[key]) && beat[key].trim())
                        || (has(beat, 'firstSigns') && !string(beat.firstSigns))) throw new Error('拍格式错误');
                    return { title: beat.title, goal: beat.goal, firstSigns: beat.firstSigns ?? '' };
                }, '引导拍').slice(0, LIMITS.beatsMax);
                if (beats.length >= LIMITS.beatsMin) result.beats = beats;
            }
        }
        return result;
    }, '规划卡').slice(0, LIMITS.planCards);
    if (value.cards.length && !cards.length) return { ok: false, error: '没有通过校验的规划卡' };
    return { ok: true, cards };
}
