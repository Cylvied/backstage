import { test, assert } from '../harness.js';
import { normalizeBaseUrl, extractModelIds } from '../../src/host/endpoint.js';

test('空地址返回空串', () => {
    assert.equal(normalizeBaseUrl('  '), '');
});

test('只有域名时补 /v1', () => {
    assert.equal(normalizeBaseUrl('https://api.example.com'), 'https://api.example.com/v1');
    assert.equal(normalizeBaseUrl('https://api.example.com/'), 'https://api.example.com/v1');
});

test('已带版本或路径的原样保留', () => {
    assert.equal(normalizeBaseUrl('https://api.example.com/v1'), 'https://api.example.com/v1');
    assert.equal(normalizeBaseUrl('https://generativelanguage.googleapis.com/v1beta/openai/'), 'https://generativelanguage.googleapis.com/v1beta/openai');
    assert.equal(normalizeBaseUrl('https://open.bigmodel.cn/api/paas/v4'), 'https://open.bigmodel.cn/api/paas/v4');
});

test('去掉结尾的 /chat/completions 和 /models', () => {
    assert.equal(normalizeBaseUrl('https://api.example.com/v1/chat/completions'), 'https://api.example.com/v1');
    assert.equal(normalizeBaseUrl('https://api.example.com/v1/models'), 'https://api.example.com/v1');
});

test('模型列表兼容多种返回格式并去重排序', () => {
    assert.deepEqual(extractModelIds({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }] }), ['a', 'b']);
    assert.deepEqual(extractModelIds({ models: [{ name: 'models/gemini-2.5-flash' }] }), ['gemini-2.5-flash']);
    assert.deepEqual(extractModelIds(['x', 'y']), ['x', 'y']);
    assert.deepEqual(extractModelIds({ error: true }), []);
});
