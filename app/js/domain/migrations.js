// Versões do formato de dados e migrações entre elas. Funções puras.
import { createInitialState, DEFAULT_PLAN_NAMES, DEFAULT_PLAN_COLORS } from './initial-state.js';

export const CURRENT_VERSION = 2;

/**
 * migrations[n] converte dados da versão n para n + 1.
 * Ao mudar o formato: incremente CURRENT_VERSION, adicione migrations[antiga] e um teste.
 */
export const migrations = {
  1: migrateV1toV2,
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * v1 → v2: modelos fixos { A, B } viram uma lista editável.
 * - A e B mantêm os ids 'A' e 'B' (sessões, diário e semana padrão não mudam);
 * - ganham rótulo, nome (o salvo ou o padrão) e cor;
 * - sessões já abertas guardam o rótulo e o nome do modelo, para continuarem
 *   legíveis se o modelo for removido no futuro.
 * Dados sem a forma esperada passam adiante sem mudança (a validação acusa).
 */
export function migrateV1toV2(data) {
  if (!isObj(data) || !isObj(data.plans)) return data;
  const plans = ['A', 'B']
    .filter((id) => isObj(data.plans[id]))
    .map((id) => ({
      id,
      label: id,
      name: data.plans[id].name || DEFAULT_PLAN_NAMES[id],
      color: DEFAULT_PLAN_COLORS[id],
      cardio: data.plans[id].cardio ?? '',
      exercises: data.plans[id].exercises,
    }));
  const byId = Object.fromEntries(plans.map((p) => [p.id, p]));
  const sessions = isObj(data.sessions)
    ? Object.fromEntries(
        Object.entries(data.sessions).map(([date, s]) =>
          Array.isArray(s?.exercises) && !s.planLabel
            ? [date, { ...s, planLabel: s.type, planName: byId[s.type]?.name ?? null }]
            : [date, s],
        ),
      )
    : data.sessions;
  return { ...data, plans, sessions };
}

/** Aplica as migrações em sequência até CURRENT_VERSION. */
export function migrate(data, fromVersion, registry = migrations, target = CURRENT_VERSION) {
  let current = data;
  for (let v = fromVersion; v < target; v++) {
    const step = registry[v];
    if (!step) throw new Error(`Migração ausente: v${v} → v${v + 1}`);
    current = step(current);
  }
  return current;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Confere a forma mínima do estado. Devolve uma lista de problemas (vazia = válido). */
export function validateState(data) {
  if (!isObject(data)) return ['o estado não é um objeto'];
  const problems = [];
  if (!Array.isArray(data.plans) || data.plans.length === 0) {
    problems.push('modelos de treino ausentes');
  } else {
    const ids = new Set();
    for (const plan of data.plans) {
      if (!isObject(plan) || typeof plan.id !== 'string' || !plan.id) {
        problems.push('modelo sem identificador');
        continue;
      }
      if (ids.has(plan.id)) problems.push(`modelo repetido: ${plan.id}`);
      ids.add(plan.id);
      if (typeof plan.label !== 'string' || !plan.label) problems.push(`rótulo do modelo ${plan.id} inválido`);
      if (!Array.isArray(plan.exercises)) problems.push(`exercícios do modelo ${plan.id} inválidos`);
    }
  }
  if (!isObject(data.sessions)) problems.push('sessões inválidas');
  if (!Array.isArray(data.measurements)) problems.push('medidas inválidas');
  if (!Array.isArray(data.notes)) problems.push('diário inválido');
  return problems;
}

/**
 * Estado salvo pela primeira versão do app (sem envelope). Mantém o que existir
 * e completa com os padrões só o que faltar.
 */
export function fromLegacy(raw) {
  const base = createInitialState();
  const merged = { ...base };
  for (const key of Object.keys(base)) {
    if (raw[key] !== undefined) merged[key] = raw[key];
  }
  return merged;
}

export function looksLikeLegacy(raw) {
  return isObject(raw) && !('schemaVersion' in raw) && ('plans' in raw || 'sessions' in raw);
}
