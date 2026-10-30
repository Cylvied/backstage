// 极小的 DOM 构造工具，以及面板共用的小控件。

/**
 * h('div', { class: 'x', onclick: fn }, '文本', child)
 * 属性值为 false/null/undefined 时不设置；on* 绑定事件；文本自动转义（用 textContent）。
 * @param {string} tag
 * @param {Record<string, any>|null} [attrs]
 * @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs ?? {})) {
        if (value === false || value === null || value === undefined) continue;
        if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else if (key === 'value') /** @type {any} */ (el).value = value;
        else if (key === 'checked') /** @type {any} */ (el).checked = Boolean(value);
        else el.setAttribute(key, value === true ? '' : String(value));
    }
    append(el, children);
    return el;
}

function append(el, children) {
    for (const child of children) {
        if (child === null || child === undefined || child === false || child === '') continue;
        if (Array.isArray(child)) append(el, child);
        else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
}

/**
 * 分段选择（强度等）。
 * @param {Record<string, string>} options  value → 文案
 * @param {string} value
 * @param {(value: string) => void} onChange
 * @param {string} label  无障碍名称
 */
export function segmented(options, value, onChange, label) {
    const group = h('div', { class: 'bs-seg', role: 'radiogroup', 'aria-label': label });
    for (const [key, text] of Object.entries(options)) {
        const btn = h('button', { type: 'button', class: 'bs-seg-item', role: 'radio', 'aria-checked': String(key === value) }, text);
        btn.addEventListener('click', () => {
            for (const other of group.children) other.setAttribute('aria-checked', String(other === btn));
            onChange(key);
        });
        group.append(btn);
    }
    return group;
}

/**
 * 需要点两次才执行的危险操作按钮（删除、移除）。第一次点击后文字变成确认文案，3 秒内再点才执行。
 * @param {string} text
 * @param {string} confirmText
 * @param {() => void} action
 */
export function confirmButton(text, confirmText, action) {
    let armed = false;
    let timer = 0;
    const btn = h('button', { type: 'button', class: 'bs-btn bs-btn-quiet bs-btn-danger' }, text);
    btn.addEventListener('click', () => {
        if (armed) {
            clearTimeout(timer);
            action();
            return;
        }
        armed = true;
        btn.textContent = confirmText;
        btn.classList.add('is-armed');
        timer = setTimeout(() => {
            armed = false;
            btn.textContent = text;
            btn.classList.remove('is-armed');
        }, 3000);
    });
    return btn;
}

/** 表单字段：标签 + 控件 */
export function field(label, control, hint) {
    const tag = /^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName) ? 'label' : 'div';
    return h(tag, { class: 'bs-field' }, h('span', { class: 'bs-field-label' }, label), control, hint ? h('span', { class: 'bs-field-hint' }, hint) : null);
}

/** @param {Record<string, string>} options @param {string} value */
export function select(options, value, attrs = {}) {
    return h('select', { class: 'bs-input', ...attrs },
        Object.entries(options).map(([k, v]) => h('option', { value: k, selected: k === value }, v)));
}
