# Drift e grounding em AR — playbook de diagnóstico

Só aparece no device: o SLAM não roda fora do celular.

## Passo 1 — separe os três drifts, a cura é diferente

Pergunta de triagem: **"escorrega parado, ao andar, ou ao girar no lugar?"**
E instrumente a distância câmera→âncora ao longo do tempo — sem essa série você debita
os três do mesmo culpado.

| Sintoma | Causa | Cura |
|---|---|---|
| Salta em degrau, **mesmo parado** | Relocalização do SLAM: o sistema de coordenadas inteiro pula | Não tem. Mitigue (gate por tracking status, absorção de salto) ou pivote para image target, que tem anchor real |
| Desliza em relação ao chão **só ao mover**, pior ao aproximar | Âncora na profundidade errada. **Não é SLAM** | Passo 2 |
| Passeia ao **girar no lugar**, com `trackingStatus` verde | Rotação pura não gera paralaxe e tira do quadro as features que o VIO usava | Passo 3 |

Ordem de grandeza do terceiro caso, medido em device: giro de 360° com a pessoa parada
afastou o conteúdo ancorado de 1,09 m para **2,9 m ainda sob `NORMAL`**, e para 4,47 m
depois de cair para `LIMITED`. É o pior de diagnosticar, porque toda a instrumentação de
qualidade de tracking fica verde enquanto acontece. **Se o jogo é feito de girar o
corpo, este é o problema principal, não um detalhe.**

## Passo 2 — place-once no chão digital

**Use o chão digital** (`SKILL.md` §2a): malha invisível em `y = 0`, `visibility = 0`,
picking do Babylon. É a melhor ancoragem medida até hoje neste stack, e resolve este
sintoma porque o ponto passa a sair sempre da mesma interseção raio×plano, no mesmo
referencial — não há profundidade para errar.

Em `scale: "absolute"` o engine ignora a altura que você declara e fixa `origin.y = 1 m`,
então `y = 0` cai perto do piso real sozinho. Dê um ajuste de ±5 cm no `y` do plano para
o resíduo, e um botão "reposicionar" para o drift 1.

### NÃO RECOMENDADO: grid de `hitTest` + fit de plano

Vários `hitTest` num grid ao redor do toque, fit de plano, altura pela mediana dos
inliers. Foi o caminho anterior desta skill. **Não use** — e o motivo não é elegância:

- **as probes mudam de posição o tempo todo.** O fit é refeito com pontos diferentes a
  cada ciclo, então a altura estimada oscila e o conteúdo treme, sobe e desce. Trocar
  "pula sempre" por um filtro temporal só troca o defeito: o filtro trava numa leitura
  impossível e defende ela;
- **rejeição por mediana+MAD não filtra nada** quando a maioria dos pontos é ruim — MAD
  grande gera tolerância grande e o lixo entra como inlier. Medido em campo numa faixa de
  1 a 3 m à frente: dispersão mediana de **32 cm**, pico de 2,8 m, com 11 de 12 pontos
  passando pela rejeição. Piso medido decentemente daria 2 a 5 cm;
- **o sensor não está medindo chão.** `hitTest` quase sempre devolve `FEATURE_POINT`, que
  é ponto solto e não superfície. Nenhum estimador conserta isso.

Se você mesmo assim precisar medir superfície, meça a dispersão (`max(y) − min(y)`) e
jogue no painel: é o número que diz na hora se vale continuar.

## Passo 3 — mitigar a deriva por rotação

Em ordem de retorno:

1. **Faça o setup varrer as direções que o jogo vai usar.** O SLAM só mapeia o que já
   viu; se a calibração obriga a pessoa a olhar para os flancos antes de começar, o mapa
   existe quando importa.
