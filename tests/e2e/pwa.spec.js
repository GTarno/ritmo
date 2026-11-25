import { test, expect, dialogClosed } from './fixtures.js';

// Terça-feira, 24/11/2026, 18h em São Paulo
const NOW = new Date('2026-11-24T18:00:00-03:00');

/** Espera o service worker instalar e assumir o controle da página. */
async function waitForServiceWorker(page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined, null, {
    timeout: 15_000,
  });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('manifest e ícones são servidos e válidos', async ({ page, request, baseURL }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const res = await request.get(new URL(href, baseURL).href);
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await res.json();
  expect(manifest).toMatchObject({ short_name: 'Ritmo', display: 'standalone', start_url: './' });
  for (const icon of manifest.icons) {
    const img = await request.get(new URL(icon.src, new URL(href, baseURL)).href);
    expect(img.ok(), icon.src).toBe(true);
    expect(img.headers()['content-type']).toBe('image/png');
  }
});

test('sem internet: o app abre e registra uma sessão completa', async ({ page, context }) => {
  await page.goto('./');
  await waitForServiceWorker(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Visão geral');

  // Fluxo completo sem rede: abrir, marcar, concluir
  await page.getByRole('link', { name: 'Começar treino de hoje' }).click();
  await page.getByRole('button', { name: 'Começar treino' }).click();
  await page.getByRole('list', { name: 'Exercícios da sessão' }).getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Concluir sessão' }).click();
  await expect(page.locator('.badge')).toHaveText('Concluída');

  // Todas as telas abrem offline
  for (const [route, title] of [
    ['treino', 'Treino AB'],
    ['calendario', 'Calendário'],
    ['evolucao', 'Evolução'],
    ['diario', 'Diário'],
    ['dados', 'Seus dados'],
  ]) {
    await page.goto(`./#${route}`);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(title);
  }

  // Abrir o endereço de novo (navegação nova) também funciona offline
  await page.goto('./#calendario');
  await page.reload();
  await expect(page.locator('a[data-date="2026-11-24"]')).toHaveAttribute('data-status', 'done');
  await context.setOffline(false);
});

test('versão nova: avisa e atualiza quando a usuária toca em "Atualizar"', async ({ page, context }) => {
  let version = 'v1';
  await context.route('**/ritmo/sw.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
    await route.fulfill({ response, body });
  });

  await page.goto('./');
  await waitForServiceWorker(page);
  const firstCache = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('ritmo-')));
  expect(firstCache).toEqual(['ritmo-v1']);

  // Deploy novo: o sw.js muda; ao recarregar, o navegador baixa e instala a versão nova
  version = 'v2';
  await page.reload();
  const toast = page.locator('#status');
  await expect(toast).toContainText('Nova versão do Ritmo disponível.', { timeout: 15_000 });

  await Promise.all([page.waitForEvent('load'), toast.getByRole('button', { name: 'Atualizar' }).click()]);
  // A checagem de atualização feita pelo próprio navegador pode não passar pelo
  // context.route; nesse caso a versão nova é a do servidor local. Em qualquer
  // caso, o cache da v1 precisa ter sido trocado por um único cache novo.
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('ritmo-'))), { timeout: 15_000 })
    .toEqual([expect.not.stringMatching(/^ritmo-v1$/)]);
  await expect(page.locator('#status')).not.toContainText('Nova versão');
});

test('"Usar como app" mostra as instruções do aparelho', async ({ page, isMobile }) => {
  await page.goto('./#dados');
  const card = page.getByRole('region', { name: 'Usar como app' });
  await expect(card).toContainText('funciona sem internet');
  await expect(card.locator('.install-steps')).toContainText(isMobile ? 'menu ⋮' : 'Adicionar à tela inicial');
});

test('convite de instalação do navegador vira o botão "Instalar o Ritmo"', async ({ page }) => {
  await page.goto('./#dados');
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = () => {
      window.__prompted = true;
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });
  const button = page.getByRole('button', { name: 'Instalar o Ritmo' });
  await expect(button).toBeVisible();
  await button.click();
  expect(await page.evaluate(() => window.__prompted)).toBe(true);
  await expect(button).toHaveCount(0);
});

test('dados gravados offline continuam lá quando a internet volta', async ({ page, context }) => {
  await page.goto('./#diario');
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Novo registro' }).click();
  await page.getByRole('dialog').getByLabel('Descrição').fill('Registrado sem internet');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await dialogClosed(page);
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText('Registrado sem internet')).toBeVisible();
});
