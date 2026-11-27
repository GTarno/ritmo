import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  remainingSeconds,
  formatClock,
  spokenDuration,
  restFor,
  adjustEnd,
  progress,
  DEFAULT_REST,
  MAX_REST,
} from '../../app/js/domain/timer.js';

const T0 = 1_700_000_000_000;

test('remainingSeconds arredonda para cima e nunca fica negativo', () => {
  assert.equal(remainingSeconds(T0 + 75_000, T0), 75);
  assert.equal(remainingSeconds(T0 + 74_100, T0), 75);
  assert.equal(remainingSeconds(T0 + 1, T0), 1);
  assert.equal(remainingSeconds(T0, T0), 0);
  assert.equal(remainingSeconds(T0 - 5_000, T0), 0);
});

test('tempo certo mesmo depois de um "salto" (tela bloqueada)', () => {
  const end = T0 + 90_000;
  assert.equal(remainingSeconds(end, T0 + 60_000), 30, '60 s em segundo plano');
  assert.equal(remainingSeconds(end, T0 + 600_000), 0, 'voltou bem depois do fim');
});

test('formatClock e spokenDuration', () => {
  assert.equal(formatClock(75), '1:15');
  assert.equal(formatClock(5), '0:05');
  assert.equal(formatClock(600), '10:00');
  assert.equal(formatClock(-3), '0:00');
  assert.equal(spokenDuration(75), '1 minuto e 15 segundos');
  assert.equal(spokenDuration(120), '2 minutos');
  assert.equal(spokenDuration(1), '1 segundo');
  assert.equal(spokenDuration(0), '0 segundos');
});

test('restFor usa o intervalo do exercício ou o padrão', () => {
  assert.equal(restFor({ rest: 75 }), 75);
  assert.equal(restFor({ rest: null }), DEFAULT_REST);
  assert.equal(restFor({}), DEFAULT_REST);
  assert.equal(restFor({ rest: 0 }), DEFAULT_REST);
  assert.equal(restFor({ rest: 5000 }), MAX_REST);
});

test('adjustEnd soma e tira tempo sem ir para o passado nem passar do máximo', () => {
  const end = T0 + 60_000;
  assert.equal(adjustEnd(end, T0, 15), T0 + 75_000);
  assert.equal(adjustEnd(end, T0, -15), T0 + 45_000);
  assert.equal(adjustEnd(T0 + 10_000, T0, -15), T0, 'não fica negativo');
  assert.equal(adjustEnd(T0 + MAX_REST * 1000, T0, 15), T0 + MAX_REST * 1000);
  assert.equal(adjustEnd(T0 - 5_000, T0, 15), T0 + 15_000, 'depois do fim, +15 recomeça do agora');
});

test('progress', () => {
  assert.equal(progress(T0, T0 + 100_000, T0), 0);
  assert.equal(progress(T0, T0 + 100_000, T0 + 25_000), 0.25);
  assert.equal(progress(T0, T0 + 100_000, T0 + 200_000), 1);
  assert.equal(progress(T0, T0, T0), 1);
});
