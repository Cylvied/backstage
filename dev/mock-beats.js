// 预览数据：造一条进行到第 2 拍的分阶段引导（字段按 INTERFACES 3.9 节）。
// 采纳 / 换拍 / 跳过用的是 src/sim/apply.js 里的正式实现。

const clone = s => structuredClone(s);

/** 预览数据：把第一条线改成进行到第 2 拍的分阶段引导 */
export function seedStagedGuide(state, reached) {
    const next = clone(state);
    for (const t of next.threads) if (t.guide?.status === 'active') t.guide.status = 'dropped';
    const t = next.threads[0];
    if (!t) return next;
    t.origin = 'user';
    t.guide = {
        intensity: 'normal',
        goal: `让「${t.title}」分几步浮出水面，最后正面摆到主角面前`,
        firstSigns: '有人在主角经过时刻意压低了声音',
        status: 'active',
        adoptedAt: Date.now() - 3600000,
        beats: [
            { title: '露出一点不对劲', goal: '主角注意到一个反常的小细节', firstSigns: '熟人的说法前后对不上', status: 'done' },
            { title: '有人刻意回避', goal: '相关的人开始躲着主角，或者岔开话题', firstSigns: '有人在主角经过时刻意压低了声音', status: 'active' },
            { title: '证据落到主角手里', goal: '一件实物或一句原话让事情坐实', firstSigns: '抽屉里多了一样不属于主角的东西', status: 'pending' },
            { title: '当面摊牌', goal: '关键人物不得不和主角把话说开', firstSigns: '对方主动约主角在没人的地方见面', status: 'pending' },
        ],
        beatIndex: 1,
        reached: Boolean(reached),
    };
    return next;
}
