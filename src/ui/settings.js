// 设置抽屉：挂在扩展设置区（#extensions_settings2），用宿主的 inline-drawer 和表单样式，
// 这样和其他扩展的设置看起来一致；只有提示条用插件自己的配色。

import { EXT_NAME } from '../constants.js';
import { h } from './dom.js';
import { normalizeNumberSetting, SETTING_RANGES } from './format.js';
import { registerThemed } from './theme.js';
import { buildApiSection } from './settings-api.js';

/** @param {any} api */
export function renderSettingsDrawer(api) {
    const tryMount = () => {
        const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
        if (!host) return false;
        if (!document.getElementById('backstage_settings_v2')) host.append(build(api));
        return true;
    };
    if (tryMount()) return;
    const observer = new MutationObserver(() => { if (tryMount()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 60000);
}

/** @param {any} api */
function build(api) {
    const s = api.settings.get();
    const save = patch => {
        api.settings.save(patch);
        syncWarning();
    };

    const check = (label, checked, onChange, hint) => h('label', { class: 'checkbox_label bs-set-check', title: hint ?? false },
        h('input', { type: 'checkbox', checked, onchange: e => onChange(e.target.checked) }),
        h('span', null, label));

    /** 数字项：失焦或回车时规整并保存 */
    const number = (label, value, rangeKey, onSave, hint) => {
        const [min, max] = SETTING_RANGES[rangeKey];
        const input = h('input', { class: 'text_pole', type: 'number', min, max, step: 1, value, inputmode: 'numeric' });
        input.addEventListener('change', () => {
            const v = normalizeNumberSetting(rangeKey, input.value, value);
            input.value = String(v);
            value = v;
            onSave(v);
        });
        return h('label', { class: 'bs-set-field' }, h('span', null, label), input, hint ? h('small', null, hint) : null);
    };

    const warning = h('div', { class: 'bs-set-warn', role: 'alert' },
        h('b', null, '需要先配置模型 API。'),
        h('span', null, '在下面填好 API 地址和模型（或选择一个连接配置），点「测试连接」确认可用。配置好之前不会推演。'));
    const syncWarning = () => {
        warning.hidden = !(api.settings.get().enabled && !api.settings.isApiReady());
    };
    const apiSection = buildApiSection(api, syncWarning);

    // 布局放在内层：宿主靠 .inline-drawer-content 的 display 控制展开收起，不能覆盖它
    const content = h('div', { class: 'inline-drawer-content' }, h('div', { class: 'bs-set' },
        warning,
        apiSection.element,

        h('h4', { class: 'bs-set-head' }, '开关'),
        check('启用后台推演', s.enabled, v => save({ enabled: v })),

        h('h4', { class: 'bs-set-head' }, '推演'),
        h('div', { class: 'bs-set-grid' },
            number('输出上限（token）', s.maxTokens, 'maxTokens', v => save({ maxTokens: v })),
            number('读取最近楼层', s.recentFloors, 'recentFloors', v => save({ recentFloors: v })),
            number('人物上限', s.maxCharacters, 'maxCharacters', v => save({ maxCharacters: v }), '钉住的人不计入淘汰')),

        h('h4', { class: 'bs-set-head' }, '注入正文'),
        check('注入暗流', s.injectUndercurrent, v => save({ injectUndercurrent: v }), '关闭后只注入你采纳的引导'),
        h('div', { class: 'bs-set-grid' },
            number('每层暗流上限', s.maxSignals, 'maxSignals', v => save({ maxSignals: v }), '0–3 条'),
            number('注入深度', s.injectDepth, 'injectDepth', v => save({ injectDepth: v }), '1 = 最新回复之后；"尽快引爆"固定为 0')),

        h('h4', { class: 'bs-set-head' }, '数据库纪要'),
        check('读取数据库插件的纪要', s.memory.enabled, v => save({ memory: { enabled: v } }), '只作为推演和参谋的参考，不注入正文'),
        h('div', { class: 'bs-set-grid' },
            (() => {
                const input = h('input', { class: 'text_pole', type: 'text', value: s.memory.worldbook, placeholder: '留空 = 角色主世界书' });
                input.addEventListener('change', () => save({ memory: { worldbook: input.value.trim() } }));
                return h('label', { class: 'bs-set-field' }, h('span', null, '世界书'), input);
            })(),
            number('纪要条数上限', s.memory.limit, 'memoryLimit', v => save({ memory: { limit: v } }))),

        h('div', { class: 'bs-set-actions' },
            h('div', {
                class: 'menu_button',
                role: 'button',
                tabindex: 0,
                onclick: () => document.getElementById('backstage_wand_button')?.click(),
            }, '打开幕后面板'))));

    // 每次展开时刷新连接列表：用户可能刚在连接管理器里新建了连接
    const toggle = h('div', { class: 'inline-drawer-toggle inline-drawer-header', onclick: () => { apiSection.refresh(); syncWarning(); } },
        h('b', null, EXT_NAME),
        h('div', { class: 'inline-drawer-icon fa-solid fa-circle-chevron-down down' }));

    const drawer = h('div', { id: 'backstage_settings_v2', class: 'inline-drawer' }, toggle, content);
    registerThemed(drawer);
    syncWarning();
    return drawer;
}

/**
 * 打开宿主的扩展设置面板，展开「幕后」设置并滚动到它。找不到设置抽屉时返回 false。
 */
export function revealSettings() {
    const drawer = document.getElementById('backstage_settings_v2');
    if (!drawer) return false;
    const block = document.getElementById('rm_extensions_block');
    if (block && !block.classList.contains('openDrawer')) {
        /** @type {HTMLElement|null} */ (document.querySelector('#extensions-settings-button .drawer-toggle'))?.click();
    }
    const content = drawer.querySelector('.inline-drawer-content');
    if (content instanceof HTMLElement && getComputedStyle(content).display === 'none') {
        /** @type {HTMLElement|null} */ (drawer.querySelector('.inline-drawer-toggle'))?.click();
    }
    // 宿主展开抽屉有动画，稍等再滚动
    setTimeout(() => drawer.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300);
    return true;
}
