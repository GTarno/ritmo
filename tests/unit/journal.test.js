import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../../app/js/domain/initial-state.js';
import { updateExercise } from '../../app/js/domain/plans.js';
import { parseNoteForm, addNote, updateNote, removeNote, listNotes, categoryLabel } from '../../app/js/domain/journal.js';

const TODAY = '2026-11-24';
function ctx() {
  let n = 0;
  return { today: TODAY, newId: () => `n${++n}` };
}
const form = (over = {}) => ({ category: 'dor', date: TODAY, text: 'Joelho incomodou', plan: '', intensity: '', ...over });

test('parseNoteForm converte e aplica os opcionais', () => {
  assert.deepEqual(parseNoteForm(form({ text: '  ok  ', plan: 'B', intensity: '6' }), TODAY).value, {
    category: 'dor',
    date: TODAY,
    text: 'ok',
    plan: 'B',
    intensity: 6,
  });
  const minimal = parseNoteForm(form(), TODAY).value;
  assert.equal(minimal.plan, null);
  assert.equal(minimal.intensity, null);
  assert.equal(parseNoteForm(form({ intensity: '0' }), TODAY).value.intensity, 0, 'zero é válido');
});

test('parseNoteForm aponta erros por campo', () => {
  const r = parseNoteForm({ category: 'x', date: '2026-11-25', text: ' ', plan: 'C', intensity: '11' }, TODAY);
  assert.deepEqual(Object.keys(r.errors).sort(), ['category', 'date', 'intensity', 'plan', 'text']);
  assert.match(r.errors.date, /futuro/);
  assert.ok(parseNoteForm(form({ intensity: '5,5' }), TODAY).errors.intensity);
  assert.ok(parseNoteForm(form({ text: 'x'.repeat(1001) }), TODAY).errors.text);
});

test('addNote, updateNote e removeNote', () => {
  const c = ctx();
  const s0 = Object.freeze(createInitialState());
  const { state: s1, note } = addNote(s0, parseNoteForm(form(), TODAY).value, c);
  assert.equal(note.id, 'n1');
  assert.equal(s1.notes.length, 1);
  assert.equal(s0.notes.length, 0);

  const s2 = updateNote(s1, 'n1', { ...parseNoteForm(form({ text: 'Melhorou', intensity: '2' }), TODAY).value });
  assert.equal(s2.notes[0].text, 'Melhorou');
  assert.equal(s2.notes[0].intensity, 2);
  assert.equal(s2.notes[0].id, 'n1');
  assert.throws(() => updateNote(s2, 'nao-existe', {}), /não encontrado/);

  assert.equal(removeNote(s2, 'n1').notes.length, 0);
});

test('editar ajuste automático preserva os dados da alteração', () => {
  const s0 = createInitialState();
  const ex = s0.plans.A.exercises[0];
  const { state } = updateExercise(s0, 'A', ex.id, { ...ex, load: 12 }, '', ctx());
  const auto = state.notes[0];
  const edited = updateNote(state, auto.id, parseNoteForm(form({ category: 'ajuste', text: 'Subi a carga', plan: 'A' }), TODAY).value);
  assert.equal(edited.notes[0].auto, true);
  assert.deepEqual(edited.notes[0].change, auto.change);
  assert.equal(edited.notes[0].text, 'Subi a carga');
});

test('listNotes ordena por data (mais recente primeiro) e filtra', () => {
  const c = ctx();
  let s = createInitialState();
  for (const f of [
    form({ date: '2026-11-20', category: 'dor', plan: 'A' }),
    form({ date: '2026-11-22', category: 'observacao' }),
    form({ date: '2026-11-20', category: 'limitacao', plan: 'B' }),
  ]) {
    s = addNote(s, parseNoteForm(f, TODAY).value, c).state;
  }
  assert.deepEqual(listNotes(s).map((n) => n.id), ['n2', 'n3', 'n1'], 'mesma data: o mais novo primeiro');
  assert.deepEqual(listNotes(s, { category: 'dor' }).map((n) => n.id), ['n1']);
  assert.deepEqual(listNotes(s, { plan: 'B' }).map((n) => n.id), ['n3']);
  assert.deepEqual(listNotes(s, { category: 'dor', plan: 'B' }), []);
  assert.equal(categoryLabel('limitacao'), 'Limitação');
});
