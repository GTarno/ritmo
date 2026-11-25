// Datas do Ritmo. Regras:
// - Toda data é uma string 'AAAA-MM-DD' (data de calendário, sem hora nem fuso).
// - Contas de calendário são feitas em UTC, onde não existe horário de verão.
// - Só o "hoje" depende de fuso: é a data atual no fuso escolhido (padrão São Paulo).
// - A semana começa na segunda-feira.
// Nunca use `new Date('AAAA-MM-DD')` fora deste arquivo: use as funções abaixo.

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n, size = 2) => String(n).padStart(size, '0');

/** true se a string é uma data de calendário real no formato AAAA-MM-DD. */
export function isValidDate(value) {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

function assertDate(value) {
  if (!isValidDate(value)) throw new RangeError(`Data inválida: ${value}`);
}

function parts(date) {
  assertDate(date);
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Milissegundos UTC da meia-noite da data (útil só para contas internas). */
function toUTC(date) {
  const { y, m, d } = parts(date);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const dt = new Date(ms);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// ---------- Fuso e "hoje" ----------

export function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const todayFormatters = new Map();

/**
 * Data de hoje no fuso informado. Fuso inválido cai no padrão (São Paulo).
 * `now` permite testar qualquer instante.
 */
export function today(timezone = DEFAULT_TIMEZONE, now = new Date()) {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  let fmt = todayFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    todayFormatters.set(tz, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// ---------- Aritmética ----------

export function addDays(date, n) {
  return fromUTC(toUTC(date) + n * DAY_MS);
}

/** Soma meses mantendo o dia quando possível (31/01 + 1 mês → 28 ou 29/02). */
export function addMonths(date, n) {
  const { y, m, d } = parts(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${pad(ny, 4)}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

/** Diferença em dias: b − a. */
export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** Negativo se a < b, zero se iguais, positivo se a > b. */
export function compareDates(a, b) {
  assertDate(a);
  assertDate(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

export const isBefore = (a, b) => compareDates(a, b) < 0;
export const isAfter = (a, b) => compareDates(a, b) > 0;

// ---------- Semanas e meses ----------

/** Dia da semana com segunda = 0 … domingo = 6. */
export function weekdayIndex(date) {
  return (new Date(toUTC(date)).getUTCDay() + 6) % 7;
}

/** Segunda-feira da semana da data. */
export function weekStart(date) {
  return addDays(date, -weekdayIndex(date));
}

/** As 7 datas (segunda a domingo) da semana da data. */
export function weekDays(date) {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthStart(date) {
  const { y, m } = parts(date);
  return `${pad(y, 4)}-${pad(m)}-01`;
}

export function monthEnd(date) {
  const { y, m } = parts(date);
  return `${pad(y, 4)}-${pad(m)}-${pad(daysInMonth(y, m))}`;
}

export function isSameMonth(a, b) {
  return a.slice(0, 7) === b.slice(0, 7);
}

/**
 * Grade do calendário mensal: semanas completas (seg–dom) cobrindo o mês.
 * Dias de fora do mês aparecem nas bordas; use isSameMonth para destacá-los.
 */
export function monthGrid(date) {
  const first = weekStart(monthStart(date));
  const last = addDays(weekStart(monthEnd(date)), 6);
  const weeks = [];
  for (let d = first; !isAfter(d, last); d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  }
  return weeks;
}

/** Segundas-feiras das últimas `count` semanas, terminando na semana de `date`. */
export function lastWeekStarts(date, count) {
  const current = weekStart(date);
  return Array.from({ length: count }, (_, i) => addDays(current, (i - count + 1) * 7));
}

// ---------- Formatação pt-BR ----------

const formatters = new Map();
function format(date, options) {
  const key = JSON.stringify(options);
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' });
    formatters.set(key, fmt);
  }
  return fmt.format(new Date(toUTC(date)));
}

/** "24/11" */
export const formatShort = (date) => format(date, { day: '2-digit', month: '2-digit' });

/** "24/11/2026" */
export const formatNumeric = (date) =>
  format(date, { day: '2-digit', month: '2-digit', year: 'numeric' });

/** "seg" */
export const weekdayShort = (date) =>
  format(date, { weekday: 'short' }).replace('.', '').toLowerCase();

/** "segunda-feira, 24 de novembro" */
export const formatLong = (date) => format(date, { weekday: 'long', day: 'numeric', month: 'long' });

/** "novembro de 2026" */
export const formatMonthYear = (date) => format(date, { month: 'long', year: 'numeric' });

/** "30 de novembro" */
export const formatDayMonth = (date) => format(date, { day: 'numeric', month: 'long' });

/** "segunda-feira" */
export const weekdayLong = (date) => format(date, { weekday: 'long' });

/**
 * Intervalo da semana que começa em `start`:
 * "23 – 29 de novembro de 2026", "30 de novembro – 6 de dezembro de 2026",
 * "28 de dezembro de 2026 – 3 de janeiro de 2027".
 */
export function formatWeekRange(start) {
  const end = addDays(start, 6);
  const { y: y1, m: m1, d: d1 } = parts(start);
  const { y: y2, m: m2, d: d2 } = parts(end);
  if (y1 !== y2) return `${formatDayMonth(start)} de ${y1} – ${formatDayMonth(end)} de ${y2}`;
  if (m1 !== m2) return `${formatDayMonth(start)} – ${formatDayMonth(end)} de ${y2}`;
  return `${d1} – ${d2} de ${format(end, { month: 'long' })} de ${y2}`;
}
