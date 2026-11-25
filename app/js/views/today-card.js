// Cartão "Treino de hoje" e atalho para abrir qualquer data.
// Usados no painel e no calendário até as telas completas (#9, #10).
import { app } from '../app-state.js';
import { h } from '../ui/dom.js';
import { field } from '../ui/form.js';
import { getSession, sessionStatus, suggestedType, progressLabel } from '../domain/sessions.js';
import { isValidDate } from '../dates.js';

export function todayCard() {
  const today = app.today();
  const session = getSession(app.state, today);
  const status = sessionStatus(session);
  const type = session?.type ?? suggestedType(app.state, today);

  const text = {
    none: `Sugestão: treino ${type}.`,
    planned: `Treino ${type} planejado.`,
    'in-progress': `Treino ${type} em andamento · ${session && status === 'in-progress' ? progressLabel(session) : ''} exercícios.`,
    done: `Treino ${type} concluído. Bom trabalho!`,
  }[status];

  const label = { none: 'Começar treino de hoje', planned: 'Começar treino de hoje', 'in-progress': 'Continuar treino', done: 'Ver sessão de hoje' }[status];

  return h(
    'section',
    { class: 'card today-card', 'aria-labelledby': 'today-title' },
    h('h3', { id: 'today-title' }, 'Treino de hoje'),
    h('p', { class: 'muted' }, text),
    h('a', { class: 'btn btn-primary', href: `#sessao/${today}` }, label),
  );
}

export function openDateForm() {
  const form = h(
    'form',
    {
      class: 'card open-date',
      novalidate: true,
      onsubmit: (e) => {
        e.preventDefault();
        const value = form.querySelector('input[name="date"]').value;
        if (isValidDate(value)) location.hash = `#sessao/${value}`;
      },
    },
    field({ label: 'Abrir sessão de outra data', name: 'date', type: 'date', value: app.today(), required: true }),
    h('button', { type: 'submit', class: 'btn' }, 'Abrir'),
  );
  return form;
}
