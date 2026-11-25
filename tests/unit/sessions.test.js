import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../app/js/domain/initial-state.js';
import { updateExercise } from '../../app/js/domain/plans.js';
import {
  sessionStatus,
  canRegister,
  suggestedType,
  scheduleSession,
  openSession,
  parseSessionForm,
  updateSession,
  completeSession,
  reopenSession,
  removeSession,
  lastLoad,
  progressLabel,
  SessionError,
} from '../../app/js/domain/sessions.js';

const TODAY = '2026-11-24'; // terça-feira
const ctx = { today: TODAY, newId: () => 'n1' };

const deepFreeze = (o) => {
  Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v));
  return Object.freeze(o);
};

/** Valores de formulário marcando os exercícios informados (id → carga em texto). */
function formFor(session, checked = {}, extra = {}) {
  return {
    exercises: session.exercises.map((e) => ({
      id: e.id,
      checked: e.id in checked,
      load: checked[e.id] ?? '',
    })),
    cardioDone: false,
    cardio: session.cardio,
    notes: '',
    ...extra,
  };
}

function opened(date = TODAY, type = 'A', base = createInitialState()) {
  return openSession(base, date, type, TODAY);
}

function completed(date, loads, base = createInitialState(), type = 'A') {
  const { state, session } = openSession(base, date, type, TODAY);
  const { value } = parseSessionForm(formFor(session, loads));
  return completeSession(state, date, value);
}

test('status: none, planned, in-progress, done', () => {
  const s0 = createInitialState();
  assert.equal(sessionStatus(s0.sessions[TODAY]), 'none');
  const planned = scheduleSession(s0, TODAY, 'B');
  assert.equal(sessionStatus(planned.sessions[TODAY]), 'planned');
  const { state } = openSession(planned, TODAY, 'B', TODAY);
  assert.equal(sessionStatus(state.sessions[TODAY]), 'in-progress');
  const done = completed(TODAY, { 'a-supino-maquina': '10' });
  assert.equal(sessionStatus(done.sessions[TODAY]), 'done');
});

test('canRegister: hoje e passado sim, futuro não', () => {
  assert.equal(canRegister('2026-11-24', TODAY), true);
  assert.equal(canRegister('2026-11-01', TODAY), true);
  assert.equal(canRegister('2026-11-25', TODAY), false);
});

test('suggestedType: planejado, depois semana padrão, depois A', () => {
  const s0 = createInitialState();
  assert.equal(suggestedType(s0, '2026-11-23'), 'A'); // segunda
  assert.equal(suggestedType(s0, '2026-11-24'), 'B'); // terça
  assert.equal(suggestedType(s0, '2026-11-25'), 'A'); // quarta livre → A
  assert.equal(suggestedType(scheduleSession(s0, '2026-11-23', 'B'), '2026-11-23'), 'B');
});

test('scheduleSession agenda e troca o modelo; não troca sessão iniciada', () => {
  const s0 = deepFreeze(createInitialState());
  const s1 = scheduleSession(s0, '2026-12-01', 'A');
  assert.deepEqual(s1.sessions['2026-12-01'], { date: '2026-12-01', type: 'A', done: false });
  const s2 = scheduleSession(s1, '2026-12-01', 'B');
  assert.equal(s2.sessions['2026-12-01'].type, 'B');
  const { state } = opened(TODAY, 'A', s0);
  assert.throws(() => scheduleSession(state, TODAY, 'B'), SessionError);
  assert.throws(() => scheduleSession(s0, '2026-02-30', 'A'), SessionError);
  assert.throws(() => scheduleSession(s0, TODAY, 'C'), SessionError);
});

test('openSession copia o modelo vigente com checked=false e carga planejada', () => {
  const base = createInitialState();
  base.plans.A.exercises[0].load = 12;
  const s0 = deepFreeze(base);
  const { state, session, opened: wasOpened } = openSession(s0, TODAY, 'A', TODAY);
  assert.equal(wasOpened, true);
  assert.equal(session.type, 'A');
  assert.equal(session.done, false);
  assert.equal(session.exercises.length, 5);
  assert.deepEqual(session.exercises[0], {
    id: 'a-supino-maquina',
    name: 'Supino na máquina',
    sets: 2,
    reps: '8–12',
    rest: 75,
    plannedLoad: 12,
    load: 12,
    checked: false,
  });
  assert.equal(session.exercises[1].load, null, 'carga em aberto continua null');
  assert.equal(session.cardio, '10 min de caminhada leve');
  assert.equal(session.cardioDone, false);
  assert.equal(session.notes, '');
  assert.equal(state.sessions[TODAY], session);
});

test('openSession usa o tipo planejado quando nenhum é informado', () => {
  const s1 = scheduleSession(createInitialState(), TODAY, 'B');
  const { session } = openSession(s1, TODAY, undefined, TODAY);
  assert.equal(session.type, 'B');
  assert.equal(session.exercises[0].name, 'Leg press');
});

test('openSession de sessão já aberta não recopia o modelo', () => {
  const { state } = opened();
  const again = openSession(state, TODAY, 'B', TODAY);
  assert.equal(again.opened, false);
  assert.equal(again.state, state);
});

test('openSession recusa data futura', () => {
  assert.throws(() => openSession(createInitialState(), '2026-11-25', 'A', TODAY), /futuras/);
});

