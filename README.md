# Tower Gate

Jogo de cartas com lanes em Realidade Aumentada (RA), inspirado na leitura de campo do Clash Royale.

## Estado Atual

- Foco atual: fechar a estabilidade e o reposicionamento da arena em RA e adicionar feedback visual de combate.
- Entrega já concluída nesta etapa:
- arena com blocos de gramado (verde), rio (azul) e caminho (amarelado)
- torres placeholder com cilindros azuis e vermelhos
- toggle de RA sem UI HTML
- posicionamento da arena em RA com hit-test, toque na superficie e ajuste de escala
- HUD de cartas com selecao, custo e regeneracao de cogumelos
- spawn de unidade ao tocar na arena apos selecionar a carta
- unidade Javali Raivoso andando ate a torre inimiga e causando dano
- torres com vida, contra-ataque e estado destruido
- modo RA migrado de WebXR para o engine 8th Wall (SLAM via camera), com suporte a iOS
- layout landscape-first: HUD em paisagem e enquadramento de camera por aspect ratio
- tela inicial escolhendo o modo (RA ou tela) antes da partida; nada do jogo aparece no menu
- calibracao de escala absoluta obrigatoria antes de ancorar a arena, guiada pelo coaching overlay oficial do 8th Wall
- painel de setup em RA com ajuste de escala, "Reposicionar" e "Comecar"

## Diarios de experimento

Cada linha de investigacao tem um diario em [`docs/experimentos/`](docs/experimentos/README.md)
— o que foi tentado, o que cada tentativa provou e o que ainda esta aberto,
inclusive as conclusoes que foram desmentidas depois:

- [`ra-e-paisagem.md`](docs/experimentos/ra-e-paisagem.md) — estabilidade da arena
  em RA e layout paisagem;
- [`ferramental-de-sessao.md`](docs/experimentos/ferramental-de-sessao.md) — como
  o projeto registra o proprio progresso entre sessoes.

Os diarios sao escritos pela skill `encerrar-sessao`
(`.claude/skills/encerrar-sessao/SKILL.md`), acionada ao fim de cada sessao.

## Layout (paisagem)

O jogo e desenhado para ser jogado com o celular deitado:

- barra superior esquerda com contador de cogumelos, switch de RA e botao de escala;
- linhas de status (RA e carta selecionada) logo abaixo da barra;
- cartas em losango empilhadas na borda direita — a descricao da carta aparece no status ao seleciona-la;
- a camera reenquadra a arena a cada mudanca de orientacao, descontando a faixa ocupada pelas cartas.

## Tela cheia e orientacao

A politica e **por modo de jogo**, nao global — e por isso que o modo e
escolhido na tela inicial, antes da partida:

- **Modo tela**: no Android/Chrome o jogo entra em tela cheia e trava em
  paisagem (`requestFullscreen` + `screen.orientation.lock`) no primeiro gesto
  depois da escolha. Depois do primeiro sucesso ele nao insiste mais — o botao
  `⛶` da barra superior serve para sair e voltar.
- **Modo RA**: roda **destravado**, sem tela cheia — `enterAR()` chama
  `exitImmersiveMode()` antes de subir a sessao. Em device, paisagem e portrait
  funcionam igualmente bem na RA; o que quebra e **trocar de orientacao com a
  sessao no ar** (a cena sai esticada). Por isso a RA nao pede rotacao nem
  fullscreen: nao adianta convidar o jogador a girar. Paisagem **travada**
  (`lock`) ainda nao foi retestada depois da calibracao obrigatoria — ver
  `docs/experimentos/ra-e-paisagem.md`.
- O overlay CSS "gire o celular" so aparece no modo tela (classe
  `needs-landscape` no `<body>`, aplicada pelo `GameFlow`).
- No Safari do iPhone nao existe Fullscreen API: o botao `⛶` fica oculto e a
  tela cheia de verdade so acontece com **Compartilhar > Adicionar a Tela de
  Inicio** (o `manifest.webmanifest` e as metas `apple-mobile-web-app-*` fazem
  o atalho abrir em paisagem, sem barras do Safari).
- No modo tela, quando a trava de orientacao nao esta disponivel, um overlay CSS
  pede para girar o aparelho.

## Realidade Aumentada (8th Wall)

- O modo RA usa o engine 8th Wall (`@8thwall/engine-binary`), que roda em qualquer navegador mobile (iOS Safari incluido) — WebXR nao e mais utilizado.
- Os artefatos do engine sao copiados de `node_modules` para `public/8thwall/` automaticamente no `npm install` (script `postinstall`).
- O chao estimado pelo SLAM fica no plano `y = 0`; a arena e posicionada por raycast com toque na superficie, com ajuste de escala (mundo em metros, escala absoluta).
- Como a escala e absoluta, ela so converge depois que o SLAM ganha paralaxe. O
  posicionamento so libera com `trackingStatus === "NORMAL"` — o criterio oficial
  de "calibrado", o mesmo que o coaching overlay do 8th Wall usa para sumir da
  tela. Em ambiente com pouca textura ha um escape: apos 30s preso em `LIMITED`
  o toque libera com aviso de precisao reduzida.
- O coaching overlay (`@8thwall/coaching-overlay`, MIT) e carregado por
  `<script>` e copiado para `public/coaching-overlay/` no mesmo `postinstall`.
- O binario possui licenca de uso limitado (ver `node_modules/@8thwall/engine-binary/LICENSE`).

## Roadmap de Fases

| Concluida | Fase | Tarefa | Objetivo |
| --- | --- | --- | --- |
| [x] | 01 | POC | AR mode, Arena com escala, posicionar tropas |
| [0] | 02 | Inimigos | Bot inimigo para jogar contra. |
| [0] | 03 | Sons e Musica | Adicionar música de fundo e sons para ataques. |
| [~] | 04 | Tela inicial e Final game | Menu inicial **entregue** (escolha de modo RA/tela); falta a tela de fim de partida (ganha/perde) |

## Critério de Conclusão da Fase 01

- Arena ancorada em RA com estabilidade visual.
- Sem jitter perceptível durante movimentos naturais do dispositivo.
- Entrada e saída do modo RA sem perder posicionamento da arena.

## Como Rodar

- Instalar dependências:

```bash
npm install
```

- Executar em desenvolvimento:

```bash
npm run dev
```

O dev server roda em HTTPS (certificado autoassinado) porque o acesso a camera exige contexto seguro. Para testar no celular, acesse `https://<ip-da-maquina>:5173` na mesma rede e aceite o aviso de certificado.

- Build de produção:

```bash
npm run build
```
