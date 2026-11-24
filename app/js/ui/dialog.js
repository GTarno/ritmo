// Diálogos com <dialog> nativo: o navegador fecha com Esc e deixa o resto da
// página inerte. Aqui cuidamos do conteúdo, do retorno, do Tab preso e de
// devolver o foco a quem abriu.
//
// Só as ações principais são botões de envio; "Fechar" e "Cancelar" são
// botões comuns. Assim, Enter num campo de texto aciona a ação principal.
import { h, icon, ICONS } from './dom.js';
import { formValues, showErrors } from './form.js';

let counter = 0;

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Abre um diálogo e resolve com o `value` da ação escolhida
 * (ou null se fechar com Esc, botão fechar, cancelar ou clique fora).
 *
 * @param {{
 *   title: string,
 *   content?: Node | string | Array<Node | string>,
 *   actions?: Array<{
 *     label: string, value?: any, variant?: 'primary' | 'danger' | 'secondary',
 *     autofocus?: boolean, cancel?: boolean,
 *   }>,
 *   beforeClose?: (value: any, form: HTMLFormElement) => boolean,
 * }} options
 *   cancel: botão que só fecha (resolve null)
 *   beforeClose: chamado ao acionar uma ação principal; devolva false para manter aberto
 * @returns {Promise<any>}
 */
export function openDialog({ title, content = [], actions = [{ label: 'Fechar', cancel: true }], beforeClose }) {
  const opener = document.activeElement;
  const id = `dialog-title-${++counter}`;
  const values = new Map();
  let dialog;
  const cancel = () => dialog.close('');

  const form = h(
    'form',
    { method: 'dialog', novalidate: true },
    h(
      'header',
      { class: 'dialog-header' },
      h('h2', { id }, title),
      h(
        'button',
        { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar', onclick: cancel },
        icon(ICONS.fechar, { size: 20 }),
      ),
    ),
    h('div', { class: 'dialog-body' }, content),
    h(
      'footer',
      { class: 'dialog-actions' },
      actions.map((action, i) => {
        const className = ['btn', `btn-${action.variant ?? 'secondary'}`];
        if (action.cancel) {
          return h('button', { type: 'button', class: className, autofocus: action.autofocus, onclick: cancel }, action.label);
        }
        const key = `a${i}`;
        values.set(key, action.value);
        return h('button', { type: 'submit', value: key, class: className, autofocus: action.autofocus }, action.label);
      }),
    ),
  );

  dialog = h('dialog', { class: 'dialog', 'aria-labelledby': id }, form);

  form.addEventListener('submit', (event) => {
    // Enter num campo envia sem "submitter" em alguns navegadores: usa a primeira ação principal.
    const key = event.submitter?.value || values.keys().next().value;
    if (!values.has(key)) return;
    if (beforeClose && beforeClose(values.get(key), form) === false) {
      event.preventDefault();
      return;
    }
    // Garante o returnValue mesmo quando o envio veio do Enter.
    event.preventDefault();
    dialog.close(key);
  });

  // Clique no fundo (fora da caixa) fecha como "cancelar".
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) cancel();
  });

  // O <dialog> nativo deixa o Tab escapar para a barra do navegador depois do
  // último botão; aqui o foco circula só entre os controles do diálogo.
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => {
        const result = values.has(dialog.returnValue) ? values.get(dialog.returnValue) : null;
        dialog.remove();
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
        resolve(result);
      },
      { once: true },
    );
    document.body.append(dialog);
    dialog.showModal();
  });
}

/**
 * Pergunta de confirmação. Resolve true só se a usuária confirmar.
 * O foco inicial fica em "Cancelar" para evitar confirmações acidentais.
 */
export async function confirmDialog(
  message,
  { title = 'Confirmar', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false } = {},
) {
  const result = await openDialog({
    title,
    content: h('p', {}, message),
    actions: [
      { label: cancelLabel, cancel: true, autofocus: true },
      { label: confirmLabel, value: true, variant: danger ? 'danger' : 'primary' },
    ],
  });
  return result === true;
}

/**
 * Diálogo com formulário. `onSubmit(values, form)` recebe os campos como texto e
 * devolve { value } para fechar ou { errors: { campo: mensagem } } para manter aberto.
 * Resolve com `value`, ou null se cancelar.
 */
export async function formDialog({
  title,
  content,
  submitLabel = 'Salvar',
  variant = 'primary',
  onSubmit,
  focusFirstField = true,
}) {
  let result = null;
  const body = h('div', {}, content);
  if (focusFirstField) body.querySelector('input, textarea, select')?.setAttribute('autofocus', '');

  const confirmed = await openDialog({
    title,
    content: body,
    actions: [
      { label: 'Cancelar', cancel: true, autofocus: !focusFirstField },
      { label: submitLabel, value: true, variant },
    ],
    beforeClose: (_, form) => {
      const outcome = onSubmit(formValues(form), form);
      if (outcome?.errors && showErrors(form, outcome.errors)) return false;
      result = outcome?.value ?? null;
      return true;
    },
  });
  return confirmed ? result : null;
}
