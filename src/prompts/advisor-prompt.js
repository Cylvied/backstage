// 剧情参谋对话提示词。纯函数，不访问宿主。
// 和一次性规划的区别：可以多轮讨论；参谋平时用文字回答，只有给出具体方案时才在末尾附方案卡。

import { materials } from './shared.js';
import { extractJsonBlock, parsePlanOutput } from '../sim/parse.js';

/** @typedef {import('../types.js').SimState} SimState */
/** @typedef {import('../types.js').SimInput} SimInput */
/** @typedef {import('../types.js').ChatMessage} ChatMessage */
/** @typedef {import('../types.js').PlanCard} PlanCard */
/** @typedef {import('../types.js').AdvisorMessage} AdvisorMessage */

/** 发给模型的历史条数上限（不含本次），太长会挤占资料 */
export const ADVISOR_HISTORY_LIMIT = 12;

const ROLE = `你是一个故事的剧情参谋。用户正在和另一位作者一起写这个故事，用户扮演主角。你在幕后和用户商量：故事接下来可以怎么走。

你能看到这个故事的设定、最近的正文，以及一份"幕后状态"：镜头外的人物各自在做什么、有哪些暗线和伏笔正在发展。

你不写正文，不替主角做决定。你讨论的是"世界和其他人物会怎样"，主角怎么应对永远留给用户。`;

const RULES = `## 怎么和用户讨论

1. 先回应用户真正问的事。用户问"为什么"，就解释；用户说想法，就帮他把想法落到具体的人物和暗线上；用户只是闲聊，就自然地聊。
2. 说话要具体：点名是哪个人物、哪条暗线、哪段前文。不说"增加戏剧张力""制造冲突"这类空话。
3. 尊重人物：人物的反应要符合他们的动机、认知和处境，不能为了剧情突然变性格或凭空知道事情。
4. 用户的想法和现有设定冲突时，直说冲突在哪，再给出调和的办法。
5. 回答简洁，一般不超过 300 字。用户要求详细展开时再展开。
6. 用户明确要你代写正文或台词时，可以写，但要说明这是草稿，只写用户点名的那一段。

## 什么时候给方案卡

只有在这两种情况下，才在回答的最后附方案卡：
- 用户要你出方案、给几个方向、整理成方案；
- 讨论已经收敛到一个具体可执行的走向，你判断用户可能想直接采用。

其余时候只用文字回答，不要附方案卡。

方案卡的规则：
- 优先挂在幕后状态里一条已有的暗线上（填它的 threadId）。只有现有的线都不合适时才写 null，并在 fit 里说明它从哪个人物或哪段前文长出来。
- 最多 3 张，彼此要有明显区别。
- goal：希望达到的结果，一两句话。firstSigns：这件事开头时主角身边可能先出现的一两个迹象。fit：为什么贴合当前故事，要具体。suggestedIntensity：seed 只铺垫、normal 自然推进、push 尽快引爆。

方案卡的格式：在文字回答之后，单独附一个 json 代码块：

\`\`\`json
{ "cards": [ { "title": "", "goal": "", "firstSigns": "", "fit": "", "threadId": "t_……或null", "suggestedIntensity": "normal" } ] }
\`\`\``;

/**
 * 把历史里的方案卡压成一行文字，让模型知道之前给过什么，又不占太多篇幅。
 * @param {PlanCard[]} cards
 */
function cardsAsText(cards) {
    return cards.map((c, i) => `（方案${i + 1}：${c.title}——${c.goal}）`).join('\n');
}

/**
 * @param {{ state: SimState, input: SimInput, history: AdvisorMessage[], message: string }} args
 * @returns {ChatMessage[]}
 */
export function buildAdvisorPrompt({ state, input, history, message }) {
    const recent = history.slice(-ADVISOR_HISTORY_LIMIT);
    /** @type {ChatMessage[]} */
    const turns = recent.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.role === 'user' || !m.cards?.length ? m.text : `${m.text}\n\n${cardsAsText(m.cards)}`.trim(),
    })).filter(m => m.content.trim());

    return [
        { role: 'system', content: `${ROLE}\n\n${RULES}` },
        { role: 'user', content: `${materials(state, input)}\n\n以上是这个故事目前的资料。接下来我们讨论剧情。` },
        { role: 'assistant', content: '资料我读完了。你想聊什么？' },
        ...turns,
        { role: 'user', content: String(message ?? '').trim() },
    ];
}

/**
 * 把参谋的回复拆成文字和方案卡。没有方案卡、或方案卡格式坏了，都不算失败：文字照常显示。
 * @param {string} text
 * @returns {{ text: string, cards: PlanCard[] }}
 */
export function splitAdvisorReply(text) {
    const raw = String(text ?? '');
    const withoutThink = raw.replace(/<(think|thinking)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');

    let cards = [];
    const block = withoutThink.match(/```json\s*([\s\S]*?)```/i);
    const candidate = block ? block[1] : null;
    if (candidate !== null) {
        const value = extractJsonBlock(`\`\`\`json\n${candidate}\n\`\`\``);
        if (value && typeof value === 'object' && Array.isArray(value.cards)) {
            const parsed = parsePlanOutput(`\`\`\`json\n${candidate}\n\`\`\``);
            if (parsed.ok) cards = parsed.cards;
        }
    }

    const prose = (block ? withoutThink.replace(block[0], '') : withoutThink).trim();
    return { text: prose, cards };
}
