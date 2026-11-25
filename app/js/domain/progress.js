// Registros corporais e séries dos gráficos de evolução. Funções puras.
import { parseDecimal } from './plans.js';
import { isValidDate, lastWeekStarts, addDays } from '../dates.js';
import { countDone } from './calendar.js';

/** Medidas corporais, na ordem dos formulários e seletores. */
export const MEASUREMENT_FIELDS = [
  { key: 'weight', label: 'Peso', unit: 'kg', min: 20, max: 400 },
  { key: 'waist', label: 'Cintura', unit: 'cm', min: 20, max: 250 },
  { key: 'hips', label: 'Quadril', unit: 'cm', min: 20, max: 250 },
  { key: 'chest', label: 'Tórax', unit: 'cm', min: 20, max: 250 },
  { key: 'thigh', label: 'Coxa', unit: 'cm', min: 10, max: 150 },
];

export const CHART_POINTS = 12;
export const FREQUENCY_WEEKS = 8;

const hasValue = (v) => v !== null && v !== undefined && v !== '';

/**
 * Converte e valida o formulário de medidas (campos em texto).
 * Data obrigatória, não futura; ao menos uma medida; cada medida num intervalo plausível.
 */
export function parseMeasurementForm(form, today) {
  const errors = {};
  const date = String(form.date ?? '').trim();
  if (!isValidDate(date)) errors.date = 'Escolha uma data válida.';
  else if (date > today) errors.date = 'A data não pode ser no futuro.';

  const entry = { date };
  let filled = 0;
  for (const { key, label, unit, min, max } of MEASUREMENT_FIELDS) {
    const value = parseDecimal(form[key]);
    if (Number.isNaN(value) || (value !== null && (value < min || value > max))) {
      errors[key] = `${label}: use um número entre ${min} e ${max} ${unit}, ou deixe em branco.`;
    }
    entry[key] = Number.isNaN(value) ? null : value;
    if (value !== null && !Number.isNaN(value)) filled++;
  }
  if (!filled && !Object.keys(errors).some((k) => k !== 'date')) {
    errors.weight = 'Informe pelo menos uma medida.';
  }
  if (Object.keys(errors).length) return { errors };
  return { value: entry };
}

/** Registro da data, ou null. */
export function measurementOn(state, date) {
  return (state.measurements ?? []).find((m) => m.date === date) ?? null;
}

/** Grava o registro da data (um por data): substitui se já existir. Lista fica ordenada por data. */
export function upsertMeasurement(state, entry) {
  const current = state.measurements ?? [];
  const others = current.filter((m) => m.date !== entry.date);
  const measurements = [...others, { ...entry }].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { state: { ...state, measurements }, replaced: others.length !== current.length };
}

export function removeMeasurement(state, date) {
  return { ...state, measurements: (state.measurements ?? []).filter((m) => m.date !== date) };
}

/** Registros do mais recente para o mais antigo. */
export function measurementList(state) {
  return [...(state.measurements ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Últimos `limit` registros com a medida preenchida, em ordem cronológica. Zero vale. */
export function measurementSeries(state, key, limit = CHART_POINTS) {
  return (state.measurements ?? [])
    .filter((m) => hasValue(m[key]))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-limit)
    .map((m) => ({ date: m.date, value: m[key] }));
}

/**
 * Todas as cargas registradas de um exercício: exercício marcado, sessão
 * concluída, carga preenchida (zero vale). Ordem cronológica.
 */
export function loadHistory(state, exerciseId) {
  return Object.values(state.sessions)
    .filter((s) => s.done && Array.isArray(s.exercises))
    .flatMap((s) => {
      const ex = s.exercises.find((e) => e.id === exerciseId);
      return ex?.checked && hasValue(ex.load) ? [{ date: s.date, value: ex.load, type: s.type }] : [];
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Últimas `limit` cargas do exercício, em ordem cronológica. */
export function loadSeries(state, exerciseId, limit = CHART_POINTS) {
  return loadHistory(state, exerciseId).slice(-limit);
}

/**
 * Exercícios disponíveis no seletor de carga: os dos modelos atuais e os que
 * aparecem marcados em sessões concluídas (mesmo se removidos do modelo).
 * Nome exibido: o do modelo atual; se não existir mais, o da sessão mais recente.
 */
export function exerciseOptions(state) {
  const options = new Map();
  for (const type of ['A', 'B']) {
    for (const ex of state.plans[type]?.exercises ?? []) {
      if (!options.has(ex.id)) options.set(ex.id, { id: ex.id, name: ex.name, plan: type, inPlan: true });
    }
  }
  const sessions = Object.values(state.sessions)
    .filter((s) => s.done && Array.isArray(s.exercises))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.checked && !options.has(ex.id)) options.set(ex.id, { id: ex.id, name: ex.name, plan: s.type, inPlan: false });
    }
  }
  return [...options.values()];
}

/** Sessões concluídas por semana nas últimas `weeks` semanas, incluindo a atual. */
export function frequencySeries(state, today, weeks = FREQUENCY_WEEKS) {
  return lastWeekStarts(today, weeks).map((start) => ({
    date: start,
    value: countDone(state, start, addDays(start, 6)),
  }));
}
