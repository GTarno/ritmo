// Estado do app em memória, compartilhado pelas telas.
// As telas leem `app.state`, aplicam uma função de domain/ e chamam `app.commit(novoEstado)`.
import { createStore } from './store.js';
import { today } from './dates.js';
import { showStatus } from './ui/status.js';

const store = createStore();
const loaded = store.load();

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const app = {
  state: loaded.state,
  store,
  loaded,

  /** Data de hoje no fuso escolhido. */
  today() {
    return today(app.state.timezone);
  },

  /** Contexto para as funções de domain/: data de hoje e gerador de ids. */
  ctx() {
    return { today: app.today(), newId };
  },

  /** Grava o estado atual e avisa se não conseguir. Devolve true se salvou. */
  save() {
    const result = store.save(app.state);
    if (!result.ok) showStatus(result.message, { type: 'error' });
    return result.ok;
  },

  /** Troca o estado e grava. */
  commit(next) {
    app.state = next;
    return app.save();
  },
};
