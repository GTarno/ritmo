// Instalação e atualização do app (PWA).
// - registra o service worker (funcionamento offline);
// - avisa quando há uma versão nova e atualiza quando a usuária tocar em "Atualizar";
// - guarda o convite de instalação do navegador (Android/Chrome) para a tela "Seus dados".
import { showStatus } from './ui/status.js';

let installPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

/** Avisa quando muda a possibilidade de instalar (para redesenhar a tela). */
export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function canPromptInstall() {
  return installPrompt !== null;
}

/** Mostra o convite de instalação do navegador. Devolve true se a usuária aceitou. */
export async function promptInstall() {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  notify();
  return outcome === 'accepted';
}

/** 'ios' | 'android' | 'outro' — para mostrar as instruções certas. */
export function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'outro';
}

function offerUpdate(worker) {
  showStatus('Nova versão do Ritmo disponível.', {
    timeout: 0,
    action: {
      label: 'Atualizar',
      onClick: () => worker.postMessage('SKIP_WAITING'),
    },
  });
}

export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    notify();
    showStatus('Ritmo instalado. Abra pelo ícone na tela inicial.');
  });

  if (!('serviceWorker' in navigator)) return;

  // Quando a versão nova assume, recarrega uma vez para usar os arquivos novos.
  let reloading = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return; // primeira instalação: nada a recarregar
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register('sw.js')
    .then((registration) => {
      // Versão nova já baixada e esperando (ex.: aba aberta durante um deploy).
      if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
    })
    .catch(() => {
      // Sem service worker o app funciona normalmente, só não fica offline.
    });
}