2. Reancore na recuperação de tracking.
3. Converta o resíduo em **regra de jogo visível** ("você está olhando para fora da área
   escaneada") em vez de erro silencioso.

## Gotchas que travam tudo

- **`hitTest` cedo demais estoura o WASM.** `RuntimeError: memory access out of bounds`,
  e dentro do render loop isso mata o app. Gate por `trackingStatus === "NORMAL"` +
  `try/catch`.
- **Normalize por px CSS** (`canvas.clientWidth/clientHeight`), nunca por
  `engine.getRenderWidth/Height()` (px de dispositivo, ×dpr ~3 no mobile).
- **Tilt: NÃO incline o conteúdo pela normal medida.** A vertical do mundo do XR8 vem do
  IMU, ou seja da gravidade — estimativa de nível muito melhor que um punhado de
  `hitTest` em incidência rasa. E a normal de um fit é a grandeza pior medida do
  pipeline: 79 amostras num arco de 2,2 m deram mediana de **13°**, p75 de 24°, pico de
  **48°**. Com clamp de 12°, metade era descartada e metade aplicada, e o conteúdo
  **alternava entre nivelado e inclinado a cada ciclo** — exatamente o sintoma de
  "tremendo/dando umas inclinadas" que faz procurar drift no lugar errado. Meça e mande
  para o painel; nunca aplique na cena. Piso real fora do nível é raro; fit ruim é o caso
  comum.
- **Não extrapole um plano além do raio que o produziu.** Fit tirado de um anel de 4 cm
  no centro da tela, usado a 40 cm de distância, amplia erro de normal por 10×: 3° viram
  2 cm, 5° viram 4,4 cm. Refaça o fit sobre os pontos da área que você quer julgar.
- **Silêncio do sensor não é evidência.** Um `hitTest` vazio significa "não sei", não
  "não tem superfície aí" — e isso decide a **polaridade** do gate. Gate que exige prova
  positiva de N amostras confirmadas recusa o tempo todo em ambiente real (79 recusas e
  zero posicionamentos em dois testes de device, inclusive apontando para o chão de uma
  cozinha). Gate que exige **prova contrária** — amostras que bateram numa superfície
  *fora* do plano esperado, o degrau que denuncia a borda de uma mesa — recusa quando
  deve. A inversão ancorou no primeiro toque.
- **`FEATURE_POINT` é um ponto solto, não uma superfície.** Inclua-o quando o hitTest
  serve para **posicionar** (achar lugar plausível); **exclua-o** quando serve para
  **reprovar**, senão um ponto no ar vira veto falso.
- **Celular não tem console.** Jogue `trackingStatus` e as métricas na própria tela.

## Grounding: fazer parecer que está no chão

O tracking pode estar perfeito e ainda parecer flutuando. O que resolve é pista visual,
não mais precisão — ver a seção 5 do `SKILL.md` (blob de contato, esconder chão virtual,
animar a entrada).

## Orientação de tela

**Paisagem em AR funciona; o que quebra é trocar de orientação no meio da sessão** —
girar com a sessão no ar deixa a cena esticada. (Ressalva: paisagem com
`screen.orientation.lock()` não foi retestada depois do gate de calibração; trate como
em aberto.)

- **Escolha uma orientação por sessão.** Peça a paisagem **antes** de subir a AR.
- Se travar: `screen.orientation.lock("landscape-primary")`, nunca o genérico
  `"landscape"` — o genérico trava na variante em que o aparelho estiver, e as duas dão
  `angle` diferente (90 vs -90).
- `lock()` exige fullscreen no Android/Chrome e **não existe no Safari do iPhone**. No
  iPhone, tela cheia real só via "Adicionar à Tela de Início" com manifest
  (`display: fullscreen`, `orientation: landscape`). Fallback universal para pedir
  rotação: overlay CSS com `@media (orientation: portrait) and (pointer: coarse)` —
  funciona sem JS, antes da cena carregar.
- Não peça fullscreen/lock com a sessão no ar: redimensiona o canvas e reprojeta a cena
  no meio do tracking.
- **`engine.resize()` durante a AR:** o engine já detecta resize de canvas sozinho, então
  chamar por fora é redundante para o tracking — mas é o único gatilho de
  `engine.onResizeObservable`, de onde o GUI fullscreen recalcula o próprio tamanho. Ver
  `ui-e-texto-em-ar.md` para a regra prática.
- Antes de culpar orientação por instabilidade, **garanta que a calibração já aconteceu**
  — sem o gate de `NORMAL` você mede duas coisas e credita a uma.

Docs: [World Tracking Issues](https://www.8thwall.com/docs/studio/troubleshooting/world-tracking-issues/),
[Coaching Overlays](https://www.8thwall.com/docs/legacy/guides/advanced-topics/coaching-overlays/).
São SPA e precisam ser abertos no navegador — fetch de conteúdo não funciona bem neles.
