// 「纸条」标签页：下一轮会注入正文的原文。

import { h } from './dom.js';

/** @param {any} ctx */
export function renderNote(ctx) {
    const settings = ctx.api.settings.get();
    const wrap = h('div', { class: 'bs-list' });
    wrap.append(h('p', { class: 'bs-lead bs-muted' }, '下一轮生成时，正文模型会额外看到下面这些文字。'));

    if (!settings.enabled) {
        wrap.append(empty('后台推演已关闭', '本轮不注入任何内容。'));
        return wrap;
    }
    const p = ctx.api.previewInjection();
    if (!p.undercurrent && !p.guide) {
        wrap.append(empty('本轮不注入', settings.injectUndercurrent
            ? '没有和眼前剧情相关的暗流，也没有正在引导的线。'
            : '暗流注入已在设置里关闭，也没有正在引导的线。'));
        return wrap;
    }
    if (p.undercurrent) wrap.append(block('暗流', `深度 ${settings.injectDepth}`, p.undercurrent));
    if (p.guide) wrap.append(block('引导', p.guidePush ? '深度 0 · 尽快引爆' : `深度 ${settings.injectDepth}`, p.guide));
    return wrap;
}

function block(title, where, text) {
    return h('section', { class: 'bs-note' },
        h('header', { class: 'bs-note-head' }, h('h3', { class: 'bs-card-title' }, title), h('span', { class: 'bs-muted' }, where)),
        h('pre', { class: 'bs-pre' }, text));
}

function empty(title, text) {
    return h('div', { class: 'bs-empty' }, h('p', { class: 'bs-empty-title' }, title), h('p', null, text));
}
