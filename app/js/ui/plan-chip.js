// Bolinha de um modelo de treino: rótulo + cor do modelo. A cor nunca é a
// única informação: o rótulo sempre aparece e leitores de tela ouvem "Treino X".
// A situação (planejado, em andamento, concluído) muda o preenchimento, não a cor.
import { h, srOnly } from './dom.js';
import { planDisplay } from '../domain/models.js';

/** Variável CSS com a cor do modelo (modelo removido: cor neutra). */
export const planColorStyle = (color) => `--plan: var(--plan-${color ?? 'none'})`;

/**
 * @param {object} state
 * @param {string} id  id do modelo (session.type)
 * @param {{ session?: object, status?: string, srPrefix?: string|null, decorative?: boolean }} [o]
 *   decorative: o texto ao lado já diz o treino; a bolinha fica escondida de leitores de tela.
 */
export function planChip(state, id, { session = null, status, srPrefix = 'Treino ', decorative = false } = {}) {
  const { label, color } = planDisplay(state, id, session);
  return h(
    'span',
    { class: 'type-chip', style: planColorStyle(color), dataset: status ? { status } : undefined, 'aria-hidden': decorative ? 'true' : null },
    !decorative && srPrefix ? srOnly(srPrefix) : null,
    label,
  );
}

/** "Treino A — Superiores e core" (ou o que ficou guardado na sessão). */
export function planTitle(state, id, session = null) {
  const { label, name } = planDisplay(state, id, session);
  return `Treino ${label} — ${name}`;
}

/** "Treino A" (ou o rótulo guardado na sessão). */
export function planShort(state, id, session = null) {
  return `Treino ${planDisplay(state, id, session).label}`;
}
