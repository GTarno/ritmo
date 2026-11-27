// Modelos de treino (A, B e quantos mais a usuária criar). Funções puras.
//
// Formato (schemaVersion 2): state.plans é uma lista ordenada
//   [{ id, label, name, color, cardio, exercises }]
// - id: estável; sessões, diário e semana padrão apontam para ele.
//   Os modelos originais mantêm 'A' e 'B'; os novos ganham um id gerado.
// - label: rótulo curto das bolinhas (1–3 caracteres, único).
// - color: uma das cores de PLAN_COLORS (contraste validado nos temas).

// Ordem da paleta categórica validada (contraste e separação para daltonismo,
// temas claro e escuro). A cor nunca aparece sozinha: sempre com o rótulo.
export const PLAN_COLORS = ['azul', 'laranja', 'turquesa', 'amarelo', 'rosa', 'verde'];
export const COLOR_LABELS = {
  azul: 'Azul',
  laranja: 'Laranja',
  turquesa: 'Turquesa',
  amarelo: 'Amarelo',
  rosa: 'Rosa',
  verde: 'Verde',
};
export const LABEL_MAX = 3;
export const NAME_MAX = 40;

export class PlanError extends Error {}

export const listPlans = (state) => state.plans ?? [];

export function getPlan(state, id) {
  return listPlans(state).find((p) => p.id === id) ?? null;
}

export const planIds = (state) => listPlans(state).map((p) => p.id);

/**
 * Rótulo e nome para exibir uma referência a um modelo. Se o modelo foi
 * removido, usa o que ficou guardado na sessão (ou o próprio id).
 */
export function planDisplay(state, id, session = null) {
  const plan = getPlan(state, id);
  if (plan) return { label: plan.label, name: plan.name, color: plan.color, exists: true };
  return {
    label: session?.planLabel ?? (typeof id === 'string' && id.length <= LABEL_MAX ? id : '?'),
    name: session?.planName ?? 'Modelo removido',
    color: null,
    exists: false,
  };
}

/** Próximo rótulo livre: C, D, E… (depois Z: T1, T2…). */
export function nextLabel(state) {
  const used = new Set(listPlans(state).map((p) => p.label.toUpperCase()));
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    if (!used.has(letter)) return letter;
  }
  for (let n = 1; ; n++) if (!used.has(`T${n}`)) return `T${n}`;
}

/** Próxima cor da paleta, na ordem, pulando as já usadas quando possível. */
export function nextColor(state) {
  const used = new Set(listPlans(state).map((p) => p.color));
  return PLAN_COLORS.find((c) => !used.has(c)) ?? PLAN_COLORS[listPlans(state).length % PLAN_COLORS.length];
}

/**
 * Valida nome, rótulo e cor (campos em texto). `exceptId`: o modelo sendo
 * editado, que pode manter o próprio rótulo.
 * @returns {{ value: { name, label, color } } | { errors }}
 */
export function parsePlanForm(form, state, exceptId = null) {
  const errors = {};
  const name = String(form.name ?? '').trim().replace(/\s+/g, ' ');
  const label = String(form.label ?? '').trim().toUpperCase();
  const color = String(form.color ?? '');

  if (!name) errors.name = 'Dê um nome ao treino (ex.: Superiores, Corpo todo).';
  else if (name.length > NAME_MAX) errors.name = `Use até ${NAME_MAX} caracteres.`;

  if (!label) errors.label = 'Informe um rótulo curto (ex.: C).';
  else if (label.length > LABEL_MAX) errors.label = `Use até ${LABEL_MAX} caracteres.`;
  else if (!/^[\p{L}\p{N}]+$/u.test(label)) errors.label = 'Use só letras e números.';
  else if (listPlans(state).some((p) => p.id !== exceptId && p.label.toUpperCase() === label)) {
    errors.label = `O rótulo ${label} já está em uso.`;
  }

  if (!PLAN_COLORS.includes(color)) errors.color = 'Escolha uma cor.';

  if (Object.keys(errors).length) return { errors };
  return { value: { name, label, color } };
}

function adjustmentNote(ctx, planId, text, change) {
  return { id: ctx.newId(), date: ctx.today, category: 'ajuste', plan: planId, text, auto: true, change };
}

function withPlans(state, plans, note) {
  return { ...state, plans, notes: note ? [...(state.notes ?? []), note] : state.notes };
}

function requirePlan(state, id) {
  const plan = getPlan(state, id);
  if (!plan) throw new PlanError(`Modelo não encontrado: ${id}`);
  return plan;
}

