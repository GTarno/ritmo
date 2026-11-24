import { test, expect, ROUTES } from './fixtures.js';

test.describe('menu', () => {
  test('no celular fica fixo embaixo, com alvos de toque ≥ 44px', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'só no celular');
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    const box = await nav.boundingBox();
    const viewport = page.viewportSize();
    expect(Math.round(box.y + box.height)).toBe(viewport.height);

    for (const link of await nav.getByRole('link').all()) {
      const b = await link.boundingBox();
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
    }

    // O conteúdo não fica escondido atrás do menu
    const padding = await page.locator('#app').evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
    expect(padding).toBeGreaterThanOrEqual(box.height);
  });

  test('no desktop fica na lateral', async ({ page, isMobile }) => {
    test.skip(isMobile, 'só no desktop');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('./');
    const nav = await page.getByRole('navigation', { name: 'Principal' }).boundingBox();
    const main = await page.locator('#app').boundingBox();
    expect(nav.x + nav.width).toBeLessThanOrEqual(main.x);
  });

  test('sem rolagem horizontal em 360px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const [route] of ROUTES) {
      await page.goto(`./#${route}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, route).toBe(false);
    }
  });
});

test.describe('teclado e foco', () => {
  test('link "Pular para o conteúdo" é o primeiro item do Tab', async ({ page }) => {
    await page.goto('./');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
  });

  test('navegar pelo menu com teclado move o foco para o título da tela', async ({ page }) => {
    await page.goto('./');
    const link = page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Diário' });
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#app h2')).toHaveText('Diário');
    await expect(page.locator('#app h2')).toBeFocused();
  });

  test('primeiro carregamento não rouba o foco', async ({ page }) => {
    await page.goto('./#treino');
    await expect(page.locator('#app h2')).not.toBeFocused();
  });
});

test.describe('estados vazios', () => {
  test('cada tela explica o que vai aparecer ali', async ({ page }) => {
    for (const [route] of ROUTES) {
      await page.goto(`./#${route}`);
      await expect(page.locator('#app .empty-state')).toBeVisible();
    }
  });

  test('ação do estado vazio leva à tela certa', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('link', { name: 'Abrir calendário' }).click();
    await expect(page.locator('#app h2')).toHaveText('Calendário');
  });
});

test.describe('diálogo', () => {
  const open = (page, opts) =>
    page.evaluate(async (o) => {
      const { confirmDialog } = await import('./js/ui/dialog.js');
      const btn = document.createElement('button');
      btn.id = 'opener';
      btn.textContent = 'Abrir';
      document.getElementById('app').append(btn);
      btn.focus();
      window.__result = 'pendente';
      confirmDialog('Remover esta sessão?', o).then((r) => (window.__result = r));
    }, opts);
  const result = (page) => page.evaluate(() => window.__result);

  test.beforeEach(async ({ page }) => page.goto('./'));

  test('confirmar resolve true e devolve o foco a quem abriu', async ({ page }) => {
    await open(page, { title: 'Remover sessão', confirmLabel: 'Remover', danger: true });
    const dialog = page.getByRole('dialog', { name: 'Remover sessão' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Remover' }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => result(page)).toBe(true);
    await expect(page.locator('#opener')).toBeFocused();
  });

  test('cancelar resolve false', async ({ page }) => {
    await open(page, {});
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    await expect.poll(() => result(page)).toBe(false);
  });

  test('Esc fecha e resolve false', async ({ page }) => {
    await open(page, {});
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => result(page)).toBe(false);
    await expect(page.locator('#opener')).toBeFocused();
  });

  test('botão fechar resolve false', async ({ page }) => {
    await open(page, {});
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
    await expect.poll(() => result(page)).toBe(false);
  });

  test('Tab fica preso dentro do diálogo', async ({ page }) => {
    await open(page, {});
    const dialog = page.getByRole('dialog');
    for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      const inside = await dialog.evaluate((d) => d.contains(document.activeElement));
      expect(inside, key).toBe(true);
    }
  });
});

test.describe('avisos de status', () => {
  test.beforeEach(async ({ page }) => page.goto('./'));

  test('aviso informativo aparece e some sozinho', async ({ page }) => {
    await page.evaluate(async () => {
      const { showStatus } = await import('./js/ui/status.js');
      showStatus('Sessão salva', { timeout: 300 });
    });
    await expect(page.locator('#status')).toContainText('Sessão salva');
    await expect(page.locator('#status')).toBeEmpty();
  });

  test('erro fica até ser fechado e usa role="alert"', async ({ page }) => {
    await page.evaluate(async () => {
      const { showStatus } = await import('./js/ui/status.js');
      showStatus('Não foi possível salvar', { type: 'error' });
    });
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Não foi possível salvar');
    await page.waitForTimeout(500);
    await expect(alert).toBeVisible();
    await alert.getByRole('button', { name: 'Fechar aviso' }).click();
    await expect(page.locator('#status')).toBeEmpty();
  });

  test('texto do aviso não é interpretado como HTML', async ({ page }) => {
    await page.evaluate(async () => {
      const { showStatus } = await import('./js/ui/status.js');
      showStatus('<img src=x onerror="window.__xss=1">');
    });
    await expect(page.locator('#status')).toContainText('<img src=x');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });
});
