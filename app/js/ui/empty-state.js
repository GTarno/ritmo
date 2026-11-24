// Estado vazio padrão: explica o que vai aparecer ali e oferece o próximo passo.
import { h } from './dom.js';

/**
 * @param {{ title: string, text?: string, action?: { label: string, href?: string, onClick?: () => void } }} options
 */
export function emptyState({ title, text, action }) {
  let button = null;
  if (action?.href) {
    button = h('a', { class: 'btn btn-primary', href: action.href }, action.label);
  } else if (action?.onClick) {
    button = h('button', { type: 'button', class: 'btn btn-primary', onclick: action.onClick }, action.label);
  }
  return h('div', { class: 'empty-state' }, h('p', { class: 'empty-title' }, title), text && h('p', {}, text), button);
}
