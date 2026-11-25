import { readFile } from 'node:fs/promises';
import { test, expect, hasHorizontalOverflow, dialogClosed } from './fixtures.js';

// Terça-feira, 24/11/2026, 18h em São Paulo
const NOW = new Date('2026-11-24T18:00:00-03:00');

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ritmo:v1'))?.data);

/** Grava um estado com uma sessão concluída, uma medida e uma anotação. */
async function seedData(page, extra = {}) {
  await page.evaluate(async (extra) => {
    const { app } = await import('./js/app-state.js');
    const S = await import('./js/domain/sessions.js');
    const o = S.openSession(app.state, '2026-11-23', 'A', '2026-11-24');
    const v = S.parseSessionForm({
      exercises: o.session.exercises.map((e, i) => ({ id: e.id, checked: i === 0, load: '12' })),
      cardioDone: false,
      cardio: '',
      notes: '',
    }).value;
    const s = S.completeSession(o.state, '2026-11-23', v);
    app.commit({
      ...s,
      measurements: [{ date: '2026-11-20', weight: 68.4, waist: null, hips: null, chest: null, thigh: null }],
      notes: [{ id: 'n1', date: '2026-11-22', category: 'dor', plan: 'B', text: 'Joelho', intensity: 4 }],
      ...extra,
    });
  }, extra);
  await page.reload();
}

const backupBuffer = (obj) => ({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('./');
});

test('atalho no cabeçalho abre "Seus dados" com o resumo', async ({ page }) => {
  await seedData(page);
  await page.getByRole('link', { name: 'Seus dados e backup' }).click();
  await expect(page).toHaveURL(/#dados$/);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Seus dados');
  const where = page.getByRole('region', { name: 'Onde ficam seus dados' });
  await expect(where).toContainText('1 sessão (1 concluída)');
  await expect(where).toContainText('1 registro corporal');
  await expect(where).toContainText('1 anotação no diário');
  await expect(page.getByText('Você ainda não fez nenhum backup.')).toBeVisible();
});

test('baixar backup gera o arquivo com todos os dados e registra a data', async ({ page }) => {
  await seedData(page);
  const before = await stored(page);
  await page.goto('./#dados');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('ritmo-backup-2026-11-24.json');

  const file = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(file).toMatchObject({ app: 'ritmo', schemaVersion: 1 });
  expect(file.exportedAt).toBe(NOW.toISOString());
  expect(file.data).toEqual(before);

  await expect(page.locator('#status')).toContainText('Backup baixado');
  await expect(page.getByText('Último backup: 24/11/2026 (hoje).')).toBeVisible();
  expect((await stored(page)).lastBackupAt).toBe('2026-11-24');
});

test('restaurar: mostra o conteúdo, pede confirmação e substitui guardando cópia', async ({ page }) => {
  await seedData(page);
  const backup = {
    app: 'ritmo',
    schemaVersion: 1,
    exportedAt: '2026-11-10T12:00:00.000Z',
    data: await page.evaluate(async () => {
      const { createInitialState } = await import('./js/domain/initial-state.js');
      return { ...createInitialState(), goal: 'Do backup', measurements: [{ date: '2026-11-01', weight: 70 }] };
    }),
  };
  await page.goto('./#dados');
  await page.locator('#import-file').setInputFiles(backupBuffer(backup));

  const dialog = page.getByRole('dialog', { name: 'Substituir os dados pelo backup?' });
  await expect(dialog).toContainText('Backup de 10/11/2026:');
  await expect(dialog).toContainText('0 sessões (0 concluídas)');
  await expect(dialog).toContainText('1 sessão (1 concluída)'); // dados atuais
  await dialog.getByRole('button', { name: 'Substituir' }).click();
  await dialogClosed(page);

  await expect(page.locator('#status')).toContainText('Backup importado');
  const data = await stored(page);
  expect(data.goal).toBe('Do backup');
  expect(data.sessions).toEqual({});
  expect(data.lastBackupAt).toBe('2026-11-10');

  const copies = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ritmo:pre-import:')));
  expect(copies).toHaveLength(1);
  const copy = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).data, copies[0]);
  expect(Object.keys(copy.sessions)).toEqual(['2026-11-23']);

  await page.goto('./');
  await expect(page.getByRole('region', { name: 'Do backup' })).toBeVisible();
});

test('cancelar a restauração não muda nada', async ({ page }) => {
  await seedData(page);
  const before = await stored(page);
  await page.goto('./#dados');
  await page.locator('#import-file').setInputFiles(backupBuffer({ app: 'ritmo', schemaVersion: 1, data: before }));
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  await dialogClosed(page);
  expect(await stored(page)).toEqual(before);
});

test('arquivos inválidos mostram erro e não mudam nada', async ({ page }) => {
  await seedData(page);
  const before = await stored(page);
  await page.goto('./#dados');
  const input = page.locator('#import-file');

  await input.setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{quebrado') });
  await expect(page.getByRole('alert')).toContainText('não é um JSON válido');

  await input.setInputFiles(backupBuffer({ foo: 1 }));
  await expect(page.getByRole('alert')).toContainText('não é um backup do Ritmo');

  await input.setInputFiles(backupBuffer({ app: 'ritmo', schemaVersion: 99, data: before }));
  await expect(page.getByRole('alert')).toContainText('versão mais nova');

  await input.setInputFiles(backupBuffer({ app: 'ritmo', schemaVersion: 1, data: { plans: {} } }));
  await expect(page.getByRole('alert')).toContainText('incompleto ou corrompido');

  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await stored(page)).toEqual(before);
});

test('ida e volta: o arquivo baixado restaura exatamente os mesmos dados em outro perfil', async ({ page, browser }) => {
  await seedData(page);
  const original = await stored(page);
  await page.goto('./#dados');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar backup' }).click();
  const text = await readFile(await (await downloadPromise).path(), 'utf8');

  // Outro perfil de navegador, sem nenhum dado
  const other = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page2 = await other.newPage();
  await page2.clock.setFixedTime(NOW);
  await page2.goto('./#dados');
  await page2.locator('#import-file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page2.getByRole('dialog').getByRole('button', { name: 'Substituir' }).click();
  await dialogClosed(page2);
  const restored = await stored(page2);
  expect(restored).toEqual({ ...original, lastBackupAt: '2026-11-24' });
  await other.close();
});

test('lembrete no painel: aparece com registros sem backup e some depois do backup', async ({ page }) => {
  await expect(page.getByRole('note')).toHaveCount(0); // sem registros, sem lembrete
  await seedData(page);
  const note = page.getByRole('note');
  await expect(note).toContainText('Você ainda não fez nenhum backup.');
  await note.getByRole('link', { name: 'Fazer backup' }).click();
  await expect(page).toHaveURL(/#dados$/);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar backup' }).click();
  await downloadPromise;
  await page.goto('./');
  await expect(page.getByRole('note')).toHaveCount(0);
});

test('lembrete volta depois de 14 dias com registros novos', async ({ page }) => {
  await seedData(page, { lastBackupAt: '2026-11-02' });
  await expect(page.getByRole('note')).toContainText('Seu último backup foi há 22 dias e há registros novos.');
});

test('botão de importar funciona pelo teclado', async ({ page }) => {
  await page.goto('./#dados');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Escolher arquivo de backup' }).focus();
  await page.keyboard.press('Enter');
  expect(await chooser).toBeTruthy();
});

test('sem rolagem horizontal em 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seedData(page);
  await page.goto('./#dados');
  expect(await hasHorizontalOverflow(page)).toBe(false);
  await page.goto('./');
  expect(await hasHorizontalOverflow(page)).toBe(false);
});
