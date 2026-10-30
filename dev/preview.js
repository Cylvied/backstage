// 预览页脚本：读 URL 参数 → 搭一个假宿主 → 用模拟 api 挂载真实面板。
// 参数：?fixture=wuxia&theme=dark&status=fresh&savefail=1&tab=参谋&advisor=multi&guide=reached&noanim=1
//   advisor：empty 空对话 / multi 多轮（含单步卡、分阶段卡、失败回复）/ fail 每次都失败 / slow 一直在想
//   orphans=1：加两条没挂在暗线或人物上的迹象（纸条页应提示未注入）
//   skips=1：再加几条能挂靠但没选上的迹象，并让主角与外界隔绝（覆盖"超过上限 / 暗流最多 1 条 / 风闻传不进来"）
//   mangle=1：模拟主题扩展把扩展设置抽屉里的控件拆出来重排
//   status=setup：模拟刚装好、模型 API 没填；apitest=fail：获取模型与测试连接都失败；profiles=0：没有连接配置
//   guide：staged 第一条线是进行到第 2 拍的分阶段引导 / reached 同上并带"这一拍看起来已经演完了"提示

import { createMockApi } from './mock-api.js';

const FIXTURES = ['wuxia', 'wuxia-pinned', 'school', 'school-guide', 'western', 'western-faded', 'urban', 'mystery', 'mystery-isolated',
    'palace', 'palace-crowded', 'apocalypse', 'apocalypse-dead', 'xiuxian', 'empty'];

const params = new URLSearchParams(location.search);
const opts = {
    fixture: params.get('fixture') ?? 'school-guide',
    theme: params.get('theme') ?? 'light',
    status: params.get('status') ?? 'fresh',
    plan: params.get('plan') ?? 'ok',
    saveFails: params.get('savefail') === '1',
    tab: params.get('tab') ?? '',
    advisor: params.get('advisor') ?? 'empty',
    guide: params.get('guide') ?? '',
    apiTest: params.get('apitest') ?? 'ok',
    profiles: params.get('profiles') ?? '2',
    orphans: params.get('orphans') ?? '0',
    skips: params.get('skips') ?? '0',
};

const $ = id => document.getElementById(id);
$('dev-fixture').innerHTML = FIXTURES.map(f => `<option ${f === opts.fixture ? 'selected' : ''}>${f}</option>`).join('');
$('dev-theme').value = opts.theme;
$('dev-status').value = opts.status;
$('dev-savefail').checked = opts.saveFails;
$('dev-tab').value = opts.tab;
$('dev-advisor').value = opts.advisor;
$('dev-guide').value = opts.guide;
$('dev-apitest').value = opts.apiTest;
$('dev-apply').addEventListener('click', () => {
    const next = new URLSearchParams({
        fixture: $('dev-fixture').value, theme: $('dev-theme').value, status: $('dev-status').value,
        savefail: $('dev-savefail').checked ? '1' : '0', tab: $('dev-tab').value,
        advisor: $('dev-advisor').value, guide: $('dev-guide').value, apitest: $('dev-apitest').value, profiles: opts.profiles, orphans: opts.orphans, skips: opts.skips,
    });
    location.search = next.toString();
});

document.documentElement.classList.toggle('host-dark', opts.theme === 'dark');

// 截图用：后台标签页里动画会停在第一帧，加 noanim=1 关掉
if (params.get('noanim') === '1') {
    document.head.append(Object.assign(document.createElement('style'), { textContent: '#backstage-panel * { animation: none !important; transition: none !important; }' }));
}

// 假聊天：偶数楼是用户，奇数楼是 AI
$('chat').innerHTML = Array.from({ length: 8 }, (_, i) => {
    const user = i % 2 === 0;
    return `<div class="mes" mesid="${i}" is_user="${user}" is_system="false">
        <div class="ch_name"><div class="mes_header_info"><div class="flex-container">
            <span class="name_text">${user ? '我' : '旁白'}</span><small class="timestamp">#${i}</small>
        </div></div></div>
        <div class="mes_text">${user ? '……' : '（AI 回复正文）'}</div>
    </div>`;
}).join('');

// 宿主的 inline-drawer 展开由宿主全局处理，这里模拟一下
document.addEventListener('click', e => {
    const toggle = e.target.closest?.('.inline-drawer-toggle');
    if (toggle) toggle.parentElement.classList.toggle('open');
});

// 宿主事件的最小模拟；调试时可在控制台 devEmit('CHAT_CHANGED') 触发
const listeners = {};
const eventTypes = { CHAT_CHANGED: 'chat_id_changed', CHARACTER_MESSAGE_RENDERED: 'character_message_rendered', MESSAGE_SWIPED: 'message_swiped' };
const eventSource = { on(name, fn) { (listeners[name] ??= []).push(fn); } };
globalThis.SillyTavern = { getContext: () => ({ eventSource, eventTypes }) };
globalThis.devEmit = key => (listeners[eventTypes[key]] ?? []).forEach(fn => fn());
// 控制台里 devSwitchChat() 模拟切换聊天（参谋记录会换成另一个聊天的）
globalThis.devSwitchChat = () => { const id = api.devSwitchChat(); devEmit('CHAT_CHANGED'); return id; };

const api = await createMockApi(opts);
globalThis.Backstage = api;
const ui = await import('../src/ui/panel.js');
ui.mountPanel(api);
ui.mountSettings(api);

// mangle=1：粗略模拟主题扩展（如 Claude Web 2.0）接管设置抽屉——把每个控件拆出来放进它自己的排版行，
// 原来的标签和结构留在原处。用来确认精简抽屉被这样重排后仍然可用。
if (params.get('mangle') === '1') {
    const content = document.querySelector('#backstage_settings_v2 .inline-drawer-content');
    const rows = document.createElement('div');
    rows.className = 'cwx-rows';
    for (const control of content.querySelectorAll('input, select, textarea, button, .menu_button')) {
        const row = document.createElement('div');
        row.className = 'cwx-row';
        row.append(control);
        rows.append(row);
    }
    content.append(rows);
}

if (opts.tab) {
    $('backstage_wand_button').click();
    [...document.querySelectorAll('#backstage-panel .bs-tab')].find(b => b.textContent.startsWith(opts.tab))?.click();
}
