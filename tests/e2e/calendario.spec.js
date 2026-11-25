import { test, expect } from './fixtures.js';

// Terça-feira, 24/11/2026, 18h em São Paulo
const NOW = new Date('2026-11-24T18:00:00-03:00');

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:v1'))?.data);
const weekList = (page) => page.getByRole('list', { name: /Dias da semana/ });
const day = (page, date) => page.locator(`a[data-date="${date}"]`);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('./#calendario');
});

test('abre na semana atual, de segunda a domingo, com hoje destacado', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '23 – 29 de novembro de 2026' })).toBeVisible();
  await expect(weekList(page).getByRole('link')).toHaveCount(7);
  await expect(weekList(page).getByRole('link').first()).toHaveAttribute('aria-label', 'segunda-feira, 23 de novembro: Livre');
  await expect(day(page, '2026-11-24')).toHaveAttribute('aria-label', /^Hoje, terça-feira/);
  await expect(page.getByText('0 de 4 treinos concluídos')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ir para hoje' })).toBeDisabled();
});

test('navega entre semanas e volta para hoje', async ({ page }) => {
  await page.getByRole('button', { name: 'Próxima semana' }).click();
  await expect(page.getByRole('heading', { name: '30 de novembro – 6 de dezembro de 2026' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Próxima semana' })).toBeFocused();
  await page.getByRole('button', { name: 'Semana anterior' }).click();
  await page.getByRole('button', { name: 'Semana anterior' }).click();
  await expect(page.getByRole('heading', { name: '16 – 22 de novembro de 2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Ir para hoje' }).click();
  await expect(page.getByRole('heading', { name: '23 – 29 de novembro de 2026' })).toBeVisible();
});

test('visão mensal com grade completa e navegação', async ({ page }) => {
  await page.getByRole('button', { name: 'Mês', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mês', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'novembro de 2026' })).toBeVisible();
  const grid = page.getByRole('table');
  await expect(grid.getByRole('columnheader')).toHaveText(['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']);
  await expect(grid.getByRole('row')).toHaveCount(7); // cabeçalho + 6 semanas
  await expect(day(page, '2026-10-26')).toBeVisible(); // borda do mês anterior

  await page.getByRole('button', { name: 'Próximo mês' }).click();
  await expect(page.getByRole('heading', { name: 'dezembro de 2026' })).toBeVisible();
  await page.getByRole('button', { name: 'Próximo mês' }).click();
  await expect(page.getByRole('heading', { name: 'janeiro de 2027' })).toBeVisible();
});

test('tocar num dia abre a sessão daquela data', async ({ page }) => {
  await day(page, '2026-11-26').click();
  await expect(page).toHaveURL(/#sessao\/2026-11-26$/);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('quinta-feira, 26 de novembro');
});

test('planejar semana: prévia, criação e preservação das sessões existentes', async ({ page }) => {
  // Quinta da semana seguinte já tem uma sessão B
  await page.evaluate(async () => {
    const { app } = await import('./js/app-state.js');
    const { scheduleSession } = await import('./js/domain/sessions.js');
    app.commit(scheduleSession(app.state, '2026-12-03', 'B'));
  });
  await page.reload();

  await page.getByRole('button', { name: 'Planejar semana' }).click();
  const dialog = page.getByRole('dialog', { name: 'Planejar semana' });
  await dialog.getByLabel('Uma data da semana').fill('2026-12-02');
  await dialog.getByLabel('Uma data da semana').dispatchEvent('change');
  await expect(dialog.locator('.plan-preview li')).toHaveText([
    'seg 30/11 Treino A — será agendado',
    'ter 01/12 Treino B — será agendado',
    'qui 03/12 já tem sessão (treino B); fica como está',
    'sex 04/12 Treino B — será agendado',
  ]);
  await dialog.getByRole('button', { name: 'Planejar' }).click();

  await expect(page.locator('#status')).toContainText('3 sessões agendadas. 1 dia já tinha sessão e ficou como estava.');
  await expect(page.getByRole('heading', { name: '30 de novembro – 6 de dezembro de 2026' })).toBeVisible();
  await expect(day(page, '2026-11-30')).toHaveAttribute('aria-label', /Treino A · planejado/);
  await expect(day(page, '2026-12-02')).toHaveAttribute('aria-label', /Livre/);
  await expect(day(page, '2026-12-03')).toHaveAttribute('aria-label', /Treino B · planejado/);

  const data = await stored(page);
  expect(Object.keys(data.sessions).sort()).toEqual(['2026-11-30', '2026-12-01', '2026-12-03', '2026-12-04']);
  expect(data.sessions['2026-12-03'].type).toBe('B');

  // Planejar de novo a mesma semana não muda nada
  await page.getByRole('button', { name: 'Planejar semana' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Planejar' }).click();
  await expect(page.locator('#status')).toContainText('Nada a agendar');
});

test('planejar a semana atual não agenda dias que já passaram', async ({ page }) => {
  await page.getByRole('button', { name: 'Planejar semana' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.plan-preview li').first()).toHaveText('seg 23/11 já passou; não será agendado');
  await dialog.getByRole('button', { name: 'Planejar' }).click();
  await expect(page.locator('#status')).toContainText('3 sessões agendadas.');
  const data = await stored(page);
  expect(Object.keys(data.sessions).sort()).toEqual(['2026-11-24', '2026-11-26', '2026-11-27']);
});

test('sessão concluída aparece no calendário e conta na semana', async ({ page }) => {
  await page.goto('./#sessao/2026-11-23');
  await page.getByRole('button', { name: 'Começar treino' }).click();
  await page.getByRole('list', { name: 'Exercícios da sessão' }).getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Concluir sessão' }).click();
  await expect(page.locator('.badge')).toHaveText('Concluída');

  await page.goto('./#calendario');
  await expect(day(page, '2026-11-23')).toHaveAttribute('aria-label', 'segunda-feira, 23 de novembro: Treino A · concluído');
  await expect(day(page, '2026-11-23')).toHaveAttribute('data-status', 'done');
  await expect(page.getByText('1 de 4 treinos concluídos')).toBeVisible();

  await page.getByRole('button', { name: 'Mês', exact: true }).click();
  await expect(day(page, '2026-11-23').locator('.type-chip')).toHaveText('A');
});

test('sem rolagem horizontal em 360px nas duas visões', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(await overflow()).toBe(false);
  await page.getByRole('button', { name: 'Mês', exact: true }).click();
  expect(await overflow()).toBe(false);
});
