// 楼层角标：每条 AI 消息的名字旁显示推演结果（成功 / 失败 / 编辑过 / 已失效），点击打开面板。
// 宿主重画消息、切换聊天、加载更早消息后都要重新挂。

import { LOG_PREFIX } from '../constants.js';
import { h } from './dom.js';
import { badgeView } from './format.js';
import { registerThemed } from './theme.js';

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
 * @param {() => void} openPanel
 */
export function mountBadges(api, openPanel) {
    // 角标散落在宿主消息里，没有自己的根元素：明暗挂在 <html data-bs-theme> 上，CSS 只按它取色
    registerThemed(document.documentElement);

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
                    view = badgeView(api.getFloorInfo(floor));
                } catch (error) {
                    console.warn(LOG_PREFIX, '读取楼层信息失败', floor, error);
                }
            }
            if (!view) {
                old?.remove();
                continue;
            }
            if (old && old.dataset.kind === view.kind && old.textContent === view.text && old.title === view.title) continue;
            const badge = h('button', { type: 'button', class: 'bs-badge', 'data-kind': view.kind, title: view.title, 'aria-label': view.title }, view.text);
            badge.addEventListener('click', e => {
                e.stopPropagation();
                openPanel();
            });
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
