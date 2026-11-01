import { test, assert } from '../harness.js';
import { collectSimInput, onHostEvents } from '../../src/host/host.js';
import { DEFAULT_SETTINGS } from '../../src/constants.js';
import { emptyState } from '../../src/util.js';
const handlers = {};
const eventTypes = Object.fromEntries(['GENERATION_STARTED','GENERATION_STOPPED','MESSAGE_RECEIVED','MESSAGE_SWIPED','MESSAGE_EDITED','MESSAGE_UPDATED','MESSAGE_DELETED','MESSAGE_SWIPE_DELETED','CHAT_CHANGED','WORLD_INFO_ACTIVATED'].map(x=>[x,x]));
const c = {eventTypes, eventSource: {on: (name,fn)=>handlers[name]=fn, removeListener:()=>{}}, characters:[{data:{extensions:{world:'测试书'}}}], characterId:0, chat:[{mes:'无关键词的新场景',name:'主角',is_user:true}], chatMetadata:{}, name1:'张三', name2:'李四', powerUserSettings:{}, getCharacterCardFields:()=>({}), substituteParams:s=>s.replaceAll('{{user}}','张三').replaceAll('{{getvar::身份}}','七皇子'), loadWorldInfo:async()=>({entries:{0:{uid:0,comment:'上一场景条目',key:['山寨'],content:'{{user}}现在是{{getvar::身份}}。',constant:false}}}), getTokenCountAsync:async()=>10};
globalThis.SillyTavern={getContext:()=>c};
onHostEvents({onGenerationStarting:()=>{},onChatChanged:()=>{},onChanged:()=>{}});
handlers.WORLD_INFO_ACTIVATED([{world:'测试书',uid:0}]);
const a = await collectSimInput(0,DEFAULT_SETTINGS,emptyState());
handlers.GENERATION_STARTED('normal',{},false);
// 宿主本轮零命中不发 WORLD_INFO_ACTIVATED，见 world-info.js:930。
const b = await collectSimInput(0,DEFAULT_SETTINGS,emptyState());
test('世界书宏展开且新一轮不沿用旧触发', () => { assert.equal(a.worldInfo[0].content, '张三现在是七皇子。'); assert.equal(b.worldInfo.length, 0); });
