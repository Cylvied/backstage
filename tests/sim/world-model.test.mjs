import { test, assert, readFixture, readFixtureJson } from '../harness.js';
import { emptyState } from '../../src/util.js';
import { parseSimOutput, parseReviewOutput } from '../../src/sim/parse.js';
import { checkPatch, extractReviewItems, applyVerdicts } from '../../src/sim/check.js';
import { applyPatch } from '../../src/sim/apply.js';
import { makeSnapshot, readSnapshot } from '../../src/state/snapshot-store.js';
const parse = value => parseSimOutput(JSON.stringify(value)).patch;
const sig = eventId => ({ voice: 'here', text: '消息', characterId: null, threadId: null, relevance: 2, eventId });
const action = extra => ({ text: '送信', duration: '两天', status: 'ongoing', outcome: null, ...extra });
function state() {
    return applyPatch(emptyState(), parse({ upsertCharacters: [{ name: '甲', aliases: ['阿甲'],
        knows: ['知道：旧信息'], longAction: action() }], upsertThreads: [{ title: '来信' }],
    addEvents: [{ text: '信已送出' }] }), { maxCharacters: 12 });
}
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}
const save = (state, extra = {}) => makeSnapshot({ floor: 0, swipeId: 0, text: '正文', state, ...extra });
const read = snapshot => readSnapshot({ extra: { backstage: snapshot } });

test('v1.5 解析仅保留白名单，程序字段无论类型均被丢弃', () => {
    const patch = parse({ addEvents: [{ text: '事实', at: 42, known: true, knownAt: {}, id: '伪造' }],
        markKnown: ['e_a', null], loreRequests: ['地图', 1], signals: [{ ...sig('new:0'), bornRun: 9 }],
        upsertCharacters: [{ name: '甲', currentAction: { text: '看信', duration: '片刻', since: 1 },
            longAction: { ...action(), since: { day: 99, slot: '' } } }] });
    assert.deepEqual(patch.addEvents, [{ text: '事实' }]);
    assert.deepEqual(patch.markKnown, ['e_a']);
    assert.deepEqual(patch.loreRequests, ['地图']);
    assert.equal(patch.signals[0].bornRun, undefined);
    assert.equal(patch.upsertCharacters[0].currentAction.since, undefined);
    assert.equal(patch.upsertCharacters[0].longAction.since, undefined);
    for (const key of ['addEvents', 'markKnown', 'loreRequests']) {
        assert.equal(parseSimOutput(JSON.stringify({ [key]: {} })).ok, false);
    }
});

test('解析坏事件不使 new:N 指向错误事件，空文本留给检查记录原因', () => {
    const patch = parse({ addEvents: [null, { text: '保留' }, { text: ' ' }],
        signals: [sig('new:0'), sig('new:1'), sig('new:2'), sig('new:9')] });
    const checked = checkPatch(emptyState(), patch);
    assert.deepEqual(checked.patch.addEvents, [{ text: '保留' }]);
    assert.deepEqual(checked.patch.signals.map(s => s.eventId), [null, 'new:0', null, null]);
    assert.equal(checked.rejected.length, 4);
});

test('程序检查只去掉坏引用与新无渠道认知，保留对象和合法项', () => {
    const base = state();
    const id = base.characters[0].id;
    const threadId = base.threads[0].id;
    const patch = parse({ upsertCharacters: [{ id, location: '城外',
        knows: ['知道：旧信息', '知道：无渠道', '知道：有渠道（来信）', '不知道：秘密', '知道：空渠道（ ）'] }],
    upsertThreads: [{ id: threadId, characterIds: [id, '不存在'] }],
    addEvents: [{ text: '事实', characterIds: ['阿甲', '不存在'], threadIds: [threadId, '错误'] }],
    signals: [{ ...sig('e_missing'), characterId: '错误', threadId }], markKnown: ['e_missing', base.chronicle[0].id] });
    const before = structuredClone(patch);
    const checked = checkPatch(freeze(base), freeze(patch));
    assert.deepEqual(patch, before);
    assert.equal(checked.patch.upsertCharacters[0].location, '城外');
    assert.deepEqual(checked.patch.upsertCharacters[0].knows, ['知道：旧信息', '知道：有渠道（来信）', '不知道：秘密']);
    assert.deepEqual(checked.patch.upsertThreads[0].characterIds, [id]);
    assert.deepEqual(checked.patch.addEvents[0].characterIds, ['阿甲']);
    assert.deepEqual(checked.patch.addEvents[0].threadIds, [threadId]);
    assert.equal(checked.patch.signals[0].threadId, threadId);
    assert.equal(checked.patch.signals[0].eventId, null);
    assert.deepEqual(checked.patch.markKnown, [base.chronicle[0].id]);
    assert.equal(checked.rejected.length, 8);
    assert.ok(checked.rejected.every(r => r.by === 'program' && r.reason && r.item.summary));
});

