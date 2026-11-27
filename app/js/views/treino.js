// Tela "Treino AB": modelos A e B, edição de exercícios e cardio.
import { app } from '../app-state.js';
import { h, icon, ICONS } from '../ui/dom.js';
import { field } from '../ui/form.js';
import { formDialog } from '../ui/dialog.js';
import { showStatus } from '../ui/status.js';
import { emptyState } from '../ui/empty-state.js';
import { listPlans, getPlan } from '../domain/models.js';
import {
  LIMITS,
  parseExerciseForm,
  addExercise,
  updateExercise,
  removeExercise,
  moveExercise,
  updateCardio,
  exerciseSummary,
  formatNumber,
} from '../domain/plans.js';

let selected = 'A';

/** Modelo selecionado; se ele não existe mais, o primeiro da lista. */
function currentPlan() {
  const plan = getPlan(app.state, selected) ?? listPlans(app.state)[0];
  selected = plan.id;
  return plan;
}
const label = () => currentPlan().label;

const reasonField = () =>
  field({
    label: 'Motivo do ajuste',
    name: 'reason',
    multiline: true,
    maxlength: LIMITS.reasonMax,
    hint: 'Fica registrado no diário junto com a alteração.',
  });

function exerciseFields(ex = {}) {
  return [
    field({ label: 'Nome', name: 'name', value: ex.name, required: true, maxlength: LIMITS.nameMax }),
    h(
      'div',
      { class: 'field-row' },
      field({ label: 'Séries', name: 'sets', value: ex.sets ?? 2, inputmode: 'numeric', required: true }),
      field({
        label: 'Repetições ou tempo',
        name: 'reps',
        value: ex.reps ?? '8–12',
        required: true,
        maxlength: LIMITS.repsMax,
        hint: 'Ex.: 8–12 ou 30 s',
      }),
    ),
    h(
      'div',
      { class: 'field-row' },
      field({
        label: 'Carga planejada',
        name: 'load',
        value: ex.load === null || ex.load === undefined ? '' : formatNumber(ex.load),
        inputmode: 'decimal',
        suffix: 'kg',
        hint: 'Em branco = em aberto. Zero vale.',
      }),
      field({ label: 'Intervalo', name: 'rest', value: ex.rest ?? '', inputmode: 'numeric', suffix: 's' }),
    ),
    reasonField(),
  ];
}

// ---------- Ações ----------

async function onAdd(rerender) {
  const result = await formDialog({
    title: `Novo exercício no treino ${label()}`,
    content: exerciseFields({ load: null, rest: 75 }),
    submitLabel: 'Adicionar',
    onSubmit: (values) => {
      const parsed = parseExerciseForm(values);
      return parsed.errors ? parsed : { value: { fields: parsed.value, reason: values.reason } };
    },
  });
  if (!result) return;
  const { state, exercise } = addExercise(app.state, selected, result.fields, result.reason, app.ctx());
  if (app.commit(state)) showStatus(`${exercise.name} adicionado ao treino ${label()}.`);
  rerender(`[data-exercise="${exercise.id}"] [data-action="edit"]`);
}

async function onEdit(ex, rerender) {
  const result = await formDialog({
    title: `Editar ${ex.name}`,
    content: exerciseFields(ex),
    onSubmit: (values) => {
      const parsed = parseExerciseForm(values);
      return parsed.errors ? parsed : { value: { fields: parsed.value, reason: values.reason } };
    },
  });
  if (!result) return rerender(`[data-exercise="${ex.id}"] [data-action="edit"]`);
  const { state, changed } = updateExercise(app.state, selected, ex.id, result.fields, result.reason, app.ctx());
  if (!changed) showStatus('Nada foi alterado.');
  else if (app.commit(state)) showStatus('Exercício atualizado. O ajuste foi registrado no diário.');
  rerender(`[data-exercise="${ex.id}"] [data-action="edit"]`);
}

async function onRemove(ex, rerender) {
  const result = await formDialog({
    title: `Remover ${ex.name}?`,
    content: [
      h('p', {}, `O exercício sai do treino ${label()}. Sessões já registradas e o histórico de cargas continuam como estão.`),
      reasonField(),
    ],
    submitLabel: 'Remover',
    variant: 'danger',
    focusFirstField: false,
    onSubmit: (values) => ({ value: { reason: values.reason } }),
  });
  if (!result) return rerender(`[data-exercise="${ex.id}"] [data-action="remove"]`);
  const { state } = removeExercise(app.state, selected, ex.id, result.reason, app.ctx());
  if (app.commit(state)) showStatus(`${ex.name} removido do treino ${label()}.`);
  rerender('[data-action="add"]');
}

function onMove(ex, direction, rerender) {
  const { state, moved } = moveExercise(app.state, selected, ex.id, direction);
  if (!moved) return;
  app.commit(state);
  const own = direction < 0 ? 'up' : 'down';
  const other = direction < 0 ? 'down' : 'up';
  // Mantém o foco no mesmo botão; se ficou desabilitado (chegou ao topo/fim), usa o outro.
  rerender(`[data-exercise="${ex.id}"] [data-action="${own}"]:not([disabled]), [data-exercise="${ex.id}"] [data-action="${other}"]`);
}

