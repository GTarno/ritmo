import AxeBuilder from '@axe-core/playwright';
import { test, expect, hasHorizontalOverflow } from './fixtures.js';

// Terça-feira, 24/11/2026, 18h em São Paulo
const NOW = new Date('2026-11-24T18:00:00-03:00');
const TODAY = '2026-11-24';

const timer = (page) => page.getByRole('region', { name: 'Descanso' });
const clock = (page) => timer(page).getByRole('timer');
const row = (page, name) => page.getByRole('list', { name: 'Exercícios da sessão' }).getByRole('listitem').filter({ hasText: name });

/** Registra chamadas de vibração, Wake Lock e áudio para conferir nos testes. */
async function spyDevice(page) {
  await page.addInitScript(() => {
    window.__calls = { vibrate: [], wakeLock: 0, released: 0, beeps: 0 };
    navigator.vibrate = (pattern) => {
      window.__calls.vibrate.push(pattern);
      return true;
    };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          window.__calls.wakeLock++;
          return { release: async () => window.__calls.released++, addEventListener() {} };
        },
      },
    });
    window.AudioContext = class {
      constructor() {
        this.currentTime = 0;
        this.destination = {};
        window.__calls.beeps++;
      }
      createOscillator() {
        return { frequency: {}, connect: (g) => g, start() {}, stop() {} };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (d) => d };
      }
      close() {}
    };
  });
}
const calls = (page) => page.evaluate(() => window.__calls);

async function openSessionA(page) {
  await page.goto(`./#sessao/${TODAY}`);
  await page.getByRole('radio', { name: /Treino A/ }).check();
  await page.getByRole('button', { name: 'Começar treino' }).click();
}

test.beforeEach(async ({ page }) => {
  await spyDevice(page);
  await page.clock.install({ time: NOW });
});

test('descanso do exercício: conta, ajusta ±15 s e avisa ao terminar', async ({ page }) => {
  await openSessionA(page);
  const button = row(page, 'Supino na máquina').getByRole('button', { name: 'Descansar 1:15' });
  await expect(button).toHaveAccessibleDescription('Supino na máquina');
  await button.click();

  await expect(timer(page)).toContainText('Supino na máquina');
  await expect(clock(page)).toHaveText('1:15');
  expect((await calls(page)).wakeLock).toBe(1); // tela continua ligada

  await page.clock.runFor(15_000);
  await expect(clock(page)).toHaveText('1:00');

  await timer(page).getByRole('button', { name: '+15 segundos' }).click();
  await expect(clock(page)).toHaveText('1:15');
  await timer(page).getByRole('button', { name: '−15 segundos' }).click();
  await timer(page).getByRole('button', { name: '−15 segundos' }).click();
  await expect(clock(page)).toHaveText('0:45');

  await page.clock.runFor(45_000);
  await expect(timer(page)).toHaveCount(0);
  await expect(page.locator('#status')).toContainText('Descanso terminado. Próxima série de Supino na máquina!');
  const c = await calls(page);
  expect(c.vibrate).toHaveLength(1);
  expect(c.released).toBe(1); // tela liberada ao terminar
  expect(c.beeps).toBe(0); // bipe vem desligado
});

test('"Pular" encerra sem aviso e libera a tela', async ({ page }) => {
  await openSessionA(page);
  await row(page, 'Remada sentada').getByRole('button', { name: /Descansar/ }).click();
  await timer(page).getByRole('button', { name: 'Pular' }).click();
  await expect(timer(page)).toHaveCount(0);
  await expect(page.locator('#status')).not.toContainText('Descanso terminado');
  const c = await calls(page);
  expect(c.vibrate).toHaveLength(0);
  expect(c.released).toBe(1);
});

test('tempo certo depois de a tela ficar bloqueada (salto no relógio)', async ({ page }) => {
  await openSessionA(page);
  await row(page, 'Supino na máquina').getByRole('button', { name: /Descansar/ }).click();
  // fastForward pula o tempo de uma vez, como o celular com a tela bloqueada
  await page.clock.fastForward(50_000);
  await expect(clock(page)).toHaveText('0:25');
  await page.clock.fastForward(60_000);
  await expect(timer(page)).toHaveCount(0);
  await expect(page.locator('#status')).toContainText('Descanso terminado');
});

test('continua contando ao trocar de tela e depois de recarregar', async ({ page }) => {
  await openSessionA(page);
  await row(page, 'Supino na máquina').getByRole('button', { name: /Descansar/ }).click();
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Evolução' }).click();
  await expect(timer(page)).toBeVisible();
  await page.clock.runFor(10_000);
  await expect(clock(page)).toHaveText('1:05');

  await page.reload();
  await expect(clock(page)).toHaveText(/1:0[45]/);
});

test('bipe opcional: liga, fica lembrado e toca ao terminar', async ({ page }) => {
  await openSessionA(page);
  await row(page, 'Prancha').getByRole('button', { name: /Descansar/ }).click();
  const toggle = timer(page).getByRole('button', { name: 'Bipe ao terminar' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toBeFocused();
  await page.clock.runFor(76_000);
  await expect(page.locator('#status')).toContainText('Descanso terminado');
  expect((await calls(page)).beeps).toBe(1);

  // Lembrado para o próximo descanso
  await row(page, 'Prancha').getByRole('button', { name: /Descansar/ }).click();
  await expect(timer(page).getByRole('button', { name: 'Bipe ao terminar' })).toHaveAttribute('aria-pressed', 'true');
});

test('exercício sem intervalo usa 1 minuto; sessão concluída não mostra o botão', async ({ page }) => {
  await page.goto('./#treino');
  await page.getByRole('button', { name: 'Editar Puxada frontal' }).click();
  await page.getByRole('dialog').getByLabel('Intervalo').fill('');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('dialog')).toHaveCount(0);

  await openSessionA(page);
  await expect(row(page, 'Puxada frontal').getByRole('button', { name: 'Descansar 1:00' })).toBeVisible();

  await row(page, 'Puxada frontal').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Concluir sessão' }).click();
  await expect(page.locator('.badge')).toHaveText('Concluída');
  await expect(page.getByRole('button', { name: /Descansar/ })).toHaveCount(0);
});

test('timer acessível e sem rolagem horizontal em 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openSessionA(page);
  await row(page, 'Desenvolvimento na máquina').getByRole('button', { name: /Descansar/ }).click();
  await expect(timer(page)).toBeVisible();
  expect(await hasHorizontalOverflow(page)).toBe(false);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 120)).join(' || ')}`)).toEqual([]);

  // No topo da página, o título da tela não fica escondido atrás do timer
  await page.evaluate(() => window.scrollTo(0, 0));
  const timerBox = await timer(page).boundingBox();
  const headingBox = await page.getByRole('heading', { level: 2 }).boundingBox();
  expect(headingBox.y).toBeGreaterThanOrEqual(timerBox.y + timerBox.height);
});