/** Novo modelo vazio, no fim da lista. `meta` já validado (parsePlanForm). */
export function createPlan(state, meta, ctx) {
  const plan = { id: ctx.newId(), ...meta, cardio: '', exercises: [] };
  const note = adjustmentNote(ctx, plan.id, `Treino criado: ${meta.label} — ${meta.name}.`, {
    action: 'plan-create',
    planId: plan.id,
    before: null,
    after: { label: meta.label, name: meta.name },
  });
  return { state: withPlans(state, [...listPlans(state), plan], note), plan };
}

/**
 * Cópia de um modelo (exercícios e cardio), logo depois do original.
 * Os exercícios ganham ids novos: o histórico de cargas de cada um é separado.
 */
export function duplicatePlan(state, sourceId, meta, ctx) {
  const source = requirePlan(state, sourceId);
  const plan = {
    id: ctx.newId(),
    ...meta,
    cardio: source.cardio ?? '',
    exercises: source.exercises.map((ex) => ({ ...ex, id: ctx.newId() })),
  };
  const plans = [...listPlans(state)];
  plans.splice(plans.findIndex((p) => p.id === sourceId) + 1, 0, plan);
  const note = adjustmentNote(ctx, plan.id, `Treino ${meta.label} — ${meta.name} criado como cópia de ${source.label} — ${source.name}.`, {
    action: 'plan-create',
    planId: plan.id,
    before: null,
    after: { label: meta.label, name: meta.name, copiedFrom: sourceId },
  });
  return { state: withPlans(state, plans, note), plan };
}

/** Muda nome, rótulo e cor. Sem mudança, devolve o mesmo estado. */
export function updatePlanMeta(state, id, meta, ctx) {
  const before = requirePlan(state, id);
  const changed = ['name', 'label', 'color'].filter((k) => before[k] !== meta[k]);
  if (!changed.length) return { state, changed: false };
  const after = { ...before, ...meta, id };
  const parts = [];
  if (before.label !== after.label || before.name !== after.name) {
    parts.push(`${before.label} — ${before.name} → ${after.label} — ${after.name}`);
  }
  if (before.color !== after.color) parts.push(`cor ${COLOR_LABELS[before.color] ?? before.color} → ${COLOR_LABELS[after.color]}`);
  const note = adjustmentNote(ctx, id, `Treino atualizado: ${parts.join('; ')}.`, {
    action: 'plan-edit',
    planId: id,
    before: { label: before.label, name: before.name, color: before.color },
    after: { label: after.label, name: after.name, color: after.color },
  });
  return { state: withPlans(state, listPlans(state).map((p) => (p.id === id ? after : p)), note), changed: true };
}

/** Move o modelo uma posição para cima (-1) ou para baixo (+1). */
export function movePlan(state, id, direction) {
  const plans = [...listPlans(state)];
  const index = plans.findIndex((p) => p.id === id);
  if (index === -1) throw new PlanError(`Modelo não encontrado: ${id}`);
  const target = index + direction;
  if (target < 0 || target >= plans.length) return { state, moved: false };
  [plans[index], plans[target]] = [plans[target], plans[index]];
  return { state: { ...state, plans }, moved: true };
}

/**
 * Remove um modelo. Sempre sobra pelo menos um.
 * - Sessões iniciadas ou concluídas ficam (guardam a própria cópia do modelo).
 * - Sessões só agendadas desse modelo, sem nada registrado, saem da agenda.
 * - Na semana padrão, os dias desse modelo viram livres.
 */
export function removePlan(state, id, ctx) {
  const plan = requirePlan(state, id);
  if (listPlans(state).length <= 1) throw new PlanError('É preciso manter pelo menos um treino.');

  const sessions = Object.fromEntries(
    Object.entries(state.sessions ?? {}).filter(([, s]) => !(s.type === id && !Array.isArray(s.exercises))),
  );
  const unscheduled = Object.keys(state.sessions ?? {}).length - Object.keys(sessions).length;
  const weekTemplate = Array.isArray(state.weekTemplate) ? state.weekTemplate.map((t) => (t === id ? null : t)) : state.weekTemplate;
  const note = adjustmentNote(ctx, id, `Treino removido: ${plan.label} — ${plan.name}.`, {
    action: 'plan-remove',
    planId: id,
    before: { label: plan.label, name: plan.name, exercises: plan.exercises.length },
    after: null,
  });
  const next = withPlans({ ...state, sessions, weekTemplate }, listPlans(state).filter((p) => p.id !== id), note);
  return { state: next, unscheduled };
}
