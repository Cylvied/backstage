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
 * @param {'c'|'t'|'s'} prefix
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
    };
}
