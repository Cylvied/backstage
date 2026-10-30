// 把组装好的注入文本写进主聊天提示词。只负责"放在哪"，文本内容由 inject/compose.js 决定。

import { INJECT_KEY_MAIN, INJECT_KEY_PUSH } from '../constants.js';

const IN_CHAT = 1;      // extension_prompt_types.IN_CHAT
const ROLE_SYSTEM = 0;  // extension_prompt_roles.SYSTEM

function setPrompt(key, text, depth) {
    globalThis.SillyTavern.getContext().setExtensionPrompt(key, text, IN_CHAT, depth, false, ROLE_SYSTEM);
}

/**
 * @param {{ undercurrent: string, guide: string, guidePush: boolean }} parts
 * @param {import('../types.js').Settings} settings
 */
export function apply({ undercurrent, guide, guidePush }, settings) {
    if (!settings.enabled) return clear();

    // 同一深度的多条注入会被宿主合成一条消息，所以暗流和普通引导放进同一个键，顺序由这里决定
    const main = [
        settings.injectUndercurrent ? undercurrent : '',
        guidePush ? '' : guide,
    ].filter(Boolean).join('\n\n');

    setPrompt(INJECT_KEY_MAIN, main, settings.injectDepth);
    // 深度 0 = 放在用户最新输入之后，分量最重，只给"尽快引爆"的引导用
    setPrompt(INJECT_KEY_PUSH, guidePush ? guide : '', 0);
}

export function clear() {
    setPrompt(INJECT_KEY_MAIN, '', 1);
    setPrompt(INJECT_KEY_PUSH, '', 0);
}
