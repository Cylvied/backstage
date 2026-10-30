// 「纸条」标签页：下一轮会注入正文的原文、每条迹象的来源；
// 底部是最近一次推演的检查与审核、读了哪些资料（v1.5）。

import { h } from './dom.js';
import { injectionSummary, sourceText, eventText } from './signal-sources.js';
import { reviewView, loreGroups, tokenText } from './world.js';
import { LOG_PREFIX } from '../constants.js';

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

    const latest = latestFloorInfo(ctx.api);
    wrap.append(reviewSection(latest), loreSection(latest));
    return wrap;
}

/** @param {import('./signal-sources.js').SignalEntry} s */
function sourceItem(s) {
    return h('li', { class: 'bs-source' },
        h('span', { class: 'bs-source-voice' }, s.voiceLabel),
        h('span', { class: 'bs-source-text' }, s.text),
        s.event ? h('span', { class: `bs-source-event${s.eventKnown ? '' : ' is-unknown'}` }, eventText(s)) : null,
        h('span', { class: 'bs-source-from' }, sourceText(s) || '来源不明',
            s.bornRun !== null ? h('span', { class: 'bs-source-run' }, `第 ${s.bornRun} 轮产生`) : null));
}

/** 没注入的迹象：一行说明，点开按原因分组列出 */
function skippedNote(sum) {
    const count = sum.skipped.reduce((n, g) => n + g.items.length, 0);
    const only = sum.skipped.length === 1 ? sum.skipped[0] : null;
    const title = only?.reason === 'orphan' ? `另有 ${count} 条迹象没有挂在暗线、人物或事件上，未注入`
        : only ? `另有 ${count} 条迹象未注入：${only.label}`
        : `另有 ${count} 条迹象未注入`;
    return h('details', { class: 'bs-orphans' },
        h('summary', null, title),
        sum.skipped.map(g => h('div', { class: 'bs-skip-group' },
            only ? null : h('p', { class: 'bs-skip-reason' }, `${g.label} · ${g.items.length} 条`),
            h('ul', { class: 'bs-sources' }, g.items.map(sourceItem)))));
}

/**
 * 当前状态来自哪一层的推演：从最新一楼往前找第一个有效的推演记录（与基底查找的方向一致）。
 * 只往前看 60 层，够用且不拖慢重画。
 * @returns {{ floor: number, info: any }|null}
 */
function latestFloorInfo(api) {
    const length = globalThis.SillyTavern?.getContext?.()?.chat?.length
        ?? Math.max(-1, ...[...document.querySelectorAll('#chat .mes[mesid]')].map(m => Number(m.getAttribute('mesid'))).filter(Number.isInteger)) + 1;
    for (let floor = length - 1; floor >= 0 && floor >= length - 60; floor--) {
        try {
            const info = api.getFloorInfo(floor);
            if (info && info.valid) return { floor, info };
        } catch (error) {
            console.warn(LOG_PREFIX, '读取楼层信息失败', floor, error);
        }
    }
    return null;
}

/** 本轮检查与审核：送审 / 通过 / 丢弃（逐条：哪一项、被谁、原因）；审核员失败时说明已放行 */
function reviewSection(latest) {
    const head = sectionHead('本轮检查与审核', latest);
    if (!latest) return section(head, muted('还没有推演记录。'));
    if (latest.info.status === 'failed') return section(head, muted('这一轮推演失败，没有检查与审核记录。'));
    const v = reviewView(latest.info.review);
    if (!v) return section(head, muted(latest.info.status === 'manual' ? '这一层是手动编辑，没有经过推演检查。' : '这一层没有检查与审核记录（较早版本的推演）。'));

    const stats = v.reviewed
        ? `送审 ${v.reviewed} 条 · 通过 ${v.approved} 条 · 被丢弃 ${v.rejected.length} 条`
        : v.rejected.length ? `没有需要审核员把关的改动 · 程序检查丢弃 ${v.rejected.length} 条` : '没有需要审核员把关的改动，程序检查也没有发现问题';
    return section(head,
        v.error ? h('p', { class: 'bs-warn', role: 'alert' }, `审核失败，已放行：${v.error}`) : null,
        h('p', { class: 'bs-review-stats' }, stats, v.model && v.reviewed ? h('span', { class: 'bs-muted' }, ` · 审核模型 ${v.model}`) : null),
        v.rejected.length ? h('ul', { class: 'bs-sources bs-rejects', 'aria-label': '被丢弃的条目' }, v.rejected.map(r => h('li', { class: 'bs-source bs-reject' },
            h('span', { class: 'bs-source-voice' }, r.kind),
            h('span', { class: 'bs-source-text' }, r.summary),
            h('span', { class: 'bs-source-from' }, `${r.by === '审核员' ? '被审核员驳回' : '被程序检查丢弃'}：${r.reason}`)))) : null);
}

/** 本轮推演读了哪些资料：按层分组，每条标题和 token，合计 */
function loreSection(latest) {
    const head = sectionHead('本轮推演读了哪些资料', latest);
    if (!latest || latest.info.status === 'failed' || latest.info.status === 'manual') return section(head, muted('这一层没有推演读取记录。'));
    const g = loreGroups(latest.info.loreUsed);
    if (!g.count) return section(head, muted(Array.isArray(latest.info.loreUsed) ? '这一轮没有读世界书。' : '这一层没有资料读取记录（较早版本的推演）。'));
    return section(head,
        h('p', { class: 'bs-review-stats' }, `世界书 ${g.count} 条 · 合计约 ${tokenText(g.total)} token`),
        g.groups.map(group => h('details', { class: 'bs-lore-group' },
            h('summary', null, h('span', null, group.label), h('span', { class: 'bs-muted' }, `${group.items.length} 条 · ${tokenText(group.tokens)} token`)),
            h('ul', { class: 'bs-lore-list' }, group.items.map(x => h('li', null,
                h('span', { class: 'bs-lore-title' }, x.title, x.world ? h('span', { class: 'bs-muted' }, ` · ${x.world}`) : null),
                h('span', { class: 'bs-lore-tokens' }, tokenText(x.tokens))))))));
}

function sectionHead(title, latest) {
    return h('header', { class: 'bs-note-head' }, h('h3', { class: 'bs-card-title' }, title),
        latest ? h('span', { class: 'bs-muted' }, `第 ${latest.floor} 楼的推演`) : null);
}

function section(head, ...children) {
    return h('section', { class: 'bs-note bs-note-meta' }, head, ...children);
}

function muted(text) {
    return h('p', { class: 'bs-muted bs-note-empty' }, text);
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
