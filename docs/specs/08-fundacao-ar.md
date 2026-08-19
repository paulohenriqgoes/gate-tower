# Spec 08 — Fundacao de RA: a arena vive na origem

Esta spec substitui a [spec 07](07-calibracao-manual-do-piso.md), que **nunca
comecou** e agora esta obsoleta: ela tentava consertar a medicao de piso, e esta
spec **remove a medicao de piso**.

Ela e auto-contida. Voce nao precisa ler o diario para executa-la, mas o
historico esta em [`arena-180-atencao.md`](../experimentos/arena-180-atencao.md),
entrada de 2026-08-19.

## A descoberta que muda tudo

O projeto media o chao com `hitTest` e um fit de plano. O 8th Wall nao espera
isso. No exemplo oficial de world tracking (`threejs-world-effects-example`, do
repo `8thwall/8thwall`), o codigo inteiro tem 60 linhas, **nao chama `hitTest`
nenhuma vez**, e faz assim:

```js
cube.position.set(0, 0.5, 0)          // conteudo APOIADO em y = 0
camera.position.set(0, 2, 2)          // "This must be at a height greater than y=0"
XR8.XrController.updateCameraProjectionMatrix({
  origin: camera.position, facing: camera.quaternion
})
canvas.addEventListener('touchstart', () => XR8.XrController.recenter())
```

O chao e `y = 0` **por autoria**, nao por medicao. `origin` declara onde a camera
comeca na cena; se `origin.y` for a altura do jogador, o piso cai exatamente em
`y = 0`, de graca, no frame zero.

No Niantic Studio e ainda mais direto: o evento de toque entrega
`e.data.worldPosition` pronto (`studio-world-effects-example/src/tap-to-place.ts`).

**Consequencia:** `placementGate.ts`, `floorEstimate.ts` e `hitTestSampling.ts`
existem para resolver um problema que o engine nao tem.

## A segunda inversao: o conteudo nunca se move

Em todo codigo oficial, o conteudo fica em coordenadas autorais fixas e quem se
move e a **origem da camera**, via `recenter()`. O projeto faz o oposto: arrasta
`arenaRoot.position` pelo mundo.

Aplicado ao Tower Gate: a arena e autorada **na origem**, com o arco abrindo no
azimute 0. O jogador e o vertice do arco — logo o jogador **e** a origem.
Ancorar e reposicionar viram o mesmo gesto, e a arena nunca tem posicao para
mudar.

## Evidencia de device (2026-08-19)

Medido com um spike descartavel em `spike/origin-recenter/` (Android/Chrome).

| Pergunta | Resposta | Numero |
| --- | --- | --- |
| `origin.y` = altura poe o piso em `y = 0`? | **Sim** | melhor calibracao: `delta 0.00` com 1,55 m declarado |
| `recenter()` inclina o mundo pelo pitch? | **Nao, so yaw** | `yaw -> 0,0` exato; pitch 48,5 e roll -1,8 preservados |
| `recenter()` descarta o mapa do SLAM? | **Sim** | cai para `LIMITED`, coaching overlay volta, >30 s para reconvergir |
| `camera.y` serve de sensor de deriva? | **Nao isoladamente** | amplitude de 0,36 a 1,68 m por janela; segue a mao |
| Deriva de laco fechado, varredura de flanco (+-90 graus) | **Pequena** | 0,04 · 0,05 · 0,07 · 0,08 · 0,10 · 0,15 m (mediana 0,075) |
| Deriva de laco fechado, giro de 360 graus | **Grande** | 0,78 m |
| Deriva apontando para carpete liso | **Pior de todas** | 0,78 m, com pitch 74 graus |

**Metodo do laco fechado:** marcar a posicao, girar, voltar FISICAMENTE ao mesmo
ponto, e ler o residuo. Sem isso a metrica mistura deriva com deslocamento real
e com o circulo que o celular percorre quando a pessoa pivota — foi o erro que
produziu leituras de 0,30 e 0,87 m que nao eram deriva.

