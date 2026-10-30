// 方案卡：参谋回复下方的卡片。选强度 → 采纳；带 beats 的显示为分阶段方案。

import { h, segmented, field } from './dom.js';
import { INTENSITY_LABEL, activeGuideThread, adoptView } from './format.js';

/** @typedef {import('../types.js').PlanCard} PlanCard */

/**
 * @param {any} ctx
 * @param {PlanCard} card
 * @param {string} key  这张卡在本面板里的唯一键（记住所选强度、是否已采纳）
 */
export function planCard(ctx, card, key) {
    const ui = ctx.ui;
    const adopted = ui.adopted.has(key);
    let intensity = ui.planIntensity[key] ?? card.suggestedIntensity ?? 'normal';
    const current = activeGuideThread(ctx.api.getState());
    const view = adoptView(card, current);
    const beats = Array.isArray(card.beats) && card.beats.length ? card.beats : null;
    const rows = [['目标', card.goal], [beats ? '' : '起始迹象', beats ? '' : card.firstSigns], ['为什么贴合', card.fit]]
        .filter(([k, v]) => k && v);

    return h('article', { class: `bs-card bs-plan-card${adopted ? ' is-adopted' : ''}` },
        h('header', { class: 'bs-card-head' },
            h('h3', { class: 'bs-card-title' }, card.title),
            adopted ? h('span', { class: 'bs-tag bs-tag-accent' }, '已采纳')
                : beats ? h('span', { class: 'bs-tag' }, `分阶段方案 · ${beats.length} 拍`) : null),
        h('dl', { class: 'bs-dl' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
        beats ? h('ol', { class: 'bs-beats bs-beats-plan' }, beats.map((b, i) => h('li', { class: 'bs-beat' },
            h('details', {
                open: ui.openBeats.has(`${key}:${i}`),
                ontoggle: e => { e.currentTarget.open ? ui.openBeats.add(`${key}:${i}`) : ui.openBeats.delete(`${key}:${i}`); },
            },
                h('summary', null, h('span', { class: 'bs-beat-mark', 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'bs-beat-title' }, b.title)),
                h('dl', { class: 'bs-dl bs-beat-detail' },
                    b.goal ? [h('dt', null, '目标'), h('dd', null, b.goal)] : null,
                    b.firstSigns ? [h('dt', null, '起始迹象'), h('dd', null, b.firstSigns)] : null))))) : null,
        adopted
            ? h('p', { class: 'bs-muted' }, beats ? '已成为分阶段引导，可以在「暗线」里逐拍推进。' : '已成为引导中的暗线，可以在「暗线」里调整或放弃。')
            : [
                field('强度', segmented(INTENSITY_LABEL, intensity, v => { intensity = v; ui.planIntensity[key] = v; }, '引导强度')),
                view.note ? h('p', { class: 'bs-warn' }, view.note) : null,
                h('div', { class: 'bs-actions' },
                    h('button', {
                        type: 'button',
                        class: 'bs-btn bs-btn-primary',
                        onclick: async () => {
                            if (await ctx.call(() => ctx.api.adopt(card, intensity), '方案已采纳')) {
                                ui.adopted.add(key);
                                ctx.render();
                            }
                        },
                    }, view.label)),
            ]);
}
