// Tela de uma sessão (#sessao/AAAA-MM-DD): agendar, abrir, registrar e concluir.
//
// Enquanto a sessão está em andamento, cada alteração é salva na hora (o
// celular pode bloquear a tela no meio do treino). Uma sessão concluída só é
// gravada ao tocar em "Salvar alterações", para não ficar inválida no meio da edição.
import { app } from '../app-state.js';
import { h, icon, ICONS } from '../ui/dom.js';
import { startRest } from '../ui/rest-timer.js';
import { restFor, formatClock } from '../domain/timer.js';
import { field } from '../ui/form.js';
import { confirmDialog } from '../ui/dialog.js';
import { showStatus } from '../ui/status.js';
import { emptyState } from '../ui/empty-state.js';
import { isValidDate, formatLong, formatShort, compareDates } from '../dates.js';
import { DEFAULT_PLAN_NAMES } from '../domain/initial-state.js';
import { PLAN_TYPES, formatNumber } from '../domain/plans.js';
import {
  getSession,
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
  NOTES_MAX,
  CARDIO_MAX,
} from '../domain/sessions.js';

const STATUS_LABEL = {
  planned: 'Planejada',
  'in-progress': 'Em andamento',
  done: 'Concluída',
};

const planLabel = (type) => `Treino ${type} — ${app.state.plans[type]?.name ?? DEFAULT_PLAN_NAMES[type]}`;

function run(action) {
  try {
    return action();
  } catch (err) {
    if (err instanceof SessionError) {
      showStatus(err.message, { type: 'error' });
      return null;
    }
    throw err;
  }
}

// ---------- Escolha do modelo (antes de começar) ----------

function typePicker(date, selected, onChange) {
  return h(
    'fieldset',
    { class: 'type-picker' },
    h('legend', {}, 'Modelo'),
    PLAN_TYPES.map((type) =>
      h(
        'label',
        { class: 'radio-card' },
        h('input', {
          type: 'radio',
          name: `type-${date}`,
          value: type,
          checked: type === selected,
          onchange: () => onChange(type),
        }),
        h('span', {}, planLabel(type)),
      ),
    ),
  );
}

function notStartedView(date, rerender) {
  const today = app.today();
  const session = getSession(app.state, date);
  const future = !canRegister(date, today);
  let type = suggestedType(app.state, date);

  const picker = typePicker(date, type, (t) => {
    type = t;
    // Numa sessão já planejada, trocar o modelo vale na hora.
    if (session) {
      const next = run(() => scheduleSession(app.state, date, t));
      if (next && app.commit(next)) showStatus(`Sessão alterada para o treino ${t}.`);
    }
  });

  const schedule = () => {
    const next = run(() => scheduleSession(app.state, date, type));
    if (next && app.commit(next)) showStatus(`Treino ${type} agendado para ${formatShort(date)}.`);
    rerender('[data-action="remove"]');
  };

  const start = () => {
    const result = run(() => openSession(app.state, date, type, today));
    if (!result) return;
    app.commit(result.state);
    rerender('.session-exercises input[type="checkbox"]');
  };

  return [
    h(
      'p',
      { class: 'muted' },
      future
        ? 'Datas futuras podem ser agendadas. O registro do treino fica disponível no dia.'
        : session
          ? 'Sessão planejada. Comece quando estiver na academia.'
          : 'Nenhuma sessão nesta data. Escolha o modelo e comece o treino.',
    ),
    picker,
    h(
      'div',
      { class: 'actions' },
      future
        ? !session &&
            h('button', { type: 'button', class: 'btn btn-primary', dataset: { action: 'schedule' }, onclick: schedule }, 'Agendar')
        : h('button', { type: 'button', class: 'btn btn-primary', dataset: { action: 'start' }, onclick: start }, 'Começar treino'),
      session && removeButton(date, rerender),
    ),
  ];
}

// ---------- Registro (sessão aberta) ----------

function lastLoadHint(exId, date) {
  const last = lastLoad(app.state, exId, date);
  return last ? `Última: ${formatNumber(last.load)} kg em ${formatShort(last.date)}` : null;
}

function restButton(ex) {
  const seconds = restFor(ex);
  return h(
    'button',
    {
      type: 'button',
      class: 'btn btn-rest',
      dataset: { action: 'rest' },
      'aria-describedby': `chk-${ex.id}-label`,
      onclick: () => startRest(seconds, ex.name),
    },
    icon(ICONS.relogio, { size: 18 }),
    `Descansar ${formatClock(seconds)}`,
  );
}