## Tres bugs que a sessao encontrou, e que a producao tem hoje

### 1. `window.BABYLON` precisa existir ANTES do `xr.js` executar

No bundle, `XR8.Babylonjs` sai de `mQ()`, chamada na construcao do namespace
(`Babylonjs: mQ()`), e a primeira coisa que ela faz e:

```js
let A, g, I
window.BABYLON && (A = new BABYLON.Matrix, g = new BABYLON.Quaternion, I = new BABYLON.Vector3)
```

Sem `window.BABYLON` naquele instante, `g` e `I` ficam `undefined` para sempre.
O projeto chama `installBabylonGlobalsForXR8()` dentro de `enterAR()`, muito
depois do `xr.js` ter carregado com `async`.

**Conserto:** tirar o `<script src="/8thwall/xr.js">` do `index.html` e injeta-lo
por JS, depois de instalar o shim. Comprovado no spike.

### 2. O ramo destro do modulo Babylon esta quebrado neste build

O conversor de quaternion do engine:

```js
a = (A, C) => (C = C || new BABYLON.Quaternion,
  Q.useRightHandedSystem
    ? (g.copyFrom(A), g.toEulerAnglesToRef(I), ...)   // usa os temporarios do bug 1
    : (C.w = A.w, C.x = A.x, C.y = A.y, C.z = A.z),   // nao toca neles
  C)
```

Com a ordem de carregamento corrigida ele para de lancar, mas **passa a produzir
quaternion NaN** e a pose morre — nada projeta, tela preta sobre o feed.
Confirmado em device.

**Decisao: o projeto fica CANHOTO** (`useRightHandedSystem` false, o default do
Babylon). Nao ligue essa flag.

**Cuidado:** `src/ar/arenaHeading.ts:26` manda ligar `useRightHandedSystem` e
afirma que `src/main.ts` ja liga. As duas coisas sao falsas — `grep -rn
"RightHanded" src/` devolve so aquele comentario. Quem seguir a instrucao quebra
a RA inteira. Esse comentario tem que sair.

### 3. O azimute 0 esta 180 graus invertido

`headingDegFromForward` usa `Math.atan2(x, -z)` — frente = `-Z`, convencao
destra. No runtime canhoto a frente da camera com `facing` identidade e **`+Z`**.
Confirmado em device: o marcador de azimute 0 colocado em `-Z` nasce **atras** do
jogador, e so aparece com `yaw` perto de 180 graus.

**Conserto:** `Math.atan2(x, z)`. O sinal ja esta certo (direita da +90 graus nas
duas convencoes); so o zero e que esta invertido.

**Cuidado:** como `relativeYawDeg` e uma subtracao de dois headings, o offset de
180 graus **cancela** para medidas relativas. Por isso a selecao de setor pode
estar correta hoje por acidente. O que nao cancela e a orientacao da geometria
local do arco. Escreva teste para o sinal E para o zero.

## Decisoes tomadas

- **D1 — nada induz o jogador a girar para fora do arco.** Girar dentro dos 180
  graus e barato (medido: <=0,15 m). Atravessar as costas custa 0,78 m. Entao:
  `OffscreenIndicator` satura na borda do arco e nunca aponta para tras; som
  posicional vem de dentro do arco; nao existe spawn, alerta ou recompensa atras
  do jogador.
- **D2 — reposicionar e um botao, sem medicao de deriva.** Nao existe estimador
  de deriva no jogo. O jogador decide quando a arena saiu do lugar e toca o
  botao. Tentamos estimar deriva por acumulo de saltos de relocalizacao e
  **falhou**: media estimada 0,155 m contra 0,082 m real, com correlacao
  levemente negativa. Nao repita esse caminho sem sinal novo.
- **D3 — o gesto de reposicionar e caro e precisa parecer caro.** Ele derruba o
  tracking para `LIMITED` e exige reconvergencia de escala. Trate como transicao
  de fase, com o coaching overlay de volta — nunca como correcao instantanea no
  meio da acao.

## Etapas

