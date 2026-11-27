# Ritmo — Plano de desenvolvimento (v2)

**Data** 24 de novembro de 2026
**Produto** Diário pessoal de academia em português do Brasil
**Hospedagem** GitHub Pages, publicado por GitHub Actions a partir da branch `main`

Este documento revisa o plano original (gerado no ChatGPT, versão `15e6fa4`) e o adapta para o repositório `gtarno/ritmo`. O escopo funcional do produto foi mantido; as mudanças estão em hospedagem, organização do código, segurança dos dados, testes e em melhorias de uso no celular durante o treino.

## 1. Objetivo do produto

Organizar a volta à academia após um período parado, com foco em emagrecer e definir. A rotina principal é: **planejar a semana → abrir o treino do dia → registrar o que foi feito → rever cargas e medidas → ajustar o modelo**.

O app começa sem peso, medidas, cargas realizadas ou sessões concluídas. Meta inicial de 4 sessões por semana, editável (1 a 7), com dois modelos reaproveitáveis (A e B).

## 2. O que mudou em relação ao plano original

| Tema | Plano original | Plano v2 | Por quê |
| --- | --- | --- | --- |
| Hospedagem | ChatGPT Sites, acesso privado por login | **GitHub Pages** com deploy por GitHub Actions | Pedido do projeto; versionamento e deploy automático a cada merge na `main` |
| Privacidade | Login protegia a abertura do site | Site público, **dados só no navegador** (nada vai para servidor) | Pages não tem login; o app não deve conter dados pessoais no código |
| Uso na academia | Página web comum | **PWA instalável e offline** | Academia costuma ter sinal ruim; abrir pelo ícone da tela inicial é mais rápido |
| Segurança dos dados | Sem backup (evolução opcional) | **Exportar/importar JSON promovido ao MVP+** e `navigator.storage.persist()` | Limpar dados do navegador apagava tudo; Safari no iOS pode apagar dados de sites pouco usados |
| Armazenamento | Chave `ritmo:v1` sem versão interna | Envelope `{ schemaVersion, data }` com **migrações versionadas** desde o início | Evita perda de dados quando o formato mudar |
| Código | Um único `app.js` | **Módulos ES nativos** (sem build), separando estado, regras, telas e gráficos | Facilita testes e manutenção sem adicionar ferramenta de build |
| Testes | Validação manual na prévia | **Testes unitários (`node --test`) + e2e Playwright no CI** | Regras de negócio (cópia de modelo, frequência, gráficos) ficam protegidas contra regressão |
| Fuso horário | Fixo em `America/Sao_Paulo` | Padrão São Paulo, **configurável** | Viagens e horário de verão não quebram o "hoje" |
| Durante o treino | Só marcar exercício e carga | **Timer de descanso**, registro por série e indicador de progressão | É o momento de maior uso do app |

## 3. Requisitos e telas (MVP — paridade com o plano original)

| Tela | Entrega | Critério de aceite |
| --- | --- | --- |
| **Visão geral** (`#painel`) | Meta e objetivo editáveis, total na semana, próximo treino, último peso, total de sessões, semana atual, histórico recente e orientação de adaptação | Ao concluir uma sessão, a frequência e o histórico atualizam |
| **Treino AB** (`#treino`) | Modelos A e B: criar, editar e remover exercícios (séries, repetições ou tempo, carga planejada em kg, intervalo em segundos) e cardio em texto livre | Editar o modelo afeta só sessões abertas depois; sessões já iniciadas são preservadas |
| **Registro de sessão** | Marcação por exercício, carga realizada, cardio, observações, salvar andamento e concluir | Sessão retomável após recarregar. Concluir exige ao menos um exercício marcado ou cardio |
| **Calendário** (`#calendario`) | Navegação semanal e mensal, abrir sessão por data, planejar semana AB | Planejar cria sessões nos dias sugeridos sem sobrescrever as existentes |
| **Evolução** (`#evolucao`) | Gráficos SVG de peso, medida, carga por exercício e frequência; lista de registros corporais e histórico de cargas | Gráficos refletem os registros; carga vem de exercícios marcados em sessões concluídas |
| **Diário** (`#diario`) | Observações, dores, limitações e ajustes, com data, texto, vínculo opcional a A/B e intensidade 0–10 | Registro aparece após salvar; mudanças no modelo geram registro de ajuste |

### Configuração inicial

