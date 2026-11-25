// Mapa de rotas. Cada tela fica no seu próprio arquivo em views/.
// A ordem aqui é a ordem do menu; rotas com `hidden` não aparecem no menu.
import { renderTreino } from './treino.js';
import { renderSessao, sessionTitle } from './sessao.js';
import { renderPainel } from './painel.js';
import { renderCalendario } from './calendario.js';
import { renderEvolucao } from './evolucao.js';
import { renderDiario } from './diario.js';
import { renderDados } from './dados.js';

export const DEFAULT_ROUTE = 'painel';

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
    render: renderEvolucao,
  },
  diario: {
    title: 'Diário',
    label: 'Diário',
    render: renderDiario,
  },
  dados: {
    title: 'Seus dados',
    hidden: true,
    render: renderDados,
  },
  sessao: {
    title: sessionTitle,
    hidden: true,
    navParent: 'calendario',
    render: renderSessao,
  },
};
