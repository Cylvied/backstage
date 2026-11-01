import {test, assert} from '../harness.js';
import { renderCharacters } from '../../src/ui/tab-characters.js';
import { planCard } from '../../src/ui/plan-card.js';
import { emptyState } from '../../src/util.js';
class FakeNode {
    constructor(tag, text = '') { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.attrs = {}; this.value = ''; this.textContent = text; }
    append(x) { this.children.push(x); if (this.tagName === 'TEXTAREA') this.value += x.textContent; }
    setAttribute(k,v) { this.attrs[k] = v; }
    addEventListener(k,f) { this.listeners[k] = f; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: t => new FakeNode(t), createTextNode: t => new FakeNode('#text',t) };
const flatten = n => [n,...n.children.flatMap(flatten)];
const txt = n => n.textContent + n.children.map(txt).join('');
const pcctx = {api:{getState:()=>emptyState()},ui:{adopted:new Set(['100:0']),planIntensity:{},openBeats:new Set()}};
const card = planCard(pcctx,{title:'计划',goal:'目标',firstSigns:'迹象',fit:'',threadId:null,suggestedIntensity:'normal'},'100:0');
test('未采纳分支不被面板缓存锁住', () => assert.ok(flatten(card).some(n=>n.tagName==='BUTTON')));
