// Diálogos com <dialog> nativo: o navegador prende o foco dentro, fecha com Esc
// e deixa o resto da página inerte. Aqui cuidamos do conteúdo, do retorno
// e de devolver o foco a quem abriu.
import { h, icon, ICONS } from './dom.js';

let counter = 0;

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Abre um diálogo e resolve com o `value` da ação escolhida
 * (ou null se fechar com Esc, botão fechar ou clique fora).
 *
 * @param {{
 *   title: string,
 *   content?: Node | string | Array<Node | string>,
 *   actions?: Array<{ label: string, value: any, variant?: 'primary' | 'danger' | 'secondary', autofocus?: boolean }>,
 * }} options
 * @returns {Promise<any>}
 */
export function openDialog({ title, content = [], actions = [{ label: 'Fechar', value: null }] }) {
  const opener = document.activeElement;
  const id = `dialog-title-${++counter}`;
  const values = new Map();

  const dialog = h(
    'dialog',
    { class: 'dialog', 'aria-labelledby': id },
    h(
      'form',
      { method: 'dialog' },
      h(
        'header',
        { class: 'dialog-header' },
        h('h2', { id }, title),
        h(
          'button',
          { type: 'submit', value: '', class: 'icon-btn', 'aria-label': 'Fechar', formnovalidate: true },
          icon(ICONS.fechar, { size: 20 }),
        ),
      ),
      h('div', { class: 'dialog-body' }, content),
      h(
        'footer',
        { class: 'dialog-actions' },
        actions.map((action, i) => {
          const key = `a${i}`;
          values.set(key, action.value);
          return h(
            'button',
            {
              type: 'submit',
              value: key,
              class: ['btn', `btn-${action.variant ?? 'secondary'}`],
              autofocus: action.autofocus,
            },
            action.label,
          );
        }),
      ),
    ),
  );

  // Clique no fundo (fora da caixa) fecha como "cancelar".
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('');
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
      { label: cancelLabel, value: false, autofocus: true },
      { label: confirmLabel, value: true, variant: danger ? 'danger' : 'primary' },
    ],
  });
  return result === true;
}
