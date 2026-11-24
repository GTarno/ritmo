import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as D from '../../app/js/dates.js';

test('isValidDate aceita só datas reais AAAA-MM-DD', () => {
  for (const ok of ['2026-11-24', '2024-02-29', '2000-02-29', '2026-12-31']) {
    assert.ok(D.isValidDate(ok), ok);
  }
  for (const bad of ['2026-02-29', '1900-02-29', '2026-13-01', '2026-00-10', '2026-04-31',
    '2026-1-1', '24/11/2026', '', null, undefined, 20261124, '2026-11-24T00:00']) {
    assert.equal(D.isValidDate(bad), false, String(bad));
  }
});

test('today usa o fuso de São Paulo por padrão', () => {
  // 02:30 UTC de segunda 30/11 = 23:30 de domingo 29/11 em São Paulo (UTC−3)
  const instant = new Date('2026-11-30T02:30:00Z');
  assert.equal(D.today(undefined, instant), '2026-11-29');
  assert.equal(D.today('America/Sao_Paulo', instant), '2026-11-29');
  assert.equal(D.weekStart(D.today(undefined, instant)), '2026-11-23', 'domingo à noite ainda é a semana anterior');
});

test('today respeita outros fusos e cai no padrão se o fuso for inválido', () => {
  const instant = new Date('2026-11-30T02:30:00Z');
  assert.equal(D.today('UTC', instant), '2026-11-30');
  assert.equal(D.today('Europe/Lisbon', instant), '2026-11-30');
  assert.equal(D.today('America/Los_Angeles', instant), '2026-11-29');
  assert.equal(D.today('Asia/Tokyo', new Date('2026-12-31T16:00:00Z')), '2027-01-01');
  assert.equal(D.today('Fuso/Inexistente', instant), '2026-11-29');
  assert.equal(D.isValidTimezone('America/Sao_Paulo'), true);
  assert.equal(D.isValidTimezone('nada'), false);
  assert.equal(D.isValidTimezone(''), false);
});

test('addDays atravessa mês, ano e fevereiro bissexto', () => {
  assert.equal(D.addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(D.addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(D.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(D.addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(D.addDays('2026-11-24', 0), '2026-11-24');
  assert.equal(D.addDays('2026-11-24', 365), '2027-11-24');
});

test('addDays não sofre com horário de verão', () => {
  // Datas de mudança de horário nos EUA e Europa; aritmética em UTC não pode pular nem repetir dia
  assert.equal(D.addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(D.addDays('2026-10-25', 1), '2026-10-26');
  let d = '2026-01-01';
  for (let i = 0; i < 365; i++) d = D.addDays(d, 1);
  assert.equal(d, '2027-01-01');
});

test('addMonths ajusta o fim do mês', () => {
  assert.equal(D.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(D.addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(D.addMonths('2026-11-24', 2), '2027-01-24');
  assert.equal(D.addMonths('2026-01-15', -1), '2025-12-15');
  assert.equal(D.addMonths('2026-03-31', -1), '2026-02-28');
});

test('diffDays e comparações', () => {
  assert.equal(D.diffDays('2026-11-24', '2026-12-01'), 7);
  assert.equal(D.diffDays('2026-12-01', '2026-11-24'), -7);
  assert.equal(D.diffDays('2024-02-01', '2024-03-01'), 29);
  assert.equal(D.compareDates('2026-11-24', '2026-11-25'), -1);
  assert.equal(D.compareDates('2026-11-24', '2026-11-24'), 0);
  assert.ok(D.isBefore('2026-09-30', '2026-10-01'));
  assert.ok(D.isAfter('2027-01-01', '2026-12-31'));
  assert.throws(() => D.compareDates('2026-11-24', 'ontem'), RangeError);
});

test('semana começa na segunda-feira', () => {
  // 24/11/2026 é terça-feira
  assert.equal(D.weekdayIndex('2026-11-23'), 0);
  assert.equal(D.weekdayIndex('2026-11-24'), 1);
  assert.equal(D.weekdayIndex('2026-11-29'), 6);
  assert.equal(D.weekStart('2026-11-24'), '2026-11-23');
  assert.equal(D.weekStart('2026-11-23'), '2026-11-23');
  assert.equal(D.weekStart('2026-11-29'), '2026-11-23');
  assert.equal(D.weekStart('2027-01-01'), '2026-12-28', 'semana atravessa a virada do ano');
  assert.deepEqual(D.weekDays('2026-11-26'), [
    '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26',
    '2026-11-27', '2026-11-28', '2026-11-29',
  ]);
});

test('monthGrid cobre o mês com semanas completas', () => {
  const nov = D.monthGrid('2026-11-24');
  assert.equal(nov[0][0], '2026-10-26');
  assert.equal(nov.at(-1)[6], '2026-12-06');
  assert.equal(nov.length, 6);
  assert.ok(nov.every((w) => w.length === 7 && D.weekdayIndex(w[0]) === 0));
  assert.ok(nov.flat().includes('2026-11-01') && nov.flat().includes('2026-11-30'));

  // Fevereiro de 2027 começa numa segunda e tem 28 dias: exatamente 4 semanas
  const feb = D.monthGrid('2027-02-10');
  assert.equal(feb.length, 4);
  assert.equal(feb[0][0], '2027-02-01');
  assert.equal(feb[3][6], '2027-02-28');

  assert.equal(D.monthStart('2024-02-15'), '2024-02-01');
  assert.equal(D.monthEnd('2024-02-15'), '2024-02-29');
  assert.ok(D.isSameMonth('2026-11-01', '2026-11-30'));
  assert.ok(!D.isSameMonth('2026-11-30', '2026-12-01'));
});

test('lastWeekStarts devolve as últimas N segundas, incluindo a atual', () => {
  const weeks = D.lastWeekStarts('2026-11-24', 8);
  assert.equal(weeks.length, 8);
  assert.equal(weeks[7], '2026-11-23');
  assert.equal(weeks[0], '2026-10-05');
});

test('formatação em pt-BR', () => {
  assert.equal(D.formatShort('2026-11-24'), '24/11');
  assert.equal(D.formatNumeric('2026-01-05'), '05/01/2026');
  assert.equal(D.weekdayShort('2026-11-23'), 'seg');
  assert.equal(D.weekdayShort('2026-11-29'), 'dom');
  assert.equal(D.formatLong('2026-11-24'), 'terça-feira, 24 de novembro');
  assert.equal(D.formatMonthYear('2026-11-24'), 'novembro de 2026');
});

test("nenhum módulo fora de dates.js usa new Date('AAAA-MM-DD')", () => {
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
  });
  const offenders = walk('app/js')
    .filter((f) => !f.endsWith('dates.js'))
    .filter((f) => /new Date\(\s*['"`]\d{4}-\d{2}-\d{2}/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});
