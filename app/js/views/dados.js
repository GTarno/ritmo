// Tela "Seus dados" (#dados): onde os dados ficam, exportar e importar backup.
import { app } from '../app-state.js';
import { h, icon, ICONS } from '../ui/dom.js';
import { confirmDialog } from '../ui/dialog.js';
import { showStatus } from '../ui/status.js';
import { today as todayIn, formatNumeric, diffDays } from '../dates.js';
import { storageStatus, requestPersistence, formatBytes } from '../persistence.js';
import { isStandalone, canPromptInstall, promptInstall, platform, onInstallChange } from '../pwa.js';
import { buildBackup, backupFileName, parseBackup, summarize, markBackup, isoToDate } from '../domain/backup.js';

export const PRE_IMPORT_PREFIX = 'ritmo:pre-import:';

const plural = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

function describe(summary) {
  return [
    `${plural(summary.sessions, 'sessão', 'sessões')} (${plural(summary.done, 'concluída', 'concluídas')})`,
    plural(summary.measurements, 'registro corporal', 'registros corporais'),
    plural(summary.notes, 'anotação no diário', 'anotações no diário'),
  ];
}

function lastBackupText() {
  const last = app.state.lastBackupAt;
  if (!last) return 'Você ainda não fez nenhum backup.';
  const days = diffDays(last, app.today());
  const when = days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
  return `Último backup: ${formatNumeric(last)} (${when}).`;
}

// ---------- Exportar ----------

function backupFile() {
  const text = buildBackup(app.state);
  const name = backupFileName(app.today());
  return { text, name, file: new File([text], name, { type: 'application/json' }) };
}

function afterExport(message, rerender, focus) {
  if (app.commit(markBackup(app.state, app.today()))) showStatus(message);
  rerender(focus);
}

function onDownload(rerender) {
  const { file, name } = backupFile();
  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  afterExport(`Backup baixado: ${name}. Guarde o arquivo fora do celular (Drive, e-mail…).`, rerender, '[data-action="download"]');
}

async function onShare(rerender) {
  const { file, name } = backupFile();
  try {
    await navigator.share({ files: [file], title: 'Backup do Ritmo', text: name });
    afterExport('Backup enviado.', rerender, '[data-action="share"]');
  } catch (err) {
    if (err?.name !== 'AbortError') showStatus('Não foi possível compartilhar. Use “Baixar backup”.', { type: 'error' });
  }
}

function canShareFiles() {
  try {
    const probe = new File(['{}'], 'x.json', { type: 'application/json' });
    return typeof navigator.share === 'function' && navigator.canShare?.({ files: [probe] }) === true;
  } catch {
    return false;
  }
}

// ---------- Importar ----------

async function onImport(file, rerender) {
  if (!file) return;
  let text;
  try {
    text = await file.text();
  } catch {
    showStatus('Não foi possível ler o arquivo.', { type: 'error' });
    return;
  }
  const result = parseBackup(text);
  if (result.error) {
    showStatus(result.error, { type: 'error' });
    return;
  }

  const { data, exportedAt, summary } = result.value;
  const fileDate = isoToDate(exportedAt, (d) => todayIn(app.state.timezone, d));
  const current = summarize(app.state);
  const ok = await confirmDialog(
    [
      h('p', {}, fileDate ? `Backup de ${formatNumeric(fileDate)}:` : 'Conteúdo do backup:'),
      h('ul', { class: 'summary-list' }, describe(summary).map((t) => h('li', {}, t))),
      h('p', {}, 'Dados atuais neste navegador, que serão substituídos:'),
      h('ul', { class: 'summary-list' }, describe(current).map((t) => h('li', {}, t))),
      h('p', { class: 'muted' }, 'Uma cópia dos dados atuais fica guardada neste navegador antes da troca.'),
    ],
    { title: 'Substituir os dados pelo backup?', confirmLabel: 'Substituir', danger: true },
  );
  if (!ok) return rerender('[data-action="import"]');

  app.store.snapshot(PRE_IMPORT_PREFIX);
  const next = markBackup(data, fileDate ?? data.lastBackupAt ?? app.today());
  if (app.commit(next)) showStatus('Backup importado. Seus dados foram restaurados.', { type: 'success' });
  rerender('[data-action="import"]');
}

// ---------- Instalar ----------

const INSTALL_STEPS = {
  ios: 'No Safari, toque em Compartilhar (o quadrado com a seta para cima) e depois em “Adicionar à Tela de Início”.',
  android: 'No Chrome, toque no menu ⋮ e depois em “Instalar app” ou “Adicionar à tela inicial”.',
  outro: 'No celular, abra este endereço no navegador e use “Adicionar à tela inicial”. No computador, use o ícone de instalar na barra de endereço.',
};

function installCard(rerender) {
  let content;
  if (isStandalone()) {
    content = h('p', {}, 'Você está usando o Ritmo instalado. Ele abre pelo ícone e funciona sem internet.');
  } else if (canPromptInstall()) {
    content = [
      h('p', {}, 'Instale o Ritmo para abrir pelo ícone, em tela cheia, e usar sem internet na academia.'),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          dataset: { action: 'install' },
          onclick: async () => {
            await promptInstall();
            rerender('[data-action="download"]');
          },
        },
        'Instalar o Ritmo',
      ),
    ];
  } else {
    content = [
      h('p', {}, 'Adicione o Ritmo à tela inicial para abrir pelo ícone, em tela cheia, e usar sem internet na academia.'),
      h('p', { class: 'install-steps' }, INSTALL_STEPS[platform()]),
    ];
  }
  return h(
    'section',
    { class: 'card', 'aria-labelledby': 'install-title' },
    h('h3', { id: 'install-title' }, 'Usar como app'),
    content,
    !isStandalone() && h('p', { class: 'muted' }, 'Depois de aberto uma vez, o app funciona sem internet.'),
  );
}

