// Tela "Treinos": modelos de treino (criar, duplicar, editar, reordenar, remover), exercícios e cardio.
import { app } from '../app-state.js';
import { h, icon, ICONS } from '../ui/dom.js';
import { field, colorField } from '../ui/form.js';
import { formDialog, confirmDialog } from '../ui/dialog.js';
import { showStatus } from '../ui/status.js';
import { emptyState } from '../ui/empty-state.js';
import {
  listPlans,
  getPlan,
  PLAN_COLORS,
  COLOR_LABELS,
  LABEL_MAX,
  NAME_MAX,
  nextLabel,
  nextColor,
  parsePlanForm,
  createPlan,
  duplicatePlan,
  updatePlanMeta,
  movePlan,
  removePlan,
} from '../domain/models.js';
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

// ---------- Treinos (modelos) ----------

const focusPlan = (id) => `[data-plan="${CSS.escape(id)}"]`;
const swatch = (color) => h('span', { class: 'swatch', 'aria-hidden': 'true', style: `--swatch: var(--plan-${color})` });

function planFields(meta) {
  return [
    field({ label: 'Nome', name: 'name', value: meta.name, required: true, maxlength: NAME_MAX, placeholder: 'Ex.: Corpo todo' }),
    field({
      label: 'Rótulo',
      name: 'label',
      value: meta.label,
      required: true,
      maxlength: LABEL_MAX,
      hint: `1 a ${LABEL_MAX} letras ou números. Aparece no calendário e no Início.`,
    }),
    colorField({
      label: 'Cor',
      name: 'color',
      value: meta.color,
      options: PLAN_COLORS.map((c) => ({ value: c, label: COLOR_LABELS[c] })),
    }),
  ];
}

async function onNewPlan(rerender) {
  const meta = await formDialog({
    title: 'Novo treino',
    content: planFields({ name: '', label: nextLabel(app.state), color: nextColor(app.state) }),
    submitLabel: 'Criar',
    onSubmit: (values) => parsePlanForm(values, app.state),
  });
  if (!meta) return rerender('[data-action="new-plan"]');
  const { state, plan } = createPlan(app.state, meta, app.ctx());
  selected = plan.id;
  if (app.commit(state)) showStatus(`Treino ${plan.label} criado. Agora adicione os exercícios.`);
  rerender('[data-action="add"]');
}

async function onDuplicatePlan(rerender) {
  const source = currentPlan();
  const meta = await formDialog({
    title: `Duplicar treino ${source.label}`,
    content: [
      h('p', { class: 'muted' }, 'A cópia começa com os mesmos exercícios e cardio. O histórico de cargas de cada treino fica separado.'),
      ...planFields({ name: `${source.name} (cópia)`.slice(0, NAME_MAX), label: nextLabel(app.state), color: nextColor(app.state) }),
    ],
    submitLabel: 'Duplicar',
    onSubmit: (values) => parsePlanForm(values, app.state),
  });
  if (!meta) return rerender('[data-action="duplicate-plan"]');
  const { state, plan } = duplicatePlan(app.state, source.id, meta, app.ctx());
  selected = plan.id;
  if (app.commit(state)) showStatus(`Treino ${plan.label} criado como cópia de ${source.label}.`);
  rerender(focusPlan(plan.id));
}

async function onEditPlan(rerender) {
  const plan = currentPlan();
  const meta = await formDialog({
    title: `Editar treino ${plan.label}`,
    content: planFields(plan),
    onSubmit: (values) => parsePlanForm(values, app.state, plan.id),
  });
  if (!meta) return rerender('[data-action="edit-plan"]');
  const { state, changed } = updatePlanMeta(app.state, plan.id, meta, app.ctx());
  if (!changed) showStatus('Nada foi alterado.');
  else if (app.commit(state)) showStatus('Treino atualizado. A mudança foi registrada no diário.');
  rerender('[data-action="edit-plan"]');
}

function onMovePlan(direction, rerender) {
  const plan = currentPlan();
  const { state, moved } = movePlan(app.state, plan.id, direction);
  if (!moved) return;
  app.commit(state);
  const own = direction < 0 ? 'plan-before' : 'plan-after';
  const other = direction < 0 ? 'plan-after' : 'plan-before';
  rerender(`[data-action="${own}"]:not([disabled]), [data-action="${other}"]`);
}

