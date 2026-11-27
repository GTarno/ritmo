// Campos de formulário acessíveis: rótulo ligado ao campo, dica e mensagem
// de erro ligadas por aria-describedby, aria-invalid quando há erro.
import { h } from './dom.js';

let counter = 0;

/**
 * @param {{
 *   label: string, name: string, value?: any, type?: string, inputmode?: string,
 *   hint?: string, required?: boolean, multiline?: boolean, maxlength?: number,
 *   autocomplete?: string, placeholder?: string, suffix?: string,
 * }} options
 */
export function field({
  label,
  name,
  value = '',
  type = 'text',
  inputmode,
  hint,
  required = false,
  multiline = false,
  maxlength,
  autocomplete = 'off',
  placeholder,
  suffix,
}) {
  const id = `f-${name}-${++counter}`;
  const hintId = hint ? `${id}-hint` : null;
  const errorId = `${id}-error`;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ');
  const attrs = {
    id,
    name,
    required,
    maxlength,
    placeholder,
    inputmode,
    autocomplete,
    'aria-describedby': describedBy,
    dataset: { errorId },
  };

  const control = multiline
    ? h('textarea', { ...attrs, rows: 3 }, value ?? '')
    : h('input', { ...attrs, type, value: value ?? '' });

  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label, required ? null : h('span', { class: 'optional' }, ' (opcional)')),
    suffix ? h('div', { class: 'input-suffix' }, control, h('span', { 'aria-hidden': 'true' }, suffix)) : control,
    hint && h('p', { class: 'hint', id: hintId }, hint),
    h('p', { class: 'error', id: errorId }),
  );
}

/** Valores do formulário como objeto { nome: texto }. */
export function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

/** Mostra erros por campo e foca o primeiro campo inválido. Devolve true se havia erros. */
export function showErrors(form, errors = {}) {
  let first = null;
  for (const control of form.querySelectorAll('input, textarea, select')) {
    if (control.type === 'radio' && first?.name === control.name) continue;
    const message = errors[control.name];
    const errorEl = control.dataset.errorId && form.querySelector(`#${CSS.escape(control.dataset.errorId)}`);
    if (errorEl) errorEl.textContent = message ?? '';
    if (message) {
      control.setAttribute('aria-invalid', 'true');
      first ??= control;
    } else {
      control.removeAttribute('aria-invalid');
    }
  }
  first?.focus();
  return first !== null;
}

/**
 * Campo de seleção com o mesmo padrão de rótulo, dica e erro do `field`.
 * @param {{ label: string, name: string, options: Array<{ value: string, label: string }>, value?: string, hint?: string, required?: boolean }} o
 */
export function selectField({ label, name, options, value = '', hint, required = false }) {
  const id = `f-${name}-${++counter}`;
  const hintId = hint ? `${id}-hint` : null;
  const errorId = `${id}-error`;
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label, required ? null : h('span', { class: 'optional' }, ' (opcional)')),
    h(
      'select',
      { id, name, required, 'aria-describedby': [hintId, errorId].filter(Boolean).join(' '), dataset: { errorId } },
      options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)),
    ),
    hint && h('p', { class: 'hint', id: hintId }, hint),
    h('p', { class: 'error', id: errorId }),
  );
}

/**
 * Escolha de cor como grupo de opções (radio), com amostra e nome por extenso:
 * a cor nunca é a única informação.
 * @param {{ label: string, name: string, options: Array<{ value: string, label: string }>, value?: string, hint?: string }} o
 */
export function colorField({ label, name, options, value = '', hint }) {
  const id = `f-${name}-${++counter}`;
  const hintId = hint ? `${id}-hint` : null;
  const errorId = `${id}-error`;
  return h(
    'fieldset',
    { class: 'field color-field', 'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') },
    h('legend', {}, label),
    h(
      'div',
      { class: 'color-options' },
      options.map((o) =>
        h(
          'label',
          { class: 'color-option' },
          h('input', { type: 'radio', name, value: o.value, checked: o.value === value, dataset: { errorId } }),
          h('span', { class: 'swatch', 'aria-hidden': 'true', style: `--swatch: var(--plan-${o.value})` }),
          h('span', {}, o.label),
        ),
      ),
    ),
    hint && h('p', { class: 'hint', id: hintId }, hint),
    h('p', { class: 'error', id: errorId }),
  );
}