### Etapa F2 — A arena vive na origem; o piso e declarado

**Objetivo:** a arena deixa de ser posicionada e passa a ser autorada. O pipeline
de medicao de piso sai inteiro.

**Arquivos-alvo:** `src/ar/EighthWallARManager.ts`, `src/types/xr8.d.ts`,
`src/ar/arenaHeading.ts`, `src/arena/ArenaSystem.ts`, `src/ar/ArenaGhost.ts`,
`index.html`, `src/main.ts`.
**Remocoes:** `src/ar/placementGate.ts`, `src/ar/floorEstimate.ts`,
`src/ar/hitTestSampling.ts` e seus testes.

**Contrato:**

- `arenaRoot.position` e `(0,0,0)` e `rotationQuaternion` e identidade, para
  sempre. Nada no projeto escreve nesses campos.
- `index.html` **nao** carrega `/8thwall/xr.js`. Quem carrega e o `main.ts`,
  depois de `installBabylonGlobalsForXR8()`, injetando a tag com
  `data-preload-chunks="slam"` e resolvendo em `window.XR8` ou no evento
  `xrloaded`.
- A camera de RA nasce em `new Vector3(0, playerHeightM, 0)` e o manager chama
  `XR8.XrController.updateCameraProjectionMatrix({ origin, facing })`
  explicitamente. Adicione o metodo em `src/types/xr8.d.ts`, com
  `updateRecenterPoint?: boolean` (existe no bundle, ausente da doc).
- `headingDegFromForward` passa a `Math.atan2(x, z)`, e o comentario sobre
  `useRightHandedSystem` em `arenaHeading.ts` e removido e substituido pelo
  aviso do bug 2 acima.
- Morrem: `ArenaAnchor`, `ArenaReanchor`, `floorY`, `forwardYawDeg`,
  `pendingReanchorAtMs`, `runPendingReanchor()`, `measureDeviceHeight()`, o gate
  de colocacao e o fit de plano.

**Criterio de aceite:** `grep -rn "hitTest" src/` devolve vazio. A contagem de
testes **vai cair** — os que morrem testam medicao de piso, e isso e o resultado
esperado, nao regressao. Testes novos cobrem o sinal e o zero do azimute.

**Como validar:** `npx tsc --noEmit && npm run test`. Device: entrar em RA cinco
vezes e ver a arena no chao nas cinco, sem nenhuma recusa possivel.

**Fora de escopo:** altura ajustavel (F3); `recenter` (F4).

**Depende de:** nenhuma.

| Tarefa | Agent | Modelo | Paralelo com |
|---|---|---|---|
| Inversao no AR Manager + ordem de carregamento | execucao direta | `opus` — decisao de arquitetura que atravessa AR Manager e Arena System, e falha em silencio | — |
| Correcao do azimute + testes de sinal e zero | `general-purpose` | `sonnet` — logica pura, contrato fechado | — |
| Remover modulos mortos e seus testes | `general-purpose` | `haiku` — mecanico, alvo definido pela tarefa 1 | — |

---

### Etapa F3 — A altura do jogador e `origin.y`

**Objetivo:** o jogador ajusta a propria altura e ve a arena subir e descer
contra o piso real.

**Por que e obrigatoria, e nao conveniencia:** a origem e capturada no
`onAttach`, quando o celular esta na pose de *apertar um botao*, nao na de
jogar. Medido em device: `delta` de -0,49 a -0,92 m numa sessao em que o
jogador entrou com a mao levantada. Sem recalibracao pos-attach, todo o resto da
sessao herda esse offset.

**Arquivos-alvo:** `src/ar/EighthWallARManager.ts`, `src/ui/StartScreen.ts`.

**Contrato:** `setPlayerHeight(m: number)` reaplica
`updateCameraProjectionMatrix({ origin: {x, y: m, z}, updateRecenterPoint: true })`
com a sessao no ar. Faixa 1,30 a 2,05 m, passo 5 cm, default 1,55, persistido em
`localStorage`. **Nunca envie valor nao-finito** — `origin` com NaN contamina o
frame do engine de forma permanente, sem caminho de volta sem reiniciar a sessao.

