import { test, assert } from '../harness.js';
import { selectSignals, composeInjection } from '../../src/inject/compose.js';
import { emptyState } from '../../src/util.js';
import { DEFAULT_SETTINGS } from '../../src/constants.js';

// 默认挂在一条现存的暗线上（未挂暗线或人物的迹象不会被注入）
const BASE_THREAD = {
    id: 't_base00', title: '背景线', characterIds: [], stage: 'growing', trigger: '', deadline: null,
    visibility: 'hidden', origin: 'sim', guide: null,
};

function sig(voice, text, relevance = 2, threadId = 't_base00') {
    return { voice, text, threadId, characterId: null, relevance };
}

function stateWith(signals, extra = {}) {
    const threads = [BASE_THREAD, ...(extra.threads ?? [])];
    return { ...emptyState(), signals, ...extra, threads };
}

const settings = { ...DEFAULT_SETTINGS, memory: { ...DEFAULT_SETTINGS.memory } };

test('没有迹象时不注入暗流', () => {
    const out = composeInjection(emptyState(), settings);
    assert.equal(out.undercurrent, '');
    assert.equal(out.guide, '');
    assert.equal(out.guidePush, false);
});

test('上限为 0 时返回空', () => {
    assert.deepEqual(selectSignals(stateWith([sig('here', '甲')]), 0), []);
});

test('按相关度降序，且最多 3 条', () => {
    const s = stateWith([sig('here', '低', 1), sig('here', '高', 3), sig('rumor', '中', 2), sig('here', '也高', 3)]);
    assert.deepEqual(selectSignals(s, 3).map(x => x.text), ['高', '也高', '中']);
});

test('暗流语态最多 1 条', () => {
    const s = stateWith([sig('undercurrent', '一', 3), sig('undercurrent', '二', 3), sig('here', '三', 1)]);
    assert.deepEqual(selectSignals(s, 3).map(x => x.text), ['一', '三']);
});

test('主角与外界隔绝时剔除风闻', () => {
    const s = stateWith([sig('rumor', '传言', 3), sig('here', '眼前', 1)], { protagonist: { location: '', reachable: false } });
    assert.deepEqual(selectSignals(s, 3).map(x => x.text), ['眼前']);
});

test('与引导中的线相关的迹象优先', () => {
    const thread = {
        id: 't_aaaaaa', title: '旧案', characterIds: [], stage: 'growing', trigger: '', deadline: null,
        visibility: 'hidden', origin: 'user',
        guide: { intensity: 'normal', goal: '让旧案浮出水面', firstSigns: '', status: 'active', adoptedAt: 0 },
    };
    const s = stateWith([sig('here', '无关但高', 3), sig('here', '相关', 1, 't_aaaaaa')], { threads: [thread] });
    assert.deepEqual(selectSignals(s, 1).map(x => x.text), ['相关']);
});

test('暗流块带幕后标签且不含替主角决定的措辞', () => {
    const out = composeInjection(stateWith([sig('here', '巷口卖炭的老汉今天没出摊', 3)]), settings);
    assert.match(out.undercurrent, /^〔幕后备注/);
    assert.match(out.undercurrent, /〔幕后备注结束〕$/);
    assert.match(out.undercurrent, /【此地此刻】巷口卖炭的老汉今天没出摊/);
    assert.doesNotMatch(out.undercurrent, /你应该让主角/);
});

test('关闭暗流注入时暗流块为空', () => {
    const out = composeInjection(stateWith([sig('here', '甲', 3)]), { ...settings, injectUndercurrent: false });
    assert.equal(out.undercurrent, '');
});

test('尽快引爆的引导标记为 guidePush', () => {
    const thread = {
        id: 't_bbbbbb', title: '刺客潜入', characterIds: [], stage: 'ripe', trigger: '', deadline: null,
        visibility: 'hinted', origin: 'user',
        guide: { intensity: 'push', goal: '刺客今夜动手', firstSigns: '屋顶有瓦片轻响', status: 'active', adoptedAt: 0 },
    };
    const out = composeInjection(stateWith([], { threads: [thread] }), settings);
    assert.equal(out.guidePush, true);
    assert.match(out.guide, /方向：刺客今夜动手/);
    assert.match(out.guide, /主角的行动始终优先/);
});

test('已结束的引导不再注入', () => {
    const thread = {
        id: 't_cccccc', title: '旧约', characterIds: [], stage: 'resolving', trigger: '', deadline: null,
        visibility: 'known', origin: 'user',
        guide: { intensity: 'normal', goal: '赴约', firstSigns: '', status: 'done', adoptedAt: 0 },
    };
    assert.equal(composeInjection(stateWith([], { threads: [thread] }), settings).guide, '');
});

test('分阶段引导只注入当前拍，并提示不要提前演后面的拍', () => {
    const thread = {
        id: 't_dddddd', title: '药王庙旧案', characterIds: [], stage: 'growing', trigger: '', deadline: null,
        visibility: 'hinted', origin: 'user',
        guide: {
            intensity: 'normal', goal: '查清三年前的旧案', firstSigns: '庙门上有新脚印', status: 'active', adoptedAt: 0,
            beatIndex: 1, reached: false,
            beats: [
                { title: '踩点', goal: '发现庙里有人', firstSigns: '', status: 'done' },
                { title: '夜探', goal: '在庙里找到旧案卷', firstSigns: '庙门上有新脚印', status: 'active' },
                { title: '对质', goal: '和老周当面对质', firstSigns: '', status: 'pending' },
            ],
        },
    };
    const out = composeInjection(stateWith([], { threads: [thread] }), settings);
    assert.match(out.guide, /整体方向：查清三年前的旧案/);
    assert.match(out.guide, /当前阶段（第 2 \/ 3 拍）：夜探/);
    assert.match(out.guide, /这一拍要达到：在庙里找到旧案卷/);
    assert.match(out.guide, /只推进这一拍/);
    assert.doesNotMatch(out.guide, /对质/);
    assert.doesNotMatch(out.guide, /踩点/);
});

test('没有挂在暗线或人物上的迹象不注入', () => {
    const person = { id: 'c_person', name: '老周', aliases: [], location: '', currentAction: null, longAction: null,
        knows: [], life: 'alive', onStage: false, pinned: false };
    const s = stateWith([
        { voice: 'here', text: '窗台上的鸟在梳理羽毛', threadId: null, characterId: null, relevance: 3 },
        { voice: 'here', text: '挂在已删除暗线上', threadId: 't_gone00', characterId: null, relevance: 3 },
        { voice: 'rumor', text: '来自人物', threadId: null, characterId: 'c_person', relevance: 1 },
        sig('here', '来自暗线', 1),
    ], { characters: [person] });
    assert.deepEqual(selectSignals(s, 3).map(x => x.text), ['来自人物', '来自暗线']);
});

test('来自主角尚不知道的事件的迹象标为「已发生」并附渠道提醒', () => {
    const s = stateWith([{ voice: 'rumor', text: '相府的人在茶馆提起核账', eventId: 'e_x', threadId: null, characterId: null, relevance: 3 }], {
        chronicle: [{ id: 'e_x', at: { day: 2, slot: '' }, text: '核账完成', characterIds: [], threadIds: [], known: false, knownAt: null }],
    });
    const out = composeInjection(s, settings);
    assert.match(out.undercurrent, /【风闻】（已发生）相府的人在茶馆提起核账/);
    assert.match(out.undercurrent, /主角还不知道/);
});
