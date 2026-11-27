// Regras dos exercícios e do cardio de um modelo de treino. Funções puras:
// recebem o estado e devolvem um estado novo, sem alterar o original. Sessões
// nunca são tocadas aqui: cada sessão guarda a própria cópia do modelo.
// O modelo é indicado pelo id (veja domain/models.js); nos textos do diário
// aparece o rótulo (A, B, C…).
//
// Toda mudança gera um registro de ajuste no diário (categoria 'ajuste'),
// com os dados antes/depois e o motivo opcional.

import { getPlan } from './models.js';

export const LIMITS = {
  nameMax: 60,
  setsMin: 1,
  setsMax: 20,
  repsMax: 30,
  loadMax: 1000,
  restMax: 900,
  cardioMax: 200,
  reasonMax: 500,
};

// ---------- Conversão e validação de campos do formulário ----------

/** "12,5" ou "12.5" → 12.5; vazio → null; inválido → NaN. */
export function parseDecimal(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(',', '.');
  if (text === '') return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return NaN;
  return Number(text);
}

/** "75" → 75; vazio → null; não inteiro → NaN. */
export function parseInteger(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  if (!/^\d+$/.test(text)) return NaN;
  return Number(text);
}

/**
 * Converte e valida os campos do formulário de exercício (strings).
 * @returns {{ value: {name, sets, reps, load, rest} } | { errors: Record<string, string> }}
 */
export function parseExerciseForm(form) {
  const errors = {};
  const name = String(form.name ?? '').trim().replace(/\s+/g, ' ');
  const reps = String(form.reps ?? '').trim();
  const sets = parseInteger(form.sets);
  const load = parseDecimal(form.load);
  const rest = parseInteger(form.rest);

  if (!name) errors.name = 'Informe o nome do exercício.';
  else if (name.length > LIMITS.nameMax) errors.name = `Use até ${LIMITS.nameMax} caracteres.`;

  if (sets === null) errors.sets = 'Informe o número de séries.';
  else if (Number.isNaN(sets) || sets < LIMITS.setsMin || sets > LIMITS.setsMax) {
    errors.sets = `Use um número inteiro de ${LIMITS.setsMin} a ${LIMITS.setsMax}.`;
  }

  if (!reps) errors.reps = 'Informe as repetições ou o tempo (ex.: 8–12 ou 30 s).';
  else if (reps.length > LIMITS.repsMax) errors.reps = `Use até ${LIMITS.repsMax} caracteres.`;

  if (Number.isNaN(load) || (load !== null && load > LIMITS.loadMax)) {
    errors.load = 'Use um número em kg (ex.: 12,5) ou deixe em branco.';
  }

  if (Number.isNaN(rest) || (rest !== null && rest > LIMITS.restMax)) {
    errors.rest = `Use segundos inteiros, até ${LIMITS.restMax}, ou deixe em branco.`;
  }

  if (Object.keys(errors).length) return { errors };
  return { value: { name, sets, reps, load, rest } };
}

// ---------- Descrição das mudanças (texto do diário) ----------

const FIELD_LABELS = { name: 'nome', sets: 'séries', reps: 'repetições', load: 'carga', rest: 'intervalo' };

export function formatNumber(n) {
  return String(n).replace('.', ',');
}

function formatField(field, value) {
  if (value === null || value === undefined || value === '') return 'em aberto';
  if (field === 'load') return `${formatNumber(value)} kg`;
  if (field === 'rest') return `${value} s`;
  return String(value);
}

/** Campos que mudaram entre duas versões do exercício. */
export function diffExercise(before, after) {
  return Object.keys(FIELD_LABELS).filter((f) => (before[f] ?? null) !== (after[f] ?? null));
}

function describeChanges(before, after, fields) {
  return fields
    .map((f) => `${FIELD_LABELS[f]} ${formatField(f, before[f])} → ${formatField(f, after[f])}`)
    .join('; ');
}

function withReason(text, reason) {
  return reason ? `${text} Motivo: ${reason}` : text;
}

function cleanReason(reason) {
  return String(reason ?? '').trim().slice(0, LIMITS.reasonMax);
}

// ---------- Operações ----------

function assertPlan(state, type) {
  const plan = getPlan(state, type);
  if (!plan) throw new Error(`Modelo inválido: ${type}`);
  return plan;
}

function findIndex(state, type, id) {
  const index = assertPlan(state, type).exercises.findIndex((e) => e.id === id);
  if (index === -1) throw new Error(`Exercício não encontrado: ${id}`);
  return index;
}

function replacePlan(state, type, plan, note) {
  return {
    ...state,
    plans: state.plans.map((p) => (p.id === type ? plan : p)),
    notes: note ? [...state.notes, note] : state.notes,
  };
}

