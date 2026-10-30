// 扩展设置区（#extensions_settings2）里的精简抽屉。完整设置在面板的设置页（settings-page.js）。

import { EXT_NAME } from '../constants.js';
import { h } from './dom.js';
import { apiStatusView } from './format.js';
import { registerThemed } from './theme.js';

/**
 * @param {any} api
 * @param {() => void} openSettings
 */
export function renderSettingsDrawer(api, openSettings) {
    const tryMount = () => {
        const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
        if (!host) return false;
        if (!document.getElementById('backstage_settings_v2')) host.append(build(api, openSettings));
        return true;
    };
    if (tryMount()) return;
    const observer = new MutationObserver(() => { if (tryMount()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 60000);
}

/**
 * 精简的设置抽屉：说明、总开关、API 状态、打开面板设置页的按钮。
 * 主题扩展（如 Claude Web 2.0）会把抽屉里的控件拆开重排、按祖先显隐决定每行显隐，
 * 所以这里只放静态元素：没有靠 hidden 切换的区块，每个控件单独拿出来也能用。
 * @param {any} api
 * @param {() => void} openSettings  打开面板并进入设置页
 */
function build(api, openSettings) {
    const enabled = h('input', { type: 'checkbox', id: 'backstage_enabled_toggle', checked: api.settings.get().enabled });
    enabled.addEventListener('change', () => api.settings.save({ enabled: enabled.checked }));

    const status = h('div', { class: 'bs-drawer-status', id: 'backstage_api_status', role: 'status' });
    const sync = () => {
        const cur = api.settings.get();
        const view = apiStatusView(cur, api.settings.isApiReady(), api.settings.listProfiles());
        status.textContent = view.text;
        status.dataset.kind = view.kind;
        if (enabled.checked !== cur.enabled) enabled.checked = cur.enabled;
    };

    const open = h('div', { class: 'menu_button', id: 'backstage_open_settings', role: 'button', tabindex: 0, title: '在幕后面板里打开设置' }, '打开幕后设置');
    open.addEventListener('click', openSettings);
    open.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSettings();
        }
    });

    const content = h('div', { class: 'inline-drawer-content' },
        h('p', { class: 'bs-drawer-note' }, '模型 API、推演和注入的全部设置都在幕后面板里（魔杖菜单 →「幕后」→ 右上角齿轮）。'),
        h('label', { class: 'checkbox_label', for: 'backstage_enabled_toggle' }, enabled, h('span', null, '启用后台推演')),
        status,
        open);

    const toggle = h('div', { class: 'inline-drawer-toggle inline-drawer-header', onclick: sync },
        h('b', null, EXT_NAME),
        h('div', { class: 'inline-drawer-icon fa-solid fa-circle-chevron-down down' }));

    const drawer = h('div', { id: 'backstage_settings_v2', class: 'inline-drawer' }, toggle, content);
    registerThemed(drawer);
    api.onStatus(sync);
    api.onStateChanged(sync);
    sync();
    return drawer;
}
