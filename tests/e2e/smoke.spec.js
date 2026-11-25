import { test, expect, ROUTES, hasHorizontalOverflow } from './fixtures.js';

test('abre na visão geral', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#app h2')).toHaveText('Visão geral');
  await expect(page).toHaveTitle('Visão geral — Ritmo');
});

test('navega pelas 5 áreas pelo menu', async ({ page }) => {
  await page.goto('./');
  const nav = page.getByRole('navigation', { name: 'Principal' });
  for (const [route, title, label] of ROUTES) {
    await nav.getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    await expect(page.locator('#app h2')).toHaveText(title);
    await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
  }
});

test('botão voltar do navegador troca de tela', async ({ page }) => {
  await page.goto('./#treino');
  await page.goto('./#diario');
  await page.goBack();
  await expect(page.locator('#app h2')).toHaveText('Treino AB');
});

test('rota inexistente cai na visão geral', async ({ page }) => {
  await page.goto('./#nao-existe');
  await expect(page.locator('#app h2')).toHaveText('Visão geral');
});

test('sem rolagem horizontal em 320px (iPhone SE) em todas as telas', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const route of [...ROUTES.map(([r]) => r), 'dados', 'sessao/2026-11-24']) {
    await page.goto(`./#${route}`);
    const overflow = await hasHorizontalOverflow(page);
    expect(overflow, route).toBe(false);
  }
});

test('dados salvos continuam após recarregar', async ({ page }) => {
  await page.goto('./');
  const saved = await page.evaluate(async () => {
    const { app } = await import('./js/main.js');
    app.state.target = 6;
    return app.save();
  });
  expect(saved).toBe(true);

  await page.reload();
  const target = await page.evaluate(async () => (await import('./js/main.js')).app.state.target);
  expect(target).toBe(6);
  await expect(page.locator('#status')).toBeEmpty();
});

test('dado corrompido gera aviso de erro e cópia de segurança', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.setItem('ritmo:v1', '{quebrado'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Uma cópia foi preservada');
  const copies = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('ritmo:corrupt:')),
  );
  expect(copies).toHaveLength(1);
});
