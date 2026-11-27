import { test, expect, hasHorizontalOverflow, dialogClosed } from './fixtures.js';

// Terça-feira, 24/11/2026, 18h em São Paulo
const NOW = new Date('2026-11-24T18:00:00-03:00');
const TODAY = '2026-11-24';

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:v1'))?.data);
const exercises = (page) => page.getByRole('list', { name: 'Exercícios da sessão' }).getByRole('listitem');
const row = (page, name) => exercises(page).filter({ hasText: name });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

async function startToday(page, type) {
  await page.goto(`./#sessao/${TODAY}`);
  if (type) await page.getByRole('radio', { name: new RegExp(`Treino ${type}`) }).check();
  await page.getByRole('button', { name: 'Começar treino' }).click();
}

test('fluxo completo: abrir, marcar, salvar parcial, recarregar e concluir', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('region', { name: 'Treino de hoje' })).toContainText('Sugestão: Treino B — Inferiores.');
  await page.getByRole('link', { name: 'Começar treino de hoje' }).click();

  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Hoje · terça-feira, 24 de novembro');
  await expect(page.getByRole('radio', { name: /Treino B/ })).toBeChecked();
  await page.getByRole('button', { name: 'Começar treino' }).click();

  await expect(page.locator('.badge')).toHaveText('Em andamento');
  await expect(exercises(page)).toHaveCount(5);
  await expect(exercises(page).first()).toContainText('Leg press');

  await row(page, 'Leg press').getByRole('checkbox').check();
  await row(page, 'Leg press').getByLabel('Carga').fill('40');
  await row(page, 'Leg press').getByLabel('Carga').blur();
  await expect(page.getByText('1 de 5 exercícios marcados')).toBeVisible();

  // Salvo automaticamente: sobrevive ao recarregar
  await page.reload();
  await expect(row(page, 'Leg press').getByRole('checkbox')).toBeChecked();
  await expect(row(page, 'Leg press').getByLabel('Carga')).toHaveValue('40');

  await page.getByRole('button', { name: 'Salvar andamento' }).click();
  await expect(page.locator('#status')).toContainText('Andamento salvo');

  await page.getByLabel('Observações').fill('Joelho ok');
  await page.getByRole('button', { name: 'Concluir sessão' }).click();
  await expect(page.locator('#status')).toContainText('Sessão concluída');
  await expect(page.locator('.badge')).toHaveText('Concluída');
  await expect(page.getByRole('button', { name: 'Salvar alterações' })).toBeFocused();

  const data = await stored(page);
  const session = data.sessions[TODAY];
  expect(session).toMatchObject({ date: TODAY, type: 'B', done: true, notes: 'Joelho ok' });
  expect(session.exercises[0]).toMatchObject({ id: 'b-leg-press', checked: true, load: 40 });

  // O cartão do painel reflete a sessão concluída
  await page.goto('./');
  await expect(page.getByRole('region', { name: 'Treino de hoje' })).toContainText('Treino B — Inferiores · concluído');
});

test('concluir sem marcar nada mostra erro e não conclui', async ({ page }) => {
  await startToday(page, 'A');
  await page.getByRole('button', { name: 'Concluir sessão' }).click();
  await expect(page.getByRole('alert')).toContainText('Marque ao menos um exercício ou o cardio');
  await expect(page.locator('.badge')).toHaveText('Em andamento');
});

test('só o cardio já permite concluir', async ({ page }) => {
  await startToday(page, 'A');
  await page.getByRole('checkbox', { name: 'Cardio feito' }).check();
  await page.getByRole('textbox', { name: /O que foi feito/ }).fill('20 min de esteira');
  await page.getByRole('button', { name: 'Concluir sessão' }).click();
  await expect(page.locator('.badge')).toHaveText('Concluída');
  const data = await stored(page);
  expect(data.sessions[TODAY]).toMatchObject({ cardioDone: true, cardio: '20 min de esteira', done: true });
});

test('carga inválida aponta o campo e bloqueia a conclusão', async ({ page }) => {
  await startToday(page, 'A');
  const supino = row(page, 'Supino na máquina');
  await supino.getByRole('checkbox').check();
  await supino.getByLabel('Carga').fill('doze');
  await page.getByRole('button', { name: 'Concluir sessão' }).click();
  await expect(supino.getByLabel('Carga')).toHaveAttribute('aria-invalid', 'true');
  await expect(supino.getByLabel('Carga')).toBeFocused();
  await expect(supino).toContainText('Use um número em kg');
  await expect(page.locator('.badge')).toHaveText('Em andamento');

  await supino.getByLabel('Carga').fill('12,5');
  await page.getByRole('button', { name: 'Concluir sessão' }).click();
  await expect(page.locator('.badge')).toHaveText('Concluída');
  expect((await stored(page)).sessions[TODAY].exercises[0].load).toBe(12.5);
});

