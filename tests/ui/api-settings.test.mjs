import { test, assert } from '../harness.js';
import { filterModels, testResultText, apiStatusView } from '../../src/ui/format.js';

const models = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite', 'gpt-4o-mini', 'deepseek-chat'];

test('filterModels：空查询返回全部', () => {
    assert.deepEqual(filterModels(models, ''), models);
    assert.deepEqual(filterModels(null, 'x'), []);
});

test('filterModels：忽略大小写，多个词都要命中', () => {
    assert.deepEqual(filterModels(models, 'FLASH'), ['gemini-2.5-flash', 'gemini-2.0-flash-lite']);
    assert.deepEqual(filterModels(models, 'gemini lite'), ['gemini-2.0-flash-lite']);
    assert.deepEqual(filterModels(models, 'claude'), []);
});

test('filterModels：完全相同的排最前，并按 limit 截断', () => {
    const list = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
    assert.equal(filterModels(list, 'gemini-2.5-flash')[0], 'gemini-2.5-flash');
    assert.equal(filterModels(models, '', 2).length, 2);
});

test('testResultText', () => {
    assert.equal(testResultText({ model: 'gemini-2.5-flash', ms: 1234, reply: '收到' }), '可用 · gemini-2.5-flash · 1.2 秒');
    assert.equal(testResultText({ model: '', ms: NaN }), '可用');
});

test('apiStatusView：未配置 / 直填 / 连接配置 / 已关闭', () => {
    const direct = { enabled: true, api: { mode: 'direct', model: 'gemini-2.5-flash' }, profileId: '' };
    assert.deepEqual(apiStatusView(direct, false, []), { kind: 'setup', text: '需要先配置模型 API' });
    assert.equal(apiStatusView(direct, true, []).text, '已配置 · gemini-2.5-flash');
    const profile = { enabled: true, api: { mode: 'profile' }, profileId: 'p1' };
    assert.equal(apiStatusView(profile, true, [{ id: 'p1', name: '便宜模型' }]).text, '已配置 · 连接配置：便宜模型');
    assert.equal(apiStatusView(profile, true, []).text, '已配置 · 连接配置：p1');
    const off = apiStatusView({ ...direct, enabled: false }, true, []);
    assert.equal(off.kind, 'off');
    assert.match(off.text, /已关闭/);
});
