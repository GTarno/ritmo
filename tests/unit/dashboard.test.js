import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../app/js/domain/initial-state.js';
import { scheduleSession, openSession, parseSessionForm, completeSession } from '../../app/js/domain/sessions.js';
import {
  parsePreferencesForm,
  updatePreferences,
  weekProgress,
  currentWeek,
  nextPlanned,
  recentSessions,
  totalDone,
  lastMeasurement,
} from '../../app/js/domain/dashboard.js';

const TODAY = '2026-11-24'; // terça

function complete(state, date, type = 'A', { cardio = false, checkFirst = 1 } = {}) {
  const opened = openSession(state, date, type, TODAY);
  const values = parseSessionForm({
    exercises: opened.session.exercises.map((e, i) => ({ id: e.id, checked: i < checkFirst, load: '' })),
    cardioDone: cardio,
    cardio: '',
    notes: '',
  }).value;
  return completeSession(opened.state, date, values);
}

test('parsePreferencesForm valida meta de 1 a 7 e objetivo', () => {
  assert.deepEqual(parsePreferencesForm({ goal: '  Emagrecer   e definir ', target: '3' }).value, {
    goal: 'Emagrecer e definir',
    target: 3,
  });
  assert.equal(parsePreferencesForm({ goal: '', target: '7' }).value.goal, '');
  for (const bad of ['0', '8', '', '2,5', 'x']) {
    assert.ok(parsePreferencesForm({ goal: 'x', target: bad }).errors.target, bad);
  }
  assert.ok(parsePreferencesForm({ goal: 'x'.repeat(81), target: '4' }).errors.goal);
});

test('updatePreferences não altera o resto do estado', () => {
  const s0 = Object.freeze(createInitialState());
  const s1 = updatePreferences(s0, { goal: 'Força', target: 3 });
  assert.equal(s1.goal, 'Força');
  assert.equal(s1.target, 3);
  assert.equal(s1.plans, s0.plans);
  assert.equal(s0.target, 4);
});

test('weekProgress conta só concluídas da semana atual', () => {
  let s = createInitialState();
  s = complete(s, '2026-11-16'); // semana anterior
  s = complete(s, '2026-11-23');
  s = scheduleSession(s, '2026-11-26', 'A'); // planejada não conta
  const p = weekProgress(s, TODAY);
  assert.deepEqual(p, { start: '2026-11-23', done: 1, target: 4, reached: false, ratio: 0.25 });

  s = { ...s, target: 1 };
  assert.equal(weekProgress(s, TODAY).reached, true);
  s = complete(s, TODAY, 'B');
  assert.equal(weekProgress(s, TODAY).ratio, 1, 'passar da meta não estoura a barra');
});

test('currentWeek devolve os 7 dias com a situação', () => {
  const s = scheduleSession(createInitialState(), '2026-11-26', 'A');
  const week = currentWeek(s, TODAY);
  assert.equal(week.length, 7);
  assert.equal(week[0].date, '2026-11-23');
  assert.deepEqual(week[3], { date: '2026-11-26', status: 'planned', type: 'A' });
});

test('nextPlanned ignora hoje, passado e sessões iniciadas', () => {
  let s = createInitialState();
  assert.equal(nextPlanned(s, TODAY), null);
  s = scheduleSession(s, TODAY, 'B');
  s = scheduleSession(s, '2026-11-27', 'B');
  s = scheduleSession(s, '2026-11-26', 'A');
  assert.equal(nextPlanned(s, TODAY).date, '2026-11-26');
});

test('recentSessions e totalDone', () => {
  let s = createInitialState();
  s = complete(s, '2026-11-16', 'A', { checkFirst: 5 });
  s = complete(s, '2026-11-20', 'B', { checkFirst: 0, cardio: true });
  s = complete(s, '2026-11-23', 'A', { checkFirst: 2 });
  s = openSession(s, TODAY, 'B', TODAY).state; // em andamento: fora
  assert.equal(totalDone(s), 3);
  assert.deepEqual(recentSessions(s, 2), [
    { date: '2026-11-23', type: 'A', checked: 2, total: 5, cardioDone: false },
    { date: '2026-11-20', type: 'B', checked: 0, total: 5, cardioDone: true },
  ]);
});

test('lastMeasurement pega o registro mais recente com o campo preenchido', () => {
  const s = createInitialState();
  assert.equal(lastMeasurement(s, 'weight'), null);
  s.measurements = [
    { date: '2026-11-10', weight: 70 },
    { date: '2026-11-20', weight: null, waist: 80 },
    { date: '2026-11-15', weight: 69.5 },
  ];
  assert.deepEqual(lastMeasurement(s, 'weight'), { date: '2026-11-15', weight: 69.5 });
  assert.equal(lastMeasurement(s, 'waist').date, '2026-11-20');
});