// ---------- Proteção dos dados ----------

function protectionCard(rerender) {
  const body = h('div', { 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'Verificando…'));
  const card = h(
    'section',
    { class: 'card', 'aria-labelledby': 'protection-title' },
    h('h3', { id: 'protection-title', tabindex: -1 }, 'Proteção dos dados'),
    body,
  );

  storageStatus().then((status) => {
    const usage =
      status.usage !== null &&
      h('p', { class: 'muted' }, `Espaço usado pelo app neste navegador: ${formatBytes(status.usage)}.`);

    if (!status.supported) {
      body.replaceChildren(
        h('p', {}, 'Este navegador não informa se protege os dados. Faça backups com frequência.'),
      );
      return;
    }
    if (status.persisted) {
      body.replaceChildren(
        h('p', { class: 'protection-ok' }, h('strong', {}, 'Protegido. '), 'O navegador não apaga os dados do Ritmo para liberar espaço.'),
        usage,
        h('p', { class: 'muted' }, 'Ainda assim, limpar os dados do site ou trocar de aparelho apaga tudo: mantenha um backup.'),
      );
      return;
    }
    body.replaceChildren(
      h(
        'p',
        { class: 'protection-warn' },
        h('strong', {}, 'Não protegido. '),
        'O navegador pode apagar os dados do Ritmo se faltar espaço ou se o site ficar semanas sem uso (comum no Safari do iPhone).',
      ),
      h(
        'ul',
        { class: 'summary-list' },
        h('li', {}, 'Instale o app (veja “Usar como app”): apps instalados costumam ser protegidos.'),
        h('li', {}, 'Faça backups com frequência.'),
      ),
      usage,
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          dataset: { action: 'persist' },
          onclick: async () => {
            const ok = await requestPersistence();
            showStatus(
              ok ? 'Pronto: o navegador vai proteger os dados do Ritmo.' : 'O navegador não liberou a proteção agora. Instalar o app costuma ajudar.',
              { type: ok ? 'success' : 'info' },
            );
            rerender('#protection-title');
          },
        },
        'Pedir proteção ao navegador',
      ),
    );
  });
  return card;
}

// ---------- Tela ----------

export function renderDados() {
  const body = h('div', { class: 'data-screen' });
  const root = h('section', { class: 'screen' }, h('h2', { class: 'screen-title' }, 'Seus dados'), body);

  function rerender(focusSelector) {
    const summary = summarize(app.state);
    const fileInput = h('input', {
      type: 'file',
      accept: 'application/json,.json',
      id: 'import-file',
      hidden: true,
      onchange: async (e) => {
        const [file] = e.target.files;
        e.target.value = '';
        await onImport(file, rerender);
      },
    });

    body.replaceChildren(
      installCard(rerender),
      protectionCard(rerender),
      h(
        'section',
        { class: 'card', 'aria-labelledby': 'where-title' },
        h('h3', { id: 'where-title' }, 'Onde ficam seus dados'),
        h(
          'p',
          {},
          'Tudo o que você registra fica só neste navegador, neste aparelho. Nada vai para a internet. ',
          'Se os dados do site forem apagados ou você trocar de celular, só um backup recupera o histórico.',
        ),
        h('ul', { class: 'summary-list' }, describe(summary).map((t) => h('li', {}, t))),
      ),
      h(
        'section',
        { class: 'card', 'aria-labelledby': 'export-title' },
        h('h3', { id: 'export-title' }, 'Fazer backup'),
        h('p', { class: 'muted', 'aria-live': 'polite' }, lastBackupText()),
        h('p', {}, 'Gera um arquivo .json com todos os seus registros. Guarde-o no Drive, no e-mail ou no computador.'),
        h(
          'div',
          { class: 'actions' },
          h(
            'button',
            { type: 'button', class: 'btn btn-primary', dataset: { action: 'download' }, onclick: () => onDownload(rerender) },
            icon(ICONS.baixar, { size: 20 }),
            'Baixar backup',
          ),
          canShareFiles() &&
            h('button', { type: 'button', class: 'btn', dataset: { action: 'share' }, onclick: () => onShare(rerender) }, 'Enviar para…'),
        ),
      ),
      h(
        'section',
        { class: 'card', 'aria-labelledby': 'import-title' },
        h('h3', { id: 'import-title' }, 'Restaurar backup'),
        h('p', {}, 'Escolha um arquivo de backup do Ritmo. Antes de substituir, o app mostra o que tem no arquivo e pede confirmação.'),
        fileInput,
        h(
          'button',
          { type: 'button', class: 'btn', dataset: { action: 'import' }, onclick: () => fileInput.click() },
          'Escolher arquivo de backup',
        ),
      ),
    );
    if (focusSelector) body.querySelector(focusSelector)?.focus();
  }

  // Redesenha quando o navegador passa a oferecer (ou deixa de oferecer) a instalação.
  const stop = onInstallChange(() => (root.isConnected ? rerender() : stop()));

  rerender();
  return root;
}
