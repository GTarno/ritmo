// Mensagens de status na região aria-live (#status).
// - info/sucesso: somem sozinhas após alguns segundos
// - erro: fica até ser fechada, e é anunciada com prioridade (role="alert")
import { h, icon, ICONS } from './dom.js';

const INFO_TIMEOUT = 4000;
let timer;

function region() {
  return document.getElementById('status');
}

export function clearStatus() {
  clearTimeout(timer);
  region()?.replaceChildren();
}

/**
 * @param {string} message
 * @param {{ type?: 'info' | 'success' | 'error', timeout?: number, action?: { label: string, onClick: () => void } }} [options]
 *   action: botão dentro do aviso (ex.: "Atualizar"); avisos com ação não somem sozinhos
 */
export function showStatus(message, { type = 'info', timeout, action } = {}) {
  const root = region();
  if (!root || !message) return;
  clearTimeout(timer);

  const isError = type === 'error';
  const toast = h(
    'div',
    { class: ['toast', `toast-${type}`], role: isError ? 'alert' : null },
    h('p', {}, message),
    action &&
      h(
        'button',
        {
          type: 'button',
          class: 'btn toast-action',
          onclick: () => {
            clearStatus();
            action.onClick();
          },
        },
        action.label,
      ),
    h(
      'button',
      { type: 'button', class: 'icon-btn', 'aria-label': 'Fechar aviso', onclick: clearStatus },
      icon(ICONS.fechar, { size: 18 }),
    ),
  );
  root.replaceChildren(toast);

  const ms = timeout ?? (isError || action ? 0 : INFO_TIMEOUT);
  if (ms > 0) timer = setTimeout(clearStatus, ms);
}
