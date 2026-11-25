// Dados do painel (Visão geral) e preferências. Funções puras.
import { addDays, weekStart, weekDays } from '../dates.js';
import { parseInteger } from './plans.js';
import { daySummary, countDone } from './calendar.js';
import { sessionStatus } from './sessions.js';

export const GOAL_MAX = 80;
export const TARGET_MIN = 1;
export const TARGET_MAX = 7;

/**
 * Valida o formulário de objetivo e meta (campos em texto).
 * @returns {{ value: { goal: string, target: number } } | { errors: Record<string, string> }}
 */
export function parsePreferencesForm(form) {
  const errors = {};
  const goal = String(form.goal ?? '').trim().replace(/\s+/g, ' ');
  const target = parseInteger(form.target);
  if (goal.length > GOAL_MAX) errors.goal = `Use até ${GOAL_MAX} caracteres.`;
  if (target === null || Number.isNaN(target) || target < TARGET_MIN || target > TARGET_MAX) {
    errors.target = `Escolha de ${TARGET_MIN} a ${TARGET_MAX} treinos por semana.`;
  }
  if (Object.keys(errors).length) return { errors };
  return { value: { goal, target } };
}

export function updatePreferences(state, { goal, target }) {
  return { ...state, goal, target };
}

/** Sessões concluídas na semana de `today` em relação à meta. */
export function weekProgress(state, today) {
  const start = weekStart(today);
  const done = countDone(state, start, addDays(start, 6));
  const target = state.target;
  return { start, done, target, reached: done >= target, ratio: Math.min(1, target ? done / target : 0) };
}

/** Os 7 dias da semana atual com a situação de cada um. */
export function currentWeek(state, today) {
  return weekDays(today).map((date) => daySummary(state, date));
}

/** Próxima sessão planejada depois de hoje (ou null). */
export function nextPlanned(state, today) {
  return (
    Object.values(state.sessions)
      .filter((s) => s.date > today && sessionStatus(s) === 'planned')
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null
  );
}

/** Sessões concluídas, da mais recente para a mais antiga. */
export function recentSessions(state, limit = 5) {
  return Object.values(state.sessions)
    .filter((s) => s.done)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit)
    .map((s) => ({
      date: s.date,
      type: s.type,
      checked: (s.exercises ?? []).filter((e) => e.checked).length,
      total: (s.exercises ?? []).length,
      cardioDone: Boolean(s.cardioDone),
    }));
}

export function totalDone(state) {
  return Object.values(state.sessions).filter((s) => s.done).length;
}

/** Último registro com o campo preenchido (ex.: 'weight'). Zero conta. */
export function lastMeasurement(state, fieldName) {
  return (
    [...(state.measurements ?? [])]
      .filter((m) => m[fieldName] !== null && m[fieldName] !== undefined && m[fieldName] !== '')
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null
  );
}
