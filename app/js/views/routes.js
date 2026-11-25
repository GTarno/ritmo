// Mapa de rotas. Cada tela ganha seu próprio arquivo em views/ nas issues do M1.
// A ordem aqui é a ordem do menu; rotas com `hidden` não aparecem no menu.
import { h } from '../ui/dom.js';
import { emptyState } from '../ui/empty-state.js';
import { renderTreino } from './treino.js';
import { renderSessao, sessionTitle } from './sessao.js';
import { renderPainel } from './painel.js';
import { renderCalendario } from './calendario.js';

export const DEFAULT_ROUTE = 'painel';

function screen(title, ...content) {
  return h('section', { class: 'screen' }, h('h2', { class: 'screen-title' }, title), content);
}

export const routes = {
  painel: {
    title: 'Visão geral',
    label: 'Início',
    render: renderPainel,
  },
  treino: {
    title: 'Treino AB',
    label: 'Treino',
    render: renderTreino,
  },
  calendario: {
    title: 'Calendário',
    label: 'Agenda',
    render: renderCalendario,
  },
  evolucao: {
    title: 'Evolução',
    label: 'Evolução',
    render: () =>
      screen(
        'Evolução',
        emptyState({
          title: 'Sem medidas ou cargas ainda',
          text: 'Registre peso e medidas e conclua treinos para ver seus gráficos aqui (issue #11).',
        }),
      ),
  },
  diario: {
    title: 'Diário',
    label: 'Diário',
    render: () =>
      screen(
        'Diário',
        emptyState({
          title: 'Diário vazio',
          text: 'Anote como se sentiu, dores, limitações e ajustes do treino (issue #12).',
        }),
      ),
  },
  sessao: {
    title: sessionTitle,
    hidden: true,
    navParent: 'calendario',
    render: renderSessao,
  },
};
