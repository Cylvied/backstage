// 面板设置页 v1.5 新增的两节：世界书（预算、推演专用常驻条目、按需调取）与审核（开关、审核模型、时间跨度门槛）。

import { DEFAULT_SETTINGS } from '../constants.js';
import { h } from './dom.js';
import { normalizeNumberSetting, SETTING_RANGES } from './format.js';
import { debounceSave, directFields, saveMerged, settingSegment, testRow } from './settings-api.js';
import { LORE_BUDGET, budgetText, normalizeBudget, filterLoreEntries, loreKey, togglePinnedLore, tokenText } from './world.js';

/** 旧设置里没有 lore / review 时用默认值补齐 */
const loreOf = s => ({ ...DEFAULT_SETTINGS.lore, ...(s.lore ?? {}) });
const reviewOf = s => ({ ...DEFAULT_SETTINGS.review, ...(s.review ?? {}) });

const check = (label, checked, onChange, hint) => h('label', { class: 'bs-check bs-set-check' },
    h('input', { type: 'checkbox', checked, onchange: e => onChange(e.target.checked) }),
    h('span', null, label, hint ? h('small', { class: 'bs-set-hint' }, hint) : null));

/** @param {any} api */
export function buildLoreSection(api) {
    let lore = loreOf(api.settings.get());
    const save = patch => {
        lore = { ...lore, ...patch };
        saveMerged(api, { lore: patch });
    };

    // ---- 预算：滑块 + 以"万"为单位的数字 ----
    const wan = n => String(Math.round(n / 1000) / 10);
    const range = h('input', {
        class: 'bs-range', type: 'range', min: LORE_BUDGET.min, max: LORE_BUDGET.max, step: LORE_BUDGET.step,
        value: lore.budget, 'aria-label': '世界书预算',
    });
    const number = h('input', { class: 'bs-input bs-budget-input', type: 'number', min: 1, max: 30, step: 0.5, value: wan(lore.budget), inputmode: 'decimal', 'aria-label': '世界书预算（万 token）' });
    const readout = h('span', { class: 'bs-budget-readout', 'aria-live': 'polite' }, budgetText(lore.budget));
    const setBudget = (tokens, persist) => {
        range.value = String(tokens);
        number.value = wan(tokens);
        readout.textContent = budgetText(tokens);
        if (persist && tokens !== lore.budget) save({ budget: tokens });
        syncPinnedNote();
    };
    range.addEventListener('input', () => setBudget(Number(range.value), false));
    range.addEventListener('change', () => setBudget(Number(range.value), true));
    number.addEventListener('change', () => setBudget(normalizeBudget(number.value, lore.budget), true));

    // ---- 推演专用常驻条目 ----
    /** @type {Array<{ world: string, uid: string|number, title: string, tokens: number }>|null} */
    let entries = null;
    let query = '';
    const search = h('input', { class: 'bs-input', type: 'search', placeholder: '按标题或世界书名搜索', 'aria-label': '搜索世界书条目', autocomplete: 'off' });
    search.addEventListener('input', () => { query = search.value; renderEntries(); });
    const status = h('small', { class: 'bs-set-note', role: 'status' });
    const list = h('div', { class: 'bs-lore-pick', role: 'group', 'aria-label': '世界书条目' });
    const pinnedNote = h('p', { class: 'bs-pinned-note' });
    const constantHint = h('small', { class: 'bs-set-note bs-constant-hint', hidden: true }, '开启上面的开关时，蓝灯条目已自动带上，无需再勾选。');
    const missingBox = h('div', { class: 'bs-pinned-missing' });

    function chosenKeys() {
        return new Set((lore.pinned ?? []).map(loreKey));
    }

    function syncPinnedNote() {
        const keys = chosenKeys();
        if (!entries) {
            pinnedNote.textContent = keys.size ? `已选 ${keys.size} 条` : '还没有选常驻条目';
            pinnedNote.dataset.kind = '';
            return;
        }
        const chosen = entries.filter(e => keys.has(loreKey(e)));
        const tokens = chosen.reduce((n, e) => n + (Number(e.tokens) || 0), 0);
        pinnedNote.textContent = keys.size ? `已选 ${keys.size} 条 · 约 ${tokenText(tokens)} token` : '还没有选常驻条目';
        const over = tokens > lore.budget;
        pinnedNote.dataset.kind = over ? 'warn' : '';
        if (over) pinnedNote.textContent += `，超过预算 ${budgetText(lore.budget)}，超出的条目会被整条截掉`;

        const missing = (lore.pinned ?? []).filter(p => !entries.some(e => loreKey(e) === loreKey(p)));
        missingBox.replaceChildren(missing.length ? h('p', { class: 'bs-set-note', 'data-kind': 'warn' },
            `另有 ${missing.length} 条已选条目现在读不到（世界书没启用、换了角色或条目已删除）。`,
            h('button', {
                type: 'button', class: 'bs-set-link',
                onclick: () => { save({ pinned: (lore.pinned ?? []).filter(p => !missing.includes(p)) }); renderEntries(); },
            }, '清除这些')) : '');
    }

    function renderEntries() {
        syncPinnedNote();
        if (!entries) return;
        const keys = chosenKeys();
        const { items, total } = filterLoreEntries(entries, lore.pinned, query);
        list.replaceChildren(...items.map(e => {
            const box = h('input', { type: 'checkbox', checked: keys.has(loreKey(e)) });
            box.addEventListener('change', () => {
                save({ pinned: togglePinnedLore(lore.pinned, e) });
                syncPinnedNote();
            });
            return h('label', { class: 'bs-lore-item' }, box,
                h('span', { class: 'bs-lore-item-title' }, e.title || `条目 ${e.uid}`,
                    e.constant ? h('span', { class: 'bs-lore-blue', title: '世界书里设为常驻（蓝灯）的条目' }, '蓝灯') : null),
                h('span', { class: 'bs-lore-item-meta' }, `${e.world} · ${tokenText(e.tokens)}`));
        }));
        constantHint.hidden = !(lore.constant && entries.some(e => e.constant));
        if (!entries.length) list.append(h('small', { class: 'bs-set-empty' }, '当前角色和聊天没有可用的世界书条目。'));
        else if (!items.length) list.append(h('small', { class: 'bs-set-empty' }, '没有匹配的条目。'));
        status.textContent = entries.length && total > items.length ? `显示前 ${items.length} 条，共 ${total} 条匹配，可以搜索缩小范围` : '';
    }

    async function load() {
        status.textContent = '正在读取世界书…';
        status.dataset.kind = '';
        reload.disabled = true;
        try {
            entries = await api.settings.listLoreEntries();
            status.textContent = '';
        } catch (error) {
            entries = null;
            list.replaceChildren();
            status.textContent = `读取失败：${error?.message ?? error}`;
            status.dataset.kind = 'error';
        } finally {
            reload.disabled = false;
        }
        renderEntries();
    }
    const reload = h('button', { type: 'button', class: 'bs-btn bs-set-btn', title: '重新读取世界书条目', onclick: load }, '刷新');
    load();

    const element = h('section', { class: 'bs-set-section', 'aria-label': '世界书' },
        h('h3', { class: 'bs-set-head' }, '世界书'),
        h('div', { class: 'bs-set-field' },
            h('span', null, '推演读取预算'),
            h('div', { class: 'bs-budget' }, range, h('div', { class: 'bs-budget-num' }, number, h('span', { class: 'bs-muted' }, '万 token'))),
            h('small', null, '每轮推演最多读这么多世界书内容（1 万–30 万）。超出时按 推演专用常驻 → 蓝灯常驻 → 正文触发 → 幕后触发 → 按需调取 的顺序保留，整条截断。当前：', readout)),
        check('推演时带上蓝灯常驻条目', lore.constant !== false, v => { save({ constant: v }); renderEntries(); },
            '世界书里设为常驻（蓝灯）的条目每轮推演都会读；条目很多、占预算时可以关掉。'),
        h('div', { class: 'bs-set-field' },
            h('span', null, '推演专用常驻条目'),
            h('small', null, '每轮推演都会带上，不注入正文。适合势力总览、地图这类全局资料。'),
            h('div', { class: 'bs-set-inline' }, search, reload),
            constantHint,
            pinnedNote,
            missingBox,
            list,
            status),
        check('允许推演按需调取条目', lore.catalog, v => save({ catalog: v }), '其余条目只把标题目录给推演，它可以点名下一轮需要的条目（晚一轮生效）'));

    return { element, refresh: load };
}

