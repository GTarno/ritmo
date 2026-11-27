import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../app/js/domain/initial-state.js';
import {
  parseDecimal,
  parseInteger,
  parseExerciseForm,
  addExercise,
  updateExercise,
  removeExercise,
  moveExercise,
  updateCardio,
  exerciseSummary,
  diffExercise,
} from '../../app/js/domain/plans.js';

function makeCtx() {
  let n = 0;
  return { today: '2026-11-24', newId: () => `id-${++n}` };
}

const deepFreeze = (o) => {
  Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v));
  return Object.freeze(o);
};

/** Estado congelado: qualquer mutação acidental lança erro. */
const frozenState = () => deepFreeze(createInitialState());

const supinoId = 'a-supino-maquina';

test('parseDecimal aceita vírgula e ponto, vazio vira null', () => {
  assert.equal(parseDecimal('12,5'), 12.5);
  assert.equal(parseDecimal('12.5'), 12.5);
  assert.equal(parseDecimal(' 0 '), 0);
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal(null), null);
  assert.ok(Number.isNaN(parseDecimal('-3')));
  assert.ok(Number.isNaN(parseDecimal('abc')));
  assert.ok(Number.isNaN(parseDecimal('1,2,3')));
});

test('parseInteger', () => {
  assert.equal(parseInteger('75'), 75);
  assert.equal(parseInteger(''), null);
  assert.ok(Number.isNaN(parseInteger('7.5')));
});

test('parseExerciseForm converte campos válidos', () => {
  const r = parseExerciseForm({ name: '  Supino   reto ', sets: '3', reps: '8–12', load: '12,5', rest: '90' });
  assert.deepEqual(r.value, { name: 'Supino reto', sets: 3, reps: '8–12', load: 12.5, rest: 90 });
});

test('parseExerciseForm: carga vazia é null e zero é válido', () => {
  assert.equal(parseExerciseForm({ name: 'X', sets: '2', reps: '10', load: '', rest: '' }).value.load, null);
  assert.equal(parseExerciseForm({ name: 'X', sets: '2', reps: '10', load: '0', rest: '' }).value.load, 0);
  assert.equal(parseExerciseForm({ name: 'X', sets: '2', reps: '10', load: '', rest: '' }).value.rest, null);
});

test('parseExerciseForm aponta erros por campo', () => {
  const r = parseExerciseForm({ name: ' ', sets: '0', reps: '', load: 'dez', rest: '1,5' });
  assert.deepEqual(Object.keys(r.errors).sort(), ['load', 'name', 'reps', 'rest', 'sets']);
  assert.ok(parseExerciseForm({ name: 'X', sets: '21', reps: '1', load: '', rest: '' }).errors.sets);
  assert.ok(parseExerciseForm({ name: 'X', sets: '', reps: '1', load: '', rest: '' }).errors.sets);
  assert.ok(parseExerciseForm({ name: 'X'.repeat(61), sets: '2', reps: '1', load: '', rest: '' }).errors.name);
});

test('updateExercise mantém o id ao renomear e registra antes/depois no diário', () => {
  const s0 = frozenState();
  const before = s0.plans[0].exercises[0];
  const { state, changed } = updateExercise(
    s0,
    'A',
    supinoId,
    { ...before, name: 'Supino reto', load: 12 },
    'Ficou leve',
    makeCtx(),
  );
  assert.equal(changed, true);
  const after = state.plans[0].exercises[0];
  assert.equal(after.id, supinoId);
  assert.equal(after.name, 'Supino reto');
  assert.equal(after.load, 12);

  assert.equal(state.notes.length, 1);
  const note = state.notes[0];
  assert.equal(note.category, 'ajuste');
  assert.equal(note.plan, 'A');
  assert.equal(note.date, '2026-11-24');
  assert.equal(note.auto, true);
  assert.equal(note.change.action, 'edit');
  assert.equal(note.change.exerciseId, supinoId);
  assert.deepEqual(note.change.before, before);
  assert.deepEqual(note.change.after, after);
  assert.equal(note.change.reason, 'Ficou leve');
  assert.match(note.text, /nome Supino na máquina → Supino reto/);
  assert.match(note.text, /carga em aberto → 12 kg/);
  assert.match(note.text, /Motivo: Ficou leve/);

  // Estado original intacto (congelado) e modelo B não foi tocado
  assert.equal(s0.plans[0].exercises[0].name, 'Supino na máquina');
  assert.equal(state.plans[1], s0.plans[1]);
});

test('updateExercise sem mudança e sem motivo não gera registro', () => {
  const s0 = frozenState();
  const r = updateExercise(s0, 'A', supinoId, { ...s0.plans[0].exercises[0] }, '  ', makeCtx());
  assert.equal(r.changed, false);
  assert.equal(r.state, s0);
});

