// Tela "Visão geral": objetivo e meta, treino de hoje, semana atual,
// números gerais, histórico recente e orientação de adaptação.
import { app } from '../app-state.js';
import { h, icon, ICONS } from '../ui/dom.js';
import { field } from '../ui/form.js';
import { formDialog } from '../ui/dialog.js';
import { showStatus } from '../ui/status.js';
import { emptyState } from '../ui/empty-state.js';
import { formatShort, formatLong, weekdayShort } from '../dates.js';
import { formatNumber } from '../domain/plans.js';
import { getSession, sessionStatus, suggestedType, progressLabel } from '../domain/sessions.js';
import {
  GOAL_MAX,
  TARGET_MIN,
  TARGET_MAX,
  parsePreferencesForm,
  updatePreferences,
  weekProgress,
  currentWeek,
  nextPlanned,
  recentSessions,
  totalDone,
  lastMeasurement,
} from '../domain/dashboard.js';

const STATUS_TEXT = { planned: 'planejado', 'in-progress': 'em andamento', done: 'concluído' };
const plural = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

// ---------- Objetivo e meta ----------

async function onEditGoal(rerender) {
  const result = await formDialog({
    title: 'Objetivo e meta',
    content: [
      field({ label: 'Objetivo', name: 'goal', value: app.state.goal ?? '', maxlength: GOAL_MAX, hint: 'Ex.: Emagrecer e definir' }),
      field({
        label: 'Meta semanal',
        name: 'target',
        value: app.state.target,
        inputmode: 'numeric',
        required: true,
        hint: `De ${TARGET_MIN} a ${TARGET_MAX} treinos por semana.`,
      }),
    ],
    onSubmit: (values) => parsePreferencesForm(values),
  });
  if (result && app.commit(updatePreferences(app.state, result))) showStatus('Objetivo e meta atualizados.');
  rerender('[data-action="edit-goal"]');
}

function goalCard(rerender) {
  const { goal, target } = app.state;
  return h(
    'section',
    { class: 'card goal-card', 'aria-labelledby': 'goal-title' },
    h(
      'div',
      { class: 'goal-text' },
      h('p', { class: 'eyebrow' }, 'Objetivo'),
      h('h3', { id: 'goal-title' }, goal || 'Defina seu objetivo'),
      h('p', { class: 'muted' }, `Meta: ${plural(target, 'treino', 'treinos')} por semana`),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Editar objetivo e meta',
        dataset: { action: 'edit-goal' },
        onclick: () => onEditGoal(rerender),
      },
      icon(ICONS.editar, { size: 20 }),
    ),
  );
}

// ---------- Treino de hoje ----------

function todayCard(today) {
  const session = getSession(app.state, today);
  const status = sessionStatus(session);
  const type = session?.type ?? suggestedType(app.state, today);
  const next = status === 'none' ? nextPlanned(app.state, today) : null;

  const text = {
    none: `Sugestão: treino ${type}.`,
    planned: `Treino ${type} planejado.`,
    'in-progress': `Treino ${type} em andamento · ${status === 'in-progress' ? progressLabel(session) : ''} exercícios.`,
    done: `Treino ${type} concluído. Bom trabalho!`,
  }[status];
  const label = {
    none: 'Começar treino de hoje',
    planned: 'Começar treino de hoje',
    'in-progress': 'Continuar treino',
    done: 'Ver sessão de hoje',
  }[status];

  return h(
    'section',
    { class: ['card', 'today-card', `is-${status}`], 'aria-labelledby': 'today-title' },
    h('h3', { id: 'today-title' }, 'Treino de hoje'),
    h('p', { class: 'muted' }, text),
    h('a', { class: 'btn btn-primary', href: `#sessao/${today}` }, label),
    next &&
      h(
        'p',
        { class: 'next-planned' },
        'Próximo planejado: ',
        h('a', { href: `#sessao/${next.date}` }, `${weekdayShort(next.date)} ${formatShort(next.date)} · Treino ${next.type}`),
      ),
  );
}

// ---------- Semana atual ----------

