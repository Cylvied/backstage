// 跟随宿主明暗：先看宿主主题色（--SmartThemeBlurTintColor），再看 body 背景，最后用系统偏好兜底。

import { isDarkColor } from './format.js';

/** @returns {'light'|'dark'} */
export function detectTheme() {
    const root = getComputedStyle(document.documentElement);
    const candidates = [
        root.getPropertyValue('--SmartThemeBlurTintColor'),
        getComputedStyle(document.body).backgroundColor,
    ];
    for (const color of candidates) {
        const dark = isDarkColor(color);
        if (dark !== null) return dark ? 'dark' : 'light';
    }
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * 主题变化时回调（宿主换主题会改 html/body 的 style 或 class）。
 * @param {(theme: 'light'|'dark') => void} fn
 */
export function watchTheme(fn) {
    let last = detectTheme();
    fn(last);
    const check = () => {
        const now = detectTheme();
        if (now !== last) fn(last = now);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', check);
}

const themed = new Set();
let current = /** @type {'light'|'dark'|null} */ (null);

/**
 * 登记一个使用插件配色的根元素（面板、设置抽屉、角标），主题变化时同步 data-bs-theme。
 * @param {HTMLElement} el
 */
export function registerThemed(el) {
    if (current === null) {
        watchTheme(next => {
            current = next;
            for (const item of themed) item.dataset.bsTheme = next;
        });
    }
    themed.add(el);
    el.dataset.bsTheme = current;
}

/** 元素移除后不再跟踪 */
export function unregisterThemed(el) {
    themed.delete(el);
}
