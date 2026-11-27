// Timer de descanso entre séries. Fica numa barra fixa fora da tela atual
// (#timer), então continua contando se a usuária trocar de aba no app.
//
// - conta a partir do horário de término: certo mesmo com a tela bloqueada;
// - ±15 s e "Pular"; ao terminar, vibra, mostra aviso e toca um bipe (opcional);
// - mantém a tela ligada enquanto conta (Wake Lock, quando o navegador permite);
// - sobrevive a recarregar a página (sessionStorage).
import { h, icon, ICONS, srOnly } from './dom.js';
import { showStatus } from './status.js';
import { remainingSeconds, formatClock, spokenDuration, adjustEnd, progress, STEP } from '../domain/timer.js';

const STORE_KEY = 'ritmo:timer';
const SOUND_KEY = 'ritmo:pref:timer-sound';
const TICK_MS = 250;

let current = null; // { label, startAt, endAt }
let interval = 0;
let wakeLock = null;
let root = null;

// ---------- Preferências e persistência (por aparelho) ----------

function soundOn() {
  try {
    return localStorage.getItem(SOUND_KEY) === '1';
  } catch {
    return false;
  }
}

function setSound(on) {
  try {
    localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

function persist() {
  try {
    if (current) sessionStorage.setItem(STORE_KEY, JSON.stringify(current));
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    // ignora: o timer continua funcionando em memória
  }
}

function restore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null');
    if (saved && saved.endAt > Date.now()) return saved;
  } catch {
    // dado inválido: ignora
  }
  return null;
}

// ---------- Efeitos do navegador ----------

async function keepScreenOn() {
  try {
    if (!wakeLock && navigator.wakeLock?.request) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => {
        wakeLock = null;
      });
    }
  } catch {
    wakeLock = null; // bateria fraca, aba oculta ou sem suporte
  }
}

function releaseScreen() {
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close?.(), 1000);
  } catch {
    // áudio indisponível: vibração e aviso continuam
  }
}

// ---------- Ciclo do timer ----------

function finish() {
  const label = current?.label;
  stop();
  navigator.vibrate?.([200, 100, 200, 100, 300]);
  if (soundOn()) beep();
  showStatus(label ? `Descanso terminado. Próxima série de ${label}!` : 'Descanso terminado. Próxima série!', {
    type: 'success',
  });
}

function tick() {
  if (!current) return;
  if (remainingSeconds(current.endAt, Date.now()) === 0) finish();
  else render();
}

/** Começa (ou recomeça) um descanso de `seconds` segundos. */
export function startRest(seconds, label = '') {
  const now = Date.now();
  current = { label, startAt: now, endAt: now + seconds * 1000 };
  persist();
  clearInterval(interval);
  interval = setInterval(tick, TICK_MS);
  keepScreenOn();
  render({ announce: `Descanso de ${spokenDuration(seconds)} começou.` });
}

function adjust(delta) {
  if (!current) return;
  const now = Date.now();
  current.endAt = adjustEnd(current.endAt, now, delta);
  if (current.endAt <= now) return finish();
  persist();
  render({ announce: `Faltam ${spokenDuration(remainingSeconds(current.endAt, now))}.` });
}

/** Para o descanso sem avisar (ex.: "Pular"). */
export function stop() {
  current = null;
  clearInterval(interval);
  interval = 0;
  persist();
  releaseScreen();
  render();
}

export const isResting = () => current !== null;

// ---------- Interface ----------

function render({ announce } = {}) {
  root ??= document.getElementById('timer');
  if (!root) return;
  document.body.classList.toggle('has-timer', Boolean(current));
  if (!current) {
    root.replaceChildren();
    return;
  }

  const now = Date.now();
  const left = remainingSeconds(current.endAt, now);
  const existing = root.querySelector('.rest-timer');
  if (existing && !announce) {
    // Atualização a cada tique: só o relógio e a barra (sem recriar os botões).
    existing.querySelector('.rest-clock').textContent = formatClock(left);
    existing.querySelector('.rest-bar span').style.width = `${progress(current.startAt, current.endAt, now) * 100}%`;
    return;
  }

  const sound = soundOn();
  root.replaceChildren(
    h(
      'section',
      { class: 'rest-timer', 'aria-label': 'Descanso' },
      h(
        'div',
        { class: 'rest-main' },
        h(
          'p',
          { class: 'rest-title' },
          h('span', {}, 'Descanso'),
          current.label && h('span', { class: 'rest-label' }, ` · ${current.label}`),
        ),
        // role="timer" não é anunciado a cada segundo; os anúncios vão na região abaixo.
        h('p', { class: 'rest-clock', role: 'timer', 'aria-live': 'off' }, formatClock(left)),
      ),
      h('div', { class: 'rest-bar', 'aria-hidden': 'true' }, h('span', { style: `width:${progress(current.startAt, current.endAt, now) * 100}%` })),
      h(
        'div',
        { class: 'rest-actions' },
        // Texto visível "−15s" + texto oculto: o nome lido é "−15 segundos" (contém o que está na tela).
        h('button', { type: 'button', class: 'btn', onclick: () => adjust(-STEP) }, h('span', {}, `−${STEP}`, h('span', { 'aria-hidden': 'true' }, 's')), srOnly(' segundos')),
        h('button', { type: 'button', class: 'btn', onclick: () => adjust(STEP) }, h('span', {}, `+${STEP}`, h('span', { 'aria-hidden': 'true' }, 's')), srOnly(' segundos')),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-pressed': String(sound),
            'aria-label': 'Bipe ao terminar',
            title: sound ? 'Bipe ligado' : 'Bipe desligado',
            onclick: () => {
              setSound(!soundOn());
              render({ announce: soundOn() ? 'Bipe ligado.' : 'Bipe desligado.' });
              root.querySelector('[aria-label="Bipe ao terminar"]')?.focus();
            },
          },
          icon(sound ? ICONS.somLigado : ICONS.somDesligado, { size: 20 }),
        ),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => stop() }, 'Pular'),
      ),
      h('p', { class: 'visually-hidden', 'aria-live': 'polite' }, announce ?? ''),
    ),
  );
}

/** Liga o timer ao app: retoma um descanso salvo e reativa a tela ligada ao voltar para o app. */
export function setupRestTimer() {
  const saved = restore();
  if (saved) {
    current = saved;
    interval = setInterval(tick, TICK_MS);
    keepScreenOn();
    render({ announce: '' });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !current) return;
    tick(); // pode ter terminado enquanto a tela estava bloqueada
    if (current) keepScreenOn(); // o navegador solta o Wake Lock quando a aba some
  });
}
