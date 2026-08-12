# Tower Gate

Jogo de cartas com lanes em Realidade Aumentada (RA), inspirado na leitura de campo do Clash Royale.

## Estado Atual

**Foco atual: a demo do mundo vivo** — o recorte que existe para responder, com
pessoas reais testando, se *a pessoa acredita que apareceu um mundo vivo na mesa
dela*. Registro da investigacao em
[`docs/experimentos/demo-mundo-vivo.md`](docs/experimentos/demo-mundo-vivo.md).

### Bloqueadores conhecidos (2026-08-12, vistos em device)

Leia isto antes de mexer em qualquer coisa:

1. **As cartas nao aparecem quando a batalha comeca** — nao da para jogar.
   Causa-raiz identificada: `src/ui/CardDeckHud.ts:83` faz
   `cardRow.height = "auto"`, e **o Babylon GUI nao tem unidade `auto`** — o
   valor vira `NaN` em silencio.
2. **Nao da para entrar numa segunda sessao de RA sem recarregar a pagina** (bug
   antigo). A camera liga e mais nada acontece. Suspeito nomeado: o projeto
   **nunca chama `XR8.run()` nem `XR8.stop()`** — o ciclo de vida inteiro esta
   delegado ao `xrCameraBehavior`, entao "sair da RA" solta a camera do Babylon
   mas nao para o engine. Bloqueia testar com varias pessoas seguidas.
3. **Colocar a arena em RA exige insistencia** e o aviso "aponte para uma
   superficie maior" nao diz o que fazer.
4. **O Beat 5 so funciona por tras da torre inimiga** — o toque nao pega de onde
   o jogador olha.

### Entregue

Compila, com 111 testes de logica pura passando. **O que foi confirmado em
device e o que so compila esta separado na tabela "Estado atual" do diario** —
consulte antes de assumir que algo funciona.

- arena de mesa metrica: 16 x 24 unidades autorais que em RA valem **0,53 m x 0,80 m**, com escala **fixa** (sem slider)
- **uma torre de cada lado** (`tower-blue-center` em z = -10, `tower-red-center` em z = +10) e **caminho central unico** (mundo x em [-2, 2]) atravessando a faixa de rio
- a superficie detectada e **medida** antes de ancorar: se nao couber a arena de 80 cm, o toque nao posiciona e o jogo pede uma superficie maior — a arena nunca e reescalada para caber
- **orientacao retrato travada** nos dois modos; paisagem saiu de escopo
- fase **`world-alive`** (Beat 4): depois de ancorar, a tela fica **completamente limpa** — sem HUD, sem timer, sem prompt, sem barra de vida
- **comportamento ocioso** procedural das criaturas: parado, vagando, observando (cabeca acompanha a camera) e social, com respiracao continua e fases dessincronizadas
- **Beat 5**: a batalha comeca tocando na torre inimiga, que acorda e revela uma carta da IA — nao existe botao de "comecar"
- `WorldTapRouter` como dono unico do toque, roteando por fase
- **HUD retrato minimo**: HP das torres e timer no topo, cogumelos e 4 cartas no terco inferior; debug so com `?debug=1`
- **invocacao em dois toques**: a metade do jogador acende, fantasma de ~200 ms, e toque fora cancela sem gastar cogumelo
- **partida de 3 min** por relogio de parede (nunca pausa), cogumelo dobrado no ultimo minuto, IA por script fixo, desempate por percentual de HP
- **fim de partida**: a arena se desfaz da borda para o centro, sem tela de resultado
- **instrumentacao de sessao** (`src/telemetry/`) com os eventos do teste e export do JSON com `?debug=1`
- 4 criaturas jogaveis (Javali 2, Tatu Bola 3, Dona Barata 4, Cururu 5) com materiais mate e paleta limitada
- indicador direcional para o que acontece fora do quadro
- modo RA no engine 8th Wall (SLAM via camera), com suporte a iOS
- tela inicial escolhendo o modo (RA ou tela) antes da partida
- calibracao de escala absoluta obrigatoria antes de ancorar, guiada pelo coaching overlay oficial do 8th Wall

## Diarios de experimento

Cada linha de investigacao tem um diario em [`docs/experimentos/`](docs/experimentos/README.md)
— o que foi tentado, o que cada tentativa provou e o que ainda esta aberto,
inclusive as conclusoes que foram desmentidas depois:

- [`demo-mundo-vivo.md`](docs/experimentos/demo-mundo-vivo.md) — a demo que mede
  se a pessoa acredita no mundo que apareceu na mesa dela;
- [`ra-e-paisagem.md`](docs/experimentos/ra-e-paisagem.md) — estabilidade da arena
  em RA e orientacao de tela;
- [`ferramental-de-sessao.md`](docs/experimentos/ferramental-de-sessao.md) — como
  o projeto registra o proprio progresso entre sessoes.

Os diarios sao escritos pela skill `encerrar-sessao`
(`.claude/skills/encerrar-sessao/SKILL.md`), acionada ao fim de cada sessao.

## Layout (retrato)

O jogo e desenhado para ser segurado com uma mao, em pe:

- a arena ocupa o quadro inteiro; o HUD flutua sobre ela;
- **topo**: HP numerico das duas torres e o timer da partida;
- **terco inferior** (zona do polegar): contador de cogumelos imediatamente
  acima da fileira de 4 cartas;
