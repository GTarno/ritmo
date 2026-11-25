import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../app/js/domain/initial-state.js';
import { openSession, parseSessionForm, completeSession } from '../../app/js/domain/sessions.js';
import {
  backupFileName,
  buildBackup,
  parseBackup,
  summarize,
  backupReminder,
  markBackup,
  isoToDate,
} from '../../app/js/domain/backup.js';

const TODAY = '2026-11-24';

function withSession(state, date) {
  const o = openSession(state, date, 'A', TODAY);
  const v = parseSessionForm({
    exercises: o.session.exercises.map((e, i) => ({ id: e.id, checked: i === 0, load: '10' })),
    cardioDone: false,
    cardio: '',
    notes: '',
  }).value;
  return completeSession(o.state, date, v);
}

test('nome do arquivo e conteúdo do backup', () => {
  assert.equal(backupFileName(TODAY), 'ritmo-backup-2026-11-24.json');
  const state = withSession(createInitialState(), '2026-11-23');
  const text = buildBackup(state, new Date('2026-11-24T21:00:00Z'));
  const parsed = JSON.parse(text);
  assert.equal(parsed.app, 'ritmo');
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.exportedAt, '2026-11-24T21:00:00.000Z');
  assert.deepEqual(parsed.data, state);
});

test('ida e volta: exportar e importar reproduz exatamente os dados', () => {
  let state = withSession(createInitialState(), '2026-11-23');
  state = { ...state, measurements: [{ date: '2026-11-20', weight: 68.4, waist: null, hips: null, chest: null, thigh: null }] };
  const r = parseBackup(buildBackup(state));
  assert.deepEqual(r.value.data, state);
  assert.deepEqual(r.value.summary, { sessions: 1, done: 1, measurements: 1, notes: 0 });
});

test('erros claros para arquivos inválidos', () => {
  assert.match(parseBackup('{quebrado').error, /não é um JSON válido/);
  assert.match(parseBackup('[1,2]').error, /não é um backup do Ritmo/);
  assert.match(parseBackup('{"foo": 1}').error, /não é um backup do Ritmo/);
  assert.match(parseBackup(JSON.stringify({ app: 'outro', schemaVersion: 1, data: {} })).error, /não é um backup do Ritmo/);
  assert.match(
    parseBackup(JSON.stringify({ app: 'ritmo', schemaVersion: 99, data: createInitialState() })).error,
    /versão mais nova/,
  );
  assert.match(
    parseBackup(JSON.stringify({ app: 'ritmo', schemaVersion: 1, data: { plans: {} } })).error,
    /incompleto ou corrompido/,
  );
});

test('aceita backup de versão antiga aplicando migrações', () => {
  const migrations = { 1: (d) => ({ ...d, migrated: true }) };
  const text = JSON.stringify({ app: 'ritmo', schemaVersion: 1, data: createInitialState() });
  const r = parseBackup(text, { migrations, currentVersion: 2 });
  assert.equal(r.value.data.migrated, true);
  assert.equal(r.value.schemaVersion, 1);
});

test('aceita o estado da primeira versão do app, sem envelope', () => {
  const legacy = { ...createInitialState() };
  delete legacy.timezone;
  const r = parseBackup(JSON.stringify(legacy));
  assert.equal(r.value.data.timezone, 'America/Sao_Paulo');
  assert.equal(r.value.exportedAt, null);
});

test('summarize', () => {
  assert.deepEqual(summarize(createInitialState()), { sessions: 0, done: 0, measurements: 0, notes: 0 });
});

test('lembrete: só com registros novos e depois de 14 dias (ou nunca)', () => {
  const empty = createInitialState();
  assert.deepEqual(backupReminder(empty, TODAY), { show: false, days: null }, 'nada registrado: sem lembrete');

  const s = withSession(empty, '2026-11-01');
  assert.equal(backupReminder(s, TODAY).show, true, 'nunca fez backup');

  assert.deepEqual(backupReminder(markBackup(s, '2026-11-20'), TODAY), { show: false, days: 4 }, 'backup recente');
  assert.equal(backupReminder(markBackup(s, '2026-11-02'), TODAY).show, false, '22 dias, mas nada novo desde então');

  const newer = withSession(markBackup(s, '2026-11-02'), '2026-11-10');
  assert.deepEqual(backupReminder(newer, TODAY), { show: true, days: 22 });
  assert.equal(backupReminder(newer, '2026-11-15').show, false, '13 dias: ainda não');
  assert.equal(backupReminder(newer, '2026-11-16').show, true, '14 dias');
});

test('isoToDate', () => {
  assert.equal(isoToDate('2026-11-24T21:00:00.000Z', (d) => d.toISOString().slice(0, 10)), '2026-11-24');
  assert.equal(isoToDate('nada', () => 'x'), null);
  assert.equal(isoToDate(null, () => 'x'), null);
});
