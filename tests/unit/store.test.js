import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, STORAGE_KEY, CORRUPT_PREFIX } from '../../app/js/store.js';
import { createInitialState } from '../../app/js/domain/initial-state.js';
import { migrate, validateState } from '../../app/js/domain/migrations.js';

/** localStorage falso, com opções para simular falhas. */
function fakeStorage(initial = {}, { failGet = false, failSetFor = () => false } = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem(k) {
      if (failGet) throw new Error('SecurityError');
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      if (failSetFor(k)) {
        const err = new Error('cheio');
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(k, String(v));
    },
  };
}

const env = (data, schemaVersion = 1) => JSON.stringify({ schemaVersion, data });
const keysWith = (storage, prefix) => [...storage.map.keys()].filter((k) => k.startsWith(prefix));

test('sem dados: estado inicial e status "new"', () => {
  const { state, status, message } = createStore({ storage: fakeStorage() }).load();
  assert.equal(status, 'new');
  assert.equal(message, undefined);
  assert.deepEqual(state, createInitialState());
});

test('salvar e carregar preserva o estado completo no envelope', () => {
  const storage = fakeStorage();
  const store = createStore({ storage });
  const { state } = store.load();
  state.target = 5;
  state.sessions['2026-11-24'] = { date: '2026-11-24', type: 'A', done: false };
  assert.deepEqual(store.save(state), { ok: true });

  const saved = JSON.parse(storage.map.get(STORAGE_KEY));
  assert.equal(saved.schemaVersion, 1);

  const reloaded = createStore({ storage }).load();
  assert.equal(reloaded.status, 'ok');
  assert.deepEqual(reloaded.state, state);
});

test('JSON corrompido: guarda cópia, começa do zero e permite salvar', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: '{quebrado' });
  const store = createStore({ storage, now: () => 123 });
  const r = store.load();
  assert.equal(r.status, 'corrupt');
  assert.ok(r.message);
  assert.equal(storage.map.get(`${CORRUPT_PREFIX}123`), '{quebrado');
  assert.equal(store.save(r.state).ok, true);
});

test('JSON corrompido sem espaço para cópia: bloqueia gravação e mantém original', () => {
  const storage = fakeStorage(
    { [STORAGE_KEY]: '{quebrado' },
    { failSetFor: (k) => k.startsWith(CORRUPT_PREFIX) },
  );
  const store = createStore({ storage });
  const r = store.load();
  assert.equal(r.status, 'corrupt');
  assert.equal(r.blocked, true);
  assert.equal(store.save(r.state).ok, false);
  assert.equal(storage.map.get(STORAGE_KEY), '{quebrado');
});

test('estrutura inválida dentro do envelope é tratada como corrompida', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: env({ plans: 'x' }) });
  const r = createStore({ storage, now: () => 1 }).load();
  assert.equal(r.status, 'corrupt');
  assert.ok(r.problems.length > 0);
  assert.equal(keysWith(storage, CORRUPT_PREFIX).length, 1);
});

test('envelope com formato desconhecido é tratado como corrompido', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify([1, 2, 3]) });
  assert.equal(createStore({ storage }).load().status, 'corrupt');
});

test('versão mais nova que o app: não sobrescreve', () => {
  const original = env(createInitialState(), 99);
  const storage = fakeStorage({ [STORAGE_KEY]: original });
  const store = createStore({ storage });
  const r = store.load();
  assert.equal(r.status, 'too-new');
  assert.equal(store.save(r.state).ok, false);
  assert.equal(storage.map.get(STORAGE_KEY), original);
});

test('localStorage inaccessível: status "unavailable", save não lança', () => {
  const store = createStore({ storage: fakeStorage({}, { failGet: true }) });
  const r = store.load();
  assert.equal(r.status, 'unavailable');
  assert.deepEqual(store.save(r.state).ok, false);

  const none = createStore({ storage: null });
  assert.equal(none.load().status, 'unavailable');
  assert.equal(none.save({}).ok, false);
});

test('armazenamento cheio: save devolve reason "quota"', () => {
  const storage = fakeStorage({}, { failSetFor: () => true });
  const store = createStore({ storage });
  const r = store.save(store.load().state);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'quota');
  assert.ok(r.message);
});

test('formato antigo sem envelope é migrado, preservando dados e guardando o original', () => {
  const legacy = {
    goal: 'Meu objetivo',
    target: 3,
    plans: createInitialState().plans,
    sessions: { '2026-11-20': { date: '2026-11-20', type: 'B', done: true } },
    measurements: [{ date: '2026-11-20', weight: 70 }],
    notes: [],
  };
  const raw = JSON.stringify(legacy);
  const storage = fakeStorage({ [STORAGE_KEY]: raw });
  const r = createStore({ storage, now: () => 7 }).load();

  assert.equal(r.status, 'migrated');
  assert.equal(r.state.goal, 'Meu objetivo');
  assert.equal(r.state.target, 3);
  assert.deepEqual(r.state.sessions, legacy.sessions);
  assert.equal(r.state.timezone, 'America/Sao_Paulo', 'campos novos recebem o padrão');
  assert.equal(storage.map.get('ritmo:pre-migration:v1:7'), raw);
  assert.equal(JSON.parse(storage.map.get(STORAGE_KEY)).schemaVersion, 1);
});

test('migrações rodam em sequência e regravam no formato atual', () => {
  const registry = {
    1: (d) => ({ ...d, a: 1 }),
    2: (d) => ({ ...d, b: d.a + 1 }),
  };
  const storage = fakeStorage({ [STORAGE_KEY]: env(createInitialState(), 1) });
  const r = createStore({ storage, migrations: registry, currentVersion: 3, now: () => 5 }).load();
  assert.equal(r.status, 'migrated');
  assert.equal(r.state.a, 1);
  assert.equal(r.state.b, 2);
  assert.equal(JSON.parse(storage.map.get(STORAGE_KEY)).schemaVersion, 3);
  assert.ok(storage.map.has('ritmo:pre-migration:v1:5'));
});

test('migração ausente não perde dados', () => {
  const raw = env(createInitialState(), 1);
  const storage = fakeStorage({ [STORAGE_KEY]: raw });
  const r = createStore({ storage, migrations: {}, currentVersion: 2, now: () => 9 }).load();
  assert.equal(r.status, 'corrupt');
  assert.equal(storage.map.get(`${CORRUPT_PREFIX}9`), raw);
});

test('migrate() e validateState() isolados', () => {
  assert.deepEqual(migrate({ x: 1 }, 1, {}, 1), { x: 1 });
  assert.throws(() => migrate({}, 1, {}, 2), /Migração ausente/);
  assert.deepEqual(validateState(createInitialState()), []);
  assert.ok(validateState(null).length > 0);
  assert.ok(validateState({ ...createInitialState(), notes: {} }).includes('diário inválido'));
});
