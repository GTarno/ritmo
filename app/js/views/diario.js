// Tela "Diário": observações, dores, limitações e ajustes. Os ajustes feitos no
// Treino AB entram aqui sozinhos e podem ser complementados como os demais.
import { app } from '../app-state.js';
import { h, icon, ICONS } from '../ui/dom.js';
import { field, selectField } from '../ui/form.js';
import { formDialog, confirmDialog } from '../ui/dialog.js';
import { showStatus } from '../ui/status.js';
import { emptyState } from '../ui/empty-state.js';
import { formatNumeric, formatShort, weekdayShort } from '../dates.js';
import {
  CATEGORIES,
  TEXT_MAX,
  INTENSITY_MIN,
  INTENSITY_MAX,
  categoryLabel,
  parseNoteForm,
  addNote,
  updateNote,
  removeNote,
  listNotes,
} from '../domain/journal.js';

// Filtros lembrados enquanto o app está aberto.
const filters = { category: '', plan: '' };

const PLAN_OPTIONS = [
  { value: '', label: 'Nenhum' },
  { value: 'A', label: 'Treino A' },
  { value: 'B', label: 'Treino B' },
];

function noteFields(note = {}) {
  const today = app.today();
  const dateField = field({ label: 'Data', name: 'date', type: 'date', value: note.date ?? today, required: true });
  dateField.querySelector('input').max = today;
  return [
    h(
      'div',
      { class: 'field-row' },
      selectField({
        label: 'Tipo',
        name: 'category',
        required: true,
        value: note.category ?? 'observacao',
        options: CATEGORIES.map((c) => ({ value: c.key, label: c.label })),
      }),
      dateField,
    ),
    field({
      label: 'Descrição',
      name: 'text',
      value: note.text ?? '',
      multiline: true,
      required: true,
      maxlength: TEXT_MAX,
      placeholder: 'Ex.: Joelho direito incomodou no leg press.',
    }),
    h(
      'div',
      { class: 'field-row' },
      selectField({ label: 'Treino', name: 'plan', value: note.plan ?? '', options: PLAN_OPTIONS }),
      field({
        label: 'Intensidade',
        name: 'intensity',
        value: note.intensity ?? '',
        inputmode: 'numeric',
        hint: `${INTENSITY_MIN} = nada, ${INTENSITY_MAX} = máxima`,
      }),
    ),
  ];
}

async function onAdd(rerender) {
  const value = await formDialog({
    title: 'Novo registro',
    content: noteFields(),
    onSubmit: (values) => parseNoteForm(values, app.today()),
  });
  if (!value) return rerender('[data-action="add"]');
  const { state, note } = addNote(app.state, value, app.ctx());
  if (app.commit(state)) showStatus('Registro salvo no diário.');
  // Se o filtro atual esconderia o novo registro, limpa os filtros para mostrá-lo.
  if ((filters.category && filters.category !== note.category) || (filters.plan && filters.plan !== note.plan)) {
    filters.category = '';
    filters.plan = '';
  }
  rerender(`[data-note="${note.id}"] [data-action="edit"]`);
}

async function onEdit(note, rerender) {
  const value = await formDialog({
    title: 'Editar registro',
    content: noteFields(note),
    onSubmit: (values) => parseNoteForm(values, app.today()),
  });
  if (!value) return rerender(`[data-note="${note.id}"] [data-action="edit"]`);
  if (app.commit(updateNote(app.state, note.id, value))) showStatus('Registro atualizado.');
  rerender(`[data-note="${note.id}"] [data-action="edit"]`);
}

async function onRemove(note, rerender) {
  const ok = await confirmDialog(`O registro de ${formatShort(note.date)} será apagado do diário.`, {
    title: 'Remover registro?',
    confirmLabel: 'Remover',
    danger: true,
  });
  if (!ok) return rerender(`[data-note="${note.id}"] [data-action="remove"]`);
  if (app.commit(removeNote(app.state, note.id))) showStatus('Registro removido.');
  rerender('[data-action="add"]');
}