function exerciseRow(ex, date, onChange, { resting = true } = {}) {
  const checkId = `chk-${ex.id}`;
  const loadId = `load-${ex.id}`;
  const hintId = `${loadId}-hint`;
  const errorId = `${loadId}-error`;
  const hint = lastLoadHint(ex.id, date);
  const planned = [
    `${ex.sets} × ${ex.reps}`,
    ex.rest !== null && ex.rest !== undefined ? `${ex.rest} s` : null,
    ex.plannedLoad !== null && ex.plannedLoad !== undefined ? `planejado ${formatNumber(ex.plannedLoad)} kg` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return h(
    'li',
    { class: ['card', 'session-exercise', ex.checked && 'is-checked'], dataset: { exercise: ex.id } },
    h(
      'div',
      { class: 'check-line' },
      h('input', {
        type: 'checkbox',
        id: checkId,
        name: 'checked',
        checked: ex.checked,
        'aria-describedby': `${checkId}-desc`,
        onchange: (e) => {
          e.target.closest('li').classList.toggle('is-checked', e.target.checked);
          onChange();
        },
      }),
      h('label', { for: checkId, id: `${checkId}-label` }, ex.name),
    ),
    h('p', { class: 'muted planned', id: `${checkId}-desc` }, planned),
    h(
      'div',
      { class: 'load-line' },
      h('label', { for: loadId }, 'Carga'),
      h(
        'div',
        { class: 'input-suffix' },
        h('input', {
          id: loadId,
          name: 'load',
          inputmode: 'decimal',
          autocomplete: 'off',
          value: ex.load === null || ex.load === undefined ? '' : formatNumber(ex.load),
          'aria-describedby': [hint && hintId, errorId].filter(Boolean).join(' '),
          onchange: onChange,
        }),
        h('span', { 'aria-hidden': 'true' }, 'kg'),
      ),
      hint && h('p', { class: 'hint', id: hintId }, hint),
      h('p', { class: 'error', id: errorId }),
    ),
    resting && restButton(ex),
  );
}

function readForm(form, session) {
  return {
    exercises: session.exercises.map((ex) => {
      const row = form.querySelector(`[data-exercise="${CSS.escape(ex.id)}"]`);
      return {
        id: ex.id,
        checked: row.querySelector('input[name="checked"]').checked,
        load: row.querySelector('input[name="load"]').value,
      };
    }),
    cardioDone: form.querySelector('input[name="cardioDone"]').checked,
    cardio: form.querySelector('[name="cardio"]').value,
    notes: form.querySelector('[name="notes"]').value,
  };
}

function showLoadErrors(form, errors) {
  let first = null;
  for (const row of form.querySelectorAll('[data-exercise]')) {
    const input = row.querySelector('input[name="load"]');
    const message = errors[row.dataset.exercise] ?? '';
    row.querySelector('.error').textContent = message;
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      first ??= input;
    } else {
      input.removeAttribute('aria-invalid');
    }
  }
  return first;
}

