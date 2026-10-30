// 预览用的 v1.5 世界模型数据：事件记录、行动开始时间、审核记录、资料来源、世界书条目。
// world=full（默认）补齐全部新字段；world=none 有时间戳但没有事件；world=legacy 去掉全部新字段（模拟旧快照）。

/** @param {any} state @param {string} mode */
export function seedWorld(state, mode) {
    const next = structuredClone(state);
    if (mode === 'legacy') {
        delete next.chronicle;
        delete next.loreWanted;
        for (const c of next.characters) {
            if (c.currentAction) delete c.currentAction.since;
            if (c.longAction) delete c.longAction.since;
        }
        for (const s of next.signals) delete s.eventId;
        return next;
    }
    const day = Number.isInteger(next.clock?.day) ? next.clock.day : 1;
    const at = (d, slot) => ({ day: Math.max(1, day - d), slot });
    next.characters.forEach((c, i) => {
        if (c.currentAction) c.currentAction.since = at(0, i % 2 ? '午后' : next.clock.slot || '');
        // 第三个人的长期行动不给时间，模拟"开始时间不明"
        if (c.longAction && i !== 2) c.longAction.since = at(2 + i, i % 2 ? '清晨' : '傍晚');
    });
    next.loreWanted = [{ title: '启明高中校史', sinceRun: Math.max(0, next.runCount - 1) }];
    if (mode === 'none' || !next.characters.length) {
        next.chronicle = [];
        return next;
    }

    const [c1, c2 = c1, c3 = c1] = next.characters;
    const [t1, t2 = t1, t3 = t1] = next.threads.length ? next.threads : [{ id: null }];
    const school = c1.id === 'c_sgd001';
    const text = school ? [
        '陈老师把三年前的退学档案从教务处借走，至今没有归还',
        '周牧在体育馆后门见了一个校外的人，对方递给他一个信封',
        '林知夏在旧校刊里找到一张被裁掉一半的合影',
        '校长办公室开会定下：保送名单下周一公示',
        '高小满把纸条的事告诉了孙悦',
        '有人在天台门锁上缠了一圈新铁丝',
    ] : [
        `${c3.name}办完了一件交代下来的差事`,
        `${c2.name}私下见了一个外人，对方留下一样东西`,
        `${c1.name}找到了一条旧线索`,
        '上面定下了一件要公布的事',
        `${c2.name}把听来的消息转告了别人`,
        '某处的门锁被人换过',
    ];
    const ids = text.map((_, i) => `e_mock0${i}`);
    next.chronicle = [
        { id: ids[0], at: at(4, '傍晚'), text: text[0], characterIds: [c3.id], threadIds: [t1.id, t3.id].filter(Boolean), known: true, knownAt: at(3, '午后') },
        { id: ids[1], at: at(3, '夜里'), text: text[1], characterIds: [c2.id], threadIds: [t3.id].filter(Boolean), known: false, knownAt: null },
        { id: ids[2], at: at(2, '午后'), text: text[2], characterIds: [c1.id], threadIds: [t1.id].filter(Boolean), known: false, knownAt: null },
        { id: ids[3], at: at(1, '清晨'), text: text[3], characterIds: [c3.id, c2.id], threadIds: [t3.id].filter(Boolean), known: true, knownAt: at(1, '早读') },
        { id: ids[4], at: at(0, '午休'), text: text[4], characterIds: ['c_gone00'], threadIds: [t2.id].filter(Boolean), known: false, knownAt: null },
        { id: ids[5], at: at(0, next.clock.slot || ''), text: text[5], characterIds: [], threadIds: [t2.id].filter(Boolean), known: false, knownAt: null },
        // 旧版本写入、没有时间的事件
        { id: 'e_mockold', at: { day: null, slot: '' }, text: school ? '据说三年前也有人在天台出过事' : '据说很久以前也出过类似的事', characterIds: [], threadIds: [t1.id].filter(Boolean), known: false, knownAt: null },
    ];
    // 迹象指向事实：第一条指向一件主角还不知道的事
    if (next.signals[0]) next.signals[0].eventId = ids[1];
    return next;
}

