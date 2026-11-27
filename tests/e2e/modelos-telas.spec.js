import AxeBuilder from '@axe-core/playwright';
import { test, expect, hasHorizontalOverflow } from './fixtures.js';

// Sessão, calendário e painel com 1, 2 e 4 modelos de treino.
const NOW = new Date('2026-11-24T18:00:00-03:00'); // terça

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const axe = async (page) => (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => v.id);
const day = (page, date) => page.locator(`a[data-date="${date}"]`);
const region = (page, name) => page.getByRole('region', { name });

/**
 * Monta o estado direto pelas regras de domínio e recarrega.
 * plans: 1 (só A), 2 (A e B) ou 4 (A, B, C — Corpo todo, D — Glúteos).
 * sessions: [data, rótulo, 'planned' | 'in-progress' | 'done'].
 */
async function setup(page, { plans = 2, sessions = [], removeAfter = [] } = {}) {
  await page.evaluate(
    async ({ plans, sessions, removeAfter }) => {
      const { app } = await import('./js/app-state.js');
      const M = await import('./js/domain/models.js');
      const S = await import('./js/domain/sessions.js');
      const ctx = app.ctx();
      let s = app.state;
      if (plans === 1) s = M.removePlan(s, 'B', ctx).state;
      if (plans >= 3) s = M.createPlan(s, { label: 'C', name: 'Corpo todo', color: 'turquesa' }, ctx).state;
      if (plans >= 4) s = M.createPlan(s, { label: 'D', name: 'Glúteos', color: 'amarelo' }, ctx).state;
      const idOf = (label) => s.plans.find((p) => p.label === label).id;
      for (const [date, label, status] of sessions) {
        if (status === 'planned') s = S.scheduleSession(s, date, idOf(label));
        else s = S.openSession(s, date, idOf(label), ctx.today).state;
        if (status === 'done') {
          s = { ...s, sessions: { ...s.sessions, [date]: { ...s.sessions[date], cardioDone: true } } };
          s = S.completeSession(s, date);
        }
      }
      for (const label of removeAfter) s = M.removePlan(s, idOf(label), ctx).state;
      app.commit(s);
    },
    { plans, sessions, removeAfter },
  );
  await page.reload();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('./');
});

test('4 treinos: calendário semanal e mensal com rótulo, cor e legenda', async ({ page }) => {
  await setup(page, {
    plans: 4,
    sessions: [
      ['2026-11-23', 'A', 'in-progress'],
      ['2026-11-25', 'C', 'planned'],
      ['2026-11-27', 'D', 'planned'],
    ],
  });
  await page.goto('./#calendario');
  await expect(day(page, '2026-11-25')).toHaveAccessibleName(/^quarta\s*,\s*25\/11\s*:\s*Treino C — Corpo todo · planejado$/);
  await expect(day(page, '2026-11-27')).toHaveAccessibleName(/Treino D — Glúteos · planejado$/);
  await expect(day(page, '2026-11-23')).toHaveAccessibleName(/Treino A — Superiores e core · em andamento$/);
  await expect(day(page, '2026-11-25').locator('.type-chip')).toHaveAttribute('style', /--plan-turquesa/);

  await page.getByRole('button', { name: 'Mês', exact: true }).click();
  await expect(day(page, '2026-11-27').locator('.type-chip')).toHaveText('Treino D');
  await expect(day(page, '2026-11-27')).toHaveAccessibleName(/: Treino D planejado$/);
  const legend = page.getByRole('region', { name: 'Treinos' });
  await expect(legend.locator('.plan-name')).toHaveText([
    'Treino A — Superiores e core',
    'Treino B — Inferiores',
    'Treino C — Corpo todo',
    'Treino D — Glúteos',
  ]);
  await expect(page.getByRole('region', { name: 'Situação' }).getByRole('listitem')).toContainText([
    'Planejado (contorno)',
    'Em andamento (tracejado)',
    'Concluído (cheio)',
  ]);
});

test('4 treinos: mês legível e acessível em 320px, nos temas claro e escuro', async ({ page }) => {
  await setup(page, {
    plans: 4,
    sessions: [
      ['2026-11-23', 'A', 'done'],
      ['2026-11-24', 'B', 'in-progress'],
      ['2026-11-25', 'C', 'planned'],
      ['2026-11-27', 'D', 'planned'],
    ],
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('./#calendario');
  await page.getByRole('button', { name: 'Mês', exact: true }).click();
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await hasHorizontalOverflow(page)).toBe(false);
    // Cada bolinha cabe inteira na célula do dia
    const clipped = await page.$$eval('.day-cell .type-chip', (chips) =>
      chips.filter((c) => {
        const cell = c.closest('.day-cell').getBoundingClientRect();
        const r = c.getBoundingClientRect();
        return r.left < cell.left || r.right > cell.right;
      }).length,
    );
    expect(clipped).toBe(0);
    expect(await axe(page), scheme).toEqual([]);
  }
});