function adjustmentNote(ctx, type, text, change) {
  return {
    id: ctx.newId(),
    date: ctx.today,
    category: 'ajuste',
    plan: type,
    text,
    auto: true,
    change,
  };
}

/**
 * @typedef {{ today: string, newId: () => string }} Ctx
 *   today: data atual (AAAA-MM-DD) para o registro no diário
 *   newId: gerador de identificadores (injetado para manter a função pura)
 */

/** Adiciona um exercício ao fim do modelo. `fields` já validados (parseExerciseForm). */
export function addExercise(state, type, fields, reason, ctx) {
  assertPlan(state, type);
  const exercise = { id: ctx.newId(), ...fields };
  const plan = getPlan(state, type);
  const why = cleanReason(reason);
  const note = adjustmentNote(ctx, type, withReason(`Exercício adicionado ao treino ${plan.label}: ${fields.name}.`, why), {
    action: 'add',
    exerciseId: exercise.id,
    before: null,
    after: exercise,
    reason: why || null,
  });
  return { state: replacePlan(state, type, { ...plan, exercises: [...plan.exercises, exercise] }, note), exercise };
}

/**
 * Edita um exercício mantendo o mesmo `id` (mesmo se o nome mudar).
 * Gera registro no diário se algo mudou ou se há motivo; sem mudança e sem
 * motivo, devolve o mesmo estado (changed: false).
 */
export function updateExercise(state, type, id, fields, reason, ctx) {
  assertPlan(state, type);
  const index = findIndex(state, type, id);
  const plan = getPlan(state, type);
  const before = plan.exercises[index];
  const after = { ...before, ...fields, id: before.id };
  const changed = diffExercise(before, after);
  const why = cleanReason(reason);
  if (!changed.length && !why) return { state, changed: false };

  const summary = changed.length
    ? `${before.name}: ${describeChanges(before, after, changed)}.`
    : `${before.name}: sem alteração nos campos.`;
  const note = adjustmentNote(ctx, type, withReason(summary, why), {
    action: 'edit',
    exerciseId: id,
    before,
    after,
    reason: why || null,
  });
  const exercises = plan.exercises.map((e, i) => (i === index ? after : e));
  return { state: replacePlan(state, type, { ...plan, exercises }, note), changed: true };
}

/** Remove um exercício do modelo. O histórico em sessões continua intacto. */
export function removeExercise(state, type, id, reason, ctx) {
  assertPlan(state, type);
  const index = findIndex(state, type, id);
  const plan = getPlan(state, type);
  const before = plan.exercises[index];
  const why = cleanReason(reason);
  const note = adjustmentNote(ctx, type, withReason(`Exercício removido do treino ${plan.label}: ${before.name}.`, why), {
    action: 'remove',
    exerciseId: id,
    before,
    after: null,
    reason: why || null,
  });
  const exercises = plan.exercises.filter((_, i) => i !== index);
  return { state: replacePlan(state, type, { ...plan, exercises }, note) };
}

/** Move um exercício uma posição para cima (-1) ou para baixo (+1). Não gera registro. */
export function moveExercise(state, type, id, direction) {
  assertPlan(state, type);
  const index = findIndex(state, type, id);
  const target = index + direction;
  const list = getPlan(state, type).exercises;
  if (target < 0 || target >= list.length) return { state, moved: false };
  const exercises = [...list];
  [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
  return { state: replacePlan(state, type, { ...getPlan(state, type), exercises }, null), moved: true };
}

/** Altera o cardio (texto livre). Gera registro se mudou ou se há motivo. */
export function updateCardio(state, type, cardio, reason, ctx) {
  assertPlan(state, type);
  const plan = getPlan(state, type);
  const before = plan.cardio ?? '';
  const after = String(cardio ?? '').trim().slice(0, LIMITS.cardioMax);
  const why = cleanReason(reason);
  if (before === after && !why) return { state, changed: false };

  const summary =
    before === after
      ? `Cardio do treino ${plan.label}: sem alteração.`
      : `Cardio do treino ${plan.label}: ${before || 'sem cardio'} → ${after || 'sem cardio'}.`;
  const note = adjustmentNote(ctx, type, withReason(summary, why), {
    action: 'cardio',
    exerciseId: null,
    before,
    after,
    reason: why || null,
  });
  return { state: replacePlan(state, type, { ...plan, cardio: after }, note), changed: before !== after };
}

/** Resumo de uma linha: "2 × 8–12 · 12,5 kg · 75 s". */
export function exerciseSummary(ex) {
  const parts = [`${ex.sets} × ${ex.reps}`];
  parts.push(ex.load === null || ex.load === undefined ? 'carga em aberto' : `${formatNumber(ex.load)} kg`);
  if (ex.rest !== null && ex.rest !== undefined) parts.push(`${ex.rest} s`);
  return parts.join(' · ');
}
