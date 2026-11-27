// Contas do timer de descanso. Funções puras, baseadas no horário de término
// (e não em contar segundos): assim o tempo fica certo mesmo se o celular
// bloquear a tela ou o app for para segundo plano.

export const DEFAULT_REST = 60;
export const STEP = 15;
export const MAX_REST = 15 * 60;

/** Segundos restantes (arredondado para cima; 0 quando terminou). */
export function remainingSeconds(endAt, now) {
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}

/** "1:15", "0:05", "10:00" */
export function formatClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "1 minuto e 15 segundos", para leitores de tela. */
export function spokenDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const min = Math.floor(s / 60);
  const sec = s % 60;
  const parts = [];
  if (min) parts.push(min === 1 ? '1 minuto' : `${min} minutos`);
  if (sec || !min) parts.push(sec === 1 ? '1 segundo' : `${sec} segundos`);
  return parts.join(' e ');
}

/** Duração do descanso para um exercício: o intervalo cadastrado ou o padrão. */
export function restFor(exercise) {
  const rest = exercise?.rest;
  return Number.isInteger(rest) && rest > 0 ? Math.min(rest, MAX_REST) : DEFAULT_REST;
}

/**
 * Soma (ou tira) segundos do descanso em andamento. Nunca termina no passado
 * nem passa do máximo. Devolve o novo horário de término.
 */
export function adjustEnd(endAt, now, deltaSeconds) {
  const remaining = Math.max(0, endAt - now) + deltaSeconds * 1000;
  return now + Math.min(Math.max(remaining, 0), MAX_REST * 1000);
}

/** Fração já decorrida (0 a 1), para a barra de progresso. */
export function progress(startAt, endAt, now) {
  const total = endAt - startAt;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (now - startAt) / total));
}
