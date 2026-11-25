// Backup em JSON: montar, ler e validar o arquivo, resumir o conteúdo e decidir
// quando lembrar de fazer backup. Funções puras.
//
// Formato do arquivo (mesmo envelope do armazenamento, mais identificação):
//   { "app": "ritmo", "schemaVersion": 1, "exportedAt": "2026-11-24T21:00:00.000Z", "data": { ... } }
import {
  CURRENT_VERSION,
  migrate as runMigrations,
  validateState,
  fromLegacy,
  looksLikeLegacy,
} from './migrations.js';
import { diffDays } from '../dates.js';

export const APP_ID = 'ritmo';
export const REMINDER_DAYS = 14;

export function backupFileName(today) {
  return `ritmo-backup-${today}.json`;
}

/** Conteúdo do arquivo de backup (texto JSON legível). */
export function buildBackup(state, now = new Date()) {
  return JSON.stringify({ app: APP_ID, schemaVersion: CURRENT_VERSION, exportedAt: now.toISOString(), data: state }, null, 2);
}

/** Totais para mostrar antes de exportar ou importar. */
export function summarize(state) {
  const sessions = Object.values(state.sessions ?? {});
  return {
    sessions: sessions.length,
    done: sessions.filter((s) => s.done).length,
    measurements: (state.measurements ?? []).length,
    notes: (state.notes ?? []).length,
  };
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Lê o texto de um arquivo de backup. Aceita o formato atual, versões antigas
 * (aplicando as migrações) e o estado da primeira versão do app, sem envelope.
 * @returns {{ value: { data, schemaVersion, exportedAt: string|null, summary } } | { error: string }}
 */
export function parseBackup(text, { migrations, currentVersion = CURRENT_VERSION } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'O arquivo não é um JSON válido.' };
  }

  let data;
  let version;
  let exportedAt = null;
  if (looksLikeLegacy(parsed)) {
    data = fromLegacy(parsed);
    version = 1;
  } else if (isObject(parsed) && Number.isInteger(parsed.schemaVersion) && isObject(parsed.data)) {
    if (parsed.app !== undefined && parsed.app !== APP_ID) return { error: 'Este arquivo não é um backup do Ritmo.' };
    data = parsed.data;
    version = parsed.schemaVersion;
    exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null;
  } else {
    return { error: 'Este arquivo não é um backup do Ritmo.' };
  }

  if (version < 1) return { error: 'Versão do backup inválida.' };
  if (version > currentVersion) {
    return { error: 'Este backup foi feito numa versão mais nova do Ritmo. Recarregue a página para atualizar o app e tente de novo.' };
  }
  if (version < currentVersion) {
    try {
      data = runMigrations(data, version, migrations, currentVersion);
    } catch (err) {
      return { error: `Não foi possível converter o backup: ${err.message}` };
    }
  }

  const problems = validateState(data);
  if (problems.length) return { error: `O backup está incompleto ou corrompido (${problems.join(', ')}).` };

  return { value: { data, schemaVersion: version, exportedAt, summary: summarize(data) } };
}

/** Data (AAAA-MM-DD) de um instante ISO no fuso informado; null se inválido. */
export function isoToDate(iso, toDate) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : toDate(d);
}

/** Existe algo registrado depois da data (ou em qualquer data, se `since` for null)? */
function hasActivitySince(state, since) {
  const after = (date) => !since || date > since;
  return (
    Object.values(state.sessions ?? {}).some((s) => s.done && after(s.date)) ||
    (state.measurements ?? []).some((m) => after(m.date)) ||
    (state.notes ?? []).some((n) => !n.auto && after(n.date))
  );
}

/**
 * Lembrete de backup: aparece quando há registros novos desde o último backup
 * e já se passaram `REMINDER_DAYS` dias (ou nunca houve backup).
 * @returns {{ show: boolean, days: number|null }}  days = dias desde o último backup
 */
export function backupReminder(state, today) {
  const last = state.lastBackupAt ?? null;
  const days = last ? diffDays(last, today) : null;
  const due = last === null || days >= REMINDER_DAYS;
  return { show: due && hasActivitySince(state, last), days };
}

/** Estado com a data do último backup registrada. */
export function markBackup(state, date) {
  return { ...state, lastBackupAt: date };
}
