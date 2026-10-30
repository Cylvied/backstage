// 输入框左侧（#leftSendForm，扩展菜单按钮和选项按钮后面）的「幕后」按钮：点击开关面板。
// 按宿主惯例只插一个 fa 图标 div，尺寸和底色交给宿主或主题（Claude Web 主题会把它画成同样的圆形按钮）。
// #leftSendForm 可能晚于本扩展出现，也可能被宿主重建（连同外层整块替换）：找不到就等，按钮或容器被移除后重新挂上。

import { LOG_PREFIX } from '../constants.js';

const ID = 'backstage_composer_button';

/** @type {null | { sync: () => void, updateState: () => void }} */
let instance = null;

/**
 * @param {any} api
 * @param {() => void} toggle  开关面板（与魔杖菜单项同一个）
 * @param {() => boolean} isOpen
 */
export function mountComposerButton(api, toggle, isOpen) {
    // 一个观察者兼管两件事：等 #leftSendForm 出现，以及挂上后发现按钮或容器被宿主移除。
    // 回调只做 O(1) 的检查，并把一批变化合并成一次处理，聊天流式输出时也不会有负担。
    /** @type {MutationObserver|null} */
    let observer = null;
    let scheduled = false;

    const enabled = () => api.settings.get().ui?.composerButton !== false;
    const healthy = () => {
        const button = document.getElementById(ID);
        return !!button && button.parentElement?.id === 'leftSendForm';
    };

    function build() {
        const el = document.createElement('div');
        el.id = ID;
        el.className = 'fa-solid fa-masks-theater interactable';
        el.title = '幕后';
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', '幕后');
        el.style.order = '2';
        el.addEventListener('click', () => toggle());
        el.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        });
        return el;
    }

    function observe() {
        if (observer) return;
        observer = new MutationObserver(() => {
            if (scheduled || healthy()) return;
            scheduled = true;
            // 不用 requestAnimationFrame：后台标签页里它不会跑
            setTimeout(() => {
                scheduled = false;
                sync();
            }, 30);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function sync() {
        const existing = document.getElementById(ID);
        if (!enabled()) {
            observer?.disconnect();
            observer = null;
            existing?.remove();
            return;
        }
        observe();
        const form = document.getElementById('leftSendForm');
        if (!form) {
            existing?.remove();
            return; // 等它出现
        }
        let button = existing;
        if (!button || button.parentElement !== form) {
            button?.remove();
            button = build();
            form.append(button);
        }
        updateState(button);
    }

    function updateState(button = document.getElementById(ID)) {
        if (!button) return;
        button.setAttribute('aria-pressed', String(isOpen()));
        let running = false;
        try {
            running = !!api.status()?.scheduler?.running;
        } catch (error) {
            console.warn(LOG_PREFIX, '读取推演状态失败', error);
        }
        if (running) button.dataset.bsRunning = 'true';
        else delete button.dataset.bsRunning;
        button.title = running ? '幕后 · 推演中' : '幕后';
    }

    api.onStatus(() => updateState());
    // 宿主事件时也顺手查一次（观察者之外的保险）
    const st = globalThis.SillyTavern?.getContext?.();
    const types = st?.eventTypes ?? st?.event_types;
    if (st?.eventSource && types) {
        for (const name of ['APP_READY', 'CHAT_CHANGED', 'SETTINGS_UPDATED']) if (types[name]) st.eventSource.on(types[name], () => sync());
    }

    instance = { sync, updateState: () => updateState() };
    sync();
    return instance;
}

/** 设置里切换开关后调用：立即显示或移除按钮 */
export function syncComposerButton() {
    instance?.sync();
}

/** 面板开关时调用：更新按钮的 aria-pressed */
export function updateComposerButton() {
    instance?.updateState?.();
}
