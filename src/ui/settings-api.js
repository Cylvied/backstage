// 面板设置页里的「模型 API」一节：直填 API（默认）或使用连接管理器的连接配置；获取模型、测试连接。
// 直填的三项（地址、密钥、模型）和「测试连接」拆成独立的小部件，审核员的单独模型也用它们。

import { h } from './dom.js';
import { filterModels, testResultText } from './format.js';

const URL_PLACEHOLDER = 'https://generativelanguage.googleapis.com/v1beta/openai';

/**
 * 保存设置：对象类的分组（api、memory、lore、review）先并上当前值再存，
 * 这样只改一项也不会把同组其他字段冲掉，不依赖宿主一侧是否逐组合并。
 * @param {any} api
 * @param {Record<string, any>} patch
 */
export function saveMerged(api, patch) {
    const current = api.settings.get();
    const full = { ...patch };
    for (const key of Object.keys(patch)) {
        const value = patch[key];
        if (value && typeof value === 'object' && !Array.isArray(value) && current[key] && typeof current[key] === 'object' && !Array.isArray(current[key])) {
            full[key] = { ...current[key], ...value };
        }
    }
    return api.settings.save(full);
}

/**
 * @param {any} api
 * @param {() => void} onChange  设置变了（用于刷新顶部的"需要先配置"提示）
 */
export function buildApiSection(api, onChange) {
    const s = api.settings.get();
    let mode = s.api?.mode === 'profile' ? 'profile' : 'direct';
    // 输入框边打边存（延迟），点选、切换等立即保存；立即保存会并入并取消还没存的输入，免得旧输入后到把它覆盖
    const typed = debounceSave(patch => {
        saveMerged(api, patch);
        onChange();
    });
    const save = patch => typed.flush(patch);

    // ---- 方式 ----
    const modeSeg = settingSegment([['direct', '直填 API'], ['profile', '使用连接配置']], mode, '接入方式', value => {
        mode = value;
        directBox.hidden = mode !== 'direct';
        profileBox.hidden = mode !== 'profile';
        test.reset();
        save({ api: { mode } });
    });

    // ---- 直填 ----
    const direct = directFields(api, s.api ?? {}, {
        idPrefix: 'backstage_api',
        push: fields => typed.push({ api: fields }),
        save: fields => save({ api: fields }),
    });
    const directBox = h('div', { class: 'bs-set-mode', hidden: mode !== 'direct' }, direct.element);

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
    const test = testRow(api, () => (mode === 'direct'
        ? { api: { mode, ...direct.values() } }
        : { api: { mode }, profileId: profile.value }));

    const section = h('section', { class: 'bs-set-section bs-set-api', 'aria-label': '模型 API' },
        h('h3', { class: 'bs-set-head' }, '模型 API'),
        modeSeg,
        directBox,
        profileBox,
        test.element,
        h('small', { class: 'bs-set-note' }, '推演和剧情参谋都用这里的模型，可以选便宜快速的。密钥保存在本地的扩展设置里。'));

    return {
        element: section,
        /** 展开抽屉时刷新连接列表：用户可能刚在连接管理器里新建了连接 */
        refresh: fillProfiles,
    };
}

/**
 * 设置页里的分段选择（单选）。
 * @param {Array<[string, string]>} options  [值, 文字]
 * @param {string} value
 * @param {string} label
 * @param {(value: string) => void} onChange
 */
export function settingSegment(options, value, label, onChange) {
    let current = value;
    const buttons = options.map(([v, text]) => {
        const btn = h('button', { type: 'button', class: 'bs-set-seg-item', role: 'radio', 'aria-checked': String(v === current) }, text);
        btn.addEventListener('click', () => {
            if (current === v) return;
            current = v;
            for (const b of buttons) b.setAttribute('aria-checked', String(b === btn));
            onChange(v);
        });
        return btn;
    });
    return h('div', { class: 'bs-set-seg', role: 'radiogroup', 'aria-label': label }, buttons);
}

/**
 * 直填的地址、密钥（可显示）、模型（可获取列表并筛选）。
 * @param {any} api
 * @param {{ url?: string, key?: string, model?: string }} initial
 * @param {{ idPrefix: string, push: (fields: object) => void, save: (fields: object) => void }} opts
 *   push：打字时延迟保存；save：点选模型时立即保存。传入的都是 { url } / { key } / { model } 这样的局部字段
 * @returns {{ element: HTMLElement, values: () => { url: string, key: string, model: string } }}
 */
