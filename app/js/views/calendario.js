// Tela "Calendário": visão semanal e mensal, abrir sessão por data e planejar semana.
import { app } from '../app-state.js';
import { h, icon, ICONS, srOnly } from '../ui/dom.js';
import { field } from '../ui/form.js';
import { formDialog } from '../ui/dialog.js';
import { showStatus } from '../ui/status.js';
import {
  addDays,
  addMonths,
  weekStart,
  weekDays,
  monthGrid,
  isSameMonth,
  isValidDate,
  formatShort,
  formatMonthYear,
  formatWeekRange,
  formatDayMonth,
  weekdayLong,
  weekdayShort,
  weekdayIndex,
} from '../dates.js';
import { daySummary, previewWeekPlan, planWeek, countDone, weekTemplateSummary } from '../domain/calendar.js';
import { listPlans, planDisplay } from '../domain/models.js';
import { planChip, planColorStyle, planShort } from '../ui/plan-chip.js';

// Visão e período lembrados enquanto o app está aberto.
const view = { mode: 'semana', anchor: null };

const STATUS_TEXT = {
  planned: 'planejado',
  'in-progress': 'em andamento',
  done: 'concluído',
};

const WEEKDAY_HEADERS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const WEEKDAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/** Bolinha do modelo da sessão do dia (rótulo e cor; guardados na sessão se o modelo saiu). */
const dayChip = (date, type) => planChip(app.state, type, { session: app.state.sessions[date] });

// ---------- Planejar semana ----------

function previewList(date) {
  const items = previewWeekPlan(app.state, date, app.today());
  if (!items.length) return h('p', { class: 'muted' }, 'A semana padrão não tem dias de treino.');
  const text = {
    create: (i) => `${planShort(app.state, i.type)} — será agendado`,
    exists: (i) => `já tem sessão (treino ${planDisplay(app.state, i.existing, app.state.sessions[i.date]).label}); fica como está`,
    past: () => 'já passou; não será agendado',
  };
  return h(
    'ul',
    { class: 'plan-preview' },
    items.map((i) =>
      h(
        'li',
        { dataset: { action: i.action } },
        h('strong', {}, `${weekdayShort(i.date)} ${formatShort(i.date)}`),
        ' ',
        text[i.action](i),
      ),
    ),
  );
}

/** "Semana padrão: seg A · ter B · qui A · sex B." a partir dos modelos atuais. */
function templateText() {
  const days = weekTemplateSummary(app.state);
  if (!days.length) return 'A semana padrão não tem dias de treino.';
  return `Semana padrão: ${days.map((d) => `${WEEKDAY_HEADERS[d.index]} ${d.label}`).join(' · ')}.`;
}

async function onPlanWeek(rerender) {
  const initial = view.mode === 'semana' && view.anchor ? weekStart(view.anchor) : app.today();
  const preview = h('div', { class: 'preview', 'aria-live': 'polite' }, previewList(initial));
  const dateField = field({
    label: 'Uma data da semana',
    name: 'date',
    type: 'date',
    value: initial,
    required: true,
    hint: 'A semana vai de segunda a domingo. Sessões já existentes não mudam.',
  });
  dateField.querySelector('input').addEventListener('change', (e) => {
    if (isValidDate(e.target.value)) preview.replaceChildren(previewList(e.target.value));
  });

  const date = await formDialog({
    title: 'Planejar semana',
    content: [
      dateField,
      h('p', { class: 'muted' }, templateText()),
      preview,
    ],
    submitLabel: 'Planejar',
    onSubmit: (values) =>
      isValidDate(values.date) ? { value: values.date } : { errors: { date: 'Escolha uma data válida.' } },
  });
  if (!date) return rerender('[data-action="plan"]');

  const result = planWeek(app.state, date, app.today());
  const n = result.created.length;
  if (n === 0) {
    showStatus('Nada a agendar: os dias de treino dessa semana já têm sessão ou já passaram.');
  } else if (app.commit(result.state)) {
    const parts = [n === 1 ? '1 sessão agendada.' : `${n} sessões agendadas.`];
    if (result.kept.length) {
      parts.push(result.kept.length === 1 ? '1 dia já tinha sessão e ficou como estava.' : `${result.kept.length} dias já tinham sessão e ficaram como estavam.`);
    }
    showStatus(parts.join(' '));
  }
  view.mode = 'semana';
  view.anchor = result.weekStart;
  rerender('[data-action="plan"]');
}

// ---------- Visões ----------

function weekView(anchor, today) {
  const days = weekDays(anchor);
  return h(
    'ol',
    { class: 'week-list', 'aria-label': `Dias da semana de ${formatWeekRange(days[0])}` },
    days.map((date) => {
      const s = daySummary(app.state, date);
      return h(
        'li',
        {},
        h(
          'a',
          {
            href: `#sessao/${date}`,
            class: ['day-row', date === today && 'is-today'],
            dataset: { date, status: s.status },
          },
          h(
            'span',
            { class: 'day-name' },
            h('span', { class: 'weekday' }, WEEKDAY_NAMES[weekdayIndex(date)], srOnly(',')),
            h('span', { class: 'muted' }, date === today ? `Hoje · ${formatShort(date)}` : formatShort(date), srOnly(':')),
          ),
          s.status === 'none'
            ? h('span', { class: 'day-status' }, 'Livre')
            : h(
                'span',
                { class: 'day-status' },
                dayChip(date, s.type),
                srOnly(' — '),
                h('span', { class: 'day-plan' }, `${planDisplay(app.state, s.type, app.state.sessions[date]).name} · ${STATUS_TEXT[s.status]}`),
              ),
        ),
      );
    }),
  );
}