async function onEditCardio(rerender) {
  const plan = currentPlan();
  const result = await formDialog({
    title: `Cardio do treino ${label()}`,
    content: [
      field({
        label: 'Cardio',
        name: 'cardio',
        value: plan.cardio ?? '',
        maxlength: LIMITS.cardioMax,
        hint: 'Texto livre. Ex.: 10 min de caminhada leve. Em branco = sem cardio.',
      }),
      reasonField(),
    ],
    onSubmit: (values) => ({ value: values }),
  });
  if (!result) return rerender('[data-action="cardio"]');
  const { state, changed } = updateCardio(app.state, selected, result.cardio, result.reason, app.ctx());
  if (state === app.state) showStatus('Nada foi alterado.');
  else if (app.commit(state)) showStatus(changed ? 'Cardio atualizado.' : 'Motivo registrado no diário.');
  rerender('[data-action="cardio"]');
}

// ---------- Renderização ----------

function planSwitcher(rerender) {
  return h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Modelo de treino' },
    listPlans(app.state).map((plan) =>
      h(
        'button',
        {
          type: 'button',
          'aria-pressed': String(plan.id === currentPlan().id),
          dataset: { plan: plan.id },
          onclick: () => {
            selected = plan.id;
            rerender(`[data-plan="${CSS.escape(plan.id)}"]`);
          },
        },
        `Treino ${plan.label}`,
      ),
    ),
  );
}

function exerciseItem(ex, index, total, rerender) {
  return h(
    'li',
    { class: 'card exercise', dataset: { exercise: ex.id } },
    h('div', { class: 'exercise-main' }, h('h4', {}, ex.name), h('p', { class: 'muted' }, exerciseSummary(ex))),
    h(
      'div',
      { class: 'exercise-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          'aria-label': `Mover ${ex.name} para cima`,
          dataset: { action: 'up' },
          disabled: index === 0,
          onclick: () => onMove(ex, -1, rerender),
        },
        icon(ICONS.cima, { size: 20 }),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          'aria-label': `Mover ${ex.name} para baixo`,
          dataset: { action: 'down' },
          disabled: index === total - 1,
          onclick: () => onMove(ex, 1, rerender),
        },
        icon(ICONS.baixo, { size: 20 }),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn',
          'aria-label': `Editar ${ex.name}`,
          dataset: { action: 'edit' },
          onclick: () => onEdit(ex, rerender),
        },
        icon(ICONS.editar, { size: 20 }),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn danger',
          'aria-label': `Remover ${ex.name}`,
          dataset: { action: 'remove' },
          onclick: () => onRemove(ex, rerender),
        },
        icon(ICONS.lixo, { size: 20 }),
      ),
    ),
  );
}

function planContent(rerender) {
  const plan = currentPlan();
  const exercises = plan.exercises;
  const name = plan.name;
  const count = exercises.length === 1 ? '1 exercício' : `${exercises.length} exercícios`;

  return [
    h('div', { class: 'plan-header' }, h('h3', {}, `Treino ${plan.label}`, name && ` — ${name}`), h('p', { class: 'muted' }, count)),
    exercises.length
      ? h(
          'ol',
          { class: 'exercise-list', 'aria-label': `Exercícios do treino ${label()}` },
          exercises.map((ex, i) => exerciseItem(ex, i, exercises.length, rerender)),
        )
      : emptyState({
          title: `Nenhum exercício no treino ${label()}`,
          text: 'Adicione os exercícios que você faz neste dia.',
        }),
    h(
      'button',
      { type: 'button', class: 'btn btn-primary add-btn', dataset: { action: 'add' }, onclick: () => onAdd(rerender) },
      icon(ICONS.mais, { size: 20 }),
      'Adicionar exercício',
    ),
    h(
      'section',
      { class: 'card cardio', 'aria-labelledby': 'cardio-title' },
      h(
        'div',
        { class: 'exercise-main' },
        h('h4', { id: 'cardio-title' }, 'Cardio'),
        h('p', { class: 'muted' }, plan.cardio || 'Sem cardio'),
      ),
      h(
        'button',
        { type: 'button', class: 'btn', dataset: { action: 'cardio' }, onclick: () => onEditCardio(rerender) },
        'Editar cardio',
      ),
    ),
  ];
}

export function renderTreino() {
  const body = h('div', { class: 'plan' });
  const root = h(
    'section',
    { class: 'screen' },
    h('h2', { class: 'screen-title' }, 'Treino AB'),
    h(
      'p',
      { class: 'muted' },
      'Alterações valem para as próximas sessões abertas a partir do modelo. Sessões já iniciadas não mudam.',
    ),
    body,
  );

  // Redesenha a área do modelo e devolve o foco a um controle equivalente.
  function rerender(focusSelector) {
    body.replaceChildren(planSwitcher(rerender), ...planContent(rerender));
    if (focusSelector) body.querySelector(focusSelector)?.focus();
  }

  rerender();
  return root;
}
