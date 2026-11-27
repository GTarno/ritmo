// Regras das sessões de treino. Funções puras: recebem o estado e devolvem um novo.
//
// Uma sessão por data, em state.sessions[data]. Três situações:
//   planejada    { date, type, done: false }                      — só agendada
//   em andamento { ..., exercises, cardio, cardioDone, notes }      — aberta, done: false
//   concluída    { ..., done: true }                               — conta na frequência
//
// Ao abrir, a sessão copia o modelo vigente. Depois disso, editar o modelo não
// muda a sessão, e editar a sessão não muda o modelo.
import { parseDecimal } from './plans.js';
import { getPlan, listPlans } from './models.js';
import { isValidDate, weekdayIndex } from '../dates.js';

export const NOTES_MAX = 1000;
export const CARDIO_MAX = 200;

export class SessionError extends Error {}

export function getSession(state, date) {
  return state.sessions[date] ?? null;
}

/** 'none' | 'planned' | 'in-progress' | 'done' */
export function sessionStatus(session) {
  if (!session) return 'none';
  if (session.done) return 'done';
  if (Array.isArray(session.exercises)) return 'in-progress';
  return 'planned';
}

export const isStarted = (session) => Array.isArray(session?.exercises);

/** Hoje e datas passadas permitem registrar; datas futuras só agendar. */
export function canRegister(date, today) {
  return date <= today;
}

/** Modelo sugerido para a data: o já planejado, senão o da semana padrão, senão o primeiro da lista. */
export function suggestedType(state, date) {
  const planned = state.sessions[date]?.type;
  if (getPlan(state, planned)) return planned;
  const fromWeek = state.weekTemplate?.[weekdayIndex(date)];
  return getPlan(state, fromWeek) ? fromWeek : listPlans(state)[0]?.id;
}

function assertDate(date) {
  if (!isValidDate(date)) throw new SessionError(`Data inválida: ${date}`);
}

function assertType(state, type) {
  if (!getPlan(state, type)) throw new SessionError(`Modelo inválido: ${type}`);
}

function withSession(state, date, session) {
  const sessions = { ...state.sessions };
  if (session) sessions[date] = session;
  else delete sessions[date];
  return { ...state, sessions };
}

/**
 * Agenda (ou troca o modelo de) uma sessão ainda não iniciada.
 * Sessões em andamento ou concluídas não podem trocar de modelo.
 */
export function scheduleSession(state, date, type) {
  assertDate(date);
  assertType(state, type);
  const current = getSession(state, date);
  if (isStarted(current)) throw new SessionError('A sessão já foi iniciada; o modelo não pode ser trocado.');
  return withSession(state, date, { date, type, done: false });
}

/**
 * Cópia do modelo para a sessão. Guarda também rótulo e nome do modelo, para a
 * sessão continuar legível se o modelo for renomeado ou removido depois.
 */
function copyPlan(plan) {
  return {
    planLabel: plan.label,
    planName: plan.name,
    exercises: plan.exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      rest: ex.rest ?? null,
      plannedLoad: ex.load ?? null,
      load: ex.load ?? null,
      checked: false,
    })),
    cardio: plan.cardio ?? '',
    cardioDone: false,
    notes: '',
  };
}

/**
 * Abre a sessão da data para registrar o treino, copiando o modelo vigente.
 * Se já estiver aberta, devolve o estado sem mudança.
 */
export function openSession(state, date, type, today) {
  assertDate(date);
  if (!canRegister(date, today)) throw new SessionError('Datas futuras só podem ser agendadas.');
  const current = getSession(state, date);
  if (isStarted(current)) return { state, session: current, opened: false };

  const chosen = type ?? suggestedType(state, date);
  assertType(state, chosen);
  const session = { date, type: chosen, done: false, ...copyPlan(getPlan(state, chosen)) };
  return { state: withSession(state, date, session), session, opened: true };
}

