// Versões do formato de dados e migrações entre elas. Funções puras.
import { createInitialState } from './initial-state.js';

export const CURRENT_VERSION = 1;

/**
 * migrations[n] converte dados da versão n para n + 1.
 * Ao mudar o formato: incremente CURRENT_VERSION, adicione migrations[antiga] e um teste.
 */
export const migrations = {};

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
  if (!isObject(data.plans) || !isObject(data.plans.A) || !isObject(data.plans.B)) {
    problems.push('modelos A/B ausentes');
  } else {
    for (const t of ['A', 'B']) {
      if (!Array.isArray(data.plans[t].exercises)) problems.push(`exercícios do modelo ${t} inválidos`);
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
