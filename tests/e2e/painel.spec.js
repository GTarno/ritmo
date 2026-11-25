import { test, expect } from './fixtures.js';

// Terça-feira, 24/11/2026, 18h em São Paulo
const NOW = new Date('2026-11-24T18:00:00-03:00');
const TODAY = '2026-11-24';

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:v1'))?.data);
const region = (page, name) => page.getByRole('region', { name });

/** Conclui uma sessão pela interface marcando os N primeiros exercícios. */
async function completeSession(page, date, { type, check = 1 } = {}) {
  await page.goto(`./#sessao/${date}`);
  if (type) await page.getByRole('radio', { name: new RegExp(`Treino ${type}`) }).check();
  await page.getByRole('button', { name: 'Começar treino' }).click();
  const boxes = page.getByRole('list', { name: 'Exercícios da sessão' }).getByRole('checkbox');
  for (let i = 0; i < check; i++) await boxes.nth(i).check();
  await page.getByRole('button', { name: 'Concluir sessão' }).click();
  await expect(page.locator('.badge')).toHaveText('Concluída');
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('estado inicial: objetivo, meta 4, semana vazia e orientação', async ({ page }) => {
  await page.goto('./');
  await expect(region(page, 'Emagrecer e definir')).toContainText('Meta: 4 treinos por semana');
  await expect(region(page, 'Treino de hoje')).toContainText('Sugestão: treino B');
  await expect(page.getByRole('progressbar', { name: /Treinos concluídos: 0 de 4 treinos/ })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Dias desta semana' }).getByRole('link')).toHaveCount(7);
  await expect(page.getByRole('term').filter({ hasText: 'Sessões concluídas' })).toBeVisible();
  await expect(page.getByRole('definition').first()).toHaveText('0');
  await expect(page.getByRole('link', { name: 'Registrar' })).toHaveAttribute('href', '#evolucao');
  await expect(region(page, 'Histórico recente')).toContainText('Nenhum treino concluído ainda');
  await expect(region(page, 'Voltando a treinar')).toContainText('repetições em reserva');
});

test('editar objetivo e meta, com validação', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Editar objetivo e meta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Objetivo e meta' });
  await dialog.getByLabel('Objetivo').fill('Ganhar condicionamento');
  await dialog.getByLabel('Meta semanal').fill('9');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog.getByText('Escolha de 1 a 7 treinos por semana.')).toBeVisible();

  await dialog.getByLabel('Meta semanal').fill('3');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(region(page, 'Ganhar condicionamento')).toContainText('Meta: 3 treinos por semana');
  await expect(page.getByRole('progressbar', { name: /0 de 3 treinos/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar objetivo e meta' })).toBeFocused();

  const data = await stored(page);
  expect(data).toMatchObject({ goal: 'Ganhar condicionamento', target: 3 });
});

test('concluir sessão atualiza frequência, total, semana e histórico', async ({ page }) => {
  await completeSession(page, '2026-11-23', { type: 'A', check: 2 });
  await page.goto('./');

  await expect(page.getByRole('progressbar', { name: /1 de 4 treinos/ })).toBeVisible();
  await expect(page.getByRole('definition').first()).toHaveText('1');
  await expect(page.getByRole('link', { name: 'segunda-feira, 23 de novembro: treino A concluído' })).toBeVisible();

  const recent = region(page, 'Histórico recente').getByRole('link');
  await expect(recent).toHaveCount(1);
  await expect(recent.first()).toContainText('seg 23/11 · Treino A');
  await expect(recent.first()).toContainText('2 de 5 exercícios');
  await recent.first().click();
  await expect(page).toHaveURL(/#sessao\/2026-11-23$/);
});

test('meta atingida aparece no painel', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const { app } = await import('./js/app-state.js');
    app.commit({ ...app.state, target: 1 });
  });
  await completeSession(page, TODAY, { check: 1 });
  await page.goto('./');
  await expect(page.getByText('Meta da semana atingida!')).toBeVisible();
  await expect(region(page, 'Treino de hoje')).toContainText('Treino B concluído');
  await expect(region(page, 'Treino de hoje').getByRole('link')).toHaveText('Ver sessão de hoje');
});

test('sessão em andamento: botão vira "Continuar treino"', async ({ page }) => {
  await page.goto(`./#sessao/${TODAY}`);
  await page.getByRole('button', { name: 'Começar treino' }).click();
  await page.goto('./');
  await expect(region(page, 'Treino de hoje')).toContainText('em andamento · 0 de 5 exercícios');
  await expect(region(page, 'Treino de hoje').getByRole('link')).toHaveText('Continuar treino');
});

test('mostra o próximo treino planejado quando hoje está livre', async ({ page }) => {
  await page.goto('./#calendario');
  await page.getByRole('button', { name: 'Planejar semana' }).click();
  await page.getByRole('dialog').getByLabel('Uma data da semana').fill('2026-11-30');
  await page.getByRole('dialog').getByRole('button', { name: 'Planejar' }).click();

  await page.goto('./');
  await expect(region(page, 'Treino de hoje')).toContainText('Próximo planejado: seg 30/11 · Treino A');
});

test('último peso aparece quando há registro', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    const { app } = await import('./js/app-state.js');
    app.commit({ ...app.state, measurements: [{ date: '2026-11-20', weight: 68.4 }] });
  });
  await page.reload();
  await expect(page.getByRole('definition').nth(1)).toContainText('68,4 kg');
  await expect(page.getByRole('definition').nth(1)).toContainText('em 20/11');
});

test('sem rolagem horizontal em 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('./');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
