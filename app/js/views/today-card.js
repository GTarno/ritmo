// Cartão "Treino de hoje" (usado no painel).
import { app } from '../app-state.js';
import { h } from '../ui/dom.js';
import { getSession, sessionStatus, suggestedType, progressLabel } from '../domain/sessions.js';

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
