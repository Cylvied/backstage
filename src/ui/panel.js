// 面板入口：主面板（魔杖菜单打开的抽屉）、设置抽屉、楼层角标。
// index.js 启动时调用 mountPanel(api) 与 mountSettings(api)。

import { EXT_NAME, LOG_PREFIX } from '../constants.js';
import { h } from './dom.js';
import { statusView, clockText, activeGuideThread } from './format.js';
import { registerThemed } from './theme.js';
import { renderCharacters } from './tab-characters.js';
import { renderThreads } from './tab-threads.js';
import { renderNote } from './tab-note.js';
import { renderAdvisor } from './tab-advisor.js';
import { mountBadges } from './badges.js';
import { renderSettingsDrawer, revealSettings } from './settings.js';

export { renderSettingsDrawer as mountSettings };

const TABS = [
    { id: 'characters', label: '人物', render: renderCharacters, count: s => s.characters.length },
    { id: 'threads', label: '暗线', render: renderThreads, count: s => s.threads.length },
    { id: 'note', label: '纸条', render: renderNote },
    { id: 'advisor', label: '参谋', render: renderAdvisor },
];

/** @param {any} api */
export function mountPanel(api) {
    if (document.getElementById('backstage-panel')) return;

    const ui = {
        open: false,
        tab: 'characters',
        editing: /** @type {string|null} */ (null),
        dirty: false,
        advisorDraft: '',
        advisorSig: /** @type {string|null} */ (null),
        scrollToEnd: false,
        planIntensity: /** @type {Record<string, string>} */ ({}),
        adopted: new Set(),   // 已采纳的方案卡（键：回复时间戳:序号）
        openBeats: new Set(), // 方案卡里展开着的拍
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
        /** 切到参谋页，并把文字放进输入框（光标在末尾） */
        goAdvisor(prefill) {
            ui.tab = 'advisor';
            ui.editing = null;
            if (prefill) ui.advisorDraft = prefill;
            ui.advisorSig = null;
            render();
            const input = body.querySelector('[data-keep="advisor-input"]');
            if (input) {
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }
        },
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
                    ui.advisorSig = null; // 进入参谋页时滚到最新一条
                    body.scrollTop = 0;
                    render();
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
        body.dataset.tab = tab.id;
        let content;
        try {
            content = tab.render(ctx);
        } catch (error) {
            console.error(LOG_PREFIX, '面板渲染失败', error);
            content = h('div', { class: 'bs-error' }, h('p', { class: 'bs-empty-title' }, '这一页显示不出来'), h('p', null, String(error?.message ?? error)));
        }
        // 重画会换掉输入框：记住焦点和光标，画完放回去（参谋输入框在推演完成时也不丢焦点）
        const active = document.activeElement;
        const keep = active instanceof HTMLElement && body.contains(active) ? active.dataset.keep : null;
        const caret = keep ? [active.selectionStart, active.selectionEnd] : null;
        body.replaceChildren(content);
        if (keep) {
            const again = body.querySelector(`[data-keep="${keep}"]`);
            again?.focus({ preventScroll: true });
            if (caret && again?.setSelectionRange) again.setSelectionRange(caret[0], caret[1]);
        }
        if (ui.scrollToEnd) {
            ui.scrollToEnd = false;
            body.scrollTop = body.scrollHeight;
        }
    }

    function renderStatus(status = api.status()) {
        const view = statusView(status, { enabled: api.settings.get().enabled, apiReady: api.settings.isApiReady() });
        root.dataset.status = view.kind;
        statusText.textContent = view.text;
        statusDetail.textContent = view.detail;
        statusDetail.title = view.detail;
        // 没配置 API 时，按钮变成「去配置」
        runBtn.textContent = view.kind === 'setup' ? '去配置' : '立即推演';
        runBtn.classList.toggle('bs-btn-primary', view.kind === 'setup');
        runBtn.disabled = view.kind === 'running' || view.kind === 'off';
    }

    runBtn.addEventListener('click', () => {
        if (!api.settings.isApiReady()) {
            if (revealSettings()) setOpen(false);
            else notify('在扩展设置（积木图标）里找到「幕后」，填写模型 API。', 'error');
            return;
        }
        const ok = api.runNow();
        if (!ok) notify('聊天里还没有 AI 回复，没有可以推演的内容。', 'error');
    });

    function setOpen(open) {
        ui.open = open;
        root.hidden = !open;
        document.getElementById('backstage_wand_button')?.classList.toggle('is-active', open);
        if (open) {
            ui.advisorSig = null;
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

    // 切换聊天：关掉正在编辑的表单（不能把上一个聊天的编辑存到新聊天里）；参谋记录由 api 按聊天切换
    const st = globalThis.SillyTavern?.getContext?.();
    const chatChanged = st?.eventTypes?.CHAT_CHANGED;
    if (st?.eventSource && chatChanged) {
        st.eventSource.on(chatChanged, () => {
            ui.editing = null;
            ui.advisorSig = null;
            ui.advisorDraft = ''; // 草稿是写给上一个故事的
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