test('同一补丁的新人物与新暗线名称引用仍通过检查', () => {
    const checked = checkPatch(emptyState(), parse({ upsertCharacters: [{ name: '乙', aliases: ['阿乙'] }],
        upsertThreads: [{ title: '新线', characterIds: ['阿乙'] }],
        addEvents: [{ text: '送达', characterIds: ['乙'], threadIds: ['新线'] }],
        signals: [{ ...sig('new:0'), characterId: '阿乙', threadId: '新线' }] }));
    assert.deepEqual(checked.rejected, []);
});

test('五类高风险逐项提取，旧认知和已完成行动不重复送审', () => {
    const base = state();
    const patch = parse({ clock: { day: 3 }, addEvents: [{ text: '新事实' }], markKnown: [base.chronicle[0].id],
        upsertCharacters: [{ name: '阿甲', longAction: action({ status: 'done' }), knows: ['知道：旧信息', '知道：新信息（目击）'] }] });
    const items = extractReviewItems(base, patch, { bigJumpDays: 2 });
    assert.deepEqual(items.map(i => i.kind), ['clock', 'event', 'action_done', 'knows', 'mark_known']);
    assert.equal(new Set(items.map(i => i.id)).size, 5);
    assert.ok(items.every(i => i.summary && i.ref));
    base.characters[0].longAction.status = 'done';
    assert.equal(extractReviewItems(base, patch, { bigJumpDays: 3 }).some(i => ['clock', 'action_done'].includes(i.kind)), false);
});

test('裁决按原始位置批量删除，未知 id 忽略、缺裁决通过且不改入参', () => {
    const base = state();
    const patch = parse({ clock: { day: 4 }, addEvents: [{ text: '一' }, { text: '二' }, { text: '三' }],
        signals: [sig('new:0'), sig('new:1'), sig('new:2')], markKnown: [base.chronicle[0].id],
        upsertCharacters: [{ id: base.characters[0].id, location: '城外', longAction: action({ status: 'done' }),
            knows: ['知道：一（目击）', '知道：二（目击）', '知道：三（目击）'] }] });
    const items = extractReviewItems(base, patch, { bigJumpDays: 2 });
    const verdicts = items.filter(i => i.kind !== 'event' && i.kind !== 'knows' || i.ref.index === 0 && i.kind === 'event'
        || i.kind === 'knows' && i.ref.subIndex !== 1).map(i => ({ id: i.id, ok: false, reason: '依据不足' }));
    verdicts.push({ id: '不存在', ok: false, reason: '忽略' });
    const before = structuredClone(patch);
    const result = applyVerdicts(freeze(patch), freeze(items), freeze(verdicts));
    assert.deepEqual(patch, before);
    assert.equal(result.patch.clock, null);
    assert.deepEqual(result.patch.addEvents.map(e => e.text), ['二', '三']);
    assert.deepEqual(result.patch.signals.map(s => s.eventId), [null, 'new:0', 'new:1']);
    assert.deepEqual(result.patch.markKnown, []);
    assert.deepEqual(result.patch.upsertCharacters[0].knows, ['知道：二（目击）']);
    assert.equal(result.patch.upsertCharacters[0].longAction, undefined);
    assert.equal(result.patch.upsertCharacters[0].location, '城外');
    assert.equal(result.rejected.length, verdicts.length - 1);
    assert.deepEqual(applyVerdicts(patch, items, []).patch, patch);
});

