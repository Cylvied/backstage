import { test, assert } from '../harness.js';
import { pickRecentRounds, RECENT_MESSAGE_CAP } from '../../src/host/recent.js';

const u = mes => ({ is_user: true, name: '我', mes });
const a = mes => ({ is_user: false, name: '角色', mes });
const sys = mes => ({ is_user: false, is_system: true, name: '旁注', mes });

test('一轮 = 一条 AI 回复加它前面的用户输入', () => {
    const chat = [a('开场'), u('u1'), a('a1'), u('u2'), a('a2'), u('u3'), a('a3')];
    assert.deepEqual(pickRecentRounds(chat, 6, 2).map(m => m.text), ['u2', 'a2', 'u3', 'a3']);
});

test('用户连发几条都算在同一轮', () => {
    const chat = [a('a0'), u('u1'), u('u1b'), u('u1c'), a('a1')];
    assert.deepEqual(pickRecentRounds(chat, 4, 1).map(m => m.text), ['u1', 'u1b', 'u1c', 'a1']);
});

test('跳过系统消息；轮数不够时读到开头为止', () => {
    const chat = [a('开场'), sys('旁注'), u('u1'), a('a1')];
    assert.deepEqual(pickRecentRounds(chat, 3, 5).map(m => m.text), ['开场', 'u1', 'a1']);
});

test('从用户楼开始数（参谋、规划用）时，末尾的用户输入也带上', () => {
    const chat = [u('u1'), a('a1'), u('u2')];
    assert.deepEqual(pickRecentRounds(chat, 2, 1).map(m => m.text), ['u1', 'a1', 'u2']);
});

test('轮数非法时按 1 轮；单次最多读取上限条数', () => {
    const chat = [a('a0'), u('u1'), a('a1')];
    assert.deepEqual(pickRecentRounds(chat, 2, 0).map(m => m.text), ['u1', 'a1']);
    const flood = [a('a0'), ...Array.from({ length: 100 }, (_, i) => u(`u${i}`)), a('a1')];
    assert.equal(pickRecentRounds(flood, flood.length - 1, 1).length, RECENT_MESSAGE_CAP);
});