/**
 * Converte e valida o que foi preenchido na tela da sessão.
 * @param {{ exercises: Array<{ id, checked, load: string }>, cardioDone, cardio, notes }} form
 * @returns {{ value } | { errors: Record<string, string> }}  erros por id de exercício
 */
export function parseSessionForm(form) {
  const errors = {};
  const exercises = form.exercises.map(({ id, checked, load }) => {
    const parsed = parseDecimal(load);
    if (Number.isNaN(parsed) || (parsed !== null && parsed > 1000)) {
      errors[id] = 'Use um número em kg (ex.: 12,5) ou deixe em branco.';
    }
    return { id, checked: Boolean(checked), load: Number.isNaN(parsed) ? null : parsed };
  });
  if (Object.keys(errors).length) return { errors };
  return {
    value: {
      exercises,
      cardioDone: Boolean(form.cardioDone),
      cardio: String(form.cardio ?? '').trim().slice(0, CARDIO_MAX),
      notes: String(form.notes ?? '').trim().slice(0, NOTES_MAX),
    },
  };
}

/** Uma sessão pode contar como feita se tem ao menos um exercício marcado ou cardio. */
export function hasActivity(session) {
  return Boolean(session.cardioDone) || session.exercises.some((e) => e.checked);
}

/**
 * Aplica os dados preenchidos (já validados por parseSessionForm) numa sessão aberta.
 * Uma sessão concluída continua concluída e não pode ficar sem atividade.
 */
export function updateSession(state, date, values) {
  const current = getSession(state, date);
  if (!isStarted(current)) throw new SessionError('A sessão ainda não foi aberta.');
  const byId = new Map(values.exercises.map((e) => [e.id, e]));
  const session = {
    ...current,
    exercises: current.exercises.map((ex) => {
      const v = byId.get(ex.id);
      return v ? { ...ex, checked: v.checked, load: v.load } : ex;
    }),
    cardioDone: values.cardioDone,
    cardio: values.cardio,
    notes: values.notes,
  };
  if (session.done && !hasActivity(session)) {
    throw new SessionError('Uma sessão concluída precisa de ao menos um exercício marcado ou do cardio.');
  }
  return withSession(state, date, session);
}

/** Conclui a sessão. Exige ao menos um exercício marcado ou cardio feito. */
export function completeSession(state, date, values) {
  const updated = values ? updateSession(state, date, values) : state;
  const session = getSession(updated, date);
  if (!isStarted(session)) throw new SessionError('A sessão ainda não foi aberta.');
  if (!hasActivity(session)) {
    throw new SessionError('Marque ao menos um exercício ou o cardio para concluir.');
  }
  return withSession(updated, date, { ...session, done: true });
}

/** Volta uma sessão concluída para "em andamento" (sai da frequência até concluir de novo). */
export function reopenSession(state, date) {
  const session = getSession(state, date);
  if (!session?.done) return state;
  return withSession(state, date, { ...session, done: false });
}

export function removeSession(state, date) {
  if (!getSession(state, date)) return state;
  return withSession(state, date, null);
}

/**
 * Última carga registrada para o exercício antes da data: só exercícios
 * marcados, em sessões concluídas, com carga preenchida (zero vale).
 * @returns {{ date: string, load: number } | null}
 */
export function lastLoad(state, exerciseId, beforeDate) {
  let best = null;
  for (const session of Object.values(state.sessions)) {
    if (!session.done || session.date >= beforeDate || !Array.isArray(session.exercises)) continue;
    const ex = session.exercises.find((e) => e.id === exerciseId);
    if (!ex?.checked || ex.load === null || ex.load === undefined) continue;
    if (!best || session.date > best.date) best = { date: session.date, load: ex.load };
  }
  return best;
}

/** Quantos exercícios foram marcados: "3 de 5". */
export function progressLabel(session) {
  const done = session.exercises.filter((e) => e.checked).length;
  return `${done} de ${session.exercises.length}`;
}
