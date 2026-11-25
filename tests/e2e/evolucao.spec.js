import { test, expect, hasHorizontalOverflow, dialogClosed } from './fixtures.js';

// Terça-feira, 24/11/2026, 18h em São Paulo
const NOW = new Date('2026-11-24T18:00:00-03:00');
const TODAY = '2026-11-24';

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:v1'))?.data);
const region = (page, name) => page.getByRole('region', { name, exact: true });

async function seed(page, fn, arg) {
  await page.evaluate(
    async ({ src, arg }) => {
      const { app } = await import('./js/app-state.js');
      const S = await import('./js/domain/sessions.js');
      const P = await import('./js/domain/plans.js');
      // eslint-disable-next-line no-new-func
      const next = await new Function('app', 'S', 'P', 'arg', `return (${src})(app, S, P, arg);`)(app, S, P, arg);
      app.commit(next);
    },
    { src: fn.toString(), arg },
  );
  await page.reload();
}

/** Conclui sessões A com a carga do supino informada para cada data. */
const completeWithLoads = (app, S, P, list) => {
  let s = app.state;
  for (const [date, load] of list) {
    const o = S.openSession(s, date, 'A', '2026-11-24');
    const v = S.parseSessionForm({
      exercises: o.session.exercises.map((e, i) => ({ id: e.id, checked: i === 0 || e.id === 'a-prancha', load: i === 0 ? load : '' })),
      cardioDone: false,
      cardio: '',
      notes: '',
    }).value;
    s = S.completeSession(o.state, date, v);
  }
  return s;
};

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('./#evolucao');
});

test('estado vazio: gráficos explicam o que falta e a frequência aparece zerada', async ({ page }) => {
  await expect(region(page, 'Peso')).toContainText('Sem registros de peso');
  await expect(region(page, 'Medidas')).toContainText('Sem registros de cintura');
  await expect(region(page, 'Carga por exercício')).toContainText('Sem cargas de Supino na máquina');
  await expect(region(page, 'Frequência').getByRole('img')).toHaveAttribute('aria-label', /0 treinos nas últimas 8 semanas/);
  await expect(region(page, 'Registros corporais')).toContainText('Nenhum registro corporal');
});

test('registrar medidas: validação, gravação e gráfico de peso', async ({ page }) => {
  await page.getByRole('button', { name: 'Registrar medidas' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar medidas' });
  await expect(dialog.getByLabel('Data')).toHaveValue(TODAY);
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog.getByText('Informe pelo menos uma medida.')).toBeVisible();

  await dialog.getByLabel('Peso').fill('68,4');
  await dialog.getByLabel('Cintura').fill('abc');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog.getByLabel('Cintura')).toHaveAttribute('aria-invalid', 'true');
  await dialog.getByLabel('Cintura').fill('81');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#status')).toContainText('Medidas registradas');

  const data = await stored(page);
  expect(data.measurements).toEqual([{ date: TODAY, weight: 68.4, waist: 81, hips: null, chest: null, thigh: null }]);

  await expect(region(page, 'Peso').getByRole('img')).toHaveAttribute('aria-label', /último 68,4 kg em 24\/11/);
  await expect(region(page, 'Peso')).toContainText('68,4 kg');
  const row = region(page, 'Registros corporais').getByRole('row', { name: /24\/11\/2026/ });
  await expect(row).toContainText('68,4 kg');
  await expect(row).toContainText('81 cm');

  // O painel mostra o último peso
  await page.goto('./');
  await expect(page.getByRole('definition').nth(1)).toContainText('68,4 kg');
});

