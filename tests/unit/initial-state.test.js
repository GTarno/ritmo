import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../app/js/domain/initial-state.js';

test('começa sem registros e com meta de 4 sessões', () => {
  const s = createInitialState();
  assert.equal(s.target, 4);
  assert.deepEqual(s.sessions, {});
  assert.deepEqual(s.measurements, []);
  assert.deepEqual(s.notes, []);
});

test('modelos A e B têm 5 exercícios com padrões do plano', () => {
  const { plans } = createInitialState();
  assert.deepEqual(
    plans.map(({ id, label, name, color }) => ({ id, label, name, color })),
    [
      { id: 'A', label: 'A', name: 'Superiores e core', color: 'laranja' },
      { id: 'B', label: 'B', name: 'Inferiores', color: 'azul' },
    ],
  );
  for (const plan of plans) {
    assert.equal(plan.exercises.length, 5);
    assert.equal(plan.cardio, '10 min de caminhada leve');
    for (const ex of plan.exercises) {
      assert.equal(ex.sets, 2);
      assert.equal(ex.rest, 75);
      assert.equal(ex.load, null, 'carga começa em aberto (null, não zero)');
    }
  }
  const prancha = plans[0].exercises.find((e) => e.name === 'Prancha');
  assert.equal(prancha.reps, '15–20 s');
});

test('ids de exercício são únicos', () => {
  const { plans } = createInitialState();
  const ids = [...plans[0].exercises, ...plans[1].exercises].map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('cada chamada devolve uma cópia independente', () => {
  const a = createInitialState();
  const b = createInitialState();
  a.plans[0].exercises[0].name = 'alterado';
  a.weekTemplate[2] = 'A';
  assert.notEqual(b.plans[0].exercises[0].name, 'alterado');
  assert.equal(b.weekTemplate[2], null);
});
