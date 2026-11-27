import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../app/js/domain/initial-state.js';
import { migrateV1toV2, validateState, CURRENT_VERSION } from '../../app/js/domain/migrations.js';
import { createStore, STORAGE_KEY } from '../../app/js/store.js';
import { parseBackup } from '../../app/js/domain/backup.js';
import { openSession, parseSessionForm, completeSession, scheduleSession, suggestedType } from '../../app/js/domain/sessions.js';
import { previewWeekPlan } from '../../app/js/domain/calendar.js';
import { addExercise } from '../../app/js/domain/plans.js';
import { exerciseOptions } from '../../app/js/domain/progress.js';
import {
  listPlans,
  getPlan,
  planIds,
  planDisplay,
  nextLabel,
  nextColor,
  parsePlanForm,
  createPlan,
  duplicatePlan,
  updatePlanMeta,
  movePlan,
  removePlan,
  PlanError,
} from '../../app/js/domain/models.js';

const TODAY = '2026-11-24';
function ctx() {
  let n = 0;
  return { today: TODAY, newId: () => `id-${++n}` };
}
const deepFreeze = (o) => {
  Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v));
  return Object.freeze(o);
};

/** Estado no formato v1 (modelos { A, B }), com uma sessão concluída e uma só agendada. */
function v1State() {
  const v2 = createInitialState();
  const plans = Object.fromEntries(v2.plans.map(({ id, name, cardio, exercises }) => [id, { name, cardio, exercises }]));
  plans.B.name = 'Pernas';
  const session = {
    date: '2026-11-23',
    type: 'A',
    done: true,
    exercises: plans.A.exercises.map((e, i) => ({ ...e, plannedLoad: null, checked: i === 0, load: i === 0 ? 10 : null })),
    cardio: '',
    cardioDone: false,
    notes: '',
  };
  return {
    ...v2,
    plans,
    sessions: { '2026-11-23': session, '2026-11-26': { date: '2026-11-26', type: 'B', done: false } },
    notes: [{ id: 'n1', date: '2026-11-22', category: 'dor', plan: 'B', text: 'Joelho', intensity: 3 }],
  };
}

// ---------- Migração ----------

test('formato atual é a versão 2', () => {
  assert.equal(CURRENT_VERSION, 2);
  assert.deepEqual(validateState(createInitialState()), []);
});

test('migração v1 → v2: A e B viram lista com ids, rótulos, nomes e cores; nada se perde', () => {
  const v1 = deepFreeze(v1State());
  const v2 = migrateV1toV2(v1);
  assert.deepEqual(validateState(v2), []);
  assert.deepEqual(
    v2.plans.map(({ id, label, name, color }) => ({ id, label, name, color })),
    [
      { id: 'A', label: 'A', name: 'Superiores e core', color: 'laranja' },
      { id: 'B', label: 'B', name: 'Pernas', color: 'azul' },
    ],
  );
  assert.deepEqual(v2.plans[0].exercises, v1.plans.A.exercises);
  assert.equal(v2.plans[1].cardio, v1.plans.B.cardio);
  // Sessão aberta guarda rótulo e nome; sessão só agendada fica igual
  assert.equal(v2.sessions['2026-11-23'].planLabel, 'A');
  assert.equal(v2.sessions['2026-11-23'].planName, 'Superiores e core');
  assert.deepEqual(v2.sessions['2026-11-23'].exercises, v1.sessions['2026-11-23'].exercises);
  assert.deepEqual(v2.sessions['2026-11-26'], v1.sessions['2026-11-26']);
  assert.deepEqual(v2.notes, v1.notes);
  assert.deepEqual(v2.weekTemplate, v1.weekTemplate);
});

test('migração v1 sem nome no modelo usa o nome padrão', () => {
  const v1 = v1State();
  delete v1.plans.A.name;
  assert.equal(migrateV1toV2(v1).plans[0].name, 'Superiores e core');
});

test('dados sem a forma esperada passam pela migração sem erro (a validação acusa)', () => {
  assert.equal(migrateV1toV2(null), null);
  const bad = { plans: 'x' };
  assert.equal(migrateV1toV2(bad), bad);
  assert.ok(validateState(migrateV1toV2(bad)).length > 0);
});

test('armazenamento v1 é migrado ao abrir o app, com cópia do original', () => {
  const raw = JSON.stringify({ schemaVersion: 1, data: v1State() });
  const map = new Map([[STORAGE_KEY, raw]]);
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) };
  const r = createStore({ storage, now: () => 9 }).load();
  assert.equal(r.status, 'migrated');
  assert.equal(map.get('ritmo:pre-migration:v1:9'), raw);
  const saved = JSON.parse(map.get(STORAGE_KEY));
  assert.equal(saved.schemaVersion, 2);
  assert.deepEqual(saved.data.plans.map((p) => p.id), ['A', 'B']);
});

