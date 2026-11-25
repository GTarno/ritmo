import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../app/js/domain/initial-state.js';
import { scheduleSession, openSession, parseSessionForm, completeSession } from '../../app/js/domain/sessions.js';
import { previewWeekPlan, planWeek, daySummary, countDone } from '../../app/js/domain/calendar.js';

const MONDAY = '2026-11-23';

const deepFreeze = (o) => {
  Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v));
  return Object.freeze(o);
};

test('planWeek numa semana futura cria seg A, ter B, qui A, sex B', () => {
  const s0 = deepFreeze(createInitialState());
  const r = planWeek(s0, '2026-12-03', '2026-11-24'); // quinta da semana seguinte
  assert.equal(r.weekStart, '2026-11-30');
  assert.deepEqual(r.created, ['2026-11-30', '2026-12-01', '2026-12-03', '2026-12-04']);
  assert.deepEqual(r.kept, []);
  assert.deepEqual(r.past, []);
  assert.deepEqual(
    r.created.map((d) => r.state.sessions[d].type),
    ['A', 'B', 'A', 'B'],
  );
  assert.equal(r.state.sessions['2026-12-02'], undefined, 'quarta é livre');
  assert.equal(r.state.sessions['2026-12-05'], undefined, 'sábado é livre');
});

test('planWeek preserva sessões existentes, de qualquer tipo', () => {
  let s = createInitialState();
  s = scheduleSession(s, '2026-12-01', 'A'); // terça já planejada com A (padrão seria B)
  const r = planWeek(deepFreeze(s), '2026-11-30', '2026-11-24');
  assert.deepEqual(r.created, ['2026-11-30', '2026-12-03', '2026-12-04']);
  assert.deepEqual(r.kept, ['2026-12-01']);
  assert.equal(r.state.sessions['2026-12-01'].type, 'A');
});

test('planWeek não mexe em sessão concluída e não agenda dias passados', () => {
  let s = createInitialState();
  const opened = openSession(s, MONDAY, 'B', '2026-11-24');
  const values = parseSessionForm({
    exercises: opened.session.exercises.map((e, i) => ({ id: e.id, checked: i === 0, load: '40' })),
    cardioDone: false,
    cardio: '',
    notes: '',
  }).value;
  s = completeSession(opened.state, MONDAY, values);

  // Hoje é quinta: seg (concluída) fica, ter já passou, qui e sex são criadas
  const r = planWeek(deepFreeze(s), MONDAY, '2026-11-26');
  assert.deepEqual(r.kept, [MONDAY]);
  assert.deepEqual(r.past, ['2026-11-24']);
  assert.deepEqual(r.created, ['2026-11-26', '2026-11-27']);
  assert.equal(r.state.sessions[MONDAY], s.sessions[MONDAY]);
  assert.equal(r.state.sessions['2026-11-24'], undefined);
});

test('planejar duas vezes a mesma semana não duplica nem altera', () => {
  const first = planWeek(createInitialState(), MONDAY, MONDAY);
  const second = planWeek(first.state, '2026-11-29', MONDAY);
  assert.deepEqual(second.created, []);
  assert.equal(second.kept.length, 4);
  assert.equal(second.state, first.state);
});

test('previewWeekPlan segue a semana padrão do estado', () => {
  const s = createInitialState();
  s.weekTemplate = [null, 'A', null, 'B', null, 'A', null];
  const p = previewWeekPlan(s, MONDAY, MONDAY);
  assert.deepEqual(
    p.map(({ date, type, action }) => [date, type, action]),
    [
      ['2026-11-24', 'A', 'create'],
      ['2026-11-26', 'B', 'create'],
      ['2026-11-28', 'A', 'create'],
    ],
  );
});

test('daySummary e countDone', () => {
  let s = createInitialState();
  assert.deepEqual(daySummary(s, MONDAY), { date: MONDAY, status: 'none', type: null });
  s = scheduleSession(s, MONDAY, 'A');
  assert.deepEqual(daySummary(s, MONDAY), { date: MONDAY, status: 'planned', type: 'A' });

  const opened = openSession(s, MONDAY, 'A', MONDAY);
  const values = parseSessionForm({
    exercises: opened.session.exercises.map((e) => ({ id: e.id, checked: true, load: '' })),
    cardioDone: false,
    cardio: '',
    notes: '',
  }).value;
  s = completeSession(opened.state, MONDAY, values);
  assert.equal(daySummary(s, MONDAY).status, 'done');
  assert.equal(countDone(s, MONDAY, '2026-11-29'), 1);
  assert.equal(countDone(s, '2026-11-24', '2026-11-29'), 0);
});