| Modelo | Grupo | Exercícios |
| --- | --- | --- |
| A | Superiores e core | Supino na máquina, remada sentada, puxada frontal, desenvolvimento na máquina, prancha |
| B | Inferiores | Leg press, cadeira flexora, cadeira extensora, elevação de quadril, panturrilha sentada |

2 séries, 75 s de intervalo, carga em aberto, 8–12 repetições (prancha 15–20 s), cardio de 10 min de caminhada leve. Semana sugerida: **Seg A · Ter B · Qua — · Qui A · Sex B · Sáb — · Dom —** (configurável a partir do M3).

### Regras de negócio mantidas

- Uma sessão por data; ao abrir, copia o modelo vigente (exercícios, séries, repetições, intervalos, cargas, cardio).
- Datas futuras permitem agendar; hoje e datas passadas permitem registrar.
- Identificador do exercício é estável mesmo se o nome mudar. Exercício removido do modelo continua no seletor de evolução se houver histórico.
- Carga vazia ≠ zero. Vazia fica fora do gráfico; zero é válido.
- Gráfico de carga: últimas 12 cargas de exercícios marcados em sessões concluídas. Gráficos corporais: até 12 registros. Frequência: últimas 8 semanas, incluindo a atual.
- Um registro corporal por data (peso, cintura, quadril, tórax, coxa — todos opcionais, ao menos um obrigatório).
- Remover sessão exige confirmação e retira sua contribuição de gráficos e frequência.
- Progressão é manual: o app pode **sinalizar** quando o topo das repetições foi atingido em sessões consecutivas, mas nunca altera carga sozinho.

## 4. Arquitetura

Aplicação estática (HTML + CSS + JavaScript com módulos ES nativos), sem framework, sem servidor e sem etapa de build. Navegação por fragmento de URL. Gráficos em SVG gerados pelo próprio app.

```
app/                    ← publicado no GitHub Pages
  index.html
  style.css
  manifest.webmanifest  (M2)
  sw.js                 (M2)
  js/
    main.js             ← bootstrap e roteador
    store.js            ← leitura/gravação, envelope versionado, migrações
    dates.js            ← "hoje" no fuso configurado, semanas (seg–dom)
    domain/             ← regras puras: planos, sessões, medidas, diário, séries dos gráficos
    views/              ← uma tela por arquivo
    ui/                 ← diálogo, status, componentes de formulário, gráficos SVG
tests/
  unit/                 ← node --test sobre domain/, dates.js e store.js
  e2e/                  ← Playwright
.github/workflows/
  ci.yml                ← sintaxe + unitários + e2e em PRs
  pages.yml             ← deploy de app/ no GitHub Pages
docs/PLANO.md
```

**Regra de ouro:** `domain/` não toca no DOM nem no `localStorage` — recebe estado e devolve estado novo. Isso é o que torna os testes simples.

### Modelo de dados

Gravado no `localStorage` sob `ritmo:v1` como `{ "schemaVersion": 1, "data": { ... } }`.

| Entidade | Representação | Invariantes |
| --- | --- | --- |
| Preferências | `goal`, `target`, `timezone`, `weekTemplate` | `target` de 1 a 7; `weekTemplate` padrão `["A","B",null,"A","B",null,null]` |
| Modelo | `plans.A`, `plans.B` com `cardio` e `exercises[]` | Lista própria por modelo |
| Exercício | `id`, `name`, `sets`, `reps`, `load`, `rest` | `id` estável; `reps` é texto; `load` `null` ≠ `0` |
| Sessão | `sessions[date]` com `date`, `type`, `done`; ao abrir ganha `exercises`, `cardio`, `cardioDone`, `notes` | Cópia independente do modelo; cada exercício ganha `checked` |
| Registro corporal | `measurements[]` com `date`, `weight`, `waist`, `hips`, `chest`, `thigh` | Uma entrada por data |
| Diário | `notes[]` com `id`, `date`, `category`, `plan`, `text`, `intensity?` | Manuais e automáticos na mesma lista |

Toda mudança de formato incrementa `schemaVersion` e adiciona uma função de migração `vN → vN+1` com teste. O backup exportado usa o mesmo envelope.

### Privacidade

O GitHub Pages é público: qualquer pessoa com o link abre o app **vazio**. Os dados de treino ficam só no navegador de quem usa (por origem e perfil), não vão para o repositório nem para nenhum servidor. Por isso o backup em JSON é essencial. Nunca commitar dados reais nem backups no repositório.

