import { test, expect } from './fixtures.js';

const NOW = new Date('2026-11-24T18:00:00-03:00');

/** Dados gravados por uma versão anterior do app (formato v1: modelos { A, B }). */
async function writeV1(page) {
  await page.evaluate(async () => {
    const { createInitialState } = await import('./js/domain/initial-state.js');
    const v2 = createInitialState();
    const plans = Object.fromEntries(v2.plans.map(({ id, name, cardio, exercises }) => [id, { name, cardio, exercises }]));
    plans.B.name = 'Pernas';
    plans.A.exercises[0].load = 12;
    const data = {
      ...v2,
      plans,
      sessions: {
        '2026-11-23': {
          date: '2026-11-23',
          type: 'A',
          done: true,
          exercises: plans.A.exercises.map((e, i) => ({ ...e, plannedLoad: e.load ?? null, checked: i === 0, load: i === 0 ? 12 : null })),
          cardio: '10 min',
          cardioDone: true,
          notes: 'Bom treino',
        },
        '2026-11-26': { date: '2026-11-26', type: 'B', done: false },
      },
      measurements: [{ date: '2026-11-20', weight: 68.4, waist: null, hips: null, chest: null, thigh: null }],
      notes: [{ id: 'n1', date: '2026-11-22', category: 'dor', plan: 'B', text: 'Joelho', intensity: 3 }],
    };
    localStorage.setItem('ritmo:v1', JSON.stringify({ schemaVersion: 1, data }));
  });
}

test('quem já usa o app encontra tudo igual depois da atualização do formato', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('./');
  await writeV1(page);
  await page.reload();

  await expect(page.locator('#status')).toContainText('Seus dados foram atualizados para o novo formato.');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:v1')));
  expect(saved.schemaVersion).toBe(2);
  expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('ritmo:pre-migration:v1:')))).toBe(true);

  // Treino: A e B com os nomes e cargas de antes
  await page.goto('./#treino');
  await expect(page.getByRole('heading', { name: 'Treino A — Superiores e core' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Exercícios do treino A' }).getByRole('listitem').first()).toContainText('12 kg');
  await page.getByRole('button', { name: 'Treino B' }).click();
  await expect(page.getByRole('heading', { name: 'Treino B — Pernas' })).toBeVisible();

  // Sessão concluída e agendamento
  await page.goto('./#sessao/2026-11-23');
  await expect(page.locator('.badge')).toHaveText('Concluída');
  await expect(page.getByText('Treino A — Superiores e core')).toBeVisible();
  await page.goto('./#sessao/2026-11-26');
  await expect(page.locator('.badge')).toHaveText('Planejada');
  await expect(page.getByRole('radio', { name: 'Treino B — Pernas' })).toBeChecked();

  // Evolução e diário
  await page.goto('./#evolucao');
  await expect(page.getByRole('region', { name: 'Carga por exercício' }).getByRole('img')).toHaveAttribute('aria-label', /última 12 kg em 23\/11/);
  await page.goto('./#diario');
  await expect(page.getByRole('list', { name: 'Registros do diário' })).toContainText('Joelho');
  await expect(page.getByRole('list', { name: 'Registros do diário' })).toContainText('Treino B');
});
