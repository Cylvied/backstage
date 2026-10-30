// 面板里的设置页：模型 API + 推演、注入、世界书、审核、数据库纪要。
// 放在我们自己的浮层里（#backstage-panel），控件全用插件自己的样式，不受宿主或主题扩展重排影响。

import { h } from './dom.js';
import { normalizeNumberSetting, SETTING_RANGES } from './format.js';
import { buildApiSection, saveMerged } from './settings-api.js';
import { buildLoreSection, buildReviewSection } from './settings-lore.js';
import { syncComposerButton } from './composer-button.js';

/**
 * @param {any} api
 * @returns {{ element: HTMLElement, refresh: () => void }}
 */
export function buildSettingsPage(api) {
    const s = api.settings.get();
    const save = patch => {
        saveMerged(api, patch);
        syncWarning();
    };

    const check = (label, checked, onChange, hint) => h('label', { class: 'bs-check bs-set-check' },
        h('input', { type: 'checkbox', checked, onchange: e => onChange(e.target.checked) }),
        h('span', null, label, hint ? h('small', { class: 'bs-set-hint' }, hint) : null));

    /** 数字项：失焦或回车时规整并保存 */
    const number = (label, value, rangeKey, onSave, hint) => {
        const [min, max] = SETTING_RANGES[rangeKey];
        const input = h('input', { class: 'bs-input', type: 'number', min, max, step: 1, value, inputmode: 'numeric' });
        input.addEventListener('change', () => {
            const v = normalizeNumberSetting(rangeKey, input.value, value);
            input.value = String(v);
            value = v;
            onSave(v);
        });
        return h('label', { class: 'bs-field' }, h('span', { class: 'bs-field-label' }, label), input, hint ? h('span', { class: 'bs-field-hint' }, hint) : null);
    };

    const warning = h('div', { class: 'bs-set-warn', role: 'alert' },
        h('b', null, '需要先配置模型 API。'),
        h('span', null, '填好 API 地址和模型（或选择一个连接配置），点「测试连接」确认可用。配置好之前不会推演。'));
    const syncWarning = () => {
        warning.hidden = !(api.settings.get().enabled && !api.settings.isApiReady());
    };
    const apiSection = buildApiSection(api, syncWarning);
    const loreSection = buildLoreSection(api);
    const reviewSection = buildReviewSection(api);

    const worldbook = h('input', { class: 'bs-input', type: 'text', value: s.memory.worldbook, placeholder: '留空 = 角色主世界书' });
    worldbook.addEventListener('change', () => save({ memory: { worldbook: worldbook.value.trim() } }));

    const element = h('div', { class: 'bs-set' },
        warning,
        apiSection.element,

        h('section', { class: 'bs-set-section' },
            h('h3', { class: 'bs-set-head' }, '推演'),
            check('启用后台推演', s.enabled, v => save({ enabled: v }), '关闭后不推演、不注入'),
            h('div', { class: 'bs-set-grid' },
                number('输出上限（token）', s.maxTokens, 'maxTokens', v => save({ maxTokens: v })),
                number('读取最近楼层', s.recentFloors, 'recentFloors', v => save({ recentFloors: v })),
                number('人物上限', s.maxCharacters, 'maxCharacters', v => save({ maxCharacters: v }), '钉住的人不计入淘汰'))),

        h('section', { class: 'bs-set-section' },
            h('h3', { class: 'bs-set-head' }, '注入正文'),
            check('注入暗流', s.injectUndercurrent, v => save({ injectUndercurrent: v }), '关闭后只注入你采纳的引导'),
            h('div', { class: 'bs-set-grid' },
                number('每层暗流上限', s.maxSignals, 'maxSignals', v => save({ maxSignals: v }), '0–3 条'),
                number('注入深度', s.injectDepth, 'injectDepth', v => save({ injectDepth: v }), '1 = 最新回复之后；"尽快引爆"固定为 0'))),

        loreSection.element,
        reviewSection.element,

        h('section', { class: 'bs-set-section' },
            h('h3', { class: 'bs-set-head' }, '界面'),
            check('在输入框旁显示「幕后」按钮', s.ui?.composerButton !== false, v => {
                save({ ui: { composerButton: v } });
                syncComposerButton();
            }, '在输入框左侧、扩展菜单按钮旁边，点一下开关幕后面板；魔杖菜单里的入口一直都在')),

        h('section', { class: 'bs-set-section' },
            h('h3', { class: 'bs-set-head' }, '数据库纪要'),
            check('读取数据库插件的纪要', s.memory.enabled, v => save({ memory: { enabled: v } }), '只作为推演和参谋的参考，不注入正文'),
            h('div', { class: 'bs-set-grid' },
                h('label', { class: 'bs-field' }, h('span', { class: 'bs-field-label' }, '世界书'), worldbook),
                number('纪要条数上限', s.memory.limit, 'memoryLimit', v => save({ memory: { limit: v } })))));

    syncWarning();
    return {
        element,
        refresh() {
            apiSection.refresh();
            syncWarning();
        },
    };
}
