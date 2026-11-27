# Roteiro de teste no celular

Parte manual da revisão de acessibilidade e navegadores móveis (#16). O que dá para automatizar já roda no CI a cada PR:

| Verificação automática | Onde |
| --- | --- |
| Acessibilidade WCAG 2.1 A/AA (axe-core) em todas as telas e janelas, temas claro e escuro | `tests/e2e/a11y.spec.js` |
| Sem rolagem horizontal em 320, 360, 390, 768, 1024 e 1280px | `tests/e2e/a11y.spec.js` |
| Treino completo só com teclado | `tests/e2e/a11y.spec.js` |
| Movimento reduzido: nenhuma animação | `tests/e2e/a11y.spec.js` |
| Motor do Safari (WebKit) com perfil de iPhone | job "Testes e2e (Safari/WebKit)" |
| Lighthouse ≥ 90 em acessibilidade e boas práticas | job "Lighthouse" |

O que só um aparelho de verdade confirma está abaixo. Leva uns 15 minutos por aparelho. Marque o que passou e anote o que estranhar (com print, se puder) numa issue nova.

## Antes de começar

- Endereço: `https://gtarno.github.io/ritmo/`
- Faça um backup em **Seus dados** se já tiver registros de verdade.

## 1. Instalação e offline

- [ ] **iPhone (Safari):** Compartilhar → "Adicionar à Tela de Início". O ícone laranja com a linha de batimento aparece na tela inicial.
- [ ] **Android (Chrome):** menu ⋮ → "Instalar app" (ou o botão "Instalar o Ritmo" em Seus dados).
- [ ] Abrir pelo ícone: o app ocupa a tela toda, sem a barra do navegador.
- [ ] Ligar o **modo avião** e abrir pelo ícone: o Início carrega.
- [ ] Ainda em modo avião: registrar uma sessão inteira (começar, marcar 2 exercícios, carga, concluir).
- [ ] Desligar o modo avião, fechar e abrir de novo: a sessão continua lá.
- [ ] Em **Seus dados → Proteção dos dados**: anotar se aparece "Protegido" ou "Não protegido".

## 2. Teclado e formulários

- [ ] Campo **Carga** (sessão e Treino AB): abre o teclado numérico com vírgula.
- [ ] Campo **Séries** e **Intensidade**: teclado numérico.
- [ ] Ao tocar num campo, a tela **não dá zoom** sozinha (iPhone).
- [ ] O campo com o cursor não fica escondido atrás do teclado.
- [ ] Datas (Planejar semana, Registrar medidas, Diário): abre o seletor de data do sistema.

## 3. Janelas e navegação

- [ ] Janelas (editar exercício, remover, planejar semana): abrem centralizadas, dá para rolar quando o teclado está aberto e os botões Salvar/Cancelar continuam alcançáveis.
- [ ] Fechar janela tocando fora dela funciona.
- [ ] Gesto/botão **voltar** do celular volta para a tela anterior do app.
- [ ] Menu de baixo: não fica atrás da barra de gestos do iPhone.
- [ ] Na sessão, os botões "Salvar andamento" e "Concluir sessão" ficam visíveis acima do menu.

## 4. Gráficos e calendário

- [ ] Evolução: tocar num ponto do gráfico mostra o valor; arrastar o dedo percorre os pontos sem rolar a página para os lados.
- [ ] Calendário mensal: os dias cabem na largura e dá para tocar em cada um sem errar o vizinho.

## 5. Leitor de tela (opcional, se quiser testar)

- **iPhone:** Ajustes → Acessibilidade → VoiceOver. **Android:** Configurações → Acessibilidade → TalkBack.
- [ ] Ao trocar de aba no menu, o título da tela é anunciado.
- [ ] Os dias do calendário são lidos com data e situação (ex.: "segunda, 23/11: Treino A concluído").
- [ ] Ao salvar, o aviso ("Sessão concluída…") é anunciado.
- [ ] Nas janelas, o foco fica dentro delas até fechar.

## 6. Aparência

- [ ] Tema escuro do celular ligado: o app fica escuro e tudo continua legível.
- [ ] Texto ampliado nas configurações do celular (tamanho grande): nada se sobrepõe nem é cortado.

## Resultado

| Aparelho / navegador | Data | Passou | Problemas (link da issue) |
| --- | --- | --- | --- |
| | | | |
