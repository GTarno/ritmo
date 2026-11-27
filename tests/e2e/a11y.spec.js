// Varredura automática de acessibilidade (axe-core, WCAG 2.1 A e AA) em todas as
// telas e janelas, com dados de exemplo, nos temas claro e escuro.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, hasHorizontalOverflow } from './fixtures.js';

const NOW = new Date('2026-11-24T18:00:00-03:00');

/** Estado com sessões, medidas, diário e lembrete de backup, para as telas terem conteúdo. */
async function seed(page) {
  await page.goto('./');
  await page.evaluate(async () => {
    const { app } = await import('./js/app-state.js');
    const S = await import('./js/domain/sessions.js');
    const C = await import('./js/domain/calendar.js');
    let s = app.state;
    const days = ['2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17', '2026-11-20', '2026-11-23'];
    days.forEach((d, i) => {
      const o = S.openSession(s, d, i % 2 ? 'B' : 'A', '2026-11-24');
      const v = S.parseSessionForm({
        exercises: o.session.exercises.map((e, j) => ({ id: e.id, checked: j < 3, load: String(10 + i + j) })),
        cardioDone: true,
        cardio: '10 min',
        notes: '',
      }).value;
      s = S.completeSession(o.state, d, v);
    });
    s = S.openSession(s, '2026-11-24', 'B', '2026-11-24').state; // em andamento
    s = C.planWeek(s, '2026-11-30', '2026-11-24').state;
    s = {
      ...s,
      measurements: [
        { date: '2026-11-01', weight: 70.2, waist: 82, hips: 99, chest: null, thigh: null },
        { date: '2026-11-20', weight: 68.4, waist: 81, hips: 98, chest: 92, thigh: 58 },
      ],
      notes: [
        { id: 'n1', date: '2026-11-22', category: 'dor', plan: 'B', text: 'Joelho incomodou', intensity: 4 },
        { id: 'n2', date: '2026-11-23', category: 'observacao', plan: null, text: 'Bom treino', intensity: null },
      ],
    };
    app.commit(s);
  });
}

async function scan(page, label) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} | ${n.html.slice(0, 160)}`),
  }));
  expect(summary, `violações de acessibilidade em ${label}`).toEqual([]);
}

const SCREENS = [
  ['painel', 'Visão geral'],
  ['treino', 'Treino AB'],
  ['calendario', 'Calendário'],
  ['sessao/2026-11-24', 'Hoje · terça-feira, 24 de novembro'],
  ['sessao/2026-11-23', 'segunda-feira, 23 de novembro'],
  ['sessao/2026-11-30', 'segunda-feira, 30 de novembro'],
  ['evolucao', 'Evolução'],
  ['diario', 'Diário'],
  ['dados', 'Seus dados'],
];

for (const scheme of ['light', 'dark']) {
  test.describe(`tema ${scheme === 'light' ? 'claro' : 'escuro'}`, () => {
    test.use({ colorScheme: scheme });

    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await seed(page);
    });

    test('todas as telas sem violações de acessibilidade', async ({ page }) => {
      for (const [route, heading] of SCREENS) {
        await page.goto(`./#${route}`);
        await expect(page.getByRole('heading', { level: 2 })).toHaveText(heading);
        await scan(page, `#${route}`);
      }
      // Calendário mensal e tabelas de dados abertas
      await page.goto('./#calendario');
      await page.getByRole('button', { name: 'Mês', exact: true }).click();
      await scan(page, 'calendário mensal');
      await page.goto('./#evolucao');
      for (const summary of await page.getByText('Ver dados em tabela').all()) await summary.click();
      await scan(page, 'evolução com tabelas abertas');
    });

    test('janelas e avisos sem violações de acessibilidade', async ({ page }) => {
      await page.goto('./#treino');
      await page.getByRole('button', { name: 'Editar Supino na máquina' }).click();
      await page.getByRole('dialog').getByLabel('Nome').fill('');
      await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click(); // com erro visível
      await scan(page, 'editar exercício com erro');
      await page.keyboard.press('Escape');

      await page.goto('./#calendario');
      await page.getByRole('button', { name: 'Planejar semana' }).click();
      await scan(page, 'planejar semana');
      await page.keyboard.press('Escape');

      await page.goto('./#evolucao');
      await page.getByRole('button', { name: 'Registrar medidas' }).click();
      await scan(page, 'registrar medidas');
      await page.keyboard.press('Escape');

      await page.goto('./#diario');
      await page.getByRole('button', { name: 'Novo registro' }).click();
      await scan(page, 'novo registro no diário');
      await page.keyboard.press('Escape');

      await page.goto('./#painel');
      await page.evaluate(async () => {
        const { showStatus } = await import('./js/ui/status.js');
        showStatus('Nova versão do Ritmo disponível.', { timeout: 0, action: { label: 'Atualizar', onClick() {} } });
      });
      await scan(page, 'aviso com ação');
      await page.evaluate(async () => (await import('./js/ui/status.js')).showStatus('Erro de teste', { type: 'error' }));
      await scan(page, 'aviso de erro');
    });
  });
}

test.describe('larguras de tela', () => {
  for (const width of [320, 360, 390, 768, 1024, 1280]) {
    test(`${width}px: todas as telas sem rolagem horizontal`, async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await page.setViewportSize({ width, height: 800 });
      await seed(page);
      for (const [route] of SCREENS) {
        await page.goto(`./#${route}`);
        expect(await hasHorizontalOverflow(page), `#${route} em ${width}px`).toBe(false);
      }
    });
  }
});

test('movimento reduzido: nenhuma animação ou transição ativa', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(NOW);
  await seed(page);
  for (const [route] of SCREENS) {
    await page.goto(`./#${route}`);
    const animated = await page.evaluate(() =>
      [...document.querySelectorAll('*')].filter((el) => {
        const s = getComputedStyle(el);
        const dur = (v) => v.split(',').some((t) => parseFloat(t) > 0);
        return (s.animationName !== 'none' && dur(s.animationDuration)) || dur(s.transitionDuration);
      }).length,
    );
    expect(animated, `#${route}`).toBe(0);
  }
});

/** Aperta Tab até o elemento receber o foco (falha se não chegar em `max` passos). */
async function tabTo(page, locator, max = 80) {
  for (let i = 0; i < max; i++) {
    if (await locator.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`não chegou ao elemento com Tab: ${locator}`);
}

test('treino completo só com o teclado', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('./');

  await tabTo(page, page.getByRole('link', { name: 'Começar treino de hoje' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2 })).toBeFocused();

  await tabTo(page, page.getByRole('button', { name: 'Começar treino' }));
  await page.keyboard.press('Enter');
  const first = page.getByRole('list', { name: 'Exercícios da sessão' }).getByRole('checkbox').first();
  await expect(first).toBeFocused();
  await page.keyboard.press('Space');
  await expect(first).toBeChecked();

  await page.keyboard.press('Tab'); // carga do mesmo exercício
  await page.keyboard.type('15');

  await tabTo(page, page.getByRole('button', { name: 'Concluir sessão' }));
  await page.keyboard.press('Enter');
  await expect(page.locator('.badge')).toHaveText('Concluída');
  const load = await page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:v1')).data.sessions['2026-11-24'].exercises[0].load);
  expect(load).toBe(15);
});
