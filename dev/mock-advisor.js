// 预览用：模拟剧情参谋。回复内容是写死的样例，按用户消息里的关键词挑。

/** @param {any} state */
export function sampleCards(state) {
    const [a, b] = state.threads;
    const single = {
        title: b ? `先推一把：${short(b.title)}` : '先埋一个钩子',
        goal: '让相关人物在主角面前露出一点破绽，但不点破',
        firstSigns: '对方说话时第一次避开了主角的眼睛',
        fit: b ? `接着「${short(b.title)}」这条线，眼下正好有人在场` : '眼前的场景里正好有人可以用',
        threadId: b?.id ?? null,
        suggestedIntensity: 'normal',
    };
    const staged = {
        title: a ? `分四步揭开：${short(a.title)}` : '分四步把事情揭开',
        goal: '从一点异样开始，最后让关键人物和主角当面说开',
        firstSigns: '熟人的说法前后对不上',
        fit: a ? `「${short(a.title)}」已经埋得够久，适合慢慢收网` : '现有的伏笔够多，适合收网',
        threadId: a?.id ?? null,
        suggestedIntensity: 'normal',
        beats: [
            { title: '露出一点不对劲', goal: '主角注意到一个反常的小细节', firstSigns: '熟人的说法前后对不上' },
            { title: '有人刻意回避', goal: '相关的人开始躲着主角', firstSigns: '有人在主角经过时刻意压低了声音' },
            { title: '证据落到主角手里', goal: '一件实物让事情坐实', firstSigns: '抽屉里多了一样不属于主角的东西' },
            { title: '当面摊牌', goal: '关键人物和主角把话说开', firstSigns: '对方约主角在没人的地方见面' },
        ],
    };
    return { single, staged };
}

/** 按消息挑一条回复；返回 null 表示这次要失败 */
export function reply(text, state, failAll) {
    if (failAll || /失败|出错/.test(text)) return null;
    const { single, staged } = sampleCards(state);
    if (/阶段|整理|排成/.test(text)) {
        return { text: '可以把它拆成四拍，一拍只往前走一小步，主角每一步都有机会自己察觉，不会显得硬凑。最后一拍再让人当面说开。\n\n另外，如果你想先试试水，也可以只用一个单步方案。', cards: [staged, single] };
    }
    if (/最该|哪条/.test(text)) {
        return { text: `我会先推「${short(state.threads[0]?.title ?? '第一条线')}」：它埋得最久，牵扯的人也正好在主角身边。其他几条可以再放一放，等这条有了动静再说。`, cards: [] };
    }
    return { text: '眼下有两个方向：一是顺着已经在发展的线推一小步，让人物露出破绽；二是把埋得最久的那条线排成几个阶段慢慢收网。我先给你第一个方向的方案，想要分阶段的话告诉我。', cards: [single] };
}

/** 预置的多轮对话（含单步卡、分阶段卡和一条失败回复） */
export function multiTurnHistory(state) {
    const { single, staged } = sampleCards(state);
    const t0 = Date.now() - 600000;
    return [
        { role: 'user', text: '接下来可以怎么走？', cards: [], at: t0 },
        { role: 'assistant', text: '眼下有两个方向：一是顺着已经在发展的线推一小步，让人物露出破绽；二是把埋得最久的那条线排成几个阶段慢慢收网。先给你第一个方向的方案。', cards: [single], at: t0 + 1000 },
        { role: 'user', text: '第二个方向也展开说说，排成几个阶段吧', cards: [], at: t0 + 60000 },
        { role: 'assistant', text: '可以拆成四拍，一拍只往前走一小步，主角每一步都有机会自己察觉。', cards: [staged], at: t0 + 61000 },
        { role: 'user', text: '能不能让更多人卷进来？', cards: [], at: t0 + 120000 },
        { role: 'assistant', text: '', cards: [], at: t0 + 150000, error: '请求超时（30 秒内没有收到回复）' },
    ];
}

function short(title) {
    const s = String(title ?? '');
    return s.length > 14 ? `${s.slice(0, 14)}…` : s;
}
