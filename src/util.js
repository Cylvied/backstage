// 通用小工具（仅组长可修改）。纯函数，不访问宿主。

import { SCHEMA_VERSION } from './constants.js';

/**
 * FNV-1a 32 位 hash，返回 8 位十六进制。用于判断正文有没有变，不用于安全。
 * @param {string} text
 * @returns {string}
 */
export function hashText(text) {
    let hash = 0x811c9dc5;
    const str = String(text ?? '');
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * @param {'c'|'t'|'s'|'e'} prefix
 * @returns {string}
 */
export function shortId(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    const time = Date.now().toString(36).slice(-4);
    return `${prefix}_${time}${rand}`;
}

/**
 * @param {number} n
 * @param {number} min
 * @param {number} max
 */
export function clamp(n, min, max) {
    const value = Number.isFinite(n) ? n : min;
    return Math.min(max, Math.max(min, value));
}

/** @returns {import('./types.js').SimState} */
export function emptyState() {
    return {
        schemaVersion: SCHEMA_VERSION,
        clock: { day: 1, slot: '', precision: 'unknown' },
        protagonist: { location: '', reachable: true },
        characters: [],
        threads: [],
        signals: [],
        runCount: 0,
        chronicle: [],
        loreWanted: [],
    };
}

/**
 * 程序盖戳：按当前 clock 生成 Stamp。
 * @param {import('./types.js').Clock} clock
 * @returns {import('./types.js').Stamp}
 */
export function stampOf(clock) {
    return { day: Number.isInteger(clock?.day) ? clock.day : null, slot: String(clock?.slot ?? '') };
}

/**
 * 给模型看的"始于何时、已过多久"。
 * @param {import('./types.js').Stamp|undefined|null} since
 * @param {import('./types.js').Clock} clock
 * @returns {string} 例如"始于第 3 天傍晚，至今已过 2 天"；开始时间不明时返回"开始时间不明"
 */
export function elapsedText(since, clock) {
    if (!since || !Number.isInteger(since.day)) return '开始时间不明';
    const at = `第 ${since.day} 天${since.slot ? since.slot : ''}`;
    const days = Number.isInteger(clock?.day) ? clock.day - since.day : null;
    if (days === null) return `始于${at}`;
    if (days <= 0) return `始于${at}，就在今天`;
    return `始于${at}，至今已过 ${days} 天`;
}