**Criterio de aceite:** mover o controle desloca a arena verticalmente em tempo
real, sem reiniciar a sessao. Em device, `delta` chega a 0,00.

**Depende de:** F2.

| Tarefa | Agent | Modelo | Paralelo com |
|---|---|---|---|
| `setPlayerHeight` + reaplicacao de origem | `general-purpose` | `sonnet` — dentro do contrato de F2 | controle de UI |
| Controle de altura na tela inicial | `general-purpose` | `sonnet` — segue padrao de HUD existente | tarefa acima |

---

### Etapa F4 — `recenter()` e a colocacao, e o unico jeito de mover a arena

**Objetivo:** ancorar e reposicionar viram o mesmo gesto. Nada mais move nada.

**Arquivos-alvo:** `src/ar/EighthWallARManager.ts`, `src/ui/HudLayer.ts`,
`src/game/GameFlow.ts`.

**Contrato:** `confirmArenaHere()` chama `XR8.XrController.recenter()`. O
jogador passa a estar no vertice do arco, com o azimute 0 na direcao em que
aponta. O mesmo metodo serve ao botao de reposicionar durante a partida.
Recuperacao de tracking **avisa e nunca move**.

Por D3, o gesto entra como transicao de fase: o coaching overlay volta, a
partida pausa a apresentacao ate `trackingStatus === "NORMAL"`, e so entao
devolve o controle.

**Criterio de aceite:** a arena nao se desloca em nenhuma circunstancia que nao
seja o gesto explicito, nem em `LIMITED -> NORMAL`. Depois do gesto, o flanco de
spawn corresponde ao que o jogador ve.

**Fora de escopo:** medicao ou estimativa de deriva (D2 proibe).

**Depende de:** F2.

| Tarefa | Agent | Modelo | Paralelo com |
|---|---|---|---|
| `recenter` como colocacao e reposicionamento | execucao direta | `opus` — a semantica de `facing` falha em silencio (inimigo no flanco errado, sem erro) | — |

---

### Etapa F5 — Segunda sessao de RA via `reconfigureSession`

**Objetivo:** fechar o bloqueador antigo com a API sancionada.

**Arquivos-alvo:** `src/ar/EighthWallARManager.ts`, `src/ar/coachingOverlay.ts`.

**Contrato:** `XR8.reconfigureSession({ runConfig })` — existe no bundle
(`xr.js`) e e usado por `packages/xrextras/src/sessionreconfiguremodule/`. No
bundle ela faz detach, pause, stop, `Object.assign(config)` e re-init.