test('data futura é recusada', async ({ page }) => {
  await page.getByRole('button', { name: 'Registrar medidas' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Data').fill('2026-11-25');
  await dialog.getByLabel('Peso').fill('70');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog.getByText('A data não pode ser no futuro.')).toBeVisible();
});

test('um registro por data: escolher uma data existente carrega e substitui', async ({ page }) => {
  await seed(page, (app) => ({ ...app.state, measurements: [{ date: '2026-11-20', weight: 70, waist: 82, hips: null, chest: null, thigh: null }] }));
  await page.getByRole('button', { name: 'Registrar medidas' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Data').fill('2026-11-20');
  await dialog.getByLabel('Data').dispatchEvent('change');
  await expect(dialog.getByLabel('Peso')).toHaveValue('70');
  await expect(dialog).toContainText('os valores foram carregados para edição');
  await dialog.getByLabel('Peso').fill('69,5');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('#status')).toContainText('Registro de 20/11 atualizado');
  const data = await stored(page);
  expect(data.measurements).toHaveLength(1);
  expect(data.measurements[0]).toMatchObject({ weight: 69.5, waist: 82 });
});

test('editar e remover registro pela lista', async ({ page }) => {
  await seed(page, (app) => ({
    ...app.state,
    measurements: [
      { date: '2026-11-10', weight: 71, waist: null, hips: null, chest: null, thigh: null },
      { date: '2026-11-20', weight: 70, waist: null, hips: null, chest: null, thigh: null },
    ],
  }));
  await page.getByRole('button', { name: 'Editar registro de 10/11' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar medidas' });
  await expect(dialog.getByLabel('Peso')).toHaveValue('71');
  await dialog.getByLabel('Coxa').fill('58');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await dialogClosed(page);
  expect((await stored(page)).measurements[0].thigh).toBe(58);

  await page.getByRole('button', { name: 'Remover registro de 20/11' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await expect(region(page, 'Registros corporais').getByRole('row')).toHaveCount(2); // cabeçalho + 1
  expect((await stored(page)).measurements.map((m) => m.date)).toEqual(['2026-11-10']);
});

test('gráfico de medida segue o seletor', async ({ page }) => {
  await seed(page, (app) => ({
    ...app.state,
    measurements: [
      { date: '2026-11-10', weight: null, waist: 82, hips: 100, chest: null, thigh: null },
      { date: '2026-11-20', weight: null, waist: 81, hips: 99, chest: null, thigh: null },
    ],
  }));
  await expect(region(page, 'Medidas').getByRole('img')).toHaveAttribute('aria-label', /Cintura: 2 registros, último 81 cm/);
  await page.getByLabel('Medida', { exact: true }).selectOption({ label: 'Quadril' });
  await expect(region(page, 'Medidas').getByRole('img')).toHaveAttribute('aria-label', /Quadril: 2 registros, último 99 cm/);
  await expect(page.getByLabel('Medida', { exact: true })).toBeFocused();
  await page.getByLabel('Medida', { exact: true }).selectOption({ label: 'Tórax' });
  await expect(region(page, 'Medidas')).toContainText('Sem registros de tórax');
});

test('carga por exercício: últimas 12, histórico completo e tabela', async ({ page }) => {
  const list = Array.from({ length: 14 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, '0')}`, String(10 + i)]);
  await seed(page, completeWithLoads, list);
  const card = region(page, 'Carga por exercício');
  await expect(card.getByRole('img')).toHaveAttribute('aria-label', /Supino na máquina: 12 registros, última 23 kg em 14\/10/);

  await card.getByText('Ver dados em tabela').click();
  await expect(card.locator('.chart-table table tbody tr')).toHaveCount(12);
  await expect(card.locator('.chart-table table tbody tr').first()).toHaveText(/14\/10\s*23 kg/);

  await card.getByText('Histórico completo (14 registros)').click();
  await expect(card.locator('.load-history li')).toHaveCount(14);
});

test('carga do modelo editada depois não muda o histórico', async ({ page }) => {
  await seed(page, completeWithLoads, [['2026-11-23', '12']]);
  await page.goto('./#treino');
  await page.getByRole('button', { name: 'Editar Supino na máquina' }).click();
  await page.getByRole('dialog').getByLabel('Carga planejada').fill('14');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await dialogClosed(page);
  await page.goto('./#evolucao');
  await expect(region(page, 'Carga por exercício').getByRole('img')).toHaveAttribute('aria-label', /última 12 kg em 23\/11/);
});

test('exercício removido do modelo continua no seletor se tem histórico', async ({ page }) => {
  await seed(page, completeWithLoads, [['2026-11-23', '12']]);
  await page.goto('./#treino');
  for (const name of ['Prancha', 'Remada sentada']) {
    await page.getByRole('button', { name: `Remover ${name}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
    await dialogClosed(page);
  }

  await page.goto('./#evolucao');
  const options = page.getByLabel('Exercício').locator('option');
  await expect(options.filter({ hasText: 'Prancha (A) — fora do modelo' })).toHaveCount(1);
  await expect(options.filter({ hasText: 'Remada sentada' })).toHaveCount(0);
});

test('frequência conta sessões concluídas por semana', async ({ page }) => {
  await seed(page, completeWithLoads, [
    ['2026-11-23', '10'],
    [TODAY, '10'],
    ['2026-11-16', '10'],
  ]);
  const chart = region(page, 'Frequência').getByRole('img');
  await expect(chart).toHaveAttribute('aria-label', /3 treinos nas últimas 8 semanas, 2 nesta semana, meta de 4/);
  await region(page, 'Frequência').getByText('Ver dados em tabela').click();
  await expect(region(page, 'Frequência').locator('tbody tr').first()).toHaveText(/23\/11\s*2/);
});

test('tooltip por mouse e por teclado', async ({ page, isMobile }) => {
  await seed(page, (app) => ({
    ...app.state,
    measurements: [
      { date: '2026-11-01', weight: 71, waist: null, hips: null, chest: null, thigh: null },
      { date: '2026-11-10', weight: 70, waist: null, hips: null, chest: null, thigh: null },
      { date: '2026-11-20', weight: 69, waist: null, hips: null, chest: null, thigh: null },
    ],
  }));
  const plot = region(page, 'Peso').locator('.chart-plot');
  const tooltip = plot.locator('.chart-tooltip');

  await plot.focus();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('69 kg');
  await page.keyboard.press('ArrowLeft');
  await expect(tooltip).toContainText('70 kg');
  await expect(tooltip).toContainText('terça-feira, 10 de novembro');
  await page.keyboard.press('Home');
  await expect(tooltip).toContainText('71 kg');

  if (!isMobile) {
    await plot.blur();
    const box = await plot.boundingBox();
    await page.mouse.move(box.x + box.width - 70, box.y + box.height / 2);
    await expect(tooltip).toContainText('69 kg');
  }
});

test('sem rolagem horizontal em 360px com a tabela preenchida', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seed(page, (app) => ({
    ...app.state,
    measurements: [{ date: '2026-11-20', weight: 68.4, waist: 81, hips: 99.5, chest: 92, thigh: 58 }],
  }));
  expect(await hasHorizontalOverflow(page)).toBe(false);
});
