// 面板设置页里的「模型 API」一节：直填 API（默认）或使用连接管理器的连接配置；获取模型、测试连接。

import { h } from './dom.js';
import { filterModels, testResultText } from './format.js';

const URL_PLACEHOLDER = 'https://generativelanguage.googleapis.com/v1beta/openai';

/**
 * @param {any} api
 * @param {() => void} onChange  设置变了（用于刷新顶部的"需要先配置"提示）
 */
export function buildApiSection(api, onChange) {
    const s = api.settings.get();
    let mode = s.api?.mode === 'profile' ? 'profile' : 'direct';
    const commit = patch => {
        api.settings.save(patch);
        onChange();
    };
    // 输入框边打边存（延迟），点选、切换等立即保存；立即保存会并入并取消还没存的输入，免得旧输入后到把它覆盖
    const typed = debounceSave(commit);
    const save = patch => typed.flush(patch);

    // ---- 方式 ----
    const modeButtons = [['direct', '直填 API'], ['profile', '使用连接配置']].map(([value, label]) => {
        const btn = h('button', { type: 'button', class: 'bs-set-seg-item', role: 'radio', 'aria-checked': String(value === mode) }, label);
        btn.addEventListener('click', () => {
            if (mode === value) return;
            mode = value;
            for (const b of modeButtons) b.setAttribute('aria-checked', String(b === btn));
            directBox.hidden = mode !== 'direct';
            profileBox.hidden = mode !== 'profile';
            result.hidden = true;
            save({ api: { mode } });
        });
        return btn;
    });

    // ---- 直填 ----
    const debounced = typed.push;
    const textInput = (value, attrs) => h('input', { class: 'bs-input', type: 'text', value: value ?? '', autocomplete: 'off', spellcheck: 'false', ...attrs });

    const url = textInput(s.api?.url, { placeholder: URL_PLACEHOLDER, inputmode: 'url' });
    url.addEventListener('input', () => debounced({ api: { url: url.value.trim() } }));

    const key = textInput(s.api?.key, { type: 'password', placeholder: 'sk-… / AIza…', autocomplete: 'new-password' });
    key.addEventListener('input', () => debounced({ api: { key: key.value.trim() } }));
    const eye = h('button', { type: 'button', class: 'bs-btn bs-set-btn', 'aria-pressed': 'false' }, '显示');
    eye.addEventListener('click', () => {
        const show = key.type === 'password';
        key.type = show ? 'text' : 'password';
        eye.textContent = show ? '隐藏' : '显示';
        eye.setAttribute('aria-pressed', String(show));
    });

    const model = textInput(s.api?.model, { placeholder: '例如 gemini-2.5-flash', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false' });
    let models = /** @type {string[]} */ ([]);
    let query = '';
    const listInfo = h('small', { class: 'bs-set-models-info' });
    const list = h('div', { class: 'bs-set-models-list', role: 'listbox', 'aria-label': '可用模型' });
    const listBox = h('div', { class: 'bs-set-models', hidden: true },
        h('div', { class: 'bs-set-models-head' }, listInfo,
            h('button', { type: 'button', class: 'bs-set-link', onclick: () => showList(false) }, '收起')),
        list);
    key.id = 'backstage_api_key';
    model.id = 'backstage_api_model';
    list.id = 'backstage_api_models';
    model.setAttribute('aria-controls', list.id);

    const showList = open => {
        listBox.hidden = !open;
        model.setAttribute('aria-expanded', String(open));
    };
    const renderList = () => {
        const hits = filterModels(models, query);
        listInfo.textContent = query
            ? `${hits.length} / ${models.length} 个模型匹配「${query}」`
            : `共 ${models.length} 个模型，点选填入；在上面输入可以筛选`;
        list.replaceChildren(...hits.map(id => {
            const item = h('button', { type: 'button', class: 'bs-set-model', role: 'option', 'aria-selected': String(id === model.value.trim()) }, id);
            item.addEventListener('click', () => {
                model.value = id;
                save({ api: { model: id } });
                showList(false);
            });
            return item;
        }));
        if (!hits.length) list.append(h('small', { class: 'bs-set-empty' }, '没有匹配的模型，可以直接手填。'));
    };
    model.addEventListener('input', () => {
        debounced({ api: { model: model.value.trim() } });
        if (models.length) {
            query = model.value.trim();
            renderList();
            showList(true);
        }
    });

    const fetchBtn = h('button', { type: 'button', class: 'bs-btn bs-set-btn' }, '获取模型');
    const fetchNote = h('small', { class: 'bs-set-note', role: 'status' });
    fetchBtn.addEventListener('click', async () => {
        fetchBtn.disabled = true;
        fetchBtn.textContent = '获取中…';
        fetchNote.textContent = '';
        fetchNote.dataset.kind = '';
        try {
            models = await api.settings.fetchModels({ url: url.value.trim(), key: key.value.trim() });
            query = '';
            renderList();
            showList(true);
        } catch (error) {
            fetchNote.textContent = String(error?.message ?? error);
            fetchNote.dataset.kind = 'error';
            showList(false);
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.textContent = '获取模型';
        }
    });

    const directBox = h('div', { class: 'bs-set-mode', hidden: mode !== 'direct' },
        h('label', { class: 'bs-set-field' }, h('span', null, 'API 地址'), url, h('small', null, 'OpenAI 兼容地址，填到 /v1 这一层即可')),
        h('div', { class: 'bs-set-field' }, h('label', { for: key.id }, '密钥'), h('div', { class: 'bs-set-inline' }, key, eye)),
        h('div', { class: 'bs-set-field' },
            h('label', { for: model.id }, '模型'),
            h('div', { class: 'bs-set-inline' }, model, fetchBtn),
            fetchNote,
            listBox));

    // ---- 连接配置 ----
    const profile = h('select', { class: 'bs-input', id: 'backstage_profile_select' });
    const profileNote = h('small');
    const fillProfiles = () => {
        const current = api.settings.get().profileId;
        const all = api.settings.listProfiles();
        const options = [h('option', { value: '' }, all.length ? '（请选择）' : '（没有连接配置）')];
        for (const p of all) options.push(h('option', { value: p.id, selected: p.id === current }, p.name));
        if (current && !all.some(p => p.id === current)) options.push(h('option', { value: current, selected: true }, '（已选的连接不存在了）'));
        profile.replaceChildren(...options);
        profileNote.textContent = all.length
            ? '使用连接管理器里保存的连接（包括它的地址、密钥和模型）。'
            : '连接管理器里还没有连接配置，建议改用直填 API。';
        profileNote.dataset.kind = all.length ? '' : 'warn';
    };
    profile.addEventListener('change', () => save({ profileId: profile.value }));
    fillProfiles();
    const profileBox = h('div', { class: 'bs-set-mode', hidden: mode !== 'profile' },
        h('label', { class: 'bs-set-field' },
            h('span', null, '连接配置'),
            h('div', { class: 'bs-set-inline' },
                profile,
                h('button', { type: 'button', class: 'bs-btn bs-set-btn', title: '重新读取连接列表', onclick: fillProfiles }, '刷新')),
            profileNote));

    // ---- 测试连接 ----
    const testBtn = h('button', { type: 'button', class: 'bs-btn bs-set-btn' }, '测试连接');
    const result = h('div', { class: 'bs-set-result', role: 'status', hidden: true });
    testBtn.addEventListener('click', async () => {
        testBtn.disabled = true;
        testBtn.textContent = '测试中…';
        result.hidden = false;
        result.dataset.kind = '';
        result.textContent = '正在发一条很短的请求…';
        const patch = mode === 'direct'
            ? { api: { mode, url: url.value.trim(), key: key.value.trim(), model: model.value.trim() } }
            : { api: { mode }, profileId: profile.value };
        try {
            result.textContent = testResultText(await api.settings.testApi(patch));
            result.dataset.kind = 'ok';
        } catch (error) {
            result.textContent = `不可用：${error?.message ?? error}`;
            result.dataset.kind = 'error';
        } finally {
            testBtn.disabled = false;
            testBtn.textContent = '测试连接';
        }
    });

    const section = h('section', { class: 'bs-set-section bs-set-api', 'aria-label': '模型 API' },
        h('h3', { class: 'bs-set-head' }, '模型 API'),
        h('div', { class: 'bs-set-seg', role: 'radiogroup', 'aria-label': '接入方式' }, modeButtons),
        directBox,
        profileBox,
        h('div', { class: 'bs-set-test' }, testBtn, result),
        h('small', { class: 'bs-set-note' }, '推演和剧情参谋都用这里的模型，可以选便宜快速的。密钥保存在本地的扩展设置里。'));

    return {
        element: section,
        /** 展开抽屉时刷新连接列表：用户可能刚在连接管理器里新建了连接 */
        refresh: fillProfiles,
    };
}

/** 输入时延迟保存，避免每个字都写设置 */
function debounceSave(save) {
    let timer = 0;
    let pending = null;
    const merge = (a, b) => ({ ...a, ...b, api: { ...(a?.api ?? {}), ...(b?.api ?? {}) } });
    /** 立即保存还没存的输入，再叠加 patch（patch 优先） */
    const flush = patch => {
        clearTimeout(timer);
        const all = merge(pending, patch);
        pending = null;
        save(all);
    };
    const push = patch => {
        pending = merge(pending, patch);
        clearTimeout(timer);
        timer = setTimeout(() => flush(), 400);
    };
    return { push, flush };
}
