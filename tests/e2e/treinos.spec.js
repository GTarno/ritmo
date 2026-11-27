import AxeBuilder from '@axe-core/playwright';
import { test, expect, hasHorizontalOverflow, dialogClosed } from './fixtures.js';

const NOW = new Date('2026-11-24T18:00:00-03:00');

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:v1'))?.data);
const pills = (page) => page.getByRole('group', { name: 'Treinos' }).getByRole('button');
const pill = (page, label) => page.getByRole('group', { name: 'Treinos' }).getByRole('button', { name: `Treino ${label}`, exact: true });

async function newPlan(page, { name, label, color } = {}) {
  await page.getByRole('button', { name: 'Novo treino' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo treino' });
  if (name !== undefined) await dialog.getByLabel('Nome').fill(name);
  if (label !== undefined) await dialog.getByLabel('Rótulo').fill(label);
  if (color) await dialog.getByRole('radio', { name: color }).check();
  await dialog.getByRole('button', { name: 'Criar' }).click();
  await dialogClosed(page);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('./#treino');
});

test('criar treino: sugere rótulo e cor, seleciona o novo e permite adicionar exercícios', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Treinos');
  await page.getByRole('button', { name: 'Novo treino' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo treino' });
  await expect(dialog.getByLabel('Nome')).toBeFocused();
  await expect(dialog.getByLabel('Rótulo')).toHaveValue('C');
  await expect(dialog.getByRole('radio', { name: 'Turquesa' })).toBeChecked();
  await dialog.getByLabel('Nome').fill('Corpo todo');
  await dialog.getByRole('button', { name: 'Criar' }).click();
  await dialogClosed(page);

  await expect(pills(page)).toHaveCount(3);
  await expect(pill(page, 'C')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Treino C — Corpo todo' })).toBeVisible();
  await expect(page.getByText('0 exercícios')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar exercício' })).toBeFocused();

  await page.getByRole('button', { name: 'Adicionar exercício' }).click();
  await page.getByRole('dialog').getByLabel('Nome').fill('Agachamento livre');
  await page.getByRole('dialog').getByRole('button', { name: 'Adicionar' }).click();
  await dialogClosed(page);

  await page.reload();
  await pill(page, 'C').click();
  await expect(page.getByRole('list', { name: 'Exercícios do treino C' })).toContainText('Agachamento livre');
  const data = await stored(page);
  expect(data.plans.map((p) => p.label)).toEqual(['A', 'B', 'C']);
  expect(data.plans[2]).toMatchObject({ name: 'Corpo todo', color: 'turquesa' });
  expect(data.notes.some((n) => n.change?.action === 'plan-create')).toBe(true);
});

test('validação: nome obrigatório e rótulo único', async ({ page }) => {
  await page.getByRole('button', { name: 'Novo treino' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Rótulo').fill('a');
  await dialog.getByRole('button', { name: 'Criar' }).click();
  await expect(dialog.getByText('Dê um nome ao treino')).toBeVisible();
  await expect(dialog.getByText('O rótulo A já está em uso.')).toBeVisible();
  await expect(dialog.getByLabel('Nome')).toBeFocused();
});

test('duplicar copia exercícios e cardio com ids novos', async ({ page }) => {
  await page.getByRole('button', { name: 'Duplicar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Duplicar treino A' });
  await expect(dialog.getByLabel('Nome')).toHaveValue('Superiores e core (cópia)');
  await dialog.getByRole('button', { name: 'Duplicar' }).click();
  await dialogClosed(page);

  await expect(pills(page)).toHaveText(['Treino A', 'Treino C', 'Treino B']);
  await expect(pill(page, 'C')).toBeFocused();
  await expect(page.getByRole('list', { name: 'Exercícios do treino C' }).getByRole('listitem')).toHaveCount(5);
  const data = await stored(page);
  const [a, c] = data.plans;
  expect(c.exercises.map((e) => e.name)).toEqual(a.exercises.map((e) => e.name));
  expect(c.exercises.every((e, i) => e.id !== a.exercises[i].id)).toBe(true);
  expect(c.cardio).toBe(a.cardio);
});

test('editar nome, rótulo e cor', async ({ page }) => {
  await pill(page, 'B').click();
  await page.getByRole('button', { name: 'Editar treino B' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar treino B' });
  await expect(dialog.getByLabel('Rótulo')).toHaveValue('B');
  await dialog.getByLabel('Nome').fill('Pernas e glúteos');
  await dialog.getByLabel('Rótulo').fill('p');
  await dialog.getByRole('radio', { name: 'Rosa' }).check();
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await dialogClosed(page);

  await expect(pill(page, 'P')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Treino P — Pernas e glúteos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar treino P' })).toBeFocused();
  const data = await stored(page);
  expect(data.plans[1]).toMatchObject({ id: 'B', label: 'P', name: 'Pernas e glúteos', color: 'rosa' });
  expect(data.notes.at(-1).text).toContain('B — Inferiores → P — Pernas e glúteos; cor Azul → Rosa');

  await page.goto('./#diario');
  await expect(page.getByRole('list', { name: 'Registros do diário' })).toContainText('Treino atualizado');
});

test('reordenar treinos', async ({ page }) => {
  await pill(page, 'B').click();
  await page.getByRole('button', { name: 'Mover treino B para antes' }).click();
  await expect(pills(page)).toHaveText(['Treino B', 'Treino A']);
  await expect(page.getByRole('button', { name: 'Mover treino B para depois' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Mover treino B para antes' })).toBeDisabled();
  await page.reload();
  await expect(pills(page)).toHaveText(['Treino B', 'Treino A']);
});

test('remover treino: confirma, desagenda o que só estava agendado e mantém o histórico', async ({ page }) => {
  await newPlan(page, { name: 'Corpo todo' });
  // Agenda o treino C numa data futura e registra uma sessão concluída do C
  await page.evaluate(async () => {
    const { app } = await import('./js/app-state.js');
    const S = await import('./js/domain/sessions.js');
    const id = app.state.plans[2].id;
    let s = S.scheduleSession(app.state, '2026-11-30', id);
    app.commit(s);
  });
  await page.reload();
  await pill(page, 'C').click();

  await page.getByRole('button', { name: 'Remover treino C' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remover treino C?' });
  await expect(dialog).toContainText('1 sessão só agendada deste treino sai da agenda.');
  await expect(dialog).toContainText('Sessões já registradas e o histórico de cargas continuam.');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(pills(page)).toHaveCount(3);

  await page.getByRole('button', { name: 'Remover treino C' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await dialogClosed(page);
  await expect(pills(page)).toHaveText(['Treino A', 'Treino B']);
  await expect(pill(page, 'A')).toHaveAttribute('aria-pressed', 'true');
  await expect(pill(page, 'A')).toBeFocused();
  const data = await stored(page);
  expect(data.sessions['2026-11-30']).toBeUndefined();
  expect(data.notes.at(-1).change.action).toBe('plan-remove');
});

test('o último treino não pode ser removido', async ({ page }) => {
  await pill(page, 'B').click();
  await page.getByRole('button', { name: 'Remover treino B' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await dialogClosed(page);
  await expect(pills(page)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Remover treino A' })).toBeDisabled();
});

test('treino novo aparece na escolha do modelo da sessão', async ({ page }) => {
  await newPlan(page, { name: 'Corpo todo' });
  await page.goto('./#sessao/2026-11-24');
  await page.getByRole('radio', { name: 'Treino C — Corpo todo' }).check();
  await page.getByRole('button', { name: 'Começar treino' }).click();
  await expect(page.getByText('Treino C — Corpo todo')).toBeVisible();
  await expect(page.getByText('Este modelo não tinha exercícios')).toBeVisible();
});

test('acessível e sem rolagem horizontal em 320px com seis treinos', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const name of ['Corpo todo', 'Glúteos', 'Costas', 'Cardio']) await newPlan(page, { name });
  await expect(pills(page)).toHaveCount(6);
  expect(await hasHorizontalOverflow(page)).toBe(false);
  let results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await page.getByRole('button', { name: /Editar treino/ }).click();
  results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`)).toEqual([]);
  expect(await hasHorizontalOverflow(page)).toBe(false);
});
