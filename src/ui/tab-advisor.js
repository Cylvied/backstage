// 「参谋」标签页：和剧情参谋多轮对话；回复下方附方案卡，可直接采纳。
// 对话记录由 api.advisor 按聊天保存，切换聊天后自然显示另一份。

import { h, confirmButton } from './dom.js';
import { ADVISOR_EXAMPLES, retryText } from './format.js';
import { planCard } from './plan-card.js';

/** @typedef {import('../types.js').AdvisorMessage} AdvisorMessage */

/** @param {any} ctx */
export function renderAdvisor(ctx) {
    const { api, ui } = ctx;
    const history = api.advisor.history() ?? [];
    const busy = api.advisor.busy();

    // 记录或"在想"状态变了 → 渲染后滚到底
    const sig = `${history.length}|${history.at(-1)?.at ?? ''}|${busy}`;
    if (sig !== ui.advisorSig) {
        ui.advisorSig = sig;
        ui.scrollToEnd = true;
    }

    const list = h('div', { class: 'bs-chat', role: 'log', 'aria-live': 'polite' });
    if (!history.length && !busy) {
        list.append(h('div', { class: 'bs-empty bs-chat-empty' },
            h('p', { class: 'bs-empty-title' }, '和参谋聊聊接下来的剧情'),
            h('p', null, '它读过现在的人物和暗线。可以随便问，也可以让它把想法排成几个阶段；满意的方案点「采纳」就会成为引导。'),
            h('div', { class: 'bs-examples' }, ADVISOR_EXAMPLES.map(q =>
                h('button', { type: 'button', class: 'bs-btn bs-example', onclick: () => send(ctx, q) }, q)))));
    }
    history.forEach((m, i) => list.append(message(ctx, m, i, history, busy)));
    if (busy) {
        list.append(h('div', { class: 'bs-msg is-assistant bs-thinking', role: 'status' },
            h('span', { class: 'bs-spinner', 'aria-hidden': 'true' }), h('span', null, '参谋在想…')));
    }

    return h('div', { class: 'bs-advisor' }, list, composer(ctx, history, busy));
}

/** @param {any} ctx @param {AdvisorMessage} m @param {number} i @param {AdvisorMessage[]} history @param {boolean} busy */
function message(ctx, m, i, history, busy) {
    if (m.role === 'user') return h('div', { class: 'bs-msg is-user' }, h('div', { class: 'bs-bubble' }, m.text));
    if (m.error) {
        const again = retryText(history, i);
        return h('div', { class: 'bs-msg is-assistant is-error', role: 'alert' },
            h('p', { class: 'bs-msg-error-title' }, '参谋没能回复'),
            h('p', { class: 'bs-msg-text' }, m.error),
            again ? h('div', { class: 'bs-actions' },
                h('button', { type: 'button', class: 'bs-btn', disabled: busy, onclick: () => send(ctx, again) }, '重试')) : null);
    }
    const cards = Array.isArray(m.cards) ? m.cards : [];
    return h('div', { class: 'bs-msg is-assistant' },
        m.text ? h('div', { class: 'bs-msg-text' }, m.text) : null,
        cards.length ? h('div', { class: 'bs-msg-cards' }, cards.map((card, j) => planCard(ctx, card, `${m.at}:${j}`))) : null);
}

/** @param {any} ctx @param {AdvisorMessage[]} history @param {boolean} busy */
function composer(ctx, history, busy) {
    const { ui } = ctx;
    const input = h('textarea', {
        class: 'bs-input bs-composer-input',
        rows: 2,
        'data-keep': 'advisor-input',
        'aria-label': '给参谋的消息',
        placeholder: busy ? '参谋在想，稍等…' : '想聊什么？回车换行，点「发送」发出',
    }, ui.advisorDraft);
    const sendBtn = h('button', { type: 'button', class: 'bs-btn bs-btn-primary bs-send', disabled: busy || !ui.advisorDraft.trim() }, '发送');
    input.addEventListener('input', () => {
        ui.advisorDraft = input.value;
        sendBtn.disabled = busy || !input.value.trim();
    });
    // 桌面上 Ctrl/⌘ + 回车也能发送；单独回车保持换行
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            sendBtn.click();
        }
    });
    sendBtn.addEventListener('click', () => send(ctx, ui.advisorDraft, true));

    return h('div', { class: 'bs-composer' },
        h('div', { class: 'bs-composer-tools' },
            h('button', {
                type: 'button',
                class: 'bs-btn bs-btn-quiet bs-btn-small',
                disabled: busy || !history.length,
                title: '让参谋把目前的讨论整理成可以采纳的方案卡',
                onclick: () => send(ctx, null),
            }, '整理成方案'),
            history.length && !busy
                ? confirmButton('清空对话', '确认清空', () => ctx.call(() => ctx.api.advisor.clear(), '对话已清空'))
                : null),
        h('div', { class: 'bs-composer-row' }, input, sendBtn));
}

/**
 * 发送一条消息（text 为 null 时是「整理成方案」）。
 * 模型失败时 api 会把带 error 的回复写进记录，界面里直接看得到；其他错误（如正忙）用提示条说明。
 * @param {any} ctx
 * @param {string|null} text
 * @param {boolean} [fromDraft]
 */
async function send(ctx, text, fromDraft = false) {
    const { api, ui } = ctx;
    if (api.advisor.busy()) return;
    if (text !== null && !String(text).trim()) return;
    const draft = ui.advisorDraft;
    if (fromDraft) ui.advisorDraft = '';
    const before = (api.advisor.history() ?? []).length;
    try {
        await (text === null ? api.advisor.summarize() : api.advisor.send(String(text)));
    } catch (error) {
        const after = api.advisor.history() ?? [];
        const logged = after.length > before && after.at(-1)?.role === 'assistant' && after.at(-1)?.error;
        if (!logged) {
            ctx.notify(String(error?.message ?? error), 'error');
            if (fromDraft && after.length === before) ui.advisorDraft = draft; // 没发出去：把输入还给用户
        }
    }
    ctx.render();
}