/** @param {any} api */
export function buildReviewSection(api) {
    const r = reviewOf(api.settings.get());
    const typed = debounceSave(patch => saveMerged(api, patch));
    const save = patch => typed.flush({ review: patch });

    const direct = directFields(api, r, {
        idPrefix: 'backstage_review',
        push: fields => typed.push({ review: fields }),
        save: fields => save(fields),
    });
    const test = testRow(api, () => ({ api: { mode: 'direct', ...direct.values() } }));
    const directBox = h('div', { class: 'bs-set-mode', hidden: r.apiMode !== 'direct' }, direct.element, test.element);

    const [min, max] = SETTING_RANGES.bigJumpDays;
    let days = r.bigJumpDays;
    const daysInput = h('input', { class: 'bs-input', type: 'number', min, max, step: 1, value: days, inputmode: 'numeric' });
    daysInput.addEventListener('change', () => {
        days = normalizeNumberSetting('bigJumpDays', daysInput.value, days);
        daysInput.value = String(days);
        save({ bigJumpDays: days });
    });

    const body = h('div', { class: 'bs-set-sub', hidden: !r.enabled },
        h('div', { class: 'bs-set-field' },
            h('span', null, '审核用的模型'),
            settingSegment([['same', '与推演相同'], ['direct', '单独直填']], r.apiMode === 'direct' ? 'direct' : 'same', '审核用的模型', value => {
                directBox.hidden = value !== 'direct';
                test.reset();
                save({ apiMode: value });
            })),
        directBox,
        h('div', { class: 'bs-set-grid' },
            h('label', { class: 'bs-field' }, h('span', { class: 'bs-field-label' }, '时钟前进几天以上需要审核'), daysInput,
                h('span', { class: 'bs-field-hint' }, `默认 ${DEFAULT_SETTINGS.review.bigJumpDays} 天`))));

    const element = h('section', { class: 'bs-set-section', 'aria-label': '审核' },
        h('h3', { class: 'bs-set-head' }, '审核'),
        check('审核高风险改动', r.enabled, v => { body.hidden = !v; save({ enabled: v }); }),
        h('small', { class: 'bs-set-note' }, '高风险改动（新发生的事、完成的长期行动、人物或主角新得知的事、大跨度时间前进）会多一次调用请审核员把关；没有这些改动的轮次不调用。'),
        body);

    return { element };
}