## 5. Hospedagem e deploy

1. O workflow `.github/workflows/pages.yml` publica a pasta `app/` a cada push na `main` (e manualmente via *Run workflow*).
2. Configuração única no GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Endereço: `https://gtarno.github.io/ritmo/`. Todos os caminhos do app devem ser **relativos** (o site roda em subpasta `/ritmo/`), inclusive no manifest e no service worker.
4. GitHub Pages em repositório privado exige plano pago; em conta gratuita o repositório precisa ser público.
5. Antes de mudar o formato dos dados em produção, a migração precisa estar pronta e testada (ver seção 4).

## 6. Fluxo de trabalho

- Uma issue por entrega, uma branch por issue, PR para `main` com CI verde.
- `main` sempre publicável: o merge dispara o deploy.
- Checklist de teste manual no celular antes de fechar marcos (sessão completa, sessão parcial, reagendamento, edição de modelo com histórico, medidas, diário, recarregar página, modo avião).

## 7. Marcos e issues

As issues estão no GitHub com o rótulo do marco (`M0`…`M4`).

### M0 — Fundação
- [#2](https://github.com/GTarno/ritmo/issues/2) Estrutura do projeto com módulos ES e decisão sobre importar o código antigo
- [#3](https://github.com/GTarno/ritmo/issues/3) Camada de armazenamento versionada com migrações
- [#4](https://github.com/GTarno/ritmo/issues/4) Utilitários de data com fuso configurável
- [#5](https://github.com/GTarno/ritmo/issues/5) CI: sintaxe, testes unitários e e2e
- [#1](https://github.com/GTarno/ritmo/issues/1) Deploy no GitHub Pages *(entregue junto com este plano)*

### M1 — MVP (paridade com o plano original)
- [#6](https://github.com/GTarno/ritmo/issues/6) Shell do app: navegação, layout mobile-first, diálogos e status
- [#7](https://github.com/GTarno/ritmo/issues/7) Treino AB: modelos e edição de exercícios
- [#8](https://github.com/GTarno/ritmo/issues/8) Registro de sessão
- [#9](https://github.com/GTarno/ritmo/issues/9) Calendário e planejar semana
- [#10](https://github.com/GTarno/ritmo/issues/10) Visão geral (painel)
- [#11](https://github.com/GTarno/ritmo/issues/11) Evolução: medidas e gráficos SVG
- [#12](https://github.com/GTarno/ritmo/issues/12) Diário

### M2 — Dados seguros e uso no celular
- [#13](https://github.com/GTarno/ritmo/issues/13) Exportar e importar backup JSON (com lembrete periódico)
- [#14](https://github.com/GTarno/ritmo/issues/14) PWA: instalável e offline
- [#15](https://github.com/GTarno/ritmo/issues/15) Pedir armazenamento persistente
- [#16](https://github.com/GTarno/ritmo/issues/16) Revisão de acessibilidade e de navegadores móveis

### M3 — Experiência de treino
- [#17](https://github.com/GTarno/ritmo/issues/17) Timer de descanso
- [#18](https://github.com/GTarno/ritmo/issues/18) Registro por série (carga, repetições, esforço)
- [#19](https://github.com/GTarno/ritmo/issues/19) Indicador de progressão de carga
- [#23](https://github.com/GTarno/ritmo/issues/23) Modelos de treino editáveis: criar, renomear e remover (além de A e B)
  - [#36](https://github.com/GTarno/ritmo/issues/36) Novo formato de dados e migração v1 → v2
  - [#37](https://github.com/GTarno/ritmo/issues/37) Tela de treinos: criar, duplicar, renomear, reordenar e remover modelos
  - [#38](https://github.com/GTarno/ritmo/issues/38) Sessão, calendário e painel com qualquer número de modelos
  - [#39](https://github.com/GTarno/ritmo/issues/39) Evolução e diário com qualquer número de modelos
- [#20](https://github.com/GTarno/ritmo/issues/20) Semana configurável (dias e sequência de modelos) — depende de #36
- [#21](https://github.com/GTarno/ritmo/issues/21) Tema escuro

### M4 — Futuro (a avaliar)
- [#22](https://github.com/GTarno/ritmo/issues/22) Sincronização entre dispositivos
