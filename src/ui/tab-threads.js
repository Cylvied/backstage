// 「暗线」标签页：线卡片；开始 / 调整 / 完成 / 放弃引导，编辑，删除。

import { h, confirmButton, field, select, segmented } from './dom.js';
import { STAGE_LABEL, VISIBILITY_LABEL, INTENSITY_LABEL, GUIDE_STATUS_LABEL, sortThreads, activeGuideThread } from './format.js';
import { updateThread, removeThread, guideCardForThread } from './state-edits.js';

/** @typedef {import('../types.js').Thread} Thread */

/** @param {any} ctx */
export function renderThreads(ctx) {
    const state = ctx.api.getState();
    const wrap = h('div', { class: 'bs-list' });
    if (!state.threads.length) {
        wrap.append(h('div', { class: 'bs-empty' },
            h('p', { class: 'bs-empty-title' }, '还没有暗线'),
            h('p', null, '推演会在镜头外慢慢埋下伏笔；也可以去「规划」里自己提一条。')));
        return wrap;
    }
    const names = new Map(state.characters.map(c => [c.id, c.name]));
    for (const t of sortThreads(state.threads)) {
        const key = ctx.ui.editing;
        if (key === `t:${t.id}`) wrap.append(editForm(ctx, t));
        else if (key === `g:${t.id}`) wrap.append(guideForm(ctx, t, activeGuideThread(state)));
        else wrap.append(card(ctx, t, names));
    }
    return wrap;
}

/** @param {any} ctx @param {Thread} t @param {Map<string,string>} names */
function card(ctx, t, names) {
    const active = t.guide?.status === 'active';
    const who = (t.characterIds ?? []).map(id => names.get(id)).filter(Boolean);
    const meta = [STAGE_LABEL[t.stage] ?? t.stage, VISIBILITY_LABEL[t.visibility] ?? t.visibility].join(' · ');
    const rows = [];
    if (t.trigger) rows.push(['引信', t.trigger]);
    if (t.deadline?.text) rows.push(['期限', t.deadline.missedOutcome ? `${t.deadline.text}；错过则${t.deadline.missedOutcome}` : t.deadline.text]);
    if (who.length) rows.push(['涉及', who.join('、')]);
    if (t.guide?.goal) rows.push(['目标', t.guide.goal]);
    if (active && t.guide.firstSigns) rows.push(['起始迹象', t.guide.firstSigns]);

    const actions = active
        ? [
            segmented(INTENSITY_LABEL, t.guide.intensity, value => ctx.call(() => ctx.api.setGuideIntensity(t.id, value)), '引导强度'),
            h('div', { class: 'bs-actions' },
                h('button', { type: 'button', class: 'bs-btn', onclick: () => ctx.call(() => ctx.api.setGuideStatus(t.id, 'done')) }, '完成'),
                h('button', { type: 'button', class: 'bs-btn bs-btn-quiet', onclick: () => ctx.call(() => ctx.api.setGuideStatus(t.id, 'dropped')) }, '放弃引导'),
                h('button', { type: 'button', class: 'bs-btn bs-btn-quiet', onclick: () => ctx.startEdit(`t:${t.id}`) }, '编辑')),
        ]
        : [h('div', { class: 'bs-actions' },
            h('button', { type: 'button', class: 'bs-btn', onclick: () => ctx.startEdit(`g:${t.id}`) }, '开始引导'),
            h('button', { type: 'button', class: 'bs-btn bs-btn-quiet', onclick: () => ctx.startEdit(`t:${t.id}`) }, '编辑'),
            confirmButton('删除', '确认删除', () => ctx.edit(s => removeThread(s, t.id))))];

    return h('article', { class: `bs-card${active ? ' is-guided' : ''}${t.stage === 'faded' ? ' is-faded' : ''}` },
        h('header', { class: 'bs-card-head' },
            h('h3', { class: 'bs-card-title' }, t.title),
            active ? h('span', { class: 'bs-tag bs-tag-accent' }, `引导中 · ${INTENSITY_LABEL[t.guide.intensity]}`)
                : t.guide ? h('span', { class: 'bs-tag' }, GUIDE_STATUS_LABEL[t.guide.status])
                    : t.origin === 'user' ? h('span', { class: 'bs-tag' }, '你的规划') : null),
        h('p', { class: 'bs-meta' }, meta),
        rows.length ? h('dl', { class: 'bs-dl' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])) : null,
        actions);
}

/** @param {any} ctx @param {Thread} t @param {Thread|null} current */
function guideForm(ctx, t, current) {
    let intensity = 'normal';
    const goal = h('textarea', { class: 'bs-input', rows: 2, placeholder: '你希望它走到哪一步' }, t.guide?.goal ?? '');
    const signs = h('textarea', { class: 'bs-input', rows: 2, placeholder: '最先露出的迹象；留空则用引信' }, t.guide?.firstSigns ?? '');
    const submit = () => {
        const card = guideCardForThread(t, { goal: goal.value, firstSigns: signs.value });
        ctx.submit(() => ctx.api.adopt(card, intensity), '已开始引导');
    };
    return h('form', { class: 'bs-card bs-form', onsubmit: e => { e.preventDefault(); submit(); } },
        h('h3', { class: 'bs-card-title' }, '开始引导'),
        h('p', { class: 'bs-meta' }, t.title),
        field('目标', goal),
        field('起始迹象', signs),
        field('强度', segmented(INTENSITY_LABEL, intensity, v => { intensity = v; }, '引导强度')),
        current && current.id !== t.id
            ? h('p', { class: 'bs-warn' }, `同一时间只能引导一条线。开始后，「${current.title}」的引导会被放弃。`)
            : null,
        h('div', { class: 'bs-actions' },
            h('button', { type: 'submit', class: 'bs-btn bs-btn-primary' }, current && current.id !== t.id ? '替换并开始' : '开始引导'),
            h('button', { type: 'button', class: 'bs-btn bs-btn-quiet', onclick: () => ctx.stopEdit() }, '取消')));
}

/** @param {any} ctx @param {Thread} t */
function editForm(ctx, t) {
    const input = (value, attrs = {}) => h('input', { class: 'bs-input', type: 'text', value: value ?? '', ...attrs });
    const f = {
        title: h('textarea', { class: 'bs-input', rows: 2 }, t.title),
        stage: select(STAGE_LABEL, t.stage),
        visibility: select(VISIBILITY_LABEL, t.visibility),
        trigger: h('textarea', { class: 'bs-input', rows: 2, placeholder: '什么条件会让它往前走' }, t.trigger ?? ''),
        deadlineText: input(t.deadline?.text, { placeholder: '留空表示没有期限' }),
        missedOutcome: input(t.deadline?.missedOutcome, { placeholder: '错过后会怎样' }),
    };
    const save = () => {
        const form = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
        ctx.submit(() => ctx.api.editState(s => updateThread(s, t.id, form)), '已保存');
    };
    return h('form', { class: 'bs-card bs-form', onsubmit: e => { e.preventDefault(); save(); } },
        h('h3', { class: 'bs-card-title' }, '编辑暗线'),
        field('一句话事实', f.title),
        h('div', { class: 'bs-row' }, field('阶段', f.stage), field('主角知情', f.visibility)),
        field('引信', f.trigger),
        field('期限', f.deadlineText),
        field('错过后果', f.missedOutcome),
        h('div', { class: 'bs-actions' },
            h('button', { type: 'submit', class: 'bs-btn bs-btn-primary' }, '保存'),
            h('button', { type: 'button', class: 'bs-btn bs-btn-quiet', onclick: () => ctx.stopEdit() }, '取消')));
}