test('sessão aberta é independente do modelo (editar modelo depois não muda a sessão)', () => {
  const { state } = opened();
  const { state: edited } = updateExercise(
    state,
    'A',
    'a-supino-maquina',
    { ...state.plans.A.exercises[0], name: 'Outro', load: 99 },
    '',
    ctx,
  );
  assert.equal(edited.sessions[TODAY].exercises[0].name, 'Supino na máquina');
  assert.equal(edited.sessions[TODAY].exercises[0].load, null);
});

test('parseSessionForm converte cargas e aponta erros por exercício', () => {
  const { session } = opened();
  const ok = parseSessionForm(formFor(session, { 'a-supino-maquina': '12,5', 'a-prancha': '0' }, { notes: '  ok  ' }));
  assert.equal(ok.value.exercises[0].load, 12.5);
  assert.equal(ok.value.exercises[0].checked, true);
  assert.equal(ok.value.exercises[4].load, 0);
  assert.equal(ok.value.exercises[1].load, null);
  assert.equal(ok.value.notes, 'ok');

  const bad = parseSessionForm(formFor(session, { 'a-supino-maquina': 'doze' }));
  assert.deepEqual(Object.keys(bad.errors), ['a-supino-maquina']);
});

test('updateSession salva andamento sem concluir', () => {
  const { state, session } = opened();
  const { value } = parseSessionForm(formFor(session, { 'a-supino-maquina': '10' }, { notes: 'Banco ocupado' }));
  const s1 = updateSession(deepFreeze(state), TODAY, value);
  const saved = s1.sessions[TODAY];
  assert.equal(saved.done, false);
  assert.equal(saved.exercises[0].checked, true);
  assert.equal(saved.exercises[0].load, 10);
  assert.equal(saved.exercises[0].plannedLoad, null);
  assert.equal(saved.notes, 'Banco ocupado');
  assert.equal(progressLabel(saved), '1 de 5');
});

test('completeSession exige exercício marcado ou cardio', () => {
  const { state, session } = opened();
  const empty = parseSessionForm(formFor(session)).value;
  assert.throws(() => completeSession(state, TODAY, empty), /ao menos um exercício ou o cardio/);

  const onlyCardio = parseSessionForm(formFor(session, {}, { cardioDone: true })).value;
  assert.equal(completeSession(state, TODAY, onlyCardio).sessions[TODAY].done, true);

  const oneExercise = parseSessionForm(formFor(session, { 'a-remada-sentada': '' })).value;
  assert.equal(completeSession(state, TODAY, oneExercise).sessions[TODAY].done, true);
});

test('completeSession recusa sessão não aberta', () => {
  assert.throws(() => completeSession(scheduleSession(createInitialState(), TODAY, 'A'), TODAY), SessionError);
});

test('sessão concluída não pode ficar sem atividade ao editar', () => {
  const s = completed(TODAY, { 'a-supino-maquina': '10' });
  const empty = parseSessionForm(formFor(s.sessions[TODAY])).value;
  assert.throws(() => updateSession(s, TODAY, empty), /concluída precisa/);
  const changed = parseSessionForm(formFor(s.sessions[TODAY], { 'a-supino-maquina': '11' })).value;
  const s2 = updateSession(s, TODAY, changed);
  assert.equal(s2.sessions[TODAY].done, true);
  assert.equal(s2.sessions[TODAY].exercises[0].load, 11);
});

test('reopenSession e removeSession', () => {
  const s = completed(TODAY, { 'a-supino-maquina': '10' });
  const reopened = reopenSession(s, TODAY);
  assert.equal(reopened.sessions[TODAY].done, false);
  assert.equal(reopened.sessions[TODAY].exercises[0].load, 10, 'reabrir mantém os registros');
  const removed = removeSession(s, TODAY);
  assert.equal(removed.sessions[TODAY], undefined);
  assert.equal(removeSession(removed, TODAY), removed);
});

test('lastLoad: só sessões concluídas, exercício marcado, carga preenchida, antes da data', () => {
  let s = createInitialState();
  s = completed('2026-11-16', { 'a-supino-maquina': '10' }, s);
  s = completed('2026-11-19', { 'a-supino-maquina': '12' }, s);
  s = completed('2026-11-20', { 'a-supino-maquina': '' }, s); // marcado sem carga: ignora
  s = completed('2026-11-21', { 'a-remada-sentada': '20' }, s); // supino não marcado: ignora

  // em andamento com carga maior: ignora
  const open = openSession(s, '2026-11-22', 'A', TODAY);
  const v = parseSessionForm(formFor(open.session, { 'a-supino-maquina': '30' })).value;
  s = updateSession(open.state, '2026-11-22', v);

  assert.deepEqual(lastLoad(s, 'a-supino-maquina', TODAY), { date: '2026-11-19', load: 12 });
  assert.deepEqual(lastLoad(s, 'a-supino-maquina', '2026-11-19'), { date: '2026-11-16', load: 10 });
  assert.equal(lastLoad(s, 'a-supino-maquina', '2026-11-16'), null);
  assert.equal(lastLoad(s, 'nao-existe', TODAY), null);

  s = completed('2026-11-23', { 'a-supino-maquina': '0' }, s);
  assert.deepEqual(lastLoad(s, 'a-supino-maquina', TODAY), { date: '2026-11-23', load: 0 }, 'zero conta');
});