/**
 * 审核记录。review=rejects（默认）有驳回 / fail 审核员失败已放行 / clean 没有高风险改动 / none 旧数据没有记录
 * @param {string} mode
 */
export function mockReview(mode) {
    if (mode === 'none') return undefined;
    if (mode === 'clean') return { reviewed: 0, approved: 0, rejected: [], error: null, usage: null };
    if (mode === 'fail') {
        return {
            reviewed: 3, approved: 3, error: '审核员返回的内容无法解析（缺少 verdicts）',
            rejected: [{ item: { id: 'p1', kind: 'reference', summary: '迹象指向了不存在的事件 e_zzz999', ref: {} }, by: 'program', reason: '引用的事件不存在' }],
            usage: { model: 'gemini-2.5-flash', ms: 2100 },
        };
    }
    return {
        reviewed: 4, approved: 2, error: null,
        rejected: [
            { item: { id: 'p1', kind: 'clock', summary: '时钟从第 6 天退回第 5 天', ref: {} }, by: 'program', reason: '时间不能倒退' },
            { item: { id: 'r2', kind: 'event', summary: '新发生的事：陈老师连夜去了省城教育厅', ref: {} }, by: 'reviewer', reason: '正文里陈老师傍晚还在批改周记，一个晚上来不及往返省城' },
            { item: { id: 'r4', kind: 'knows', summary: '周牧新得知：知道林知夏在查退学名单（没有写渠道）', ref: {} }, by: 'reviewer', reason: '周牧和林知夏这两天没有接触，也没有旁人可能告诉他' },
        ],
        usage: { model: 'gemini-2.5-flash', ms: 1850 },
    };
}

/** lore=fail 时 listLoreEntries 失败；lore=empty 时这一轮没读世界书 */
export function mockLoreUsed(mode) {
    if (mode === 'legacy') return undefined;
    if (mode === 'empty') return [];
    return [
        { world: '启明高中', uid: 1, title: '学校总览与年级分布', layer: 'pinned', tokens: 2380 },
        { world: '启明高中', uid: 2, title: '校园地图', layer: 'pinned', tokens: 1460 },
        { world: '启明高中', uid: 7, title: '天台', layer: 'triggered', tokens: 520 },
        { world: '启明高中', uid: 9, title: '高三（2）班', layer: 'triggered', tokens: 880 },
        { world: '人物设定', uid: 'chen', title: '陈老师', layer: 'backstage', tokens: 940 },
        { world: '人物设定', uid: 'zhou', title: '周牧', layer: 'backstage', tokens: 760 },
        { world: '启明高中', uid: 15, title: '保送制度', layer: 'backstage', tokens: 610 },
        { world: '启明高中', uid: 21, title: '启明高中校史', layer: 'requested', tokens: 3120 },
    ];
}

/** 世界书条目列表（推演专用常驻的候选） */
export function mockLoreEntries() {
    const base = [
        ['启明高中', 1, '学校总览与年级分布', 2380], ['启明高中', 2, '校园地图', 1460], ['启明高中', 7, '天台', 520],
        ['启明高中', 9, '高三（2）班', 880], ['启明高中', 15, '保送制度', 610], ['启明高中', 21, '启明高中校史', 3120],
        ['启明高中', 22, '教务处与档案室', 740], ['启明高中', 23, '体育馆', 430],
        ['人物设定', 'chen', '陈老师', 940], ['人物设定', 'zhou', '周牧', 760], ['人物设定', 'lin', '林知夏', 820],
        ['人物设定', 'gao', '高小满', 510], ['人物设定', 'sun', '孙悦', 690],
        ['城市', 'c1', '城区总览（超长条目）', 98000],
    ].map(([world, uid, title, tokens]) => ({ world, uid, title, tokens }));
    // 再补一批，测试搜索和"只显示前 N 条"
    for (let i = 1; i <= 160; i++) base.push({ world: '杂项', uid: 1000 + i, title: `杂项条目 ${i}`, tokens: 100 + (i * 37) % 900 });
    return base;
}
