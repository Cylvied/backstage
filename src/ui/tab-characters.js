// 「人物」标签页：主角处境 + 人物卡片（钉住、移除、编辑）。

import { h, confirmButton, field, select } from './dom.js';
import { LIFE_LABEL, LONG_STATUS_LABEL, sortCharacters } from './format.js';
import { togglePin, removeCharacter, updateCharacter } from './state-edits.js';

/** @typedef {import('../types.js').Character} Character */

/** @param {any} ctx */
export function renderCharacters(ctx) {
    const state = ctx.api.getState();
    const wrap = h('div', { class: 'bs-list' });

    const p = state.protagonist;
    wrap.append(h('p', { class: 'bs-lead' },
        h('span', { class: 'bs-lead-label' }, '主角'),
        p.location || '位置不明',
        h('span', { class: 'bs-muted' }, p.reachable ? ' · 可以接触外界' : ' · 与外界隔绝')));

    if (!state.characters.length) {
        wrap.append(h('div', { class: 'bs-empty' },
            h('p', { class: 'bs-empty-title' }, '还没有镜头外的人物'),
            h('p', null, '每轮 AI 回复后，推演会记下这些人在做什么。')));
        return wrap;
    }
    for (const c of sortCharacters(state.characters)) {
        wrap.append(ctx.ui.editing === `c:${c.id}` ? editForm(ctx, c) : card(ctx, c));
    }
    return wrap;
}

/** @param {any} ctx @param {Character} c */
function card(ctx, c) {
    const meta = [c.onStage ? '在场' : '不在场', LIFE_LABEL[c.life] ?? c.life, c.location].filter(Boolean).join(' · ');
    const rows = [];
    if (c.currentAction?.text) rows.push(['此刻', c.currentAction.text, c.currentAction.duration]);
    if (c.longAction?.text) {
        const la = c.longAction;
        const tail = [la.duration, la.status !== 'ongoing' ? LONG_STATUS_LABEL[la.status] : '', la.outcome].filter(Boolean).join('，');
        rows.push(['长期', la.text, tail]);
    }

    return h('article', { class: `bs-card${c.pinned ? ' is-pinned' : ''}${c.life === 'dead' ? ' is-dead' : ''}` },
        h('header', { class: 'bs-card-head' },
            h('h3', { class: 'bs-card-title' }, c.name,
                c.aliases?.length ? h('span', { class: 'bs-alias' }, `又名 ${c.aliases.join('、')}`) : null),
            c.pinned ? h('span', { class: 'bs-tag' }, '已钉住') : null),
        h('p', { class: 'bs-meta' }, meta),
        rows.length ? h('dl', { class: 'bs-dl' }, rows.map(([k, v, d]) => [
            h('dt', null, k),
            h('dd', null, v, d ? h('span', { class: 'bs-muted' }, `（${d}）`) : null),
        ])) : null,
        c.knows?.length ? h('div', { class: 'bs-knows' },
            h('p', { class: 'bs-subhead' }, '认知'),
            h('ul', null, c.knows.map(k => h('li', null, k)))) : null,
        h('div', { class: 'bs-actions' },
            h('button', {
                type: 'button',
                class: 'bs-btn bs-btn-quiet',
                title: c.pinned ? '取消后，人物超过上限时可能被淘汰' : '钉住的人不会被自动淘汰，推演也不能删除',
                onclick: () => ctx.edit(s => togglePin(s, c.id)),
            }, c.pinned ? '取消钉住' : '钉住'),
            h('button', { type: 'button', class: 'bs-btn bs-btn-quiet', onclick: () => ctx.startEdit(`c:${c.id}`) }, '编辑'),
            confirmButton('移除', '确认移除', () => ctx.edit(s => removeCharacter(s, c.id)))));
}

/** @param {any} ctx @param {Character} c */
function editForm(ctx, c) {
    const input = (value, attrs = {}) => h('input', { class: 'bs-input', type: 'text', value: value ?? '', ...attrs });
    const area = (value, rows) => h('textarea', { class: 'bs-input', rows }, value ?? '');
    const f = {
        name: input(c.name),
        aliases: input((c.aliases ?? []).join('，'), { placeholder: '用逗号分隔' }),
        location: input(c.location, { placeholder: '区域·地点' }),
        life: select(LIFE_LABEL, c.life),
        onStage: h('input', { type: 'checkbox', checked: c.onStage }),
        currentText: input(c.currentAction?.text, { placeholder: '留空表示没有' }),
        currentDuration: input(c.currentAction?.duration, { placeholder: '如：今夜之内' }),
        longText: input(c.longAction?.text, { placeholder: '留空表示没有' }),
        longDuration: input(c.longAction?.duration),
        longStatus: select(LONG_STATUS_LABEL, c.longAction?.status ?? 'ongoing'),
        longOutcome: input(c.longAction?.outcome, { placeholder: '完成或放弃时的结果' }),
        knows: area((c.knows ?? []).join('\n'), 4),
    };
    const save = () => {
        const form = {};
        for (const [k, el] of Object.entries(f)) form[k] = k === 'onStage' ? el.checked : el.value;
        ctx.submit(() => ctx.api.editState(s => updateCharacter(s, c.id, form)), '已保存');
    };
    return h('form', { class: 'bs-card bs-form', onsubmit: e => { e.preventDefault(); save(); } },
        h('h3', { class: 'bs-card-title' }, `编辑 ${c.name}`),
        field('名字', f.name),
        field('别名', f.aliases),
        field('位置', f.location),
        h('div', { class: 'bs-row' }, field('生死', f.life),
            h('label', { class: 'bs-check' }, f.onStage, h('span', null, '在主角当前场景中'))),
        h('fieldset', { class: 'bs-group' }, h('legend', null, '此刻在做'), f.currentText, field('持续', f.currentDuration)),
        h('fieldset', { class: 'bs-group' }, h('legend', null, '长期行动'), f.longText,
            h('div', { class: 'bs-row' }, field('持续', f.longDuration), field('状态', f.longStatus)),
            field('结果', f.longOutcome)),
        field('认知', f.knows, '一行一条，最多 5 条；如"知道：……（渠道）"或"不知道：……"'),
        h('div', { class: 'bs-actions' },
            h('button', { type: 'submit', class: 'bs-btn bs-btn-primary' }, '保存'),
            h('button', { type: 'button', class: 'bs-btn bs-btn-quiet', onclick: () => ctx.stopEdit() }, '取消')));
}