**Correcao ao README:** a hipotese registrada ("o projeto nunca chama `XR8.run()`
nem `XR8.stop()`") esta **errada**. O `xrCameraBehavior` chama os dois: o
`attach` termina em `XR8.run({ canvas, ownRunLoop: false, ... })` e o `detach`
faz `XR8.stop()` + `XR8.clearCameraPipelineModules()`. Quem seguir aquela pista
procura no lugar errado.

**Criterio de aceite:** entrar em RA, sair, entrar de novo — a arena aparece na
segunda sessao sem recarregar a pagina.

**Depende de:** F2 (mesmo arquivo).

| Tarefa | Agent | Modelo | Paralelo com |
|---|---|---|---|
| Trocar o ciclo de vida da sessao | execucao direta | `opus` — causa-raiz, com a hipotese anterior ja desmentida | F6 |

---

### Etapa F6 — Adotar o que o `xrextras` ja resolve

**Objetivo:** parar de manter a mao codigo que o 8th Wall distribui sob MIT.

**Arquivos-alvo:** `package.json`, `index.html`, `src/main.ts`,
`scripts/copy-8thwall.mjs`.

**Contrato:** avaliar e adotar `FullWindowCanvas` (dimensionamento de canvas — o
problema que `main.ts` resolve a mao hoje), `Loading`, `RuntimeError` e
`LandingPage`.

**Risco declarado:** esses modulos assumem o fluxo de pipeline modules, e aqui
quem manda no ciclo de vida e o `xrCameraBehavior`. A etapa pode terminar
adotando um subconjunto — isso e resultado valido, desde que o motivo de cada
recusa fique registrado.

**Criterio de aceite:** cada modulo adotado remove codigo equivalente; cada
modulo recusado tem o motivo escrito.

**Depende de:** F2.

| Tarefa | Agent | Modelo | Paralelo com |
|---|---|---|---|
| Avaliar compatibilidade com o behavior | `general-purpose` | `sonnet` — investigacao com criterio objetivo | F5 (arquivos distintos) |
| Integrar os modulos aprovados | `general-purpose` | `sonnet` | — |

---

### Etapa F7 — Reescrever as skills a partir da API, nao da cicatriz

**Objetivo:** as skills deixam de ensinar a medir o piso e passam a ensinar a
declara-lo. Este e um objetivo declarado do projeto: produzir skills que
permitam construir jogos de RA com 8th Wall + Babylon sem cair nas armadilhas
desta sessao.

**Arquivos-alvo:**
`.claude/skills/babylonjs-game-dev/references/ar-xr-8thwall.md` (reescrita),
`references/8thwall-anchoring.md` (novo), `SKILL.md` (indice).
Ja existe, escrito nesta sessao: `references/8thwall-api-surface.md` (854 linhas,
com procedencia por simbolo).

**Contrato:**

- `8thwall-anchoring.md` abre com **a escolha de referencial** como a primeira
  decisao de um jogo de RA: conteudo autorado na origem versus posicionado por
  medicao; `recenter()` como primitiva de colocacao; quando image target e a
  resposta certa. `hitTest` e rebaixado a consulta pontual sobre geometria,
  nunca fundacao de grounding.
- Entra o mapa honesto do que o binario **nao** tem: meshing de sala, depth,
  oclusao, classificacao de superficie, anchor persistente. Os eventos `mesh*`
  sao do caminho VPS/wayspot, e `enableVps: true` emite `console.error("[XR] VPS
  is not supported in standalone mode.")` — VPS esta fora.
- Entram os tres bugs desta spec: ordem de carregamento do `BABYLON`, ramo
  destro quebrado, e o par sinal/zero de azimute.
#### F7.a — Dois erros ATIVOS na skill, com linha exata

Estes dois nao dependem da reescrita e **podem ser feitos primeiro, isolados**.
Sao erros que fazem quem seguir a skill escrever codigo que nao funciona. Alvo:
`.claude/skills/babylonjs-game-dev/references/ar-xr-8thwall.md`.

**Erro 1 — `imageTargets` e no-op (linha 148).** A secao "Image Targets" ensina:

```ts
XR8.XrController.configure({
  imageTargets: ["meu-alvo-1", "meu-alvo-2"],
});
```

Neste bundle isso **nao faz nada**. O branch legado em `xr-slam.js` e:

```js
else void 0 !== A.imageTargets && console.warn(
  "[XR] imageTargets is deprecated, please use imageTargetData instead.")
```

Repare que ele **so avisa** — nao atribui. O branch vivo e o de
`imageTargetData`, que atribui `q = A.imageTargetData`. Troque a chamada e
registre que a doc oficial ainda mistura os dois nomes na mesma pagina.

**Erro 2 — `recenterWithOrigin` nao existe (linha 222).** O texto diz:

> "World tracking do binario distribuido nao tem anchor persistente por objeto —
> so `recenter()`/`recenterWithOrigin`."

`recenterWithOrigin` **nao e metodo de `XrController`**. E nome de evento de
cena da integracao A-Frame (`xr.js`, no bloco que faz
`g.aScene.emit("recenter", ...)`), sem relacao com o caminho Babylon. Remova a
mencao. O resto da frase esta certo: nao ha anchor persistente por objeto.

**Criterio de aceite de F7.a:** `grep -n "imageTargets\|recenterWithOrigin"` no
arquivo nao devolve mais as duas ocorrencias erradas, e cada correcao carrega o
trecho de bundle que a sustenta.

#### F7.b — Um item a REBAIXAR, nao a promover

**Linha 204, "Esconda o chao virtual opaco em AR".** Este item e **heuristica do
autor do projeto**, nao achado medido — confirmado por ele em 2026-08-19 — e ha
contra-evidencia: experiencias de mini golf em RA poem o percurso no chao e
funcionam.

O que a medicao desta sessao sustenta e mais estreito: **linha fina e extensa
vista em incidencia rasante amplifica erro de pose**, por geometria projetiva. E
por isso que julgar ancoragem por um anel deitado a 2,2 m e cruel, e por isso que
o spike passou a usar totens verticais com pe visivel. Mas amplificar o sintoma
nao e o mesmo que proibir conteudo no piso.

**Nao apague e nao promova.** Mantenha o texto, marcado como heuristica de origem
conhecida e sem medicao, e adicione ao lado o achado medido — que e sobre
**escolha de alvo para diagnosticar deriva**, nao sobre design de arte.

**Criterio de aceite:** todo aprendizado de campo do arquivo atual sobrevive —
silencio do sensor nao e evidencia; tilt medido nunca aplicado; limiar em graus
carrega raio implicito; crash do WASM; normalizacao em px CSS. **Nenhum deles
esta errado**; todos mudam de lugar. E a meta-licao entra explicita: skill
escrita so a partir da experiencia da sessao consolida o caminho errado se nunca
for confrontada com a superficie de API e com o codigo oficial.

**Fora de escopo:** diario e README — isso e a skill `encerrar-sessao`.

**Depende de:** **F7.a nao depende de nada** — sao dois erros pontuais com linha
e evidencia, e podem sair na Onda 1 junto com a F2, em arquivo disjunto. F7.b e
a reescrita grande dependem da evidencia de device de F2 a F5, porque o que a
skill vai afirmar sobre ancoragem precisa ter sido visto funcionando.

| Tarefa | Agent | Modelo | Paralelo com |
|---|---|---|---|
| **F7.a** — corrigir `imageTargets` e `recenterWithOrigin` | `general-purpose` | `haiku` — dois alvos com linha exata, trecho de bundle citado e criterio por `grep`; nao ha decisao a tomar | F2 (arquivo disjunto) |
| F7.b + reescrita e reparticionamento das skills | execucao direta | `opus` — decide o que o projeto vai acreditar sobre RA daqui pra frente | — |
| Atualizar indice e links da `SKILL.md` | `general-purpose` | `haiku` — mecanico | — |

---

## Ondas

```
Onda 1 (paralelo): F2 · F7.a     — F2 refatora src/; F7.a toca so a skill
Onda 2 (device):   validar F2
Onda 3 (serial):   F3 -> F4      — ambas em EighthWallARManager.ts
Onda 4 (device):   validar F3 e F4
Onda 5 (paralelo): F5 · F6       — F5 no AR Manager; F6 em main.ts/index.html
Onda 6 (device):   validar F5 e F6
Onda 7 (serial):   F7.b          — precisa da evidencia acumulada
```

**Por que quase tudo e serial:** F2 a F5 escrevem o mesmo
`EighthWallARManager.ts` (1579 linhas hoje), e cada uma precisa de veredito em
device antes da seguinte — hardware e serial por natureza. O paralelismo real
esta na Onda 5, e no fato de a F2 **encolher** o arquivo o suficiente para as
etapas seguintes ficarem baratas.

## O spike

`spike/origin-recenter/` e descartavel e nao e importado por nada em `src/`.
Ele responde as perguntas desta spec e pode ser apagado quando F2 e F4 estiverem
validadas em device. Enquanto existir, e a forma mais barata de reproduzir
qualquer um dos tres bugs acima em isolamento.

Rode com `npm run dev` e abra
`https://<ip>:5173/spike/origin-recenter/index.html` no celular. `?rh=1` entra no
caminho destro so para reproduzir o defeito.
