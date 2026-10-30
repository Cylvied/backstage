// 大事记（事件记录，v1.5）：「暗线与大事」页顶部的列表，以及人物卡、暗线卡里的"相关事件"。
// 旧数据没有 chronicle 时：大事记显示一句空状态，卡片里不显示这一块。

import { h } from './dom.js';
import { chronicleView, relatedEvents } from './world.js';

/** 大事记默认显示的条数，其余点"展开"再看 */
const SHOW = 5;
/** 卡片里相关事件最多显示几条（已知 + 未知合计） */
const CARD_SHOW = 4;

/** @param {any} ctx @param {import('../types.js').SimState} state */
export function chronicleSection(ctx, state) {
    const all = chronicleView(state);
    const expanded = ctx.ui.chronicleAll === true;
    const shown = expanded ? all : all.slice(0, SHOW);
    const unknown = all.filter(e => !e.known).length;
    return h('section', { class: 'bs-chronicle', 'aria-label': '大事记' },
        h('header', { class: 'bs-section-head' },
            h('h3', { class: 'bs-section-title' }, '大事记'),
            all.length ? h('span', { class: 'bs-muted' }, `${all.length} 件${unknown ? ` · ${unknown} 件主角尚不知道` : ''}`) : null),
        all.length
            ? h('ol', { class: 'bs-events' }, shown.map(e => eventItem(e, true)))
            : h('p', { class: 'bs-muted bs-chronicle-empty' }, '镜头外还没有记下已经发生的事。推演确认某件事办成了，会记在这里。'),
        all.length > SHOW ? h('button', {
            type: 'button',
            class: 'bs-btn bs-btn-quiet bs-btn-small bs-more',
            'aria-expanded': String(expanded),
            onclick: () => { ctx.ui.chronicleAll = !expanded; ctx.render(); },
        }, expanded ? '收起' : `展开全部 ${all.length} 件`) : null);
}

/**
 * 卡片里的"相关事件"：已知在前，未知的弱化并标"主角尚不知道"。没有相关事件时返回 null。
 * @param {import('../types.js').SimState} state
 * @param {{ characterId?: string, threadId?: string }} target
 */
export function relatedEventsBlock(state, target) {
    const { known, unknown } = relatedEvents(state, target);
    const total = known.length + unknown.length;
    if (!total) return null;
    const k = known.slice(0, CARD_SHOW);
    const u = unknown.slice(0, Math.max(0, CARD_SHOW - k.length));
    const rest = total - k.length - u.length;
    return h('div', { class: 'bs-related' },
        h('p', { class: 'bs-subhead' }, '相关的事'),
        h('ol', { class: 'bs-events is-compact' }, [...k, ...u].map(e => eventItem(e, false))),
        rest ? h('p', { class: 'bs-muted bs-related-more' }, `另有 ${rest} 件，见「暗线与大事」的大事记`) : null);
}

/** @param {import('./world.js').EventView} e @param {boolean} full  大事记里列出相关人物和暗线 */
function eventItem(e, full) {
    const links = full ? [...e.people, ...e.threads.map(t => `「${t}」`)] : [];
    return h('li', { class: `bs-event${e.known ? ' is-known' : ' is-unknown'}` },
        h('div', { class: 'bs-event-head' },
            h('span', { class: 'bs-event-when' }, e.when),
            e.known
                ? h('span', { class: 'bs-event-mark is-known', title: e.knownWhen ? `主角于${e.knownWhen}得知` : '主角已经知道' }, '主角已知')
                : h('span', { class: 'bs-event-mark' }, '主角尚不知道')),
        h('p', { class: 'bs-event-text' }, e.text),
        links.length ? h('p', { class: 'bs-event-links' }, `相关：${links.join('、')}`) : null);
}