export function directFields(api, initial, { idPrefix, push, save }) {
    const textInput = (value, attrs) => h('input', { class: 'bs-input', type: 'text', value: value ?? '', autocomplete: 'off', spellcheck: 'false', ...attrs });

    const url = textInput(initial.url, { placeholder: URL_PLACEHOLDER, inputmode: 'url' });
    url.addEventListener('input', () => push({ url: url.value.trim() }));

    const key = textInput(initial.key, { type: 'password', placeholder: 'sk-… / AIza…', autocomplete: 'new-password', id: `${idPrefix}_key` });
    key.addEventListener('input', () => push({ key: key.value.trim() }));
    const eye = h('button', { type: 'button', class: 'bs-btn bs-set-btn', 'aria-pressed': 'false' }, '显示');
    eye.addEventListener('click', () => {
        const show = key.type === 'password';
        key.type = show ? 'text' : 'password';
        eye.textContent = show ? '隐藏' : '显示';
        eye.setAttribute('aria-pressed', String(show));
    });

    const model = textInput(initial.model, {
        placeholder: '例如 gemini-2.5-flash', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false',
        id: `${idPrefix}_model`, 'aria-controls': `${idPrefix}_models`,
    });
    let models = /** @type {string[]} */ ([]);
    let query = '';
    const listInfo = h('small', { class: 'bs-set-models-info' });
    const list = h('div', { class: 'bs-set-models-list', role: 'listbox', 'aria-label': '可用模型', id: `${idPrefix}_models` });
    const listBox = h('div', { class: 'bs-set-models', hidden: true },
        h('div', { class: 'bs-set-models-head' }, listInfo,
            h('button', { type: 'button', class: 'bs-set-link', onclick: () => showList(false) }, '收起')),
        list);

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
                save({ model: id });
                showList(false);
            });
            return item;
        }));
        if (!hits.length) list.append(h('small', { class: 'bs-set-empty' }, '没有匹配的模型，可以直接手填。'));
    };
    model.addEventListener('input', () => {
        push({ model: model.value.trim() });
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

    const element = h('div', { class: 'bs-set-direct' },
        h('label', { class: 'bs-set-field' }, h('span', null, 'API 地址'), url, h('small', null, 'OpenAI 兼容地址，填到 /v1 这一层即可')),
        h('div', { class: 'bs-set-field' }, h('label', { for: key.id }, '密钥'), h('div', { class: 'bs-set-inline' }, key, eye)),
        h('div', { class: 'bs-set-field' },
            h('label', { for: model.id }, '模型'),
            h('div', { class: 'bs-set-inline' }, model, fetchBtn),
            fetchNote,
            listBox));

    return {
        element,
        values: () => ({ url: url.value.trim(), key: key.value.trim(), model: model.value.trim() }),
    };
}

/**
 * 「测试连接」按钮和结果行。
 * @param {any} api
 * @param {() => object} getPatch  交给 api.settings.testApi 的设置（可带界面上还没保存的值）
 */
export function testRow(api, getPatch) {
    const btn = h('button', { type: 'button', class: 'bs-btn bs-set-btn' }, '测试连接');
    const result = h('div', { class: 'bs-set-result', role: 'status', hidden: true });
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '测试中…';
        result.hidden = false;
        result.dataset.kind = '';
        result.textContent = '正在发一条很短的请求…';
        try {
            result.textContent = testResultText(await api.settings.testApi(getPatch()));
            result.dataset.kind = 'ok';
        } catch (error) {
            result.textContent = `不可用：${error?.message ?? error}`;
            result.dataset.kind = 'error';
        } finally {
            btn.disabled = false;
            btn.textContent = '测试连接';
        }
    });
    return {
        element: h('div', { class: 'bs-set-test' }, btn, result),
        reset: () => { result.hidden = true; },
    };
}

/**
 * 输入时延迟保存，避免每个字都写设置。patch 里的对象分组（api、review……）逐组合并。
 * @param {(patch: object) => void} save
 */
export function debounceSave(save) {
    let timer = 0;
    let pending = null;
    const merge = (a, b) => {
        const out = { ...(a ?? {}) };
        for (const [k, v] of Object.entries(b ?? {})) {
            out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? { ...out[k], ...v } : v;
        }
        return out;
    };
    /** 立即保存还没存的输入，再叠加 patch（patch 优先） */
    const flush = patch => {
        clearTimeout(timer);
        const all = merge(pending, patch);
        pending = null;
        if (Object.keys(all).length) save(all);
    };
    const push = patch => {
        pending = merge(pending, patch);
        clearTimeout(timer);
        timer = setTimeout(() => flush(), 400);
    };
    return { push, flush };
}