function openedView(date, rerender) {
  const session = getSession(app.state, date);
  const done = session.done;
  const progress = h('p', { class: 'progress', 'aria-live': 'polite' }, `${progressLabel(session)} exercícios marcados`);

  /** Lê e valida o formulário. Devolve os valores ou null (com erros na tela). */
  function collect({ focusError }) {
    const parsed = parseSessionForm(readForm(form, getSession(app.state, date)));
    const first = showLoadErrors(form, parsed.errors ?? {});
    if (first && focusError) first.focus();
    return parsed.value ?? null;
  }

  function autosave() {
    const current = getSession(app.state, date);
    progress.textContent = `${progressLabel({ exercises: readForm(form, current).exercises })} exercícios marcados`;
    if (current.done) return; // sessão concluída só grava em "Salvar alterações"
    const values = collect({ focusError: false });
    if (!values) return;
    const next = run(() => updateSession(app.state, date, values));
    if (next) app.commit(next);
  }

  const saveProgress = () => {
    const values = collect({ focusError: true });
    if (!values) return;
    const next = run(() => updateSession(app.state, date, values));
    if (next && app.commit(next)) showStatus('Andamento salvo. Você pode continuar depois.');
  };

  const complete = () => {
    const values = collect({ focusError: true });
    if (!values) return;
    const next = run(() => completeSession(app.state, date, values));
    if (!next) return;
    if (app.commit(next)) showStatus('Sessão concluída. Bom treino!', { type: 'success' });
    rerender('[data-action="save-done"]');
  };

  const saveDone = () => {
    const values = collect({ focusError: true });
    if (!values) return;
    const next = run(() => updateSession(app.state, date, values));
    if (next && app.commit(next)) showStatus('Alterações salvas.');
  };

  const reopen = async () => {
    const ok = await confirmDialog('A sessão volta para “em andamento” e deixa de contar na frequência até ser concluída de novo.', {
      title: 'Reabrir sessão?',
      confirmLabel: 'Reabrir',
    });
    if (!ok) return;
    if (app.commit(reopenSession(app.state, date))) showStatus('Sessão reaberta.');
    rerender('[data-action="complete"]');
  };

  const form = h(
    'form',
    { class: 'session-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
    h('p', { class: 'muted' }, planLabel(session.type)),
    progress,
    session.exercises.length
      ? h(
          'ol',
          { class: 'session-exercises', 'aria-label': 'Exercícios da sessão' },
          session.exercises.map((ex) => exerciseRow(ex, date, autosave, { resting: !done })),
        )
      : emptyState({ title: 'Este modelo não tinha exercícios', text: 'Registre o cardio ou observações.' }),
    h(
      'fieldset',
      { class: 'card cardio-done' },
      h('legend', {}, 'Cardio'),
      h(
        'div',
        { class: 'check-line' },
        h('input', { type: 'checkbox', id: `cardio-${date}`, name: 'cardioDone', checked: session.cardioDone, onchange: autosave }),
        h('label', { for: `cardio-${date}` }, 'Cardio feito'),
      ),
      field({ label: 'O que foi feito', name: 'cardio', value: session.cardio, maxlength: CARDIO_MAX }),
    ),
    field({
      label: 'Observações',
      name: 'notes',
      value: session.notes,
      multiline: true,
      maxlength: NOTES_MAX,
      hint: 'Como se sentiu, ajustes de carga, aparelho ocupado…',
    }),
    h(
      'div',
      { class: 'actions sticky-actions' },
      done
        ? [
            h('button', { type: 'button', class: 'btn btn-primary', dataset: { action: 'save-done' }, onclick: saveDone }, 'Salvar alterações'),
            h('button', { type: 'button', class: 'btn', dataset: { action: 'reopen' }, onclick: reopen }, 'Reabrir'),
          ]
        : [
            h('button', { type: 'button', class: 'btn', dataset: { action: 'save' }, onclick: saveProgress }, 'Salvar andamento'),
            h('button', { type: 'button', class: 'btn btn-primary', dataset: { action: 'complete' }, onclick: complete }, 'Concluir sessão'),
          ],
    ),
  );

  // Texto (cardio, observações) também salva sozinho enquanto em andamento.
  form.querySelector('[name="cardio"]').addEventListener('change', autosave);
  form.querySelector('[name="notes"]').addEventListener('change', autosave);

  return [form, h('div', { class: 'actions danger-zone' }, removeButton(date, rerender))];
}

function removeButton(date, rerender) {
  return h(
    'button',
    {
      type: 'button',
      class: 'btn btn-danger-outline',
      dataset: { action: 'remove' },
      onclick: async () => {
        const session = getSession(app.state, date);
        const started = sessionStatus(session) !== 'planned';
        const ok = await confirmDialog(
          started
            ? `A sessão de ${formatShort(date)} e tudo o que foi registrado nela serão apagados, inclusive dos gráficos e da frequência.`
            : `O agendamento de ${formatShort(date)} será removido.`,
          { title: 'Remover sessão?', confirmLabel: 'Remover', danger: true },
        );
        if (!ok) return;
        if (app.commit(removeSession(app.state, date))) showStatus('Sessão removida.');
        rerender('[data-action="start"], [data-action="schedule"]');
      },
    },
    'Remover sessão',
  );
}

// ---------- Tela ----------

export function sessionTitle(date) {
  return isValidDate(date) ? `Sessão de ${formatShort(date)}` : 'Sessão';
}

export function renderSessao(date) {
  if (!isValidDate(date)) {
    return h(
      'section',
      { class: 'screen' },
      h('h2', { class: 'screen-title' }, 'Sessão'),
      emptyState({ title: 'Data inválida', text: 'Abra a sessão pelo calendário.', action: { label: 'Abrir calendário', href: '#calendario' } }),
    );
  }

  const badge = h('span', { class: 'badge' });
  const body = h('div', { class: 'session' });
  const today = app.today();
  const relative = compareDates(date, today) === 0 ? 'Hoje · ' : '';

  const root = h(
    'section',
    { class: 'screen' },
    h('h2', { class: 'screen-title' }, `${relative}${formatLong(date)}`),
    badge,
    body,
  );

  function rerender(focusSelector) {
    const session = getSession(app.state, date);
    const status = sessionStatus(session);
    badge.textContent = STATUS_LABEL[status] ?? 'Sem sessão';
    badge.dataset.status = status;
    body.replaceChildren(...[status === 'none' || status === 'planned' ? notStartedView(date, rerender) : openedView(date, rerender)].flat());
    if (focusSelector) body.querySelector(focusSelector)?.focus();
  }

  rerender();
  return root;
}

