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

/**
 * true se a página rola na horizontal. No celular emulado, `innerWidth` cresce
 * junto com o conteúdo largo, então a comparação é com a menor entre a largura
 * da tela e a da janela.
 */
export const hasHorizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > Math.min(screen.width, window.innerWidth));

/**
 * Espera o diálogo terminar de fechar. `getByRole('dialog')` some assim que o
 * diálogo fecha (fica oculto), mas o app só grava no evento `close`, que vem
 * depois; o elemento só sai do DOM nesse evento.
 */
export const dialogClosed = (page) => expect(page.locator('dialog')).toHaveCount(0);