async function onRemovePlan(rerender) {
  const plan = currentPlan();
  const scheduled = Object.values(app.state.sessions).filter((s) => s.type === plan.id && !Array.isArray(s.exercises)).length;
  const ok = await confirmDialog(
    [
      h('p', {}, `O treino ${plan.label} — ${plan.name} e seus ${plan.exercises.length} exercícios saem da lista de treinos.`),
      h(
        'ul',
        { class: 'summary-list' },
        h('li', {}, 'Sessões já registradas e o histórico de cargas continuam.'),
        scheduled > 0 &&
          h('li', {}, scheduled === 1 ? '1 sessão só agendada deste treino sai da agenda.' : `${scheduled} sessões só agendadas deste treino saem da agenda.`),
        h('li', {}, 'Na semana padrão, os dias deste treino ficam livres.'),
      ),
    ],
    { title: `Remover treino ${plan.label}?`, confirmLabel: 'Remover', danger: true },
  );
  if (!ok) return rerender('[data-action="remove-plan"]');
  const { state } = removePlan(app.state, plan.id, app.ctx());
  selected = listPlans(state)[0].id;
  if (app.commit(state)) showStatus(`Treino ${plan.label} removido.`);
  rerender(focusPlan(selected));
}

// ---------- Renderização ----------

function planSwitcher(rerender) {
  return h(
    'div',
    { class: 'plan-picker' },
    h(
      'div',
      { class: 'plan-pills', role: 'group', 'aria-label': 'Treinos' },
      listPlans(app.state).map((plan) =>
        h(
          'button',
          {
            type: 'button',
            class: 'plan-pill',
            'aria-pressed': String(plan.id === currentPlan().id),
            dataset: { plan: plan.id },
            onclick: () => {
              selected = plan.id;
              rerender(focusPlan(plan.id));
            },
          },
          swatch(plan.color),
          `Treino ${plan.label}`,
        ),
      ),
    ),
    h(
      'button',
      { type: 'button', class: 'btn', dataset: { action: 'new-plan' }, onclick: () => onNewPlan(rerender) },
      icon(ICONS.mais, { size: 18 }),
      'Novo treino',
    ),
  );
}

function planActions(plan, rerender) {
  const plans = listPlans(app.state);
  const index = plans.findIndex((p) => p.id === plan.id);
  const only = plans.length === 1;
  const btn = (action, labelText, iconName, onclick, extra = {}) =>
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': labelText, dataset: { action }, onclick, ...extra }, icon(ICONS[iconName], { size: 20 }));
  return h(
    'div',
    { class: 'plan-actions', role: 'group', 'aria-label': `Ações do treino ${plan.label}` },
    btn('edit-plan', `Editar treino ${plan.label}`, 'editar', () => onEditPlan(rerender)),
    h(
      'button',
      { type: 'button', class: 'btn', dataset: { action: 'duplicate-plan' }, onclick: () => onDuplicatePlan(rerender) },
      'Duplicar',
    ),
    btn('plan-before', `Mover treino ${plan.label} para antes`, 'anterior', () => onMovePlan(-1, rerender), { disabled: index === 0 }),
    btn('plan-after', `Mover treino ${plan.label} para depois`, 'proximo', () => onMovePlan(1, rerender), { disabled: index === plans.length - 1 }),
    btn('remove-plan', `Remover treino ${plan.label}`, 'lixo', () => onRemovePlan(rerender), {
      class: 'icon-btn danger',
      disabled: only,
      title: only ? 'É preciso manter pelo menos um treino' : null,
    }),
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
    h(
      'div',
      { class: 'plan-header' },
      h(
        'div',
        { class: 'plan-title' },
        swatch(plan.color),
        h('div', {}, h('h3', {}, `Treino ${plan.label}`, name && ` — ${name}`), h('p', { class: 'muted' }, count)),
      ),
      planActions(plan, rerender),
    ),
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
    h('h2', { class: 'screen-title' }, 'Treinos'),
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