test('updateExercise só com motivo gera registro', () => {
  const s0 = frozenState();
  const r = updateExercise(s0, 'A', supinoId, { ...s0.plans[0].exercises[0] }, 'Dor no ombro', makeCtx());
  assert.equal(r.changed, true);
  assert.equal(r.state.notes.length, 1);
  assert.match(r.state.notes[0].text, /Dor no ombro/);
});

test('editar o modelo não altera sessões já iniciadas', () => {
  const base = createInitialState();
  const sessionCopy = structuredClone(base.plans[0].exercises).map((e) => ({ ...e, checked: true, load: 10 }));
  base.sessions['2026-11-23'] = { date: '2026-11-23', type: 'A', done: true, exercises: sessionCopy, cardio: base.plans[0].cardio };
  const s0 = deepFreeze(base);

  let { state } = updateExercise(s0, 'A', supinoId, { ...s0.plans[0].exercises[0], load: 14 }, '', makeCtx());
  ({ state } = removeExercise(state, 'A', 'a-prancha', '', makeCtx()));
  ({ state } = updateCardio(state, 'A', '20 min de bicicleta', '', makeCtx()));

  assert.equal(state.sessions, s0.sessions);
  assert.equal(state.sessions['2026-11-23'].exercises[0].load, 10);
  assert.equal(state.sessions['2026-11-23'].exercises.length, 5);
  assert.equal(state.sessions['2026-11-23'].cardio, '10 min de caminhada leve');
});

test('addExercise adiciona no fim com id novo e registra no diário', () => {
  const s0 = frozenState();
  const fields = { name: 'Abdominal', sets: 3, reps: '15', load: null, rest: 45 };
  const { state, exercise } = addExercise(s0, 'B', fields, '', makeCtx());
  assert.equal(state.plans[1].exercises.length, 6);
  assert.deepEqual(state.plans[1].exercises.at(-1), exercise);
  assert.equal(exercise.id, 'id-1');
  assert.equal(state.notes[0].change.action, 'add');
  assert.equal(state.notes[0].plan, 'B');
  assert.equal(state.notes[0].change.reason, null);
});

test('removeExercise tira do modelo e registra no diário', () => {
  const s0 = frozenState();
  const { state } = removeExercise(s0, 'A', supinoId, 'Máquina quebrada', makeCtx());
  assert.equal(state.plans[0].exercises.length, 4);
  assert.ok(!state.plans[0].exercises.some((e) => e.id === supinoId));
  assert.equal(state.notes[0].change.action, 'remove');
  assert.equal(state.notes[0].change.before.name, 'Supino na máquina');
  assert.match(state.notes[0].text, /Máquina quebrada/);
});

test('moveExercise troca posições e respeita os limites', () => {
  const s0 = frozenState();
  const ids = (s) => s.plans[0].exercises.map((e) => e.id);
  const down = moveExercise(s0, 'A', supinoId, 1);
  assert.equal(down.moved, true);
  assert.deepEqual(ids(down.state).slice(0, 2), ['a-remada-sentada', supinoId]);
  assert.equal(down.state.notes.length, 0);

  const top = moveExercise(s0, 'A', supinoId, -1);
  assert.equal(top.moved, false);
  assert.equal(top.state, s0);
  assert.equal(moveExercise(s0, 'A', 'a-prancha', 1).moved, false);
});

test('updateCardio registra antes/depois; vazio = sem cardio', () => {
  const s0 = frozenState();
  const r = updateCardio(s0, 'A', '  15 min de bicicleta ', '', makeCtx());
  assert.equal(r.changed, true);
  assert.equal(r.state.plans[0].cardio, '15 min de bicicleta');
  assert.equal(r.state.notes[0].change.before, '10 min de caminhada leve');
  assert.equal(r.state.notes[0].change.after, '15 min de bicicleta');

  const none = updateCardio(s0, 'B', '', '', makeCtx());
  assert.equal(none.state.plans[1].cardio, '');
  assert.match(none.state.notes[0].text, /→ sem cardio/);

  const same = updateCardio(s0, 'A', '10 min de caminhada leve', '', makeCtx());
  assert.equal(same.state, s0);
});

test('operações rejeitam modelo ou exercício inexistentes', () => {
  const s0 = frozenState();
  assert.throws(() => updateExercise(s0, 'C', supinoId, {}, '', makeCtx()), /Modelo inválido/);
  assert.throws(() => removeExercise(s0, 'A', 'nao-existe', '', makeCtx()), /não encontrado/);
});

test('exerciseSummary e diffExercise', () => {
  assert.equal(exerciseSummary({ sets: 2, reps: '8–12', load: null, rest: 75 }), '2 × 8–12 · carga em aberto · 75 s');
  assert.equal(exerciseSummary({ sets: 3, reps: '10', load: 12.5, rest: null }), '3 × 10 · 12,5 kg');
  assert.equal(exerciseSummary({ sets: 3, reps: '10', load: 0, rest: 60 }), '3 × 10 · 0 kg · 60 s');
  assert.deepEqual(diffExercise({ name: 'a', load: null }, { name: 'a', load: 0 }), ['load']);
});
