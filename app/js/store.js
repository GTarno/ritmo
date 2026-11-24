// Leitura e gravação do estado no localStorage, dentro de um envelope versionado:
//   ritmo:v1 → { "schemaVersion": N, "data": { ... } }
// Regra principal: nenhum caminho apaga dados silenciosamente.
import { createInitialState } from './domain/initial-state.js';
import {
  CURRENT_VERSION,
  migrate as runMigrations,
  validateState,
  fromLegacy,
  looksLikeLegacy,
} from './domain/migrations.js';

export const STORAGE_KEY = 'ritmo:v1';
export const CORRUPT_PREFIX = 'ritmo:corrupt:';

/**
 * Situações possíveis após load():
 *  new         — nada salvo ainda
 *  ok          — dados carregados
 *  migrated    — dados de versão antiga convertidos (e regravados)
 *  corrupt     — dados ilegíveis; cópia guardada em ritmo:corrupt:<timestamp>
 *  too-new     — dados de uma versão mais nova do app; gravação bloqueada
 *  unavailable — navegador não permite armazenamento; nada será salvo
 */
export const MESSAGES = {
  migrated: 'Seus dados foram atualizados para o novo formato.',
  corrupt:
    'Não foi possível ler os dados salvos. Uma cópia foi preservada e o app começou do zero.',
  'corrupt-blocked':
    'Não foi possível ler os dados salvos nem guardar uma cópia. Para não perder nada, o app não vai gravar alterações.',
  'too-new':
    'Os dados salvos são de uma versão mais nova do Ritmo. Recarregue a página para atualizar; nada será gravado até lá.',
  unavailable:
    'Este navegador não está permitindo salvar dados (modo privado ou bloqueio). Os registros serão perdidos ao fechar.',
  quota: 'Não há espaço para salvar. Exporte um backup e libere espaço no navegador.',
  'save-failed': 'Não foi possível salvar. Tente novamente.',
};

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // acesso pode lançar exceção com cookies/dados bloqueados
  }
}

function isQuotaError(err) {
  return (
    err?.name === 'QuotaExceededError' ||
    err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err?.code === 22 ||
    err?.code === 1014
  );
}

export function createStore({
  storage = defaultStorage(),
  now = () => Date.now(),
  migrations,
  currentVersion = CURRENT_VERSION,
} = {}) {
  // Quando true, save() recusa gravar para não sobrescrever dados que não entendemos.
  let blocked = false;

  function read() {
    try {
      return { raw: storage.getItem(STORAGE_KEY) };
    } catch {
      return { error: true };
    }
  }

  function write(key, value) {
    storage.setItem(key, value);
  }

  function envelope(data) {
    return JSON.stringify({ schemaVersion: currentVersion, data });
  }

  function preserveCorrupt(raw) {
    try {
      write(`${CORRUPT_PREFIX}${now()}`, raw);
      return true;
    } catch {
      return false;
    }
  }

  function fresh(status, extra = {}) {
    return { state: createInitialState(), status, ...extra };
  }

  function handleCorrupt(raw, problems) {
    if (preserveCorrupt(raw)) {
      // A cópia está segura; a chave principal pode ser reaproveitada.
      return fresh('corrupt', { message: MESSAGES.corrupt, problems });
    }
    blocked = true;
    return fresh('corrupt', { message: MESSAGES['corrupt-blocked'], problems, blocked: true });
  }

  function load() {
    blocked = false;
    if (!storage) {
      blocked = true;
      return fresh('unavailable', { message: MESSAGES.unavailable, blocked: true });
    }

    const { raw, error } = read();
    if (error) {
      blocked = true;
      return fresh('unavailable', { message: MESSAGES.unavailable, blocked: true });
    }
    if (raw === null || raw === undefined) return fresh('new');

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return handleCorrupt(raw, ['JSON inválido']);
    }

    let data;
    let version;
    if (looksLikeLegacy(parsed)) {
      data = fromLegacy(parsed);
      version = 1;
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      Number.isInteger(parsed.schemaVersion) &&
      parsed.schemaVersion >= 1
    ) {
      data = parsed.data;
      version = parsed.schemaVersion;
    } else {
      return handleCorrupt(raw, ['formato desconhecido']);
    }

    if (version > currentVersion) {
      blocked = true;
      return fresh('too-new', { message: MESSAGES['too-new'], blocked: true, version });
    }

    const needsMigration = version < currentVersion || looksLikeLegacy(parsed);
    if (version < currentVersion) {
      try {
        data = runMigrations(data, version, migrations, currentVersion);
      } catch (err) {
        return handleCorrupt(raw, [`falha na migração: ${err.message}`]);
      }
    }

    const problems = validateState(data);
    if (problems.length) return handleCorrupt(raw, problems);

    if (needsMigration) {
      // Guarda o original antes de regravar no formato novo.
      try {
        write(`ritmo:pre-migration:v${version}:${now()}`, raw);
        write(STORAGE_KEY, envelope(data));
      } catch {
        // Sem espaço para a cópia: mantém o original intacto e segue em memória.
        blocked = true;
        return { state: data, status: 'migrated', message: MESSAGES.quota, blocked: true };
      }
      return { state: data, status: 'migrated', message: MESSAGES.migrated };
    }

    return { state: data, status: 'ok' };
  }

  /** Grava o estado. Nunca lança exceção: devolve { ok, reason?, message? }. */
  function save(state) {
    if (blocked || !storage) {
      return { ok: false, reason: 'blocked', message: MESSAGES.unavailable };
    }
    try {
      write(STORAGE_KEY, envelope(state));
      return { ok: true };
    } catch (err) {
      if (isQuotaError(err)) return { ok: false, reason: 'quota', message: MESSAGES.quota };
      return { ok: false, reason: 'error', message: MESSAGES['save-failed'] };
    }
  }

  return { load, save, isBlocked: () => blocked };
}