function monthView(anchor, today) {
  const weeks = monthGrid(anchor);
  return h(
    'table',
    { class: 'month-grid' },
    h('caption', { class: 'visually-hidden' }, formatMonthYear(anchor)),
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        WEEKDAY_HEADERS.map((d, i) => h('th', { scope: 'col', abbr: WEEKDAY_NAMES[i] }, d)),
      ),
    ),
    h(
      'tbody',
      {},
      weeks.map((week) =>
        h(
          'tr',
          {},
          week.map((date) => {
            const s = daySummary(app.state, date);
            return h(
              'td',
              { class: [!isSameMonth(date, anchor) && 'out'] },
              h(
                'a',
                {
                  href: `#sessao/${date}`,
                  class: ['day-cell', date === today && 'is-today'],
                  dataset: { date, status: s.status },
                },
                h('span', { class: 'day-number' }, String(Number(date.slice(8)))),
                srOnly(`${formatDayMonth(date).replace(/^\d+/, '')}, ${weekdayLong(date)}${date === today ? ', hoje' : ''}`),
                s.status !== 'none' && [srOnly(': '), dayChip(date, s.type), srOnly(` ${STATUS_TEXT[s.status]}`)],
              ),
            );
          }),
        ),
      ),
    ),
  );
}

/** Legenda gerada a partir dos modelos existentes, mais o significado do preenchimento. */
function legend() {
  const plans = listPlans(app.state);
  return h(
    'div',
    { class: 'legends' },
    h(
      'section',
      { class: 'legend-group', 'aria-labelledby': 'legend-plans-title' },
      h('h4', { id: 'legend-plans-title' }, 'Treinos'),
      h(
        'ul',
        { class: 'legend legend-plans' },
        plans.map((p) =>
          h('li', {}, h('span', { class: 'type-chip', style: planColorStyle(p.color), 'aria-hidden': 'true' }, p.label), h('span', { class: 'plan-name' }, `Treino ${p.label} — ${p.name}`)),
        ),
      ),
    ),
    h(
      'section',
      { class: 'legend-group', 'aria-labelledby': 'legend-status-title' },
      h('h4', { id: 'legend-status-title' }, 'Situação'),
      h(
        'ul',
        { class: 'legend' },
        [
          ['planned', 'Planejado (contorno)'],
          ['in-progress', 'Em andamento (tracejado)'],
          ['done', 'Concluído (cheio)'],
        ].map(([status, label]) =>
          h('li', { dataset: { status } }, h('span', { class: 'type-chip', style: planColorStyle(plans[0]?.color), 'aria-hidden': 'true' }, plans[0]?.label ?? 'A'), label),
        ),
      ),
    ),
  );
}

export function renderCalendario() {
  const body = h('div', { class: 'calendar' });
  const root = h('section', { class: 'screen' }, h('h2', { class: 'screen-title' }, 'Calendário'), body);

  function rerender(focusSelector) {
    const today = app.today();
    const anchor = view.anchor ?? today;
    const isWeek = view.mode === 'semana';
    const start = weekStart(anchor);

    const step = (n) => {
      view.anchor = isWeek ? addDays(start, 7 * n) : addMonths(anchor, n);
      rerender(`[data-action="${n < 0 ? 'prev' : 'next'}"]`);
    };

    const period = isWeek ? formatWeekRange(start) : formatMonthYear(anchor);
    const doneCount = isWeek ? countDone(app.state, start, addDays(start, 6)) : null;

    body.replaceChildren(
      h(
        'div',
        { class: 'calendar-toolbar' },
        h(
          'div',
          { class: 'segmented', role: 'group', 'aria-label': 'Visão do calendário' },
          [
            ['semana', 'Semana'],
            ['mes', 'Mês'],
          ].map(([mode, label]) =>
            h(
              'button',
              {
                type: 'button',
                'aria-pressed': String(view.mode === mode),
                dataset: { mode },
                onclick: () => {
                  view.mode = mode;
                  rerender(`[data-mode="${mode}"]`);
                },
              },
              label,
            ),
          ),
        ),
        h(
          'button',
          { type: 'button', class: 'btn btn-primary', dataset: { action: 'plan' }, onclick: () => onPlanWeek(rerender) },
          'Planejar semana',
        ),
      ),
      h(
        'div',
        { class: 'period-nav' },
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': isWeek ? 'Semana anterior' : 'Mês anterior',
            dataset: { action: 'prev' },
            onclick: () => step(-1),
          },
          icon(ICONS.anterior, { size: 22 }),
        ),
        h('h3', { 'aria-live': 'polite', tabindex: -1 }, period),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': isWeek ? 'Próxima semana' : 'Próximo mês',
            dataset: { action: 'next' },
            onclick: () => step(1),
          },
          icon(ICONS.proximo, { size: 22 }),
        ),
      ),
      h(
        'div',
        { class: 'period-meta' },
        doneCount !== null &&
          h('p', { class: 'muted' }, `${doneCount} de ${app.state.target} treinos concluídos`),
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            dataset: { action: 'today' },
            'aria-label': 'Ir para hoje',
            disabled: isWeek ? start === weekStart(today) : isSameMonth(anchor, today),
            onclick: () => {
              view.anchor = null;
              rerender('[data-action="today"]');
            },
          },
          'Hoje',
        ),
      ),
      isWeek ? weekView(anchor, today) : monthView(anchor, today),
      !isWeek && legend(),
    );
    if (focusSelector) {
      const el = body.querySelector(focusSelector);
      // "Ir para hoje" fica desabilitado depois de usado: foca o título do período.
      (el && !el.disabled ? el : body.querySelector('.period-nav h3'))?.focus?.();
    }
  }

  rerender();
  return root;
}
