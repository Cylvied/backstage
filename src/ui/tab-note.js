// 「纸条」标签页：下一轮会注入正文的原文，以及每条迹象的来源。

import { h } from './dom.js';
import { injectionSummary, sourceText } from './signal-sources.js';

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
    const sum = injectionSummary(ctx.api.getState(), settings);
    wrap.append(h('p', { class: 'bs-inject-summary', role: 'status' }, sum.total
        ? `本轮候选 ${sum.total} 条迹象，实际注入 ${sum.injected} 条${sum.disabled ? '（暗流注入已关闭）' : ''}`
        : '本轮没有候选迹象'));

    if (!p.undercurrent && !p.guide) {
        wrap.append(empty('本轮不注入', settings.injectUndercurrent
            ? '没有和眼前剧情相关的暗流，也没有正在引导的线。'
            : '暗流注入已在设置里关闭，也没有正在引导的线。'));
    }
    if (p.undercurrent) {
        wrap.append(block('暗流', `深度 ${settings.injectDepth}`, p.undercurrent,
            sum.picked.length ? h('ul', { class: 'bs-sources', 'aria-label': '本轮注入的迹象及来源' }, sum.picked.map(sourceItem)) : null));
    }
    if (sum.skipped.length) wrap.append(skippedNote(sum));
    if (p.guide) wrap.append(block('引导', p.guidePush ? '深度 0 · 尽快引爆' : `深度 ${settings.injectDepth}`, p.guide));
    return wrap;
}

/** @param {import('./signal-sources.js').SignalEntry} s */
function sourceItem(s) {
    return h('li', { class: 'bs-source' },
        h('span', { class: 'bs-source-voice' }, s.voiceLabel),
        h('span', { class: 'bs-source-text' }, s.text),
        h('span', { class: 'bs-source-from' }, sourceText(s) || '来源不明',
            s.bornRun !== null ? h('span', { class: 'bs-source-run' }, `第 ${s.bornRun} 轮产生`) : null));
}

/** 没注入的迹象：一行说明，点开按原因分组列出 */
function skippedNote(sum) {
    const count = sum.skipped.reduce((n, g) => n + g.items.length, 0);
    const only = sum.skipped.length === 1 ? sum.skipped[0] : null;
    const title = only?.reason === 'orphan' ? `另有 ${count} 条迹象没有挂在暗线或人物上，未注入`
        : only ? `另有 ${count} 条迹象未注入：${only.label}`
        : `另有 ${count} 条迹象未注入`;
    return h('details', { class: 'bs-orphans' },
        h('summary', null, title),
        sum.skipped.map(g => h('div', { class: 'bs-skip-group' },
            only ? null : h('p', { class: 'bs-skip-reason' }, `${g.label} · ${g.items.length} 条`),
            h('ul', { class: 'bs-sources' }, g.items.map(sourceItem)))));
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
