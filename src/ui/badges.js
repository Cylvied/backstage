// 楼层角标：每条 AI 消息的名字旁显示推演结果（成功 / 失败 / 编辑过 / 已失效）和"注入 M/N"。
// 点击弹出一小块说明（手机上没有悬停提示），里面可以打开面板。
// 宿主重画消息、切换聊天、加载更早消息后都要重新挂。

import { LOG_PREFIX } from '../constants.js';
import { h } from './dom.js';
import { badgeView } from './format.js';
import { registerThemed } from './theme.js';
import { injectionSummary } from './signal-sources.js';

const EVENTS = [
    'CHARACTER_MESSAGE_RENDERED',
    'CHAT_CHANGED',
    'MORE_MESSAGES_LOADED',
    'MESSAGE_SWIPED',
    'MESSAGE_UPDATED',
    'MESSAGE_EDITED',
    'MESSAGE_DELETED',
];

/**
 * @param {any} api
 * @param {(tab?: string) => void} openPanel
 */
export function mountBadges(api, openPanel) {
    // 角标散落在宿主消息里，没有自己的根元素：明暗挂在 <html data-bs-theme> 上，CSS 只按它取色
    registerThemed(document.documentElement);

    const pop = badgePopover(openPanel);
    let timer = 0;
    const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(refreshAll, 50);
    };

    function refreshAll() {
        const settings = api.settings.get();
        for (const mes of document.querySelectorAll('#chat .mes')) {
            const old = mes.querySelector('.bs-badge');
            const isAi = mes.getAttribute('is_user') !== 'true' && mes.getAttribute('is_system') !== 'true';
            const floor = Number(mes.getAttribute('mesid'));
            let view = null;
            if (settings.enabled && isAi && Number.isInteger(floor)) {
                try {
                    const info = api.getFloorInfo(floor);
                    // info.state 为这一层的推演状态（接口提议中）；拿不到时角标只显示候选数
                    view = badgeView(info, info?.state ? injectionSummary(info.state, settings) : undefined);
                } catch (error) {
                    console.warn(LOG_PREFIX, '读取楼层信息失败', floor, error);
                }
            }
            if (!view) {
                if (old && pop.owner === old) pop.close();
                old?.remove();
                continue;
            }
            if (old && old.dataset.kind === view.kind && old.textContent === view.text && old.title === view.title) continue;
            const badge = h('button', { type: 'button', class: 'bs-badge', 'data-kind': view.kind, title: view.title, 'aria-label': view.title, 'aria-haspopup': 'dialog' }, view.text);
            badge.addEventListener('click', e => {
                e.stopPropagation();
                if (pop.owner === badge) pop.close();
                else pop.open(badge, view);
            });
            if (old && pop.owner === old) pop.close();
            if (old) old.replaceWith(badge);
            else (mes.querySelector('.mes_header_info .flex-container') ?? mes.querySelector('.ch_name') ?? mes).append(badge);
        }
    }

    const st = globalThis.SillyTavern?.getContext?.();
    const source = st?.eventSource;
    const types = st?.eventTypes ?? st?.event_types;
    if (source && types) {
        for (const name of EVENTS) if (types[name]) source.on(types[name], schedule);
    } else {
        console.warn(LOG_PREFIX, '拿不到宿主事件，楼层角标只会在推演状态变化时刷新');
    }
    api.onStateChanged(schedule);
    schedule();
}

/**
 * 角标说明浮层：同一时间只有一个，点外面、Esc、滚动时关掉。
 * @param {(tab?: string) => void} openPanel
 */
function badgePopover(openPanel) {
    /** @type {HTMLElement|null} */
    let el = null;
    const state = {
        /** @type {HTMLElement|null} */
        owner: null,
        open(badge, view) {
            state.close();
            state.owner = badge;
            el = h('div', { class: 'bs-badge-pop', role: 'dialog', 'aria-label': '幕后推演说明', 'data-kind': view.kind },
                view.lines.map((line, i) => h('p', { class: i ? 'bs-badge-pop-line' : 'bs-badge-pop-head' }, line)),
                h('div', { class: 'bs-badge-pop-actions' },
                    h('button', { type: 'button', class: 'bs-badge-pop-btn', onclick: () => { state.close(); openPanel(); } }, '打开幕后面板'),
                    isLatest(badge) && view.lines.some(l => l.startsWith('候选'))
                        ? h('button', { type: 'button', class: 'bs-badge-pop-btn', onclick: () => { state.close(); openPanel('note'); } }, '查看纸条')
                        : null));
            document.body.append(el);
            place(el, badge);
            document.addEventListener('pointerdown', onOutside, true);
            document.addEventListener('keydown', onKey, true);
            document.addEventListener('scroll', state.close, true);
            window.addEventListener('resize', state.close);
        },
        close() {
            el?.remove();
            el = null;
            state.owner = null;
            document.removeEventListener('pointerdown', onOutside, true);
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('scroll', state.close, true);
            window.removeEventListener('resize', state.close);
        },
    };
    const onOutside = e => {
        if (!el?.contains(e.target) && !state.owner?.contains(e.target)) state.close();
    };
    const onKey = e => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        const owner = state.owner;
        state.close();
        owner?.focus();
    };
    return state;
}

/** 纸条页展示的是当前状态，只对最后一条 AI 回复的角标给「查看纸条」 */
function isLatest(badge) {
    const all = document.querySelectorAll('#chat .mes .bs-badge');
    return all[all.length - 1] === badge;
}

/** 放在角标下方（下方放不下就放上方），左右不出屏 */
function place(el, badge) {
    const r = badge.getBoundingClientRect();
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 6;
    const top = below + hgt > window.innerHeight - 8 && r.top - hgt - 6 > 8 ? r.top - hgt - 6 : below;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}