test('mostra a última carga registrada do exercício', async ({ page }) => {
  // Sessão concluída na segunda com supino a 10 kg
  await page.goto('./#sessao/2026-11-23');
  await page.getByRole('button', { name: 'Começar treino' }).click();
  await row(page, 'Supino na máquina').getByRole('checkbox').check();
  await row(page, 'Supino na máquina').getByLabel('Carga').fill('10');
  await page.getByRole('button', { name: 'Concluir sessão' }).click();
  await expect(page.locator('.badge')).toHaveText('Concluída');

  await startToday(page, 'A');
  await expect(row(page, 'Supino na máquina')).toContainText('Última: 10 kg em 23/11');
  await expect(row(page, 'Remada sentada')).not.toContainText('Última');
});

test('data futura: agendar, trocar o modelo e remover', async ({ page }) => {
  await page.goto('./#sessao/2026-11-26');
  await expect(page.getByText('Datas futuras podem ser agendadas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Começar treino' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Treino A/ })).toBeChecked(); // quinta = A
  await page.getByRole('button', { name: 'Agendar' }).click();
  await expect(page.locator('.badge')).toHaveText('Planejada');
  expect((await stored(page)).sessions['2026-11-26']).toEqual({ date: '2026-11-26', type: 'A', done: false });

  await page.getByRole('radio', { name: /Treino B/ }).check();
  await expect(page.locator('#status')).toContainText('alterada para o treino B');
  expect((await stored(page)).sessions['2026-11-26'].type).toBe('B');

  await page.getByRole('button', { name: 'Remover sessão' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await expect(page.locator('.badge')).toHaveText('Sem sessão');
  expect((await stored(page)).sessions['2026-11-26']).toBeUndefined();
});

test('sessão planejada para hoje abre com o modelo planejado', async ({ page }) => {
  await page.goto(`./#sessao/${TODAY}`);
  await page.evaluate(async (today) => {
    const { app } = await import('./js/app-state.js');
    const { scheduleSession } = await import('./js/domain/sessions.js');
    app.commit(scheduleSession(app.state, today, 'A'));
  }, TODAY);
  await page.reload();
  await expect(page.locator('.badge')).toHaveText('Planejada');
  await expect(page.getByRole('radio', { name: /Treino A/ })).toBeChecked();
  await page.getByRole('button', { name: 'Começar treino' }).click();
  await expect(exercises(page).first()).toContainText('Supino na máquina');
});

test('remover sessão iniciada pede confirmação', async ({ page }) => {
  await startToday(page, 'A');
  await page.getByRole('button', { name: 'Remover sessão' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remover sessão?' });
  await expect(dialog).toContainText('inclusive dos gráficos e da frequência');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.badge')).toHaveText('Em andamento');

  await page.getByRole('button', { name: 'Remover sessão' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await expect(page.locator('.badge')).toHaveText('Sem sessão');
  await expect(page.getByRole('button', { name: 'Começar treino' })).toBeFocused();
});

test('editar sessão concluída e reabrir', async ({ page }) => {
  await startToday(page, 'A');
  await row(page, 'Puxada frontal').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Concluir sessão' }).click();
  await expect(page.locator('.badge')).toHaveText('Concluída');

  // Desmarcar tudo numa sessão concluída não é aceito
  await row(page, 'Puxada frontal').getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('alert')).toContainText('concluída precisa');
  expect((await stored(page)).sessions[TODAY].exercises[2].checked).toBe(true);

  await row(page, 'Puxada frontal').getByRole('checkbox').check();
  await row(page, 'Puxada frontal').getByLabel('Carga').fill('25');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.locator('#status')).toContainText('Alterações salvas');
  expect((await stored(page)).sessions[TODAY].exercises[2].load).toBe(25);

  await page.getByRole('button', { name: 'Reabrir' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reabrir' }).click();
  await expect(page.locator('.badge')).toHaveText('Em andamento');
  expect((await stored(page)).sessions[TODAY].done).toBe(false);
});

test('editar o modelo depois de abrir a sessão não muda a sessão', async ({ page }) => {
  await startToday(page, 'A');
  await page.goto('./#treino');
  await page.getByRole('button', { name: 'Editar Supino na máquina' }).click();
  await page.getByRole('dialog').getByLabel('Nome').fill('Supino reto');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await dialogClosed(page);

  await page.goto(`./#sessao/${TODAY}`);
  await expect(exercises(page).first()).toContainText('Supino na máquina');
});

test('data inválida mostra aviso; menu destaca a Agenda', async ({ page }) => {
  await page.goto('./#sessao/2026-02-30');
  await expect(page.getByText('Data inválida')).toBeVisible();
  await page.goto(`./#sessao/${TODAY}`);
  await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Agenda' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page).toHaveTitle('Sessão de 24/11 — Ritmo');
});

test('sem rolagem horizontal na sessão em 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await startToday(page, 'A');
  const overflow = await hasHorizontalOverflow(page);
  expect(overflow).toBe(false);
});
