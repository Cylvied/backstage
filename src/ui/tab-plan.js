// 「规划」标签页：输入想法 → 生成最多 3 张方案卡 → 选强度后采纳。

import { h, segmented, field } from './dom.js';
import { INTENSITY_LABEL, activeGuideThread } from './format.js';

/** @typedef {import('../types.js').PlanCard} PlanCard */

/** @param {any} ctx */
export function renderPlan(ctx) {
    const ui = ctx.ui;
    const wrap = h('div', { class: 'bs-list' });

    const input = h('textarea', {
        class: 'bs-input bs-plan-input',
        rows: 3,
        placeholder: '想让剧情往哪儿走？可以留空，让它根据现有的暗线提几个方向。',
        disabled: ui.planLoading,
        oninput: e => { ui.planRequest = e.target.value; },
    }, ui.planRequest);
    const run = async () => {
        ui.planLoading = true;
        ui.planError = '';
        ui.planCards = [];
        ui.adopted = new Set();
        ctx.render();
        const token = ui.planToken;
        let cards = [];
        let error = '';
        try {
            cards = await ctx.api.plan(ui.planRequest.trim());
            if (!cards.length) error = '模型没有给出可用的方案，换个说法再试一次。';
        } catch (e) {
            error = String(e?.message ?? e);
        }
        if (token !== ui.planToken) return; // 期间切换了聊天，结果作废
        ui.planCards = cards;
        ui.planError = error;
        ui.planLoading = false;
        ctx.render();
    };
    wrap.append(h('div', { class: 'bs-plan-ask' },
        input,
        h('div', { class: 'bs-actions' },
            h('button', { type: 'button', class: 'bs-btn bs-btn-primary', disabled: ui.planLoading, onclick: run },
                ui.planLoading ? '正在构思…' : ui.planCards.length ? '重新生成' : '生成方案'))));

    if (ui.planLoading) {
        wrap.append(h('div', { class: 'bs-loading', role: 'status' },
            h('span', { class: 'bs-spinner', 'aria-hidden': 'true' }),
            h('span', null, '正在读当前的人物和暗线，构思 2–3 个方案…')));
        return wrap;
    }
    if (ui.planError) {
        wrap.append(h('div', { class: 'bs-error', role: 'alert' }, h('p', { class: 'bs-empty-title' }, '没能生成方案'), h('p', null, ui.planError)));
    }
    if (!ui.planCards.length && !ui.planError) {
        wrap.append(h('div', { class: 'bs-empty' },
            h('p', { class: 'bs-empty-title' }, '和它商量下一段剧情'),
            h('p', null, '方案采纳后会成为一条带引导的暗线，下一轮起以你选的强度悄悄推进。同一时间只引导一条线。')));
        return wrap;
    }
    const current = activeGuideThread(ctx.api.getState());
    ui.planCards.forEach((card, i) => wrap.append(planCard(ctx, card, i, current)));
    return wrap;
}

/** @param {any} ctx @param {PlanCard} card @param {number} index @param {import('../types.js').Thread|null} current */
function planCard(ctx, card, index, current) {
    const ui = ctx.ui;
    const adopted = ui.adopted.has(index);
    let intensity = ui.planIntensity[index] ?? card.suggestedIntensity ?? 'normal';
    const replaces = current && !adopted && current.id !== card.threadId;
    const rows = [['目标', card.goal], ['起始迹象', card.firstSigns], ['为什么贴合', card.fit]].filter(([, v]) => v);

    return h('article', { class: `bs-card bs-plan-card${adopted ? ' is-adopted' : ''}` },
        h('header', { class: 'bs-card-head' },
            h('h3', { class: 'bs-card-title' }, card.title),
            adopted ? h('span', { class: 'bs-tag bs-tag-accent' }, '已采纳') : null),
        h('dl', { class: 'bs-dl' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
        adopted
            ? h('p', { class: 'bs-muted' }, '已成为引导中的暗线，可以在「暗线」里调整或放弃。')
            : [
                field('强度', segmented(INTENSITY_LABEL, intensity, v => { intensity = v; ui.planIntensity[index] = v; }, '引导强度')),
                replaces ? h('p', { class: 'bs-warn' }, `采纳后会替换当前的引导「${current.title}」。`) : null,
                h('div', { class: 'bs-actions' },
                    h('button', {
                        type: 'button',
                        class: 'bs-btn bs-btn-primary',
                        onclick: async () => {
                            const ok = await ctx.call(() => ctx.api.adopt(card, intensity), '方案已采纳');
                            if (ok) {
                                ui.adopted = new Set([index]);
                                ctx.render();
                            }
                        },
                    }, replaces ? '替换并采纳' : '采纳')),
            ]);
}

