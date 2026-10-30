import { test, assert, readFixtureJson } from '../harness.js';
import { statusView, sortCharacters, sortThreads, badgeView, isDarkColor, normalizeNumberSetting, clockText, activeGuideThread } from '../../src/ui/format.js';

const on = { enabled: true, apiReady: true };
const idle = { lagging: false, lastError: null, lastRunAt: 1, scheduler: { running: null, queued: 0, lastError: null } };

test('statusView 优先级：关闭 > 未配置 API > 推演中 > 失败 > 落后 > 最新', () => {
    assert.equal(statusView(idle, { enabled: false, apiReady: false }).kind, 'off');
    assert.equal(statusView(idle, { enabled: true, apiReady: false }).kind, 'setup');
    assert.match(statusView(idle, { enabled: true, apiReady: false }).text, /模型 API/);
    assert.equal(statusView({ ...idle, lastError: 'x', scheduler: { running: {}, queued: 2, lastError: null } }, on).kind, 'running');
    const failed = statusView({ ...idle, lastError: '超时', lagging: true }, on);
    assert.equal(failed.kind, 'failed');
    assert.equal(failed.detail, '超时');
    assert.equal(statusView({ ...idle, scheduler: { running: null, queued: 0, lastError: '坏了' } }, on).kind, 'failed');
    assert.equal(statusView({ ...idle, lagging: true }, on).kind, 'lagging');
    assert.equal(statusView(idle, on).kind, 'fresh');
});

test('sortCharacters：钉住 → 在场 → 生死，稳定排序', () => {
    const cs = [
        { id: 'a', pinned: false, onStage: false, life: 'dead' },
        { id: 'b', pinned: false, onStage: true, life: 'alive' },
        { id: 'c', pinned: true, onStage: false, life: 'alive' },
        { id: 'd', pinned: false, onStage: false, life: 'alive' },
        { id: 'e', pinned: false, onStage: false, life: 'alive' },
    ];
    assert.deepEqual(sortCharacters(cs).map(c => c.id), ['c', 'b', 'd', 'e', 'a']);
    assert.equal(cs[0].id, 'a', '不修改入参');
});

test('sortThreads：引导中的线排最前，淡出的排最后', () => {
    const s = readFixtureJson('states/school-guide.json');
    assert.equal(sortThreads(s.threads)[0].id, 't_sgd002');
    const wf = readFixtureJson('states/western-faded.json');
    const sorted = sortThreads(wf.threads);
    assert.equal(sorted[sorted.length - 1].stage, 'faded');
    assert.equal(activeGuideThread(s).id, 't_sgd002');
    assert.equal(activeGuideThread(wf), null);
});

test('badgeView 四种情况', () => {
    assert.equal(badgeView(null), null);
    assert.equal(badgeView({ valid: false, status: 'ok' }).kind, 'stale');
    assert.equal(badgeView({ valid: true, status: 'failed', error: '超时' }).kind, 'failed');
    assert.match(badgeView({ valid: true, status: 'failed', error: '超时' }).title, /超时/);
    assert.equal(badgeView({ valid: true, status: 'ok', edited: true }).kind, 'edited');
    const ok = badgeView({ valid: true, status: 'ok', edited: false, signalCount: 2, changedCharacters: ['甲', '乙'] });
    assert.equal(ok.kind, 'ok');
    assert.equal(ok.text, '幕后 · 2 人 · 候选 2');
    assert.match(ok.title, /甲、乙/);
    assert.equal(badgeView({ valid: true, status: 'ok', changedCharacters: [], signalCount: 0 }).text, '幕后');
});

test('badgeView 有本层状态时显示"注入 M/N"并说明没注入的原因', () => {
    const info = { valid: true, status: 'ok', edited: false, signalCount: 2, changedCharacters: [] };
    const sum = { total: 2, injected: 0, disabled: false, skipped: [{ label: '没挂在暗线或人物上', items: [{}, {}] }] };
    const v = badgeView(info, sum);
    assert.equal(v.text, '幕后 · 注入 0/2');
    assert.equal(v.lines[1], '候选 2 条迹象 · 注入 0 条');
    assert.equal(v.lines[2], '未注入 2 条：没挂在暗线或人物上');
    assert.equal(v.title, v.lines.join('\n'));
    const off = badgeView(info, { total: 2, injected: 0, disabled: true, skipped: [{ label: '暗流注入已关闭', items: [{}, {}] }] });
    assert.match(off.lines[1], /注入已关闭/);
    assert.equal(off.lines.length, 2);
    const edited = badgeView({ ...info, edited: true }, { total: 1, injected: 1, disabled: false, skipped: [] });
    assert.equal(edited.kind, 'edited');
    assert.equal(edited.text, '幕后 · 已编辑 · 注入 1/1');
    assert.equal(badgeView({ valid: true, status: 'failed', error: 'x' }, sum).lines.length, 1);
});

test('isDarkColor 识别 rgb / rgba / hex，透明返回 null', () => {
    assert.equal(isDarkColor('rgb(23, 23, 23)'), true);
    assert.equal(isDarkColor('rgba(250, 249, 245, 1)'), false);
    assert.equal(isDarkColor('#262624'), true);
    assert.equal(isDarkColor('#fff'), false);
    assert.equal(isDarkColor('rgba(0, 0, 0, 0)'), null);
    assert.equal(isDarkColor('transparent'), null);
    assert.equal(isDarkColor('rgb(36 36 36 / 80%)'), true);
});

test('normalizeNumberSetting 夹到范围，看不懂时回退', () => {
    assert.equal(normalizeNumberSetting('maxSignals', '9', 3), 3);
    assert.equal(normalizeNumberSetting('maxSignals', '-1', 3), 0);
    assert.equal(normalizeNumberSetting('maxTokens', 'abc', 2000), 2000);
    assert.equal(normalizeNumberSetting('maxTokens', '', 2000), 2000);
    assert.equal(normalizeNumberSetting('injectDepth', '2.6', 1), 3);
});

test('clockText', () => {
    assert.equal(clockText({ day: 6, slot: '放学', precision: 'exact' }), '第 6 天 · 放学');
    assert.equal(clockText({ day: 2, slot: '', precision: 'approx' }), '约第 2 天');
    assert.equal(clockText({ day: 1, slot: '夜', precision: 'unknown' }), '时间不明');
});

test('badgeView 说明里列出检查与审核结果；旧数据没有 review 时不列', () => {
    const info = { valid: true, status: 'ok', edited: false, signalCount: 0, changedCharacters: [] };
    assert.equal(badgeView(info).lines.length, 1);
    const rejected = [{ item: { id: 'r1', kind: 'event', summary: 'x', ref: {} }, by: 'reviewer', reason: 'y' }];
    const v = badgeView({ ...info, review: { reviewed: 2, approved: 1, rejected, error: null, usage: null } });
    assert.equal(v.lines.at(-1), '检查与审核：送审 2 条，通过 1 条，丢弃 1 条');
    assert.match(badgeView({ ...info, review: { reviewed: 2, approved: 2, rejected: [], error: '超时', usage: null } }).title, /审核失败，已放行：超时/);
});
