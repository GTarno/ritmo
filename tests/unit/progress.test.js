import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../app/js/domain/initial-state.js';
import { openSession, parseSessionForm, completeSession, updateSession } from '../../app/js/domain/sessions.js';
import { removeExercise } from '../../app/js/domain/plans.js';
import {
  parseMeasurementForm,
  upsertMeasurement,
  removeMeasurement,
  measurementOn,
  measurementList,
  measurementSeries,
  loadHistory,
  loadSeries,
  exerciseOptions,
  frequencySeries,
} from '../../app/js/domain/progress.js';

const TODAY = '2026-11-24';
const SUPINO = 'a-supino-maquina';

const deepFreeze = (o) => {
  Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v));
  return Object.freeze(o);
};

/** Abre e conclui uma sessão A com cargas por id ({ id: '10' }); ids ausentes ficam desmarcados. */
function session(state, date, loads, { done = true, type = 'A' } = {}) {
  const o = openSession(state, date, type, TODAY);
  const values = parseSessionForm({
    exercises: o.session.exercises.map((e) => ({ id: e.id, checked: e.id in loads, load: loads[e.id] ?? '' })),
    cardioDone: false,
    cardio: '',
    notes: '',
  }).value;
  return done ? completeSession(o.state, date, values) : updateSession(o.state, date, values);
}

test('parseMeasurementForm: vírgula, campos opcionais e ao menos uma medida', () => {
  const ok = parseMeasurementForm({ date: TODAY, weight: '68,4', waist: '', hips: '98', chest: '', thigh: '' }, TODAY);
  assert.deepEqual(ok.value, { date: TODAY, weight: 68.4, waist: null, hips: 98, chest: null, thigh: null });

  const none = parseMeasurementForm({ date: TODAY }, TODAY);
  assert.match(none.errors.weight, /pelo menos uma medida/);

  const bad = parseMeasurementForm({ date: '2026-11-25', weight: '5', waist: 'abc' }, TODAY);
  assert.match(bad.errors.date, /futuro/);
  assert.ok(bad.errors.weight);
  assert.ok(bad.errors.waist);
  assert.match(parseMeasurementForm({ date: '2026-02-30', weight: '70' }, TODAY).errors.date, /válida/);
});

test('upsertMeasurement: um registro por data, ordenado', () => {
  const s0 = deepFreeze(createInitialState());
  let r = upsertMeasurement(s0, { date: '2026-11-20', weight: 70, waist: null });
  assert.equal(r.replaced, false);
  r = upsertMeasurement(r.state, { date: '2026-11-10', weight: 71 });
  r = upsertMeasurement(r.state, { date: '2026-11-20', weight: 69.5, waist: 80 });
  assert.equal(r.replaced, true);
  assert.deepEqual(r.state.measurements.map((m) => m.date), ['2026-11-10', '2026-11-20']);
  assert.deepEqual(measurementOn(r.state, '2026-11-20'), { date: '2026-11-20', weight: 69.5, waist: 80 });
  assert.deepEqual(measurementList(r.state).map((m) => m.date), ['2026-11-20', '2026-11-10']);
  assert.deepEqual(removeMeasurement(r.state, '2026-11-10').measurements.map((m) => m.date), ['2026-11-20']);
  assert.equal(s0.measurements.length, 0);
});

test('measurementSeries: só valores preenchidos, últimos 12 em ordem cronológica', () => {
  const s = createInitialState();
  s.measurements = Array.from({ length: 15 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    weight: 70 - i * 0.1,
    waist: i % 2 ? null : 80,
  }));
  const weight = measurementSeries(s, 'weight');
  assert.equal(weight.length, 12);
  assert.equal(weight[0].date, '2026-10-04');
  assert.equal(weight.at(-1).date, '2026-10-15');
  assert.equal(measurementSeries(s, 'waist').length, 8);
  assert.deepEqual(measurementSeries(s, 'thigh'), []);
});

test('loadHistory: só marcados, sessões concluídas, carga preenchida; zero vale', () => {
  let s = createInitialState();
  s = session(s, '2026-11-02', { [SUPINO]: '10' });
  s = session(s, '2026-11-05', { [SUPINO]: '' }); // sem carga
  s = session(s, '2026-11-09', { 'a-remada-sentada': '20' }); // supino desmarcado
  s = session(s, '2026-11-12', { [SUPINO]: '0' });
  s = session(s, '2026-11-16', { [SUPINO]: '30' }, { done: false }); // em andamento
  assert.deepEqual(loadHistory(s, SUPINO), [
    { date: '2026-11-02', value: 10, type: 'A' },
    { date: '2026-11-12', value: 0, type: 'A' },
  ]);
});

test('loadSeries limita às últimas 12', () => {
  let s = createInitialState();
  for (let d = 1; d <= 14; d++) s = session(s, `2026-10-${String(d).padStart(2, '0')}`, { [SUPINO]: String(d) });
  const series = loadSeries(s, SUPINO);
  assert.equal(series.length, 12);
  assert.equal(series[0].value, 3);
  assert.equal(series.at(-1).value, 14);
});

test('exerciseOptions inclui exercício removido do modelo se tiver histórico', () => {
  let s = createInitialState();
  s = session(s, '2026-11-02', { 'a-prancha': '' });
  s = removeExercise(s, 'A', 'a-prancha', '', { today: TODAY, newId: () => 'x' }).state;
  s = removeExercise(s, 'A', 'a-puxada-frontal', '', { today: TODAY, newId: () => 'y' }).state;
  const ids = exerciseOptions(s).map((o) => o.id);
  assert.equal(ids.length, 9);
  assert.ok(ids.includes('a-prancha'), 'removido mas com histórico');
  assert.ok(!ids.includes('a-puxada-frontal'), 'removido sem histórico');
  assert.deepEqual(exerciseOptions(s).find((o) => o.id === 'a-prancha'), {
    id: 'a-prancha',
    name: 'Prancha',
    plan: 'A',
    inPlan: false,
  });
});

test('frequencySeries: 8 semanas terminando na atual', () => {
  let s = createInitialState();
  s = session(s, '2026-11-23', { [SUPINO]: '' });
  s = session(s, TODAY, { [SUPINO]: '' });
  s = session(s, '2026-10-05', { [SUPINO]: '' }); // primeira semana da janela
  s = session(s, '2026-09-28', { [SUPINO]: '' }); // fora da janela
  const f = frequencySeries(s, TODAY);
  assert.equal(f.length, 8);
  assert.deepEqual(f[0], { date: '2026-10-05', value: 1 });
  assert.deepEqual(f.at(-1), { date: '2026-11-23', value: 2 });
  assert.equal(f.reduce((sum, w) => sum + w.value, 0), 3);
});
