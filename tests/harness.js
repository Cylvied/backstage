// 迷你测试框架（仅组长可修改）。
// 本机没有 Node，测试用 macOS 自带的 JavaScriptCore（jsc）运行：tests/run.sh
// 写法和 node:test 基本一致：
//   import { test, assert } from '../harness.js';
//   test('名字', () => { assert.equal(1, 1); });
// 支持 async 测试函数。

// ---- jsc 缺少的几个全局对象，补最小实现（只供测试用）----
if (typeof globalThis.console === 'undefined') {
    const out = (...args) => globalThis.print(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    globalThis.console = { log: out, info: out, debug: () => {}, warn: out, error: out };
}
if (typeof globalThis.structuredClone === 'undefined') {
    globalThis.structuredClone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
}
if (typeof globalThis.AbortController === 'undefined') {
    class AbortSignalShim {
        constructor() { this.aborted = false; this.reason = undefined; this._listeners = []; }
        addEventListener(type, fn) { if (type === 'abort') this._listeners.push(fn); }
        removeEventListener(type, fn) { this._listeners = this._listeners.filter(l => l !== fn); }
        throwIfAborted() { if (this.aborted) throw this.reason; }
    }
    globalThis.AbortController = class {
        constructor() { this.signal = new AbortSignalShim(); }
        abort(reason) {
            if (this.signal.aborted) return;
            this.signal.aborted = true;
            this.signal.reason = reason ?? new Error('AbortError');
            for (const fn of this.signal._listeners) fn({ type: 'abort' });
        }
    };
}

// ---- 断言 ----
class AssertionError extends Error {}

function fail(message, actual, expected) {
    const detail = arguments.length > 1 ? `\n  实际：${show(actual)}\n  期望：${show(expected)}` : '';
    throw new AssertionError(`${message}${detail}`);
}

function show(value) {
    try { return JSON.stringify(value); } catch { return String(value); }
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((acc, key) => { acc[key] = stable(value[key]); return acc; }, {});
    }
    return value;
}

export const assert = {
    ok(value, message = '期望为真') { if (!value) fail(message, value, true); },
    equal(actual, expected, message = '值不相等') { if (!Object.is(actual, expected)) fail(message, actual, expected); },
    notEqual(actual, expected, message = '值不应相等') { if (Object.is(actual, expected)) fail(message, actual, expected); },
    deepEqual(actual, expected, message = '结构不相等') {
        if (show(stable(actual)) !== show(stable(expected))) fail(message, actual, expected);
    },
    match(text, regex, message = '不匹配') { if (!regex.test(String(text))) fail(message, text, String(regex)); },
    doesNotMatch(text, regex, message = '不应匹配') { if (regex.test(String(text))) fail(message, text, String(regex)); },
    throws(fn, message = '期望抛出异常') {
        try { fn(); } catch { return; }
        fail(message);
    },
    async rejects(fn, message = '期望 Promise 被拒绝') {
        try { await fn(); } catch { return; }
        fail(message);
    },
};

// ---- 读取样本 ----

/**
 * 读取 tests/fixtures/ 下的文件（路径相对 fixtures 目录），例如 readFixture('states/wuxia.json')。
 * jsc 提供全局 read()；tests/run.sh 会设置 globalThis.__FIXTURES__ 为 fixtures 目录的绝对路径。
 * @param {string} path
 * @returns {string}
 */
export function readFixture(path) {
    if (typeof globalThis.read !== 'function' || !globalThis.__FIXTURES__) {
        throw new Error('readFixture 只能在 tests/run.sh 中使用');
    }
    return globalThis.read(`${globalThis.__FIXTURES__}/${path}`);
}

/** @param {string} path */
export function readFixtureJson(path) {
    return JSON.parse(readFixture(path));
}

// ---- 注册与运行 ----
const tests = [];

/**
 * @param {string} name
 * @param {() => (void|Promise<void>)} fn
 */
export function test(name, fn) {
    tests.push({ name, fn });
}

/** 由 tests/run.sh 生成的入口调用。返回失败数。 */
export async function run(fileLabel) {
    let failed = 0;
    for (const { name, fn } of tests) {
        try {
            await fn();
            globalThis.print(`  ✓ ${name}`);
        } catch (error) {
            failed++;
            globalThis.print(`  ✗ ${name}\n    ${String(error?.message ?? error).replace(/\n/g, '\n    ')}`);
        }
    }
    globalThis.print(`${failed ? 'FAIL' : 'PASS'} ${fileLabel}（${tests.length - failed}/${tests.length}）`);
    return failed;
}
