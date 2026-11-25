# Ritmo

Diário pessoal de academia em português do Brasil: planejar a semana, registrar treinos, acompanhar cargas, medidas e frequência. Aplicação estática, dados salvos só no navegador.

- **Plano de desenvolvimento:** [docs/PLANO.md](docs/PLANO.md)
- **Site:** https://gtarno.github.io/ritmo/ (publicado automaticamente a cada push na `main`)

## Rodar localmente

Sem build. Requer Node 22+ apenas para os scripts de desenvolvimento.

```bash
npm install                          # só ferramentas de teste
npm start                            # app em http://localhost:4173/ritmo/ (igual ao Pages)
npm run check                        # node --check em todos os .js de app/
npm test                             # testes unitários (node:test)
npx playwright install chromium      # uma vez, para os testes e2e
npm run test:e2e                     # testes no navegador (desktop e celular)
```

O CI (`.github/workflows/ci.yml`) roda sintaxe, testes unitários e e2e em todo pull request.

## Organização do código

```
app/                 ← publicado no GitHub Pages, sem build
  index.html, style.css
  js/main.js         ← ponto de entrada e roteamento por #hash
  js/domain/         ← regras puras: sem DOM, sem localStorage (fácil de testar)
  js/views/          ← uma tela por arquivo
  js/ui/             ← componentes de interface reaproveitáveis
tests/unit/          ← testes de regras com node:test
tests/e2e/           ← testes no navegador com Playwright
scripts/             ← utilitários de desenvolvimento
```

Convenções:
- Módulos ES nativos (`import`/`export`), caminhos sempre **relativos** (o site roda em `/ritmo/`).
- Código e textos da interface em português; datas no formato `AAAA-MM-DD`.
- Carga vazia é `null`, nunca `0` (zero é um valor válido).
- Nunca commitar dados reais ou backups.

## App instalável e offline

- `app/sw.js` guarda todos os arquivos do app num cache com versão. **Ao criar um arquivo em `app/`, inclua-o em `ASSETS`** (um teste unitário confere).
- A versão (`__VERSION__`) é trocada pelo commit no deploy e por um hash do conteúdo no `npm start`. Quando muda, o app mostra "Nova versão disponível" com o botão "Atualizar".
- Ícones: `node scripts/generate-icons.js` gera os PNGs de `app/icons/` a partir do SVG do script.

## Publicação

O workflow `.github/workflows/pages.yml` publica `app/` no GitHub Pages. Configuração única: **Settings → Pages → Source: GitHub Actions**.
