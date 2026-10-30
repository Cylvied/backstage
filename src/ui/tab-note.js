// 「纸条」标签页：下一轮会注入正文的原文，以及每条迹象的来源。

import { h } from './dom.js';
import { signalSources, sourceText, VOICE_LABEL } from './signal-sources.js';

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
    const { picked, orphans } = signalSources(ctx.api.getState(), settings);

    if (!p.undercurrent && !p.guide) {
        wrap.append(empty('本轮不注入', settings.injectUndercurrent
            ? '没有和眼前剧情相关的暗流，也没有正在引导的线。'
            : '暗流注入已在设置里关闭，也没有正在引导的线。'));
    }
    if (p.undercurrent) {
        wrap.append(block('暗流', `深度 ${settings.injectDepth}`, p.undercurrent,
            picked.length ? h('ul', { class: 'bs-sources', 'aria-label': '本轮注入的迹象及来源' }, picked.map(s =>
                h('li', { class: 'bs-source' },
                    h('span', { class: 'bs-source-voice' }, s.voiceLabel),
                    h('span', { class: 'bs-source-text' }, s.text),
                    h('span', { class: 'bs-source-from' }, sourceText(s))))) : null));
    }
    if (settings.injectUndercurrent && orphans.length) wrap.append(orphanNote(orphans));
    if (p.guide) wrap.append(block('引导', p.guidePush ? '深度 0 · 尽快引爆' : `深度 ${settings.injectDepth}`, p.guide));
    return wrap;
}

/** 没挂在暗线或人物上的迹象：不注入，折叠列出原文 */
function orphanNote(orphans) {
    return h('details', { class: 'bs-orphans' },
        h('summary', null, `另有 ${orphans.length} 条迹象没有挂在暗线或人物上，未注入`),
        h('ul', null, orphans.map(s => h('li', null, `【${VOICE_LABEL[s.voice] ?? '暗流'}】${String(s.text).trim()}`))));
}

function block(title, where, text, extra) {
    return h('section', { class: 'bs-note' },
        h('header', { class: 'bs-note-head' }, h('h3', { class: 'bs-card-title' }, title), h('span', { class: 'bs-muted' }, where)),
        h('pre', { class: 'bs-pre' }, text),
        extra ?? null);
}

function empty(title, text) {
    return h('div', { class: 'bs-empty' }, h('p', { class: 'bs-empty-title' }, title), h('p', null, text));
}
