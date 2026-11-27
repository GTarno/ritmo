import { test, expect, dialogClosed } from './fixtures.js';

/**
 * Substitui navigator.storage por uma versão controlada pelo teste.
 * persisted: situação inicial; grant: o que persist() responde; null = sem a API.
 */
async function fakeStorage(page, { persisted = false, grant = false, usage = 12 * 1024 } = {}) {
  await page.addInitScript(
    ({ persisted, grant, usage }) => {
      window.__persistCalls = 0;
      if (persisted === null) {
        Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
        return;
      }
      let state = persisted;
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          persisted: async () => state,
          persist: async () => {
            window.__persistCalls++;
            state = grant;
            return grant;
          },
          estimate: async () => ({ usage, quota: 1024 ** 3 }),
          getDirectory: navigator.storage?.getDirectory?.bind(navigator.storage),
        },
      });
    },
    { persisted, grant, usage },
  );
}

const card = (page) => page.getByRole('region', { name: 'Proteção dos dados' });
const persistCalls = (page) => page.evaluate(() => window.__persistCalls);

test('pede proteção uma vez, só depois da primeira gravação', async ({ page }) => {
  await fakeStorage(page, { grant: true });
  await page.goto('./#diario');
  expect(await persistCalls(page)).toBe(0); // abrir o app não pede nada

  for (const text of ['Primeiro registro', 'Segundo registro']) {
    await page.getByRole('button', { name: 'Novo registro' }).click();
    await page.getByRole('dialog').getByLabel('Descrição').fill(text);
    await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
    await dialogClosed(page);
  }
  await expect.poll(() => persistCalls(page)).toBe(1);
});

test('não pede de novo se já está protegido', async ({ page }) => {
  await fakeStorage(page, { persisted: true });
  await page.goto('./#diario');
  await page.getByRole('button', { name: 'Novo registro' }).click();
  await page.getByRole('dialog').getByLabel('Descrição').fill('Registro');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await dialogClosed(page);
  await page.waitForTimeout(200);
  expect(await persistCalls(page)).toBe(0);
});

test('protegido: mostra a situação e o espaço usado', async ({ page }) => {
  await fakeStorage(page, { persisted: true, usage: 1536 });
  await page.goto('./#dados');
  await expect(card(page)).toContainText('Protegido.');
  await expect(card(page)).toContainText('Espaço usado pelo app neste navegador: 1,5 KB.');
  await expect(card(page).getByRole('button', { name: 'Pedir proteção ao navegador' })).toHaveCount(0);
});

test('não protegido: explica o risco, recomenda instalar e backup, e permite pedir', async ({ page }) => {
  await fakeStorage(page, { persisted: false, grant: true });
  await page.goto('./#dados');
  await expect(card(page)).toContainText('Não protegido.');
  await expect(card(page)).toContainText('Instale o app');
  await expect(card(page)).toContainText('Faça backups com frequência.');

  await card(page).getByRole('button', { name: 'Pedir proteção ao navegador' }).click();
  await expect(page.locator('#status')).toContainText('o navegador vai proteger os dados');
  await expect(card(page)).toContainText('Protegido.');
  await expect(page.getByRole('heading', { name: 'Proteção dos dados' })).toBeFocused();
});

test('pedido recusado pelo navegador: avisa e continua mostrando como não protegido', async ({ page }) => {
  await fakeStorage(page, { persisted: false, grant: false });
  await page.goto('./#dados');
  await card(page).getByRole('button', { name: 'Pedir proteção ao navegador' }).click();
  await expect(page.locator('#status')).toContainText('não liberou a proteção agora');
  await expect(card(page)).toContainText('Não protegido.');
});

test('navegador sem a API: recomenda backup, sem erros', async ({ page }) => {
  await fakeStorage(page, { persisted: null });
  await page.goto('./#dados');
  await expect(card(page)).toContainText('não informa se protege os dados');
});
