import { test, assert } from '../harness.js';
import { onHostEvents } from '../../src/host/host.js';
const handlers = new Map();
const timers = [];
globalThis.setTimeout = fn => timers.push(fn);
globalThis.document = { getElementById: () => null };
let chatId = 'A';
let chat = [{ mes: '开场' }, { is_user: true, mes: '输入' }, { mes: 'A回复' }];
const types = Object.fromEntries(['GENERATION_STARTED','GENERATION_STOPPED','MESSAGE_RECEIVED','MESSAGE_SWIPED','MESSAGE_EDITED','MESSAGE_UPDATED','MESSAGE_DELETED','MESSAGE_SWIPE_DELETED','CHAT_CHANGED','WORLD_INFO_ACTIVATED'].map(x=>[x,x]));
globalThis.SillyTavern = { getContext: () => ({chat, getCurrentChatId: () => chatId, eventTypes: types, eventSource: {on:(k,fn)=>handlers.set(k,fn), removeListener:()=>{}}}) };
const finalized=[];
onHostEvents({onReplyFinalized:e=>finalized.push(e),onGenerationStarting:()=>{},onChanged:()=>{},onChatChanged:()=>{}});
handlers.get('MESSAGE_RECEIVED')(2, 'normal');
chatId = 'B'; chat = [{mes:'开场B'}, {is_user:true,mes:'输入B'}, {mes:'B的旧回复'}];
handlers.get('CHAT_CHANGED')();
for(let i=0;i<8;i++){ const fn=timers.shift(); if(fn)fn(); await Promise.resolve(); }
test('切聊天取消未定稿事件', () => assert.equal(finalized.length, 0));
