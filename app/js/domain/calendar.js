// Regras do calendário. Funções puras.
import { weekDays, weekStart } from '../dates.js';
import { getPlan } from './models.js';
import { sessionStatus, scheduleSession } from './sessions.js';
import { DEFAULT_WEEK_TEMPLATE } from './initial-state.js';

/** Situação de um dia para exibir no calendário. */
export function daySummary(state, date) {
  const session = state.sessions[date] ?? null;
  return { date, status: sessionStatus(session), type: session?.type ?? null };
}

/**
 * O que "Planejar semana" faria na semana da data: para cada dia com modelo
 * na semana padrão, diz se cria a sessão ou por que não.
 *   create — dia livre, será agendado
 *   exists — já tem sessão (de qualquer tipo/situação); fica como está
 *   past   — dia já passou; não agenda o passado
 * Dias sem modelo na semana padrão (descanso) não aparecem.
 */
export function previewWeekPlan(state, date, today) {
  const template = Array.isArray(state.weekTemplate) ? state.weekTemplate : DEFAULT_WEEK_TEMPLATE;
  return weekDays(date)
    .map((day, i) => ({ date: day, type: template[i] }))
    .filter(({ type }) => getPlan(state, type) !== null)
    .map(({ date: day, type }) => {
      if (state.sessions[day]) return { date: day, type, action: 'exists', existing: state.sessions[day].type };
      if (day < today) return { date: day, type, action: 'past' };
      return { date: day, type, action: 'create' };
    });
}

/**
 * Agenda a semana da data (segunda como referência) seguindo a semana padrão.
 * Nunca altera sessões existentes nem agenda dias que já passaram.
 * @returns {{ state, weekStart: string, created: string[], kept: string[], past: string[] }}
 */
export function planWeek(state, date, today) {
  const preview = previewWeekPlan(state, date, today);
  let next = state;
  for (const item of preview) {
    if (item.action === 'create') next = scheduleSession(next, item.date, item.type);
  }
  const pick = (action) => preview.filter((p) => p.action === action).map((p) => p.date);
  return { state: next, weekStart: weekStart(date), created: pick('create'), kept: pick('exists'), past: pick('past') };
}

/** Contagem de sessões concluídas num intervalo de datas (inclusive). */
export function countDone(state, from, to) {
  return Object.values(state.sessions).filter((s) => s.done && s.date >= from && s.date <= to).length;
}

/**
 * Dias de treino da semana padrão com o rótulo do modelo, na ordem seg→dom.
 * Dias que apontam para um modelo removido ficam livres (não aparecem).
 * @returns {Array<{ index: number, id: string, label: string }>}
 */
export function weekTemplateSummary(state) {
  const template = Array.isArray(state.weekTemplate) ? state.weekTemplate : DEFAULT_WEEK_TEMPLATE;
  return template
    .map((id, index) => ({ index, id, plan: getPlan(state, id) }))
    .filter((d) => d.plan)
    .map(({ index, id, plan }) => ({ index, id, label: plan.label }));
}