function weekCard(today) {
  const progress = weekProgress(app.state, today);
  const days = currentWeek(app.state, today);
  const label = `${progress.done} de ${plural(progress.target, 'treino', 'treinos')}`;
  return h(
    'section',
    { class: 'card week-card', 'aria-labelledby': 'week-title' },
    h('h3', { id: 'week-title' }, 'Esta semana'),
    h(
      'div',
      { class: 'progress-line' },
      h('progress', { id: 'week-progress', max: progress.target, value: Math.min(progress.done, progress.target), 'aria-label': `Treinos concluídos: ${label}` }),
      h('span', { class: 'progress-text' }, label),
    ),
    progress.reached && h('p', { class: 'goal-reached' }, 'Meta da semana atingida!'),
    h(
      'ol',
      { class: 'week-strip', 'aria-label': 'Dias desta semana' },
      days.map((d) =>
        h(
          'li',
          {},
          h(
            'a',
            {
              href: `#sessao/${d.date}`,
              class: ['strip-day', d.date === today && 'is-today'],
              dataset: { status: d.status },
              'aria-label': `${d.date === today ? 'Hoje, ' : ''}${formatLong(d.date)}: ${d.status === 'none' ? 'livre' : `treino ${d.type} ${STATUS_TEXT[d.status]}`}`,
            },
            h('span', { class: 'strip-weekday' }, weekdayShort(d.date)),
            d.status === 'none' ? h('span', { class: 'strip-empty' }, '·') : h('span', { class: 'type-chip' }, d.type),
          ),
        ),
      ),
    ),
  );
}

// ---------- Números ----------

function statsCard() {
  const total = totalDone(app.state);
  const weight = lastMeasurement(app.state, 'weight');
  return h(
    'dl',
    { class: 'stats' },
    h('div', { class: 'card stat' }, h('dt', {}, 'Sessões concluídas'), h('dd', {}, String(total))),
    h(
      'div',
      { class: 'card stat' },
      h('dt', {}, 'Último peso'),
      weight
        ? h('dd', {}, `${formatNumber(weight.weight)} kg`, h('span', { class: 'muted stat-sub' }, `em ${formatShort(weight.date)}`))
        : h('dd', { class: 'stat-empty' }, h('a', { href: '#evolucao' }, 'Registrar')),
    ),
  );
}

// ---------- Histórico recente ----------

function recentCard() {
  const items = recentSessions(app.state, 5);
  return h(
    'section',
    { class: 'recent', 'aria-labelledby': 'recent-title' },
    h('h3', { id: 'recent-title' }, 'Histórico recente'),
    items.length
      ? h(
          'ol',
          { class: 'recent-list' },
          items.map((s) => {
            const detail = [
              s.total ? `${s.checked} de ${s.total} exercícios` : null,
              s.cardioDone ? 'cardio' : null,
            ]
              .filter(Boolean)
              .join(' + ');
            return h(
              'li',
              {},
              h(
                'a',
                { class: 'card recent-item', href: `#sessao/${s.date}` },
                h('span', { class: 'type-chip', dataset: { status: 'done' } }, s.type),
                h(
                  'span',
                  { class: 'recent-text' },
                  h('strong', {}, `${weekdayShort(s.date)} ${formatShort(s.date)} · Treino ${s.type}`),
                  h('span', { class: 'muted' }, detail),
                ),
              ),
            );
          }),
        )
      : emptyState({
          title: 'Nenhum treino concluído ainda',
          text: 'Suas sessões concluídas aparecem aqui.',
        }),
  );
}

// ---------- Orientação ----------

function guidanceCard() {
  return h(
    'section',
    { class: 'card guidance', 'aria-labelledby': 'guidance-title' },
    h('h3', { id: 'guidance-title' }, 'Voltando a treinar'),
    h(
      'ul',
      {},
      h('li', {}, 'Comece com cargas leves e priorize a execução.'),
      h('li', {}, 'Termine cada série com algumas repetições em reserva.'),
      h(
        'li',
        {},
        'Quando chegar ao topo das repetições com boa técnica em sessões seguidas, experimente um pequeno aumento de carga e anote como se sentiu.',
      ),
      h('li', {}, 'Dor diferente do cansaço normal? Pare, registre no diário e ajuste o treino.'),
    ),
  );
}

export function renderPainel() {
  const body = h('div', { class: 'dashboard' });
  const root = h('section', { class: 'screen' }, h('h2', { class: 'screen-title' }, 'Visão geral'), body);

  function rerender(focusSelector) {
    const today = app.today();
    body.replaceChildren(goalCard(rerender), todayCard(today), weekCard(today), statsCard(), recentCard(), guidanceCard());
    if (focusSelector) body.querySelector(focusSelector)?.focus();
  }

  rerender();
  return root;
}
