import {test, assert} from '../harness.js';
import {emptyState, hashText} from '../../src/util.js';
import {findBase, makeSnapshot, readSnapshot, isSnapshotValid} from '../../src/state/snapshot-store.js';
import {chooseWriteBase} from '../../src/state/write-guard.js';
import {applyPatch, adoptPlan, advanceBeat} from '../../src/sim/apply.js';
import {parseSimOutput} from '../../src/sim/parse.js';
const status = {};
const LOG_PREFIX = '[测试]';
const EXT_NAME = '测试';
const notifyStatus = () => {};
const refreshInjection = () => {};
const buildSimPrompt = () => [];
const checkAndReview = async (state, patch) => ({patch, review:null});
let messages, written, during;
const host = {
    getSettings: () => ({enabled:true,maxCharacters:12,maxTokens:100}),
    getChatView: () => ({chatId:'a',length:messages.length,getMessage:i=>messages[i]}),
    collectSimInput: async () => ({loreUsed:[]}),
    writeSnapshot: async (floor, swipe, snap) => { written=snap; return true; },
};
const llm = {call: async () => { if(during) during(); return {text:JSON.stringify({noChange:true,guideReached:true}),model:'mock',ms:0}; }};
const source = readFile(__FIXTURES__ + '/../../index.js');
const runJob = eval('(async function runJob' + source.split('async function runJob')[1].split('/**\n * 程序检查')[0] + ')');
function setup() {
    const state=adoptPlan(emptyState(),{title:'计划',goal:'目标',firstSigns:'迹象',beats:[{title:'一',goal:'一',firstSigns:'一'},{title:'二',goal:'二',firstSigns:'二'}]},'normal');
    const snap=makeSnapshot({floor:0,swipeId:0,text:'正文',state,status:'manual'});
    snap.createdAt=1;
    messages=[{isUser:false,text:'正文',swipeId:0,extra:{backstage:snap}}];
    written=null; during=null;
    return snap;
}
test('手动重推保留请求前已采纳引导及编辑标记', async () => {
    setup();
    await runJob({chatId:'a',floor:0,swipeId:0,textHash:hashText('正文'),reason:'manual'},{aborted:false});
    assert.equal(written.state.threads.length,1);
    assert.equal(written.edited,true);
    assert.equal(written.parentId,null);
});
test('推演中换拍不把旧完成判断写到新拍', async () => {
    const snap=setup();
    during=()=>{
        const state=advanceBeat(snap.state,snap.state.threads[0].id);
        messages[0].extra.backstage=makeSnapshot({floor:0,swipeId:0,text:'正文',state,status:'manual'});
    };
    await runJob({chatId:'a',floor:0,swipeId:0,textHash:hashText('正文'),reason:'manual'},{aborted:false});
    assert.equal(written.state.threads[0].guide.beatIndex,1);
    assert.equal(written.state.threads[0].guide.reached,false);
});
