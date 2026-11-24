import { test, expect } from './fixtures.js';

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:v1')).data);
const list = (page) => page.getByRole('list', { name: /Exercícios do treino/ });

test.beforeEach(async ({ page }) => {
  await page.goto('./#treino');
});

test('mostra o treino A com os 5 exercícios iniciais e o cardio', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Treino A — Superiores e core' })).toBeVisible();
  await expect(list(page).getByRole('listitem')).toHaveCount(5);
  await expect(list(page).getByRole('listitem').first()).toContainText('Supino na máquina');
  await expect(list(page).getByRole('listitem').first()).toContainText('2 × 8–12 · carga em aberto · 75 s');
  await expect(page.getByText('10 min de caminhada leve')).toBeVisible();
});

test('alterna entre os treinos A e B', async ({ page }) => {
  const b = page.getByRole('button', { name: 'Treino B' });
  await b.click();
  await expect(b).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Treino B — Inferiores' })).toBeVisible();
  await expect(list(page).getByRole('listitem').first()).toContainText('Leg press');
  await expect(b).toBeFocused();
});

test('editar exercício: salva, mantém o id, registra no diário e persiste', async ({ page }) => {
  await page.getByRole('button', { name: 'Editar Supino na máquina' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar Supino na máquina' });
  await expect(dialog.getByLabel('Nome')).toBeFocused();

  await dialog.getByLabel('Nome').fill('Supino reto');
  await dialog.getByLabel('Carga planejada').fill('12,5');
  await dialog.getByLabel('Séries').fill('3');
  await dialog.getByLabel('Motivo do ajuste').fill('Ficou leve');
  await dialog.getByRole('button', { name: 'Salvar' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#status')).toContainText('registrado no diário');
  await expect(list(page).getByRole('listitem').first()).toContainText('Supino reto');
  await expect(list(page).getByRole('listitem').first()).toContainText('3 × 8–12 · 12,5 kg · 75 s');
  await expect(page.getByRole('button', { name: 'Editar Supino reto' })).toBeFocused();

  const data = await stored(page);
  expect(data.plans.A.exercises[0]).toMatchObject({ id: 'a-supino-maquina', name: 'Supino reto', load: 12.5, sets: 3 });
  expect(data.notes).toHaveLength(1);
  expect(data.notes[0]).toMatchObject({ category: 'ajuste', plan: 'A' });
  expect(data.notes[0].text).toContain('Motivo: Ficou leve');

  await page.reload();
  await expect(list(page).getByRole('listitem').first()).toContainText('Supino reto');
});

test('Enter num campo salva o formulário', async ({ page }) => {
  await page.getByRole('button', { name: 'Editar Remada sentada' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Carga planejada').fill('20');
  await dialog.getByLabel('Carga planejada').press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(list(page).getByRole('listitem').nth(1)).toContainText('20 kg');
});

test('erros de validação mantêm o diálogo aberto e apontam o campo', async ({ page }) => {
  await page.getByRole('button', { name: 'Editar Puxada frontal' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome').fill('');
  await dialog.getByLabel('Carga planejada').fill('dez');
  await dialog.getByRole('button', { name: 'Salvar' }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Nome')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByLabel('Nome')).toBeFocused();
  await expect(dialog.getByText('Informe o nome do exercício.')).toBeVisible();
  await expect(dialog.getByLabel('Carga planejada')).toHaveAttribute('aria-invalid', 'true');

  await dialog.getByLabel('Nome').fill('Puxada aberta');
  await dialog.getByLabel('Carga planejada').fill('');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(list(page).getByRole('listitem').nth(2)).toContainText('Puxada aberta');
});

test('cancelar não altera nada', async ({ page }) => {
  await page.getByRole('button', { name: 'Editar Supino na máquina' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome').fill('Outro nome');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(list(page).getByRole('listitem').first()).toContainText('Supino na máquina');
  expect(await page.evaluate(() => localStorage.getItem('ritmo:v1'))).toBeNull();
});

test('salvar sem mudanças avisa e não registra no diário', async ({ page }) => {
  await page.getByRole('button', { name: 'Editar Supino na máquina' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('#status')).toContainText('Nada foi alterado');
  expect(await page.evaluate(() => localStorage.getItem('ritmo:v1'))).toBeNull();
});

test('adicionar exercício', async ({ page }) => {
  await page.getByRole('button', { name: 'Treino B' }).click();
  await page.getByRole('button', { name: 'Adicionar exercício' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo exercício no treino B' });
  await dialog.getByLabel('Nome').fill('Abdutora');
  await dialog.getByLabel('Carga planejada').fill('0');
  await dialog.getByRole('button', { name: 'Adicionar' }).click();

  await expect(list(page).getByRole('listitem')).toHaveCount(6);
  await expect(list(page).getByRole('listitem').last()).toContainText('Abdutora');
  await expect(list(page).getByRole('listitem').last()).toContainText('0 kg');
  const data = await stored(page);
  expect(data.plans.B.exercises.at(-1)).toMatchObject({ name: 'Abdutora', load: 0, sets: 2, rest: 75 });
  expect(data.notes[0].change.action).toBe('add');
});

test('remover exercício pede confirmação e registra no diário', async ({ page }) => {
  await page.getByRole('button', { name: 'Remover Prancha' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remover Prancha?' });
  await expect(dialog).toContainText('histórico de cargas continuam');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(list(page).getByRole('listitem')).toHaveCount(5);

  await page.getByRole('button', { name: 'Remover Prancha' }).click();
  await page.getByRole('dialog').getByLabel('Motivo do ajuste').fill('Dor lombar');
  await page.getByRole('dialog').getByRole('button', { name: 'Remover' }).click();
  await expect(list(page).getByRole('listitem')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Adicionar exercício' })).toBeFocused();

  const data = await stored(page);
  expect(data.notes[0].change).toMatchObject({ action: 'remove', reason: 'Dor lombar' });
});

test('reordenar com os botões de mover mantém o foco', async ({ page }) => {
  const up = page.getByRole('button', { name: 'Mover Remada sentada para cima' });
  await up.click();
  await expect(list(page).getByRole('listitem').first()).toContainText('Remada sentada');
  // Chegou ao topo: "para cima" fica desabilitado e o foco vai para "para baixo"
  await expect(up).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Mover Remada sentada para baixo' })).toBeFocused();

  const data = await stored(page);
  expect(data.plans.A.exercises.map((e) => e.id).slice(0, 2)).toEqual(['a-remada-sentada', 'a-supino-maquina']);
  expect(data.notes).toHaveLength(0);
});

test('editar cardio', async ({ page }) => {
  await page.getByRole('button', { name: 'Editar cardio' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cardio do treino A' });
  await dialog.getByRole('textbox', { name: /^Cardio/ }).fill('15 min de bicicleta');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('15 min de bicicleta')).toBeVisible();
  const data = await stored(page);
  expect(data.plans.A.cardio).toBe('15 min de bicicleta');
  expect(data.notes[0].change).toMatchObject({ action: 'cardio', before: '10 min de caminhada leve' });
});

test('nome com HTML aparece como texto', async ({ page }) => {
  await page.getByRole('button', { name: 'Adicionar exercício' }).click();
  await page.getByRole('dialog').getByLabel('Nome').fill('<img src=x onerror="window.__xss=1">');
  await page.getByRole('dialog').getByRole('button', { name: 'Adicionar' }).click();
  await expect(list(page).getByRole('listitem').last()).toContainText('<img src=x');
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('sem rolagem horizontal com nome longo em 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByRole('button', { name: 'Editar Supino na máquina' }).click();
  await page.getByRole('dialog').getByLabel('Nome').fill('Supinoinclinadocomhalteresnobancoregulavel'.slice(0, 60));
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
