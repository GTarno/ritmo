// Regras do diário. Funções puras.
// Registros manuais e ajustes gerados pelo Treino AB (auto: true, com `change`)
// ficam na mesma lista, state.notes.
import { isValidDate } from '../dates.js';
import { parseInteger } from './plans.js';

export const CATEGORIES = [
  { key: 'observacao', label: 'Observação' },
  { key: 'dor', label: 'Dor' },
  { key: 'limitacao', label: 'Limitação' },
  { key: 'ajuste', label: 'Ajuste' },
];
export const TEXT_MAX = 1000;
export const INTENSITY_MIN = 0;
export const INTENSITY_MAX = 10;

export const categoryLabel = (key) => CATEGORIES.find((c) => c.key === key)?.label ?? 'Registro';

/**
 * Converte e valida o formulário (campos em texto). `planIds`: modelos que
 * podem ser vinculados (os existentes; registros antigos mantêm o vínculo).
 * @returns {{ value: { category, date, text, plan, intensity } } | { errors }}
 */
export function parseNoteForm(form, today, planIds = ['A', 'B']) {
  const errors = {};
  const category = String(form.category ?? '');
  const date = String(form.date ?? '').trim();
  const text = String(form.text ?? '').trim();
  const plan = String(form.plan ?? '');
  const intensity = parseInteger(form.intensity);

  if (!CATEGORIES.some((c) => c.key === category)) errors.category = 'Escolha o tipo do registro.';
  if (!isValidDate(date)) errors.date = 'Escolha uma data válida.';
  else if (date > today) errors.date = 'A data não pode ser no futuro.';
  if (!text) errors.text = 'Descreva o que aconteceu.';
  else if (text.length > TEXT_MAX) errors.text = `Use até ${TEXT_MAX} caracteres.`;
  if (plan && !planIds.includes(plan)) errors.plan = 'Escolha um treino da lista ou nenhum.';
  if (Number.isNaN(intensity) || (intensity !== null && (intensity < INTENSITY_MIN || intensity > INTENSITY_MAX))) {
    errors.intensity = `Use um número inteiro de ${INTENSITY_MIN} a ${INTENSITY_MAX}, ou deixe em branco.`;
  }

  if (Object.keys(errors).length) return { errors };
  return { value: { category, date, text, plan: plan || null, intensity } };
}

/** Novo registro manual. */
export function addNote(state, value, ctx) {
  const note = { id: ctx.newId(), ...value };
  return { state: { ...state, notes: [...state.notes, note] }, note };
}

/**
 * Edita um registro. Em ajustes automáticos, os dados da alteração
 * (`auto`, `change`) são preservados.
 */
export function updateNote(state, id, value) {
  if (!state.notes.some((n) => n.id === id)) throw new Error(`Registro não encontrado: ${id}`);
  return { ...state, notes: state.notes.map((n) => (n.id === id ? { ...n, ...value, id } : n)) };
}

export function removeNote(state, id) {
  return { ...state, notes: state.notes.filter((n) => n.id !== id) };
}

/**
 * Registros filtrados, do mais recente para o mais antigo. Na mesma data,
 * o criado por último aparece primeiro.
 * @param {{ category?: string, plan?: string }} filters  vazio = todos
 */
export function listNotes(state, { category = '', plan = '' } = {}) {
  return state.notes
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => (!category || note.category === category) && (!plan || note.plan === plan))
    .sort((a, b) => (a.note.date === b.note.date ? b.index - a.index : a.note.date < b.note.date ? 1 : -1))
    .map(({ note }) => note);
}