function noteItem(note, rerender) {
  const meta = [
    note.plan ? `Treino ${note.plan}` : null,
    note.intensity !== null && note.intensity !== undefined ? `intensidade ${note.intensity}/10` : null,
  ].filter(Boolean);
  return h(
    'li',
    { class: ['card', 'note', `note-${note.category}`], dataset: { note: note.id } },
    h(
      'div',
      { class: 'note-head' },
      h(
        'div',
        { class: 'note-title' },
        h('span', { class: 'tag', dataset: { category: note.category } }, categoryLabel(note.category)),
        note.auto && h('span', { class: 'tag tag-auto' }, 'automático'),
        h('time', { datetime: note.date }, `${weekdayShort(note.date)} ${formatNumeric(note.date)}`),
      ),
      h(
        'div',
        { class: 'note-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `Editar registro de ${formatShort(note.date)}: ${categoryLabel(note.category)}`,
            dataset: { action: 'edit' },
            onclick: () => onEdit(note, rerender),
          },
          icon(ICONS.editar, { size: 18 }),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn danger',
            'aria-label': `Remover registro de ${formatShort(note.date)}: ${categoryLabel(note.category)}`,
            dataset: { action: 'remove' },
            onclick: () => onRemove(note, rerender),
          },
          icon(ICONS.lixo, { size: 18 }),
        ),
      ),
    ),
    h('p', { class: 'note-text' }, note.text),
    meta.length > 0 && h('p', { class: 'muted note-meta' }, meta.join(' · ')),
  );
}

function filterBar(rerender) {
  const select = (label, id, key, options) =>
    h(
      'div',
      { class: 'field' },
      h('label', { for: id }, label),
      h(
        'select',
        {
          id,
          onchange: (e) => {
            filters[key] = e.target.value;
            rerender(`#${id}`);
          },
        },
        options.map((o) => h('option', { value: o.value, selected: o.value === filters[key] }, o.label)),
      ),
    );
  return h(
    'div',
    { class: 'filters', role: 'group', 'aria-label': 'Filtros do diário' },
    select('Tipo', 'filter-category', 'category', [{ value: '', label: 'Todos' }, ...CATEGORIES.map((c) => ({ value: c.key, label: c.label }))]),
    select('Treino', 'filter-plan', 'plan', [{ value: '', label: 'Todos' }, ...PLAN_OPTIONS.slice(1)]),
  );
}

export function renderDiario() {
  const body = h('div', { class: 'journal' });
  const root = h('section', { class: 'screen' }, h('h2', { class: 'screen-title' }, 'Diário'), body);

  function rerender(focusSelector) {
    const all = app.state.notes.length;
    const notes = listNotes(app.state, filters);
    const filtered = filters.category || filters.plan;
    body.replaceChildren(
      h(
        'button',
        { type: 'button', class: 'btn btn-primary', dataset: { action: 'add' }, onclick: () => onAdd(rerender) },
        icon(ICONS.mais, { size: 20 }),
        'Novo registro',
      ),
      all > 0 && filterBar(rerender),
      all > 0 &&
        h(
          'p',
          { class: 'muted', 'aria-live': 'polite' },
          filtered ? `${notes.length} de ${all} registros` : all === 1 ? '1 registro' : `${all} registros`,
        ),
      notes.length
        ? h('ol', { class: 'note-list', 'aria-label': 'Registros do diário' }, notes.map((n) => noteItem(n, rerender)))
        : all
          ? emptyState({
              title: 'Nenhum registro com esses filtros',
              action: {
                label: 'Limpar filtros',
                onClick: () => {
                  filters.category = '';
                  filters.plan = '';
                  rerender('[data-action="add"]');
                },
              },
            })
          : emptyState({
              title: 'Diário vazio',
              text: 'Anote como se sentiu, dores, limitações e ajustes do treino. Ajustes feitos no Treino AB aparecem aqui sozinhos.',
            }),
    );
    if (focusSelector) body.querySelector(focusSelector)?.focus();
  }

  rerender();
  return root;
}
