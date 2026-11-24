// Mapa de rotas. Cada tela ganha seu próprio arquivo em views/ nas issues do M1.
import { placeholder } from '../ui/placeholder.js';

export const DEFAULT_ROUTE = 'painel';

export const routes = {
  painel: { title: 'Visão geral', render: () => placeholder('Visão geral', '#10') },
  treino: { title: 'Treino AB', render: () => placeholder('Treino AB', '#7') },
  calendario: { title: 'Calendário', render: () => placeholder('Calendário', '#9') },
  evolucao: { title: 'Evolução', render: () => placeholder('Evolução', '#11') },
  diario: { title: 'Diário', render: () => placeholder('Diário', '#12') },
};