test('4 treinos: painel mostra rótulo nas bolinhas, nome na sugestão e no próximo planejado', async ({ page }) => {
  await setup(page, {
    plans: 4,
    sessions: [
      ['2026-11-23', 'C', 'done'],
      ['2026-11-25', 'C', 'planned'],
      ['2026-11-27', 'D', 'planned'],
    ],
  });
  await expect(region(page, 'Treino de hoje')).toContainText('Sugestão: Treino B — Inferiores.');
  await expect(region(page, 'Treino de hoje').getByRole('link', { name: /Próximo|qua/ }).last()).toHaveText('qua 25/11 · Treino C — Corpo todo');
  const strip = page.getByRole('list', { name: 'Dias desta semana' });
  await expect(strip.getByRole('link').nth(2)).toHaveAccessibleName(/treino C planejado$/);
  await expect(strip.getByRole('link').nth(4)).toHaveAccessibleName(/treino D planejado$/);
  await expect(strip.locator('.type-chip')).toHaveText(['treino C', 'treino C', 'treino D']);
  await expect(region(page, 'Histórico recente')).toContainText('Treino C — Corpo todo');
  expect(await axe(page)).toEqual([]);

  await page.setViewportSize({ width: 320, height: 700 });
  expect(await hasHorizontalOverflow(page)).toBe(false);
});

test('4 treinos: a sessão oferece todos os modelos', async ({ page }) => {
  await setup(page, { plans: 4 });
  await page.goto('./#sessao/2026-11-28');
  const group = page.getByRole('group', { name: 'Modelo' });
  await expect(group.getByRole('radio')).toHaveCount(4);
  await group.getByRole('radio', { name: 'Treino D — Glúteos' }).check();
  await page.getByRole('button', { name: 'Agendar' }).click();
  await expect(page.locator('#status')).toContainText('Treino D agendado para 28/11.');
  await page.goto('./#calendario');
  await expect(day(page, '2026-11-28')).toHaveAccessibleName(/Treino D — Glúteos · planejado$/);
});

test('2 treinos: legenda com A e B e semana padrão de sempre', async ({ page }) => {
  await page.goto('./#calendario');
  await page.getByRole('button', { name: 'Mês', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Treinos' }).locator('.plan-name')).toHaveText([
    'Treino A — Superiores e core',
    'Treino B — Inferiores',
  ]);
  await page.getByRole('button', { name: 'Planejar semana' }).click();
  await expect(page.getByRole('dialog')).toContainText('Semana padrão: seg A · ter B · qui A · sex B.');
  await page.goto('./#sessao/2026-11-28');
  await expect(page.getByRole('group', { name: 'Modelo' }).getByRole('radio')).toHaveCount(2);
});

test('1 treino: dias do modelo removido ficam livres e a sugestão usa o treino que sobrou', async ({ page }) => {
  await setup(page, { plans: 1 });
  await expect(region(page, 'Treino de hoje')).toContainText('Sugestão: Treino A — Superiores e core.');

  await page.goto('./#calendario');
  await page.getByRole('button', { name: 'Planejar semana' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Semana padrão: seg A · qui A.');
  await dialog.getByLabel('Uma data da semana').fill('2026-12-02');
  await dialog.getByLabel('Uma data da semana').dispatchEvent('change');
  await expect(dialog.locator('.plan-preview li')).toHaveText(['seg 30/11 Treino A — será agendado', 'qui 03/12 Treino A — será agendado']);
  await dialog.getByRole('button', { name: 'Planejar' }).click();
  await expect(page.locator('#status')).toContainText('2 sessões agendadas.');
  await expect(day(page, '2026-12-01')).toHaveAccessibleName(/Livre$/);

  await page.getByRole('button', { name: 'Mês', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Treinos' }).locator('.plan-name')).toHaveText(['Treino A — Superiores e core']);

  await page.goto('./#sessao/2026-11-28');
  await expect(page.getByRole('group', { name: 'Modelo' }).getByRole('radio')).toHaveCount(1);
});

test('sessão de um modelo removido continua abrindo com o nome guardado', async ({ page }) => {
  await setup(page, { plans: 3, sessions: [['2026-11-23', 'C', 'done']], removeAfter: ['C'] });

  await page.goto('./#sessao/2026-11-23');
  await expect(page.locator('.badge')).toHaveText('Concluída');
  await expect(page.getByText('Treino C — Corpo todo')).toBeVisible();

  await page.goto('./#calendario');
  await expect(day(page, '2026-11-23')).toHaveAccessibleName(/Treino C — Corpo todo · concluído$/);
  await expect(day(page, '2026-11-23').locator('.type-chip')).toHaveAttribute('style', /--plan-none/);

  await page.goto('./');
  await expect(region(page, 'Histórico recente')).toContainText('Treino C — Corpo todo');
  expect(await axe(page)).toEqual([]);
});