test('backup v1 importado é migrado para v2', () => {
  const r = parseBackup(JSON.stringify({ app: 'ritmo', schemaVersion: 1, data: v1State() }));
  assert.equal(r.value.schemaVersion, 1);
  assert.deepEqual(r.value.data.plans.map((p) => p.label), ['A', 'B']);
  assert.equal(r.value.data.sessions['2026-11-23'].planLabel, 'A');
});

test('validação acusa ids repetidos, lista vazia e modelo sem rótulo', () => {
  const s = createInitialState();
  assert.ok(validateState({ ...s, plans: [] }).includes('modelos de treino ausentes'));
  assert.ok(validateState({ ...s, plans: [s.plans[0], s.plans[0]] }).some((p) => p.includes('repetido')));
  assert.ok(validateState({ ...s, plans: [{ ...s.plans[0], label: '' }] }).some((p) => p.includes('rótulo')));
});

// ---------- Consultas ----------

test('listPlans, getPlan, planIds e planDisplay', () => {
  const s = createInitialState();
  assert.deepEqual(planIds(s), ['A', 'B']);
  assert.equal(getPlan(s, 'B').name, 'Inferiores');
  assert.equal(getPlan(s, 'X'), null);
  assert.deepEqual(planDisplay(s, 'A'), { label: 'A', name: 'Superiores e core', color: 'laranja', exists: true });
  assert.deepEqual(planDisplay(s, 'X', { planLabel: 'C', planName: 'Corpo todo' }), {
    label: 'C',
    name: 'Corpo todo',
    color: null,
    exists: false,
  });
  assert.equal(planDisplay(s, 'uuid-longo-removido').label, '?');
});

test('nextLabel e nextColor sugerem o próximo livre', () => {
  const s = createInitialState();
  assert.equal(nextLabel(s), 'C');
  assert.equal(nextColor(s), 'turquesa');
  const full = { ...s, plans: Array.from({ length: 26 }, (_, i) => ({ ...s.plans[0], id: `p${i}`, label: String.fromCharCode(65 + i) })) };
  assert.equal(nextLabel(full), 'T1');
});

// ---------- Formulário ----------

test('parsePlanForm: nome, rótulo curto e único (sem diferenciar maiúsculas) e cor', () => {
  const s = createInitialState();
  assert.deepEqual(parsePlanForm({ name: '  Corpo   todo ', label: ' c ', color: 'verde' }, s).value, {
    name: 'Corpo todo',
    label: 'C',
    color: 'verde',
  });
  const bad = parsePlanForm({ name: '', label: 'abcd', color: 'preto' }, s).errors;
  assert.deepEqual(Object.keys(bad).sort(), ['color', 'label', 'name']);
  assert.match(parsePlanForm({ name: 'X', label: 'a', color: 'verde' }, s).errors.label, /já está em uso/);
  assert.match(parsePlanForm({ name: 'X', label: 'A-1', color: 'verde' }, s).errors.label, /letras e números/);
  assert.equal(parsePlanForm({ name: 'X', label: 'A', color: 'laranja' }, s, 'A').value.label, 'A', 'o próprio modelo pode manter o rótulo');
});

// ---------- Operações ----------

test('createPlan: modelo vazio no fim, com registro no diário', () => {
  const s0 = deepFreeze(createInitialState());
  const { state, plan } = createPlan(s0, { name: 'Corpo todo', label: 'C', color: 'verde' }, ctx());
  assert.deepEqual(planIds(state), ['A', 'B', 'id-1']);
  assert.deepEqual(plan, { id: 'id-1', name: 'Corpo todo', label: 'C', color: 'verde', cardio: '', exercises: [] });
  assert.equal(state.notes.at(-1).change.action, 'plan-create');
  assert.equal(state.notes.at(-1).plan, 'id-1');
  assert.equal(s0.plans.length, 2);
});

test('duplicatePlan: copia exercícios com ids novos, logo depois do original', () => {
  const s0 = deepFreeze(createInitialState());
  const { state, plan } = duplicatePlan(s0, 'A', { name: 'Superiores 2', label: 'A2', color: 'amarelo' }, ctx());
  assert.deepEqual(planIds(state), ['A', plan.id, 'B']);
  assert.equal(plan.exercises.length, 5);
  assert.deepEqual(plan.exercises.map((e) => e.name), s0.plans[0].exercises.map((e) => e.name));
  assert.ok(plan.exercises.every((e, i) => e.id !== s0.plans[0].exercises[i].id), 'ids novos: histórico separado');
  assert.equal(plan.cardio, s0.plans[0].cardio);
  assert.match(state.notes.at(-1).text, /cópia de A — Superiores e core/);
});

