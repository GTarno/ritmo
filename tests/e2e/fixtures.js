import { test as base, expect } from '@playwright/test';

// Toda página reprova o teste se tiver erro de JavaScript ou no console.
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await use(page);
    expect(errors, 'erros no console').toEqual([]);
  },
});

export { expect };

/** [rota, título da tela, rótulo no menu] na ordem do menu. */
export const ROUTES = [
  ['painel', 'Visão geral', 'Início'],
  ['treino', 'Treino AB', 'Treino'],
  ['calendario', 'Calendário', 'Agenda'],
  ['evolucao', 'Evolução', 'Evolução'],
  ['diario', 'Diário', 'Diário'],
];
