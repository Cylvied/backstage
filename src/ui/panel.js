// 面板入口：主面板（魔杖菜单打开的抽屉）、设置抽屉、楼层角标。
// index.js 启动时调用 mountPanel(api) 与 mountSettings(api)。

import { EXT_NAME, LOG_PREFIX } from '../constants.js';
import { h } from './dom.js';
import { statusView, clockText, activeGuideThread } from './format.js';
import { registerThemed } from './theme.js';
import { renderCharacters } from './tab-characters.js';
import { renderThreads } from './tab-threads.js';
import { renderNote } from './tab-note.js';
import { renderPlan } from './tab-plan.js';
import { mountBadges } from './badges.js';
import { renderSettingsDrawer } from './settings.js';

export { renderSettingsDrawer as mountSettings };

const TABS = [
    { id: 'characters', label: '人物', render: renderCharacters, count: s => s.characters.length },
    { id: 'threads', label: '暗线', render: renderThreads, count: s => s.threads.length },
    { id: 'note', label: '纸条', render: renderNote },
    { id: 'plan', label: '规划', render: renderPlan },
];

/** @param {any} api */
export function mountPanel(api) {
    if (document.getElementById('backstage-panel')) return;

    const ui = {
        open: false,
        tab: 'characters',
        editing: /** @type {string|null} */ (null),
        dirty: false,
        planRequest: '',
        planToken: 0,
        planLoading: false,
        planError: '',
        planCards: [],
        planIntensity: {},
        adopted: new Set(),
    };

    const statusText = h('span', { class: 'bs-status-text' });
    const statusDetail = h('span', { class: 'bs-status-detail' });
    const statusDot = h('span', { class: 'bs-dot', 'aria-hidden': 'true' });
    const runBtn = h('button', { type: 'button', class: 'bs-btn bs-btn-small' }, '立即推演');
    const clock = h('span', { class: 'bs-clock' });
    const notice = h('div', { class: 'bs-notice', role: 'status', 'aria-live': 'polite' });
    const tabBar = h('nav', { class: 'bs-tabs', role: 'tablist', 'aria-label': '幕后' });
    const body = h('div', { class: 'bs-body', role: 'tabpanel' });

    const sheet = h('aside', { class: 'bs-sheet', role: 'dialog', 'aria-label': EXT_NAME },
        h('div', { class: 'bs-grip', 'aria-hidden': 'true' }),
        h('header', { class: 'bs-head' },
            h('h2', { class: 'bs-title' }, EXT_NAME),
            clock,
            h('button', { type: 'button', class: 'bs-icon-btn', 'aria-label': '关闭', title: '关闭', onclick: () => setOpen(false) }, '×')),
        h('div', { class: 'bs-status' },
            statusDot,
            h('div', { class: 'bs-status-main' }, statusText, statusDetail),
            runBtn),
        tabBar,
        notice,
        body);
    const root = h('div', { id: 'backstage-panel', class: 'bs-root', hidden: true },
        h('div', { class: 'bs-backdrop', onclick: () => setOpen(false) }),
        sheet);
    document.body.append(root);
    registerThemed(root);

    let noticeTimer = 0;
    function notify(text, kind = 'info') {
        clearTimeout(noticeTimer);
        notice.textContent = text;
        notice.dataset.kind = kind;
        notice.classList.add('is-shown');
        noticeTimer = setTimeout(() => notice.classList.remove('is-shown'), kind === 'error' ? 6000 : 2500);
    }

    const ctx = {
        api,
        ui,
        render,
        notify,
        startEdit(key) { ui.editing = key; render(); },
        stopEdit() { ui.editing = null; render(); },
        /** 包一层错误展示；成功返回 true */
        async call(fn, okText) {
            try {
                await fn();
                if (okText) notify(okText);
                return true;
            } catch (error) {
                notify(String(error?.message ?? error) || '操作没有成功', 'error');
                console.warn(LOG_PREFIX, error);
                // 表单开着时不重画，保留用户的输入
                if (!ui.editing) render();
                return false;
            }
        },
        /** @param {(state: any) => any} mutate */
        edit(mutate, okText) { return ctx.call(() => api.editState(mutate), okText); },
        /** 表单提交：保存成功才关闭表单，失败时保留输入 */
        async submit(fn, okText) {
            if (await ctx.call(fn, okText)) ctx.stopEdit();
        },
    };

    function renderTabs() {
        const state = api.getState();
        tabBar.replaceChildren(...TABS.map(tab => {
            const n = tab.count ? tab.count(state) : null;
            const guided = tab.id === 'threads' && activeGuideThread(state);
            return h('button', {
                type: 'button',
                role: 'tab',
                class: 'bs-tab',
                'aria-selected': String(ui.tab === tab.id),
                onclick: () => {
                    if (ui.tab === tab.id) return;
                    ui.tab = tab.id;
                    ui.editing = null;
                    render();
                    body.scrollTop = 0;
                },
            }, tab.label, n ? h('span', { class: 'bs-tab-count' }, String(n)) : null, guided ? h('span', { class: 'bs-tab-dot', title: '有正在引导的线' }) : null);
        }));
    }

    function render() {
        if (!ui.open) { ui.dirty = true; return; }
        ui.dirty = false;
        const state = api.getState();
        clock.textContent = clockText(state.clock);
        renderTabs();
        const tab = TABS.find(t => t.id === ui.tab) ?? TABS[0];
        let content;
        try {
            content = tab.render(ctx);
        } catch (error) {
            console.error(LOG_PREFIX, '面板渲染失败', error);
            content = h('div', { class: 'bs-error' }, h('p', { class: 'bs-empty-title' }, '这一页显示不出来'), h('p', null, String(error?.message ?? error)));
        }
        body.replaceChildren(content);
    }

    function renderStatus(status = api.status()) {
        const view = statusView(status, api.settings.get());
        root.dataset.status = view.kind;
        statusText.textContent = view.text;
        statusDetail.textContent = view.detail;
        statusDetail.title = view.detail;
        runBtn.disabled = view.kind === 'running' || view.kind === 'off' || view.kind === 'setup';
    }

    runBtn.addEventListener('click', () => {
        const ok = api.runNow();
        if (!ok) notify('聊天里还没有 AI 回复，没有可以推演的内容。', 'error');
    });

    function setOpen(open) {
        ui.open = open;
        root.hidden = !open;
        document.getElementById('backstage_wand_button')?.classList.toggle('is-active', open);
        if (open) {
            renderStatus();
            render();
            sheet.querySelector('.bs-tab[aria-selected="true"]')?.focus({ preventScroll: true });
        }
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && ui.open) {
            if (ui.editing) ctx.stopEdit();
            else setOpen(false);
        }
    });

    api.onStatus(s => renderStatus(s));
    api.onStateChanged(() => {
        // 正在编辑时不重画，免得冲掉输入；关闭编辑后再补画
        if (ui.editing) { ui.dirty = true; return; }
        render();
    });

    // 切换聊天：丢掉上一个聊天的方案卡和正在进行的编辑（方案卡不能拿到别的聊天里采纳）
    const st = globalThis.SillyTavern?.getContext?.();
    const chatChanged = st?.eventTypes?.CHAT_CHANGED;
    if (st?.eventSource && chatChanged) {
        st.eventSource.on(chatChanged, () => {
            ui.planToken++;
            Object.assign(ui, { editing: null, planLoading: false, planError: '', planCards: [], planIntensity: {}, adopted: new Set() });
            render();
        });
    }

    const toggle = () => setOpen(!ui.open);
    addWandItem(toggle);
    mountBadges(api, () => setOpen(true));
    renderStatus();
}

/** 在魔杖菜单里加入口。菜单由宿主异步渲染，所以等它出现。 */
function addWandItem(onClick) {
    const tryAdd = () => {
        const menu = document.getElementById('extensionsMenu');
        if (!menu) return false;
        if (document.getElementById('backstage_wand_button')) return true;
        const item = h('div', { id: 'backstage_wand_button', class: 'list-group-item flex-container flexGap5', title: '打开幕后面板' },
            h('div', { class: 'fa-solid fa-masks-theater extensionsMenuExtensionButton' }),
            h('span', null, EXT_NAME));
        item.addEventListener('click', onClick);
        menu.append(item);
        return true;
    };
    if (tryAdd()) return;
    const observer = new MutationObserver(() => { if (tryAdd()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 60000);
}