test('updatePlanMeta: muda nome, rótulo e cor; sem mudança não gera registro', () => {
  const s0 = deepFreeze(createInitialState());
  const r = updatePlanMeta(s0, 'B', { name: 'Pernas', label: 'P', color: 'rosa' }, ctx());
  assert.equal(r.changed, true);
  assert.deepEqual(getPlan(r.state, 'B'), { ...s0.plans[1], name: 'Pernas', label: 'P', color: 'rosa' });
  assert.match(r.state.notes.at(-1).text, /B — Inferiores → P — Pernas; cor Azul → Rosa/);
  const same = updatePlanMeta(s0, 'A', { name: 'Superiores e core', label: 'A', color: 'laranja' }, ctx());
  assert.equal(same.changed, false);
  assert.equal(same.state, s0);
});

test('movePlan respeita os limites', () => {
  const s0 = createInitialState();
  const r = movePlan(s0, 'B', -1);
  assert.deepEqual(planIds(r.state), ['B', 'A']);
  assert.equal(movePlan(s0, 'A', -1).moved, false);
  assert.throws(() => movePlan(s0, 'X', 1), PlanError);
});

test('removePlan: mantém sessões registradas, desagenda as só planejadas e libera a semana padrão', () => {
  let s = createInitialState();
  const opened = openSession(s, '2026-11-23', 'B', TODAY);
  const values = parseSessionForm({
    exercises: opened.session.exercises.map((e, i) => ({ id: e.id, checked: i === 0, load: '40' })),
    cardioDone: false,
    cardio: '',
    notes: '',
  }).value;
  s = completeSession(opened.state, '2026-11-23', values);
  s = scheduleSession(s, '2026-11-24', 'B');
  s = scheduleSession(s, '2026-11-26', 'A');

  const r = removePlan(deepFreeze(s), 'B', ctx());
  assert.deepEqual(planIds(r.state), ['A']);
  assert.equal(r.unscheduled, 1);
  assert.ok(r.state.sessions['2026-11-23'], 'sessão concluída continua');
  assert.equal(r.state.sessions['2026-11-23'].planLabel, 'B');
  assert.equal(r.state.sessions['2026-11-24'], undefined, 'agendamento do modelo removido sai');
  assert.ok(r.state.sessions['2026-11-26'], 'agendamento de outro modelo fica');
  assert.deepEqual(r.state.weekTemplate, ['A', null, null, 'A', null, null, null]);
  assert.equal(r.state.notes.at(-1).change.action, 'plan-remove');

  // O histórico de cargas do modelo removido continua disponível
  const options = exerciseOptions(r.state);
  assert.ok(options.some((o) => o.id === 'b-leg-press' && !o.inPlan && o.plan === 'B'));
  // A sessão continua mostrando o modelo pelo que guardou
  assert.deepEqual(planDisplay(r.state, 'B', r.state.sessions['2026-11-23']).name, 'Inferiores');
});

test('removePlan recusa remover o último modelo', () => {
  const s = removePlan(createInitialState(), 'B', ctx()).state;
  assert.throws(() => removePlan(s, 'A', ctx()), /pelo menos um/);
});

test('o resto do app funciona com um modelo novo', () => {
  const c = ctx();
  let { state, plan } = createPlan(createInitialState(), { name: 'Corpo todo', label: 'C', color: 'verde' }, c);
  ({ state } = addExercise(state, plan.id, { name: 'Agachamento', sets: 3, reps: '10', load: 20, rest: 90 }, '', c));
  // semana padrão com o modelo novo na quarta
  state = { ...state, weekTemplate: ['A', 'B', plan.id, 'A', 'B', null, null] };
  assert.equal(suggestedType(state, '2026-11-25'), plan.id);
  assert.deepEqual(previewWeekPlan(state, '2026-11-30', TODAY).map((i) => i.type), ['A', 'B', plan.id, 'A', 'B']);

  const opened = openSession(state, TODAY, plan.id, TODAY);
  assert.equal(opened.session.planLabel, 'C');
  assert.equal(opened.session.exercises[0].name, 'Agachamento');
  assert.ok(exerciseOptions(opened.state).some((o) => o.name === 'Agachamento' && o.plan === 'C'));
  assert.equal(suggestedType(removePlan(createInitialState(), 'A', c).state, TODAY), 'B', 'sem o modelo da semana, sugere o primeiro');
});
