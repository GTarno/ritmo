import { test, expect, hasHorizontalOverflow, dialogClosed } from './fixtures.js';

// Terça-feira, 24/11/2026, 18h em São Paulo
const NOW = new Date('2026-11-24T18:00:00-03:00');
const TODAY = '2026-11-24';

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:v1'))?.data);
const notes = (page) => page.getByRole('list', { name: 'Registros do diário' }).getByRole('listitem');

async function addNote(page, { category = 'Observação', date, text, plan, intensity } = {}) {
  await page.getByRole('button', { name: 'Novo registro' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo registro' });
  await dialog.getByLabel('Tipo').selectOption({ label: category });
  if (date) await dialog.getByLabel('Data').fill(date);
  await dialog.getByLabel('Descrição').fill(text);
  if (plan) await dialog.getByLabel('Treino').selectOption({ label: plan });
  if (intensity !== undefined) await dialog.getByLabel('Intensidade').fill(String(intensity));
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await dialogClosed(page);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('./#diario');
});

test('diário vazio explica o que vai aparecer, sem filtros', async ({ page }) => {
  await expect(page.getByText('Diário vazio')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Filtros do diário' })).toHaveCount(0);
  await expect(page.locator('#app')).not.toContainText(/^0$/);
});

test('criar registro com todos os campos e persistir', async ({ page }) => {
  await addNote(page, { category: 'Dor', text: 'Joelho direito incomodou no leg press.', plan: 'Treino B', intensity: 6 });
  await expect(page.locator('#status')).toContainText('Registro salvo no diário');
  await expect(notes(page)).toHaveCount(1);
  const item = notes(page).first();
  await expect(item).toContainText('Dor');
  await expect(item).toContainText('ter 24/11/2026');
  await expect(item).toContainText('Joelho direito incomodou no leg press.');
  await expect(item).toContainText('Treino B · intensidade 6/10');
  await expect(item.getByRole('button', { name: /Editar registro de 24\/11/ })).toBeFocused();

  const data = await stored(page);
  expect(data.notes).toHaveLength(1);
  expect(data.notes[0]).toMatchObject({ category: 'dor', date: TODAY, plan: 'B', intensity: 6 });

  await page.reload();
  await expect(notes(page)).toHaveCount(1);
});

test('validação: descrição obrigatória, data futura e intensidade de 0 a 10', async ({ page }) => {
  await page.getByRole('button', { name: 'Novo registro' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Data').fill('2026-11-25');
  await dialog.getByLabel('Intensidade').fill('11');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog.getByText('Descreva o que aconteceu.')).toBeVisible();
  await expect(dialog.getByText('A data não pode ser no futuro.')).toBeVisible();
  await expect(dialog.getByText('Use um número inteiro de 0 a 10')).toBeVisible();
  await expect(dialog.getByLabel('Data')).toBeFocused();

  await dialog.getByLabel('Data').fill(TODAY);
  await dialog.getByLabel('Descrição').fill('Dia cansativo');
  await dialog.getByLabel('Intensidade').fill('0');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await dialogClosed(page);
  await expect(notes(page).first()).toContainText('intensidade 0/10');
});

test('editar e remover registro', async ({ page }) => {
  await addNote(page, { category: 'Limitação', text: 'Evitar agachamento profundo' });
  await notes(page).first().getByRole('button', { name: /Editar registro/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar registro' });
  await expect(dialog.getByLabel('Descrição')).toHaveValue('Evitar agachamento profundo');
  await expect(dialog.getByLabel('Tipo')).toHaveValue('limitacao');
  await dialog.getByLabel('Descrição').fill('Evitar agachamento profundo por 2 semanas');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await dialogClosed(page);
  await expect(notes(page).first()).toContainText('por 2 semanas');

  await notes(page).first().getByRole('button', { name: /Remover registro/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await expect(notes(page)).toHaveCount(1);
  await notes(page).first().getByRole('button', { name: /Remover registro/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await dialogClosed(page);
  await expect(page.getByText('Diário vazio')).toBeVisible();
  expect((await stored(page)).notes).toHaveLength(0);
});

test('ordem por data e filtros por tipo e treino', async ({ page }) => {
  await addNote(page, { category: 'Dor', date: '2026-11-20', text: 'Ombro', plan: 'Treino A' });
  await addNote(page, { category: 'Observação', date: '2026-11-22', text: 'Treino rendeu' });
  await addNote(page, { category: 'Limitação', date: '2026-11-20', text: 'Sem impacto', plan: 'Treino B' });

  await expect(notes(page)).toHaveCount(3);
  await expect(notes(page).nth(0)).toContainText('Treino rendeu');
  await expect(notes(page).nth(1)).toContainText('Sem impacto'); // mesma data: o mais novo primeiro
  await expect(notes(page).nth(2)).toContainText('Ombro');

  await page.getByLabel('Tipo').selectOption({ label: 'Dor' });
  await expect(notes(page)).toHaveCount(1);
  await expect(page.getByText('1 de 3 registros')).toBeVisible();
  await expect(page.getByLabel('Tipo')).toBeFocused();

  await page.getByLabel('Treino').selectOption({ label: 'Treino B' });
  await expect(page.getByText('Nenhum registro com esses filtros')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(notes(page)).toHaveCount(3);
});

test('novo registro escondido pelo filtro limpa os filtros para aparecer', async ({ page }) => {
  await addNote(page, { category: 'Dor', text: 'Ombro' });
  await page.getByLabel('Tipo').selectOption({ label: 'Dor' });
  await addNote(page, { category: 'Observação', text: 'Bom treino' });
  await expect(page.getByLabel('Tipo')).toHaveValue('');
  await expect(notes(page)).toHaveCount(2);
});

test('ajustes do Treino AB aparecem no diário e podem ser editados sem perder a alteração', async ({ page }) => {
  await page.goto('./#treino');
  await page.getByRole('button', { name: 'Editar Supino na máquina' }).click();
  await page.getByRole('dialog').getByLabel('Carga planejada').fill('12');
  await page.getByRole('dialog').getByLabel('Motivo do ajuste').fill('Ficou leve');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await dialogClosed(page);

  await page.goto('./#diario');
  const item = notes(page).first();
  await expect(item).toContainText('Ajuste');
  await expect(item).toContainText('automático');
  await expect(item).toContainText('Supino na máquina: carga em aberto → 12 kg. Motivo: Ficou leve');
  await expect(item).toContainText('Treino A');

  await item.getByRole('button', { name: /Editar registro/ }).click();
  await page.getByRole('dialog').getByLabel('Intensidade').fill('3');
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await dialogClosed(page);
  const data = await stored(page);
  expect(data.notes[0]).toMatchObject({ auto: true, intensity: 3, change: { action: 'edit', exerciseId: 'a-supino-maquina' } });
});

test('texto com HTML e quebras de linha aparece como texto', async ({ page }) => {
  await addNote(page, { text: '<img src=x onerror="window.__xss=1">\nsegunda linha' });
  await expect(notes(page).first()).toContainText('<img src=x');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('sem rolagem horizontal em 360px com registros', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await addNote(page, { category: 'Dor', text: 'x'.repeat(200), plan: 'Treino A', intensity: 5 });
  expect(await hasHorizontalOverflow(page)).toBe(false);
});
