// Armazenamento persistente: pede ao navegador para não apagar os dados do
// Ritmo quando faltar espaço ou quando o site ficar um tempo sem uso (o Safari
// do iPhone faz isso com sites que não estão instalados).

let requested = false;

const storageApi = () => (typeof navigator !== 'undefined' ? navigator.storage : undefined);

/**
 * Pede a proteção uma única vez por sessão, depois que algo é gravado.
 * Não pergunta nada à usuária: o navegador decide sozinho (Chrome considera,
 * por exemplo, se o app está instalado).
 */
export function requestPersistenceOnce() {
  if (requested) return;
  requested = true;
  const storage = storageApi();
  if (!storage?.persist) return;
  storage
    .persisted()
    .then((already) => (already ? true : storage.persist()))
    .catch(() => false);
}

/** Pede a proteção agora (ex.: botão em "Seus dados"). Devolve true se ficou protegido. */
export async function requestPersistence() {
  const storage = storageApi();
  if (!storage?.persist) return false;
  try {
    return await storage.persist();
  } catch {
    return false;
  }
}

/**
 * Situação atual do armazenamento.
 * @returns {Promise<{ supported: boolean, persisted: boolean | null, usage: number | null, quota: number | null }>}
 */
export async function storageStatus() {
  const storage = storageApi();
  if (!storage?.persisted) return { supported: false, persisted: null, usage: null, quota: null };
  const [persisted, estimate] = await Promise.all([
    storage.persisted().catch(() => null),
    storage.estimate ? storage.estimate().catch(() => null) : Promise.resolve(null),
  ]);
  return { supported: true, persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null };
}

/** "12 KB", "3,4 MB", "1,2 GB". */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')} ${units[unit]}`;
}

/** Só para testes: permite pedir de novo. */
export function resetPersistenceRequest() {
  requested = false;
}