test('审核解析严格要求布尔 ok 与字符串 reason，空裁决合法', () => {
    assert.deepEqual(parseReviewOutput('{"verdicts":[]}'), { ok: true, verdicts: [] });
    for (const value of [{}, { verdicts: null }, { verdicts: [{ id: 'r1', ok: 'false', reason: '' }] },
        { verdicts: [{ id: 'r1', ok: false }] }, { verdicts: [null] }]) {
        assert.equal(parseReviewOutput(JSON.stringify(value)).ok, false);
    }
});

test('快照接受完整新字段和时间不明，副本隔离且历史悬空引用有效', () => {
    const base = state();
    base.characters[0].longAction.since = { day: null, slot: '' };
    base.chronicle[0].characterIds = ['已淘汰人物'];
    const review = { rejected: checkPatch(base, parse({ markKnown: ['不存在'] })).rejected,
        reviewed: 0, approved: 0, error: null, usage: { model: '审核', ms: 2 } };
    const loreUsed = [{ world: '世界', uid: 1, title: '地图', layer: 'pinned', tokens: 10 }];
    const snapshot = save(base, { review, loreUsed });
    assert.ok(read(snapshot));
    review.error = '后来修改';
    loreUsed[0].title = '修改';
    assert.equal(snapshot.review.error, null);
    assert.equal(snapshot.loreUsed[0].title, '地图');
});

test('快照拒绝非法新字段的类型和枚举', () => {
    const valid = save(state(), { review: { rejected: [], reviewed: 1, approved: 1, error: null, usage: null },
        loreUsed: [{ world: '书', uid: '1', title: '图', layer: 'requested', tokens: 1 }] });
    const changes = [s => { s.state.chronicle = null; }, s => { s.state.chronicle[0].at.day = -1; },
        s => { s.state.chronicle[0].known = 'true'; }, s => { s.state.chronicle[0].knownAt = {}; },
        s => { s.state.chronicle[0].threadIds = [1]; }, s => { s.state.loreWanted = [{ title: '图', sinceRun: -1 }]; },
        s => { s.state.characters[0].longAction.since = { day: 1.5, slot: '' }; },
        s => { s.state.signals = [sig(42)]; }, s => { s.review.approved = -1; }, s => { s.review.rejected = [null]; },
        s => { s.review.usage = { model: '审核', ms: -1 }; }, s => { s.loreUsed[0].layer = '未知'; },
        s => { s.loreUsed[0].tokens = -1; }, s => { s.loreUsed[0].uid = {}; }];
    for (const change of changes) {
        const snapshot = structuredClone(valid);
        change(snapshot);
        assert.equal(read(snapshot), null);
    }
});

for (const entry of readFixtureJson('v15/model-outputs/review/cases.json')) {
    test(`v1.5 审核样本：${entry.file}`, () => {
        assert.equal(parseReviewOutput(readFixture(`v15/model-outputs/review/${entry.file}`)).ok, entry.expectOk);
    });
}
for (const entry of readFixtureJson('v15/model-outputs/sim/cases.json')) {
    test(`v1.5 推演样本解析、检查、合并、快照：${entry.file}`, () => {
        const base = readFixtureJson(entry.basedOn);
        const result = parseSimOutput(readFixture(`v15/model-outputs/sim/${entry.file}`));
        assert.equal(result.ok, entry.expectParseOk);
        if (!result.ok) return;
        const checked = checkPatch(base, result.patch);
        if (!entry.expectRejectedKinds.length) assert.deepEqual(checked.rejected, []);
        else assert.ok(checked.rejected.some(r => entry.expectRejectedKinds.includes(r.item.kind)));
        assert.ok(read(save(applyPatch(base, checked.patch, { maxCharacters: 12 }))));
    });
}