- fora da partida — e principalmente na fase `world-alive` — **nao existe HUD
  nenhum na tela**;
- diagnostico so com `?debug=1`.

## Tela cheia e orientacao

A politica e **retrato travado, para os dois modos**. Ela deixou de ser por modo
de jogo quando a spec da demo tirou paisagem de escopo.

- O modo imersivo (`requestFullscreen` + `screen.orientation.lock("portrait-primary")`)
  e pedido **antes** de subir a sessao de RA, nunca com ela no ar: com a sessao
  ativa isso redimensiona o canvas e reprojeta a cena no meio do tracking.
- Quem aplica a politica e o `GameFlow`; o `enterAR()` nao mexe mais em
  orientacao.
- `src/main.ts` **nao chama `engine.resize()` enquanto a sessao de RA esta
  ativa** — o engine do 8th Wall ja detecta mudanca de canvas sozinho a cada
  frame.
- Onde `screen.orientation.lock` nao existe (Safari do iPhone), um overlay CSS
  incondicional pede retrato — sem depender de JS, antes mesmo da cena carregar.
- No Safari do iPhone nao existe Fullscreen API: a tela cheia de verdade so
  acontece com **Compartilhar > Adicionar a Tela de Inicio** (o
  `manifest.webmanifest` e as metas `apple-mobile-web-app-*` fazem o atalho abrir
  em retrato, sem barras do Safari).
- Historico de por que paisagem foi abandonada, e o que continua sem veredito,
  em [`docs/experimentos/ra-e-paisagem.md`](docs/experimentos/ra-e-paisagem.md).

## Realidade Aumentada (8th Wall)

- O modo RA usa o engine 8th Wall (`@8thwall/engine-binary`), que roda em qualquer navegador mobile (iOS Safari incluido) — WebXR nao e mais utilizado.
- Os artefatos do engine sao copiados de `node_modules` para `public/8thwall/` automaticamente no `npm install` (script `postinstall`).
- O chao estimado pelo SLAM fica no plano `y = 0`; a arena e ancorada uma unica
  vez, na profundidade real do piso estimada por um fit de plano ao redor do
  toque (mundo em metros, escala absoluta).
- **A escala em RA e fixa, nao ajustavel.** A arena tem um tamanho fisico
  definido — 0,80 m no maior eixo — e o fator de conversao das unidades autorais
  para metros e a constante `AR_ARENA_SCALE` (`0.8 / 24 ≈ 0.0333`), exportada por
  `src/arena/ArenaSystem.ts`. O slider de escala foi removido: ele so serviria
  para o jogador desmentir o tamanho da arena.
- Antes de ancorar, o app **mede a extensao da superficie**: uma segunda rodada
  de hitTests, mais larga que a do fit, mede a caixa envolvente dos pontos que
  pertencem ao plano detectado, nos dois eixos da arena. Se a superficie nao
  comporta os 0,53 m x 0,80 m, o toque nao posiciona nada e a tela pede "Aponte
  para uma superficie maior". A arena **nunca** e reescalada para caber.
- A orientacao de tela nao e mais responsabilidade do AR Manager: quem aplica a
  politica e o `GameFlow`, **antes** de subir a sessao. Com a sessao no ar nao se
  pede tela cheia nem `screen.orientation.lock` — as duas coisas redimensionam o
  canvas e reprojetam a cena no meio do tracking.
- **O engine nunca e parado.** Nao existe chamada a `XR8.run()` nem
  `XR8.stop()` no projeto: entrar em RA e adicionar o `xrCameraBehavior` a uma
  `FreeCamera`, e sair e descartar essa camera. Por isso **a segunda sessao de
  RA nao sobe sem recarregar a pagina** — ver os bloqueadores acima e a hipotese
  1 em [`docs/experimentos/demo-mundo-vivo.md`](docs/experimentos/demo-mundo-vivo.md).
- **Circular a arena funciona so em partes.** Confirmado em device
  (2026-08-12): passar para **tras** da arena faz a camera enquadrar area que o
  SLAM ainda nao mapeou, e o conteudo comeca a driftar. Esta em investigacao —
  ver a hipotese 4 em
  [`docs/experimentos/ra-e-paisagem.md`](docs/experimentos/ra-e-paisagem.md).
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
| [~] | 01 | POC | AR mode, Arena com escala, posicionar tropas — ancoragem funciona, mas **circular por tras da arena drifta** e o criterio de deslize nao foi remedido depois da arena virar 80 cm |
| [x] | 02 | Inimigos | Bot inimigo por **script fixo** (`src/battle/EnemyScript.ts`) — confirmado em device: foi a IA que destruiu a torre do jogador e encerrou a partida |
| [0] | 03 | Sons e Musica | Adicionar musica de fundo e sons para ataques. |
| [x] | 04 | Tela inicial e Final game | Menu inicial entregue; o fim de partida virou a **dissolucao da arena** (a spec da demo proibe tela de resultado) — confirmado em device |

## Criterio de Conclusao da Fase 01

- Arena ancorada em RA com estabilidade visual.
- Sem jitter perceptivel durante movimentos naturais do dispositivo.
- Entrada e saida do modo RA sem perder posicionamento da arena.
- **Deslize de no maximo ~2 cm com o celular circulando a mesa por 60 s** (o
  criterio do Beat 3 da spec da demo). **Ainda nao medido** depois da arena
  passar a ter 80 cm com escala fixa.

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
