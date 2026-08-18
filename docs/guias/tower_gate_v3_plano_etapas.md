# Tower Gate v3 — Plano de execução por etapas

> Deriva de [`tower_gate_spec_v3.md`](tower_gate_spec_v3.md) e do
> [storyboard v3](tower_gate_storyboard.html). A spec diz **o que** o jogo é; este
> documento diz **em que ordem construir**, com contrato por etapa, sub-agent e
> modelo declarados, e paralelismo explícito.
>
> Formato obrigatório: `.claude/skills/planejamento-por-etapas/SKILL.md`.
> Etapas que tocam RA/Babylon acionam `babylonjs-game-dev`.

---

## 0. O que a v3 derruba do código atual

A v3 não é uma camada em cima do protótipo — ela mata as três premissas em que o
protótipo foi construído: arena de mesa com footprint fixo, caminho único entre
duas torres, e HUD 2D como leitura de recurso. O que sobrevive é a **fundação de
RA** (calibração, coaching, fit de plano, gate por prova contrária, blob de
contato, materiais mate, comportamento ocioso, telemetria) e as **criaturas**.

| Arquivo | Destino |
|---|---|
| `src/arena/ArenaSystem.ts` | reescrito — grid de tiles e lanes morrem; vira arco polar em metros |
| `src/combat/DeploymentZone.ts` (+test) | **removido** — substituído pelo anel de colocação (Etapa 6) |
| `src/battle/EnemyScript.ts` (+test) | **removido** — substituído pelo `WaveDirector` (Etapa 4) |
| `src/ui/CardDeckHud.ts` | **removido** — cartas viram objeto 3D preso ao jogador (Etapa 7) |
| `src/towers/ProximityTrigger.ts` (+test) | **removido** — o gatilho deixa de ser aproximação e vira enquadramento (Etapa 10) |
| `src/ar/ArenaGhost.ts` | reescrito — não existe mais retângulo de 80 cm para pré-visualizar |
| `src/ar/placementGate.ts` | política mantida (recusa por prova contrária), critério novo (Etapa 3) |
| `src/camera/arenaFraming.ts` | reescrito — no modo canvas a câmera passa a simular o jogador no vértice do arco |
| `src/ui/HudLayer.ts` | encolhe para timer + HP da torre + setas de flanco |
| `src/towers/CautionSign.ts` | **permanece**, agora só como cenário (spec §9) |
| `src/units/idle/ResidentPopulation.ts` | **permanece** — é o mundo vivo do Ato 1 |
| `src/ar/EighthWallARManager.ts`, `hitTestSampling.ts`, `coachingOverlay.ts` | permanecem; ganham a ancoragem egocêntrica |

### O bloqueador antigo continua no caminho

O README lista como bloqueador 1 que **não se entra numa segunda sessão de RA sem
recarregar a página** (o projeto nunca chama `XR8.run()`/`XR8.stop()`). A v3 piora
o custo disso: o Ato 4 termina em "jogar de novo", e o álbum entre partidas exige
sair e voltar. **Esse conserto é pré-requisito da Etapa 11**, e está declarado lá.

---

## 1. Decisões que este plano fecha

A spec v3 §13 deixa pontas soltas. Algumas são de playtest e continuam abertas;
outras precisavam de resposta para o plano ser executável. Estas foram fechadas
aqui — todas reversíveis, todas com o motivo registrado.

| # | Decisão | Motivo |
|---|---|---|
| D1 | **Escala 1 unidade = 1 metro.** `AR_ARENA_SCALE` (~0,0333) deixa de existir. | A v3 especifica tudo em metros (torre 1,20 m, tropa 0,35 m, fade entre 1,2 m e 0,6 m, raio 2–2,5 m). O motivo original de autorar fora de escala — "não dividir por ~30 toda constante espacial" — morre junto com as constantes, que estão sendo reescritas de qualquer jeito. Manter o fator seria conversão mental permanente entre a spec e o código. **Preço**: perde-se o comentário de que escala ~0,03 quebra shadow-mapping — irrelevante, o grounding já é por blob. |
| D2 | **Colocação = pressionar a carta, mirar, soltar.** Um gesto contínuo: `pointerdown` na carta seleciona, o anel segue o centro da tela enquanto o dedo está pressionado, `pointerup` solta a tropa. | A spec §4 pede "um gesto só" e escreve literalmente `solta`. Dois toques separados são duas viagens de enquadramento. O toque-duplo fica como **fallback** (se `pointerup` acontecer a menos de 150 ms e sem movimento de mira, a carta fica selecionada e o segundo toque confirma) — acessibilidade sem custo de design. |
| D3 | **Beber o chá = tocar no caldeirão enquadrado.** Não existe timer de bebida. | A janela de vulnerabilidade que a spec §5 quer **é o próprio ato de enquadrar o caldeirão** — olhar para baixo já cega os três flancos. Um timer por cima disso seria punição dupla e mais um número para monitorar. |
| D4 | **Hierarquia de áudio**: torradeira > alerta de flanco recém-nascido > impacto na torre > tropa > ambiente. Um canal por prioridade; o inferior sofre ducking. | Fecha a ponta solta §13. A torradeira ganha porque é a única informação que o jogador **não tem como obter olhando** — o resto tem redundância visual. |
| D5 | **Derrota = torre cair.** Estoque zerado nunca encerra a partida. | Recomendação da própria spec §13. O cogumelo roxo existe justamente para o estoque nunca ser condição terminal. |
| D6 | **Coelho = onda final**, nasce no setor central e **troca de setor a cada ~20 s**, avançando para o jogador como qualquer inimigo, mais lento. | Fecha a ponta solta §13 sem escolher nenhum dos dois extremos: fixo no central torna os laterais decoração, circular obriga perseguição. Trocar de setor mantém os três flancos vivos sem exigir que o jogador saia do lugar. **Provisória** — é a decisão deste plano com maior chance de cair no playtest. |
| D7 | **`ARENA_ARC_DEG = 180`, parametrizável.** Testar 120° é trocar uma constante, sem tocar em lógica. | A spec §1 já pede isso. O modelo polar da Etapa 1 é escrito para não assumir 180 em lugar nenhum. |
| D8 | **Cartas fazem fade para 35% enquanto o anel de colocação está ativo**, nunca somem, e a carta pressionada nunca faz fade. | Fecha a ponta solta "mirar longe vs. ler cartas": some o que atrapalha a leitura do chão, permanece o que confirma qual carta está na mão. |

**Continuam em aberto — só playtest responde**: tuning do cogumelo verde,
duração da partida (3 vs 4 min), o Coelho intimidar criança em festa, o arco
confortável real (D7 deixa isso barato de testar), e o livro de cartas (adiado
pela própria spec).

---

## 2. Invariantes que nenhuma etapa pode quebrar

Estes valem para todas as etapas e não se repetem em cada spec:

1. **A lógica de jogo é independente do modo de renderização**
   (`.github/copilot-instructions.md` §2). O modelo polar da Etapa 1 recebe
   `cameraYawDeg` como argumento — nunca lê a câmera do Babylon por dentro. É
   isso que mantém o modo canvas jogável com o jogador simulado no vértice do arco.
2. **Arquitetura modular obrigatória**: AR Manager, Arena System, Unit Factory,
   Combat Engine, HUD. Módulo novo entra debaixo de um destes ou justifica-se
   como novo módulo nomeado (`world/`, `audio/`).
3. **Lógica pura testável fora do engine.** A suíte atual (183 testes) roda sem
   Babylon; toda regra nova de arena, onda, economia e fermentação nasce em
   arquivo puro com `.test.ts` ao lado.
4. **Nada de shadow map.** Grounding é blob de contato
   (`src/fx/contactShadow.ts`) — a razão vale ainda mais com objetos de 1,20 m.
5. **`hitTest` só com `trackingStatus === "NORMAL"`, sempre em `try/catch`**, e
   normalizado por `clientWidth/clientHeight` (px CSS). Chamada precoce estoura o
   WASM e mata o app.
6. **Gate de RA recusa por prova contrária, nunca por falta de prova.** Silêncio
   do sensor é "não sei", não "não pode".
7. **`DynamicTexture.update()`, nunca `update(false)`** — o `false` sobrevive em
   textura simétrica e só denuncia no primeiro texto desenhado.

---

## 3. As etapas

### Etapa 1 — `ArenaArc`: o modelo polar puro

**Objetivo:** passa a existir uma fonte única de verdade sobre "onde é isso no
arco" — setor, azimute, raio, o que está enquadrado e onde é legal colocar —
como lógica pura, sem Babylon e sem cena.

**Arquivos-alvo:** `src/arena/ArenaArc.ts` (novo), `src/arena/ArenaArc.test.ts` (novo).

**Contrato:**

```ts
export const ARENA_ARC_DEG = 180;          // D7 — parametrizável
export const ARENA_SECTOR_COUNT = 3;
export const ARENA_RADIUS_M = 2.2;         // ajustável em [2.0, 2.5]
export const MIN_PLACE_RADIUS_M = 0.9;     // spec §4
export const DEVICE_FOV_DEG = 60;          // FOV útil em retrato

export type SectorId = "left" | "center" | "right";

/** Ponto 2D no espaço local da arena (y = 0 sempre). */
export interface ArenaPoint2D { x: number; z: number; }

/**
 * Azimute em graus. 0 = a direção para onde o celular apontava quando a arena
 * fechou. Positivo cresce para a DIREITA do jogador. Frente = -Z, direita = +X
 * (sistema destro, como o modulo Babylon do 8th Wall configura a cena).
 */
export interface ArcPoint { azimuthDeg: number; radiusM: number; }

export function toArc(p: ArenaPoint2D): ArcPoint;
export function toLocal(p: ArcPoint): ArenaPoint2D;
export function sectorOf(azimuthDeg: number): SectorId | null;   // null = fora do arco
export function sectorCenterDeg(sector: SectorId): number;
export function sectorRangeDeg(sector: SectorId): [number, number];

export type PlacementVerdict =
  | { ok: true }
  | { ok: false; reason: "fora-do-arco" | "perto-demais" | "longe-demais" };
export function evaluatePlacement(p: ArcPoint): PlacementVerdict;

/** Setores que o celular cobre agora. Vazio quando o jogador olha para fora do arco. */
export function framedSectors(cameraYawDeg: number, fovDeg?: number): SectorId[];

/** Setor de spawn. NUNCA um setor enquadrado, salvo se todos estiverem. */
export function pickSpawnSector(cameraYawDeg: number, rng: () => number): SectorId;
```

**Critério de aceite:** `pickSpawnSector` nunca devolve setor enquadrado enquanto
existir ao menos um livre; `sectorOf` cobre `[-90, +90]` sem buraco nem
sobreposição nas fronteiras exatas (`±30`, `±90`); trocar `ARENA_ARC_DEG` para 120
mantém todos os testes verdes com os limites recalculados; nenhum import de
`@babylonjs/*` no arquivo.

**Como validar:** `npm test`.

**Fora de escopo:** desenhar qualquer coisa; mexer em `ArenaSystem`; decidir
posição do caldeirão ou da torre.

**Sub-agents:**

| Tarefa | Agent | Modelo | Roda em paralelo com |
|---|---|---|---|
| Implementar `ArenaArc` + testes | general-purpose | `sonnet` — contrato fechado, é implementação normal dentro da spec | Etapa 2 |

**Depende de:** nenhuma.

---

### Etapa 2 — Escala de sala: 1 unidade = 1 metro

**Objetivo:** os objetos deixam de ler como maquete. A torre mede 1,20 m de
verdade, obstrui a visão, tem sombra de contato proporcional, e desaparece por
fade em vez de ser cortada pelo near plane quando o jogador chega perto.

**Arquivos-alvo:** `src/arena/metrics.ts` (novo), `src/fx/proximityFade.ts` (novo),
`src/fx/proximityFade.test.ts` (novo), `src/arena/ArenaSystem.ts`,
`src/towers/MushroomTower.ts`, `src/towers/CrazyRabbit.ts`,
`src/towers/CautionSign.ts`, `src/units/*.ts`, `src/units/UnitFactory.ts`,
`src/fx/contactShadow.ts`, `src/fx/spawnAnimation.ts`, `src/ui/HealthBarMesh.ts`,
`src/units/idle/IdleBehavior.ts`.

**Contrato:**

```ts
// src/arena/metrics.ts — fonte única de tamanho físico
export const TOWER_HEIGHT_M = 1.2;
export const RABBIT_HEIGHT_M = 0.7;
export const TROOP_HEIGHT_M = 0.35;
export const CAULDRON_HEIGHT_M = 0.5;
export const FADE_START_M = 1.2;
export const FADE_END_M = 0.6;

// src/fx/proximityFade.ts
/** Puro e testável: 1 = opaco (>= startM), 0 = invisível (<= endM). */
export function computeFadeAlpha(distanceM: number, startM: number, endM: number): number;
export function attachProximityFade(
  mesh: AbstractMesh,
  getCameraPosition: () => Vector3,
  opts?: { startM?: number; endM?: number }
): { dispose(): void };
```

**Critério de aceite:** `grep -r AR_ARENA_SCALE src/` não retorna nada;
`arenaRoot.scaling` é 1 nos dois modos; a torre mede 1,20 m no eixo Y; o blob de
contato acompanha o diâmetro real do objeto; a menos de 0,6 m a torre está com
alpha 0 e não aparece cortada.

**Como validar:** `npm test` && `npm run build`; em device, aproximar da torre até
encostar — ela some por fade, sem plano de corte visível.

**Fora de escopo:** mudar a forma da arena (é a Etapa 3); criar o caldeirão (é a
Etapa 8) — só a constante de altura entra aqui.

**Sub-agents:**

| Tarefa | Agent | Modelo | Roda em paralelo com |
|---|---|---|---|
| Varrer todos os usos de `AR_ARENA_SCALE`, `ARENA_AUTHORED_*` e constantes espaciais em unidades autorais, devolvendo lista arquivo:linha com o fator a aplicar | Explore | `haiku` — busca mecânica, critério objetivo | — (roda **antes**, é insumo das outras) |
| Converter geometria e constantes para metros | general-purpose | `sonnet` — implementação guiada pela tabela de escala da spec §2 | tarefa do fade |
| `proximityFade` + testes | general-purpose | `sonnet` — módulo novo, contrato fechado | tarefa da conversão (arquivos disjuntos) |

**Depende de:** nenhuma.

---

### Etapa 3 — Ancoragem egocêntrica: a arena fecha onde o jogador está

**Objetivo:** a arena deixa de ser um retângulo colocado num ponto tocado e passa
a nascer **no jogador** — origem na projeção do celular no piso, azimute 0 na
direção em que ele apontava no instante do fechamento.

**Arquivos-alvo:** `src/ar/EighthWallARManager.ts`, `src/ar/ArenaGhost.ts`
(reescrito), `src/ar/placementGate.ts` (+test), `src/ar/hitTestSampling.ts`,
`src/game/GameFlow.ts`, `src/camera/arenaFraming.ts` (modo canvas).

**Contrato:**

```ts
export interface ArenaAnchor {
  /** Origem da arena: o celular projetado no piso estimado. */
  origin: Vector3;
  /** Direção do celular no fechamento — vira o azimute 0 do `ArenaArc`. */
  forwardYawDeg: number;
  floorY: number;
}

arManager.canCloseArena(): { ok: true } | { ok: false; reason: string };
arManager.closeArenaAtPlayer(): ArenaAnchor | null;
arManager.onArenaClosedObservable: Observable<ArenaAnchor>;
/** Yaw da câmera em relação ao azimute 0 da arena. Alimenta TODO o resto. */
arManager.getCameraYawDeg(): number;
```

O gate deixa de medir "cabe um retângulo de 80 cm" e passa a exigir três coisas:
(a) `trackingStatus === "NORMAL"`; (b) piso encontrado abaixo do device entre
0,8 m e 2,0 m, por fit de plano sobre amostras à frente do jogador — **não** sobre
o ponto de toque; (c) nenhuma **prova contrária** de obstáculo dentro de
`MIN_PLACE_RADIUS_M`. A política de "silêncio do sensor não reprova" continua
intacta — ela é o motivo de o gate atual funcionar.

**Critério de aceite:** em device, a arena fecha na posição do jogador sem ele
tocar em ponto nenhum do chão; girando o tronco 180°, torre, caldeirão e limites
de setor permanecem coerentes com o mundo real; **deslize ≤ ~2 cm em 60 s girando
no lugar**. Note que o critério mudou de forma: o jogador não circula mais, então
a medição é de rotação, não de translação.

**Como validar:** `npm run dev` + device Android e iOS; overlay de debug
(`?debug=1`) mostrando `trackingStatus`, `getCameraYawDeg()` e o setor enquadrado.

**Fora de escopo:** a intro do Ato 1–2 (Etapa 10) — aqui a arena fecha por botão
de debug; qualquer conteúdo de combate.

**Sub-agents:**

| Tarefa | Agent | Modelo | Roda em paralelo com |
|---|---|---|---|
| Mapear tudo em `ArenaGhost`/`placementGate`/`EighthWallARManager` que depende do footprint retangular de 80 cm | Explore | `haiku` — varredura, critério objetivo | — (roda antes) |
| Desenhar e implementar a ancoragem egocêntrica e o novo gate | general-purpose | `opus` — é decisão de ancoragem em RA, o lugar onde erro só aparece depois, em outro módulo, como drift | — |

**Depende de:** Etapa 1 (raio e setores), Etapa 2 (escala métrica).

---

### Etapa 4 — Diretor de ondas e convergência ao jogador

**Objetivo:** o combate deixa de ser torre-contra-torre com caminho central e
passa a ser ondas que nascem na borda do arco, **sempre fora do que o jogador está
enquadrando**, e convergem para ele.

**Arquivos-alvo:** `src/battle/WaveDirector.ts` (novo), `src/battle/WaveDirector.test.ts`
(novo), `src/combat/CombatEngine.ts` (reescrito), `src/units/BaseUnit.ts`,
`src/battle/EnemyScript.ts` (+test, removidos),
`src/combat/DeploymentZone.ts` (+test, removidos).

**Contrato:**

```ts
export interface WaveEntry { cardId: string; count: number; }
export interface WaveSpec { atMs: number; entries: WaveEntry[]; }
export interface SpawnOrder { cardId: string; sector: SectorId; point: ArcPoint; }

export class WaveDirector {
  constructor(opts: { waves: WaveSpec[]; getCameraYawDeg: () => number; rng?: () => number });
  /** Chamado por frame com o tempo decorrido. Devolve o que nasce agora. */
  update(elapsedMs: number): SpawnOrder[];
  reset(): void;
}

/** Contrato consumido pela Etapa 5 — declarado aqui para permitir paralelismo. */
export interface SectorThreat { sector: SectorId; count: number; nearestRadiusM: number; }
combatEngine.getSectorThreats(): SectorThreat[];
combatEngine.onEnemyDefeatedObservable: Observable<{ cardId: string }>;
combatEngine.onPlayerTowerDamagedObservable: Observable<Vector3>;  // permanece
```

**Critério de aceite:** nenhum inimigo nasce em setor enquadrado enquanto houver
setor livre; nenhum nasce dentro de `MIN_PLACE_RADIUS_M`; inimigos convergem
radialmente para a torre do jogador e a danificam; `getSectorThreats()` devolve
contagem correta por setor; `WaveDirector` testado sem Babylon com `rng` semeado.

**Como validar:** `npm test` && `npm run dev` no **modo canvas** — o modo tela é a
validação barata aqui, porque o comportamento de onda não depende de RA.

**Fora de escopo:** alertas de flanco (Etapa 5); o Coelho como onda final (D6 —
entra depois que as ondas comuns estiverem validadas); colocação de tropa do
jogador (Etapa 6).

**Sub-agents:**

| Tarefa | Agent | Modelo | Roda em paralelo com |
|---|---|---|---|
| `WaveDirector` + testes | general-purpose | `sonnet` — arquivo novo, contrato fechado acima | reescrita do `CombatEngine` (arquivos disjuntos) |
| Reescrever `CombatEngine` para alvo-único-jogador e navegação radial | general-purpose | `opus` — módulo central que cruza Arena/Unit/Combat; erro aqui contamina todas as etapas seguintes | `WaveDirector` |

**Depende de:** Etapa 1.

---

### Etapa 5 — Alertas de flanco e áudio espacial

**Objetivo:** o jogador passa a saber **quantos** inimigos há no que ele não está
vendo — inclusive o que está dentro do FOV mas escondido atrás da torre — sem
saber quais nem como estão dispostos.

**Arquivos-alvo:** `src/ui/FlankAlert.ts` (novo), `src/fx/visibilityRaycast.ts`
(novo), `src/audio/SpatialCues.ts` (novo), `src/ui/HudLayer.ts`,
`src/ui/OffscreenIndicator.ts` (absorvido ou aposentado).

**Contrato:**

```ts
export function isOccluded(
  scene: Scene, from: Vector3, to: Vector3, blockers: AbstractMesh[]
): boolean;

export class FlankAlert {
  update(threats: SectorThreat[], cameraYawDeg: number): void;
  dispose(): void;
}

/** Hierarquia D4 aplicada por dentro: torradeira > alerta > impacto > tropa. */
export class SpatialCues {
  playEnemySpawn(worldPos: Vector3): void;
  playTeaReady(): void;
  playTowerHit(worldPos: Vector3): void;
  dispose(): void;
}
```

Um setor dispara alerta quando tem inimigo **fora do FOV** ou inimigo **dentro do
FOV porém ocluído** — raycast de visibilidade contra a torre, não comparação de
ângulo (spec §2.2). Sons posicionais usam `Sound` com `spatialSound: true`, e o
`AudioEngine` só sobe depois da primeira interação do usuário (política de
autoplay).

**Critério de aceite:** com um inimigo atrás do jogador, a seta do lado certo
acende com o número certo; movendo o inimigo para trás da torre dentro do FOV, a
seta continua acesa; o som do spawn vem da direção correta em fone de ouvido; a
torradeira abafa o alerta quando os dois disparam juntos.

**Como validar:** `npm test` (raycast e hierarquia testáveis com stubs) +
`npm run dev` no modo canvas com câmera girável, depois device com fone.

**Fora de escopo:** a carta de informação (revela espécie — Etapa 9); a torradeira
de verdade (Etapa 8 emite o evento, aqui só existe o canal de prioridade).

**Sub-agents:**

| Tarefa | Agent | Modelo | Roda em paralelo com |
|---|---|---|---|
| `FlankAlert` + enxugar `HudLayer` para timer + HP + setas | general-purpose | `sonnet` — contrato fechado, padrão de HUD já existe no projeto | `SpatialCues`/`visibilityRaycast` |
| `visibilityRaycast` + `SpatialCues` com a hierarquia D4 | general-purpose | `sonnet` — implementação normal; a armadilha (autoplay) já está nomeada na spec | `FlankAlert` |

**Depende de:** Etapa 1, Etapa 4.

---

### Etapa 6 — Colocação direta no chão

**Objetivo:** invocar tropa vira um gesto só, no lugar onde importa: pressionar a
carta, mirar o chão, soltar. O elixir é debitado na colocação e a tropa nasce onde
foi apontada.

**Arquivos-alvo:** `src/interaction/PlacementRing.ts` (novo),
`src/interaction/PlacementRing.test.ts` (novo), `src/interaction/WorldTapRouter.ts`,
`src/combat/CombatEngine.ts`, `src/cards/CardDeckSystem.ts`.

**Contrato:**

```ts
export type RingState = "valid" | "too-close" | "out-of-arc" | "too-far" | "no-resource";

export class PlacementRing {
  /** Começa a seguir o centro da tela projetado no piso. */
  show(cardId: string): void;
  /** Por frame, enquanto visível. */
  update(): void;
  getCurrentArcPoint(): ArcPoint | null;
  getState(): RingState;
  hide(): void;
}

combatEngine.tryDeployAtArcPoint(p: ArcPoint, cardId: string): boolean;
```

Gesto (D2): `pointerdown` na carta → `show()`; o anel acompanha o centro da tela
enquanto o dedo está pressionado; `pointerup` → se `getState() === "valid"`,
`tryDeployAtArcPoint` debita e cria a tropa; qualquer outro estado cancela **sem
gastar nada**. Fallback de toque-duplo quando o `pointerup` chega em menos de
150 ms sem movimento de mira.

**Critério de aceite:** o anel é verde onde dá para colocar e apagado onde não dá;
soltar num ponto inválido não debita; a tropa nasce exatamente onde o anel estava
e não caminha do centro; empilhar na base é impossível (`MIN_PLACE_RADIUS_M`).

**Como validar:** `npm test` (estados do anel são lógica pura sobre `ArenaArc`) +
device: colocar tropa nos três setores sem sair do lugar.

**Fora de escopo:** o visual final da carta (Etapa 7 — aqui a carta ainda é o HUD
2D atual, só para ter o que pressionar); coleta de cogumelo.

**Sub-agents:**

| Tarefa | Agent | Modelo | Roda em paralelo com |
|---|---|---|---|
| `PlacementRing` + integração no router e no `CombatEngine` | general-purpose | `sonnet` — contrato fechado, e o `WorldTapRouter` já tem o padrão de despacho por fase | — |

**Depende de:** Etapa 1, Etapa 3, Etapa 4.

---

### Etapa 7 — Cartas presas ao jogador; o HUD 2D de combate morre

**Objetivo:** as cartas saem da barra inferior e viram objetos 3D presos ao
jogador, na diagonal inferior, girando com ele. A barra de elixir desaparece: a
leitura de recurso passa a ser "carta acesa ou apagada".

**Arquivos-alvo:** `src/ui/HandCards3D.ts` (novo), `src/ui/HandCards3D.test.ts`
(novo — só a lógica de layout/estado), `src/ui/CardDeckHud.ts` (removido),
`src/ui/DiamondCard.ts` (arte reaproveitada como textura), `src/ui/HudLayer.ts`,
`src/cards/cardCatalog.ts` (cor de contorno por **tipo**, spec §7).

**Contrato:**

```ts
export type CardKind = "autonoma" | "mira" | "informacao" | "negacao";

// cardCatalog ganha o eixo de atenção da spec §7
export interface CardDefinition {
  id: string; name: string; summary: string; cost: number;
  accentColor: string;
  kind: CardKind;          // define a cor de contorno
}

export class HandCards3D {
  constructor(scene: Scene, camera: Camera, deck: CardDeckSystem);
  onCardPressedObservable: Observable<string>;
  onCardReleasedObservable: Observable<string>;
  /** D8 — fade para 35% durante a mira; a carta pressionada nunca faz fade. */
  setFadedForAiming(faded: boolean): void;
  dispose(): void;
}
```

Quads **unlit** de alto contraste, parentados a um `TransformNode` filho da
câmera. Mão de 4 slots; slot vazio renderiza como contorno tracejado. Texto por
`DynamicTexture` com `update()` — o `update(false)` sobe a textura de cabeça para
baixo e passa despercebido em arte simétrica.

**Critério de aceite:** girando o tronco, as cartas acompanham sem lag
perceptível; legíveis com o celular a braço estendido em retrato; carta
impagável fica visivelmente apagada; não existe mais nenhuma barra de elixir nem
fileira 2D de cartas na tela; `HudLayer` só desenha timer, HP da torre e setas.

**Como validar:** `npm test` && `npm run build`; device: ler as quatro cartas de
relance enquanto gira.

**Fora de escopo:** o livro de cartas (adiado pela spec); o álbum (Etapa 11).

**Sub-agents:**

| Tarefa | Agent | Modelo | Roda em paralelo com |
|---|---|---|---|
| `HandCards3D` + remoção do `CardDeckHud` + `kind` no catálogo | general-purpose | `sonnet` — implementação dentro de contrato; as armadilhas de GUI/textura já estão nomeadas | — |

**Depende de:** Etapa 2, Etapa 6.

---

### Etapa 8 — Caldeirão fermentador

**Objetivo:** existe um lugar no mundo onde o poder se regenera, com leitura por
volume de líquido, aceleração por cogumelo verde, aviso sonoro de pronto, e uma
janela de vulnerabilidade que o jogador escolhe quando pagar.

**Arquivos-alvo:** `src/world/Cauldron.ts` (novo), `src/world/Cauldron.test.ts`
(novo), `src/world/GreenMushroom.ts` (novo), `src/cards/CardDeckSystem.ts`,
`src/audio/SpatialCues.ts`.

**Contrato:**

```ts
export class Cauldron {
  /** 0..1 — o volume de líquido é a UI. */
  getFillRatio(): number;
  /** Cogumelo verde entregue: acelera a fermentação. */
  addMushroom(): void;
  isReady(): boolean;
  /** Restaura o poder ao máximo, instantaneamente. Sem duração, sem buff. */
  drink(): boolean;
  onReadyObservable: Observable<void>;   // dispara a torradeira (D4)
}

// CardDeckSystem: "cogumelos" viram "poder", com regeneração LENTA de fundo
deck.getPower(): number;
deck.setPower(value: number): void;
deck.canPay(cardId: string): boolean;
```

Beber (D3) = tocar no caldeirão **enquanto ele está enquadrado**; a exposição é o
próprio enquadramento. O cogumelo verde nasce **atrás dos inimigos** (spec §8) —
`ArenaArc` já sabe onde isso é; tocar nele faz o cogumelo voar sozinho até o
caldeirão.

**Critério de aceite:** cogumelo tocado voa e sobe o nível do líquido; ao encher,
toca a torradeira e o líquido muda de leitura; beber acende todas as cartas
pagáveis; a telemetria confirma que durante o gesto de beber `framedSectors()`
está vazio — se não estiver, a janela de vulnerabilidade não existe e o desenho
falhou.

**Como validar:** `npm test` (fermentação e poder são lógica pura) + device.

**Fora de escopo:** o cogumelo roxo (Etapa 9).

**Sub-agents:**

| Tarefa | Agent | Modelo | Roda em paralelo com |
|---|---|---|---|
| `Cauldron` + testes de fermentação | general-purpose | `sonnet` — regra nova com trade-off de tuning | `GreenMushroom` |
| `GreenMushroom` (spawn atrás do inimigo, voo até o caldeirão) | general-purpose | `sonnet` — implementação normal sobre `ArenaArc` | `Cauldron` |
| Renomear cogumelo→poder no `CardDeckSystem` e afrouxar a regeneração de fundo | general-purpose | `haiku` — renomeação e ajuste de constante, verificável pelo build e pela suíte | as duas acima (arquivo disjunto) |

**Depende de:** Etapa 7.

---

### Etapa 9 — Economia de cartas: derrotado vira carta

**Objetivo:** o game loop passa a ter entrada de cartas. Toda criatura abatida
entra no álbum **no instante do abate** — vale em vitória e em derrota.

**Arquivos-alvo:** `src/cards/CardAlbum.ts` (+test, novos),
`src/cards/CardStock.ts` (+test, novos), `src/world/PurpleMushroom.ts` (novo),
`src/combat/CombatEngine.ts` (só o hook).

**Contrato:**

```ts
export class CardAlbum {
  register(cardId: string): boolean;      // true = descoberta inédita
  has(cardId: string): boolean;
  entries(): string[];
  toJSON(): string; static fromJSON(raw: string): CardAlbum;   // localStorage
}

export class CardStock {
  count(cardId: string): number;
  /** Só a criatura que MORRE em batalha é consumida (spec §7). */
  consumeOnDeath(cardId: string): void;
  /** Sobrevivente volta ao estoque no fim da partida. */
  returnSurvivor(cardId: string): void;
  isBankrupt(): boolean;
  grantRandom(rng: () => number): string;   // cogumelo roxo
}
```

Falência (estoque zerado) **não** encerra a partida (D5): faz nascer um cogumelo
roxo que dá uma carta aleatória.

**Critério de aceite:** perder a partida e ainda sair com as cartas dos inimigos
abatidos; sobreviventes voltam ao estoque e mortos não; zerar o estoque faz
nascer o roxo; o álbum sobrevive ao reload da página.

**Como validar:** `npm test` (tudo aqui é lógica pura) + uma partida completa em
device terminando em derrota.

**Fora de escopo:** a tela do álbum (Etapa 11); a carta do Coelho (depende de D6,
entra na Etapa 11 junto com a vitória).

**Sub-agents:**

| Tarefa | Agent | Modelo | Roda em paralelo com |
|---|---|---|---|
| `CardAlbum` + `CardStock` + testes + persistência | general-purpose | `sonnet` — lógica de dupla camada com regra sutil (morto ≠ sobrevivente) | `PurpleMushroom` |
| `PurpleMushroom` como variação visual do verde | general-purpose | `haiku` — variação de um objeto que já existirá, contrato fechado | `CardAlbum`/`CardStock` |

**Depende de:** Etapa 4.

---

### Etapa 10 — A intro: o gatilho é enquadrar

**Objetivo:** o Ato 1 e o Ato 2 existem. A torre brota, o som de banho chama, o
jogador procura com o celular, e **enquadrar** o Coelho por 1–2 s contínuos abre a
fenda e fecha a arena. É a primeira ação da partida e é exatamente a mecânica
central.

**Arquivos-alvo:** `src/towers/FramingTrigger.ts` (+test, novos),
`src/towers/ProximityTrigger.ts` (+test, removidos), `src/fx/FloorCrack.ts` (novo),
`src/towers/CrazyRabbit.ts`, `src/game/GameFlow.ts`, `src/game/GameTypes.ts`.

**Contrato:**

```ts
export type GamePhase =
  | "menu" | "ar-setup" | "world-alive" | "arena-closing"
  | "playing" | "match-over" | "album";

export type FramingStage = "idle" | "noticing" | "staring" | "triggered";

export class FramingTrigger {
  /** `isFramed` = dentro do cone central E não ocluído (reusa `isOccluded`). */
  update(isFramed: boolean, nowMs: number): FramingStage;
  getStage(): FramingStage;
  reset(): void;
}
```

`isFramed` exige três coisas juntas, e as três importam: o Coelho dentro do
frustum, dentro de um cone central de ~20° (ter no canto do olho não é enquadrar),
e não ocluído. Os limiares saem de telemetria de device — o mesmo critério que o
`ProximityTrigger` usou, não palpite.

**Critério de aceite:** varrer a câmera passando de raspão pelo Coelho **não**
dispara; manter no centro por ~1,5 s dispara; a reação é gradual e legível (para
de cantar → olha de lado → encara) antes de qualquer coisa acontecer; a fenda abre
no piso real e a arena fecha na posição do jogador.

**Como validar:** `npm test` (a máquina de estados é pura) + device, com a métrica
de sessão registrando o intervalo `arena_placed → framing_triggered`. **Precisa de
alguém que não conhece o jogo** — o autor testando o próprio jogo não vale como
leitura, e o README já registra esse erro.

**Fora de escopo:** o fim de partida (Etapa 11); a placa "CUIDADO" continua só
como cenário e não é gatilho de nada.

**Sub-agents:**

| Tarefa | Agent | Modelo | Roda em paralelo com |
|---|---|---|---|
| Desenhar o gatilho de enquadramento, a reação gradual e a nova máquina de fases | general-purpose | `opus` — é o "momento Alice"; decisão de sensação que cruza AR, animação e fluxo, e cujo erro só aparece com gente testando | — |
| `FloorCrack` (a fenda) | general-purpose | `sonnet` — efeito localizado, contrato fechado | — (mesmo `GameFlow` não; arquivo disjunto, pode ir junto) |

**Depende de:** Etapa 2, Etapa 3, Etapa 5 (usa `isOccluded`).

---

### Etapa 11 — Fim de partida, álbum e a segunda sessão de RA

**Objetivo:** a partida termina, o jogador vê o que conquistou, e **consegue jogar
de novo sem recarregar a página**.

**Arquivos-alvo:** `src/ui/AlbumScreen.ts` (novo), `src/fx/arenaDissolve.ts`,
`src/game/GameFlow.ts`, `src/ar/ArSessionController.ts`,
`src/ar/EighthWallARManager.ts`.

**Contrato:**

```ts
arManager.startSession(): Promise<void>;   // chama XR8.run()
arManager.stopSession(): Promise<void>;    // chama XR8.stop()
// Invariante: entrar → sair → entrar de novo, sem reload, com tracking novo.

export class AlbumScreen {
  show(album: CardAlbum, gained: string[]): void;
  onPlayAgainObservable: Observable<void>;
}
```

**Este é o lugar onde o bloqueador 1 do README é pago.** O ciclo de vida do engine
hoje é delegado ao `xrCameraBehavior`; "sair da RA" solta a câmera do Babylon mas
nunca para o engine. Sem `XR8.run()`/`XR8.stop()`, o Ato 4 não fecha — e sem o Ato
4 fechando não dá para testar várias pessoas seguidas.

Derrota = torre cair (D5). Duração 3 min pelo `MatchClock` existente. O Coelho
como onda final (D6) e a carta dele por vitória entram aqui.

**Critério de aceite:** três partidas seguidas no mesmo carregamento de página, com
ancoragem nova em cada uma; a arena se desfaz da borda para o centro antes do
álbum; as cartas ganhadas aparecem destacadas; "jogar de novo" volta ao Ato 1.

**Como validar:** device, três partidas seguidas — é a validação que destrava
testar com pessoas reais.

**Fora de escopo:** deck building; qualquer progressão além do álbum.

**Sub-agents:**

| Tarefa | Agent | Modelo | Roda em paralelo com |
|---|---|---|---|
| Ciclo de vida real da sessão de RA (`XR8.run`/`XR8.stop`) | general-purpose | `opus` — é depuração de causa-raiz de um bloqueador antigo, no módulo mais sensível do projeto | — |
| `AlbumScreen` + fim de partida | general-purpose | `sonnet` — tela 2D dentro de contrato fechado | tarefa do ciclo de vida (arquivos disjuntos) |

**Depende de:** Etapa 9, Etapa 10.

---

## 4. Ondas de execução

```
Onda 1 (paralelo):  Etapa 1 · Etapa 2        — nenhuma dependência; arquivos disjuntos
Onda 2 (paralelo):  Etapa 3 · Etapa 4        — 3 toca ar/ + GameFlow, 4 toca battle/ + combat/
Onda 3 (serial):    VALIDAÇÃO EM DEVICE      — ancoragem egocêntrica e deslize ao girar
Onda 4 (paralelo):  Etapa 5 · Etapa 6        — 5 toca ui/ + audio/, 6 toca interaction/ + combat/
Onda 5 (serial):    Etapa 7                  — mata o HUD 2D; toca HudLayer, que a Etapa 5 acabou de mexer
Onda 6 (serial):    VALIDAÇÃO DA TESE        — etapas 1–7 em device, com alguém que não conhece o jogo
Onda 7 (paralelo):  Etapa 8 · Etapa 9        — 8 toca world/ + cards/CardDeckSystem, 9 toca cards/CardAlbum|CardStock
Onda 8 (serial):    Etapa 10                 — reescreve GamePhase; nada pode estar mexendo em GameFlow junto
Onda 9 (serial):    Etapa 11                 — depende de 9 e 10; toca GameFlow de novo
```

**Por que a Onda 3 e a Onda 6 são serializações obrigatórias:** validação em
hardware é serial por natureza, e as duas são pontos de não-retorno. A Onda 3
responde se a ancoragem egocêntrica é estável o bastante para o jogo existir; a
Onda 6 é o corte que a própria spec §12 define — **"passos 1–4 provam a tese; se a
mecânica de atenção não for divertida ali, o resto não salva"**. Executar as
Ondas 7–9 antes desse veredito é construir em cima de uma aposta não verificada.

**Por que a Onda 5 e as Ondas 8–9 são seriais:** conflito de escrita, não de
dependência. `HudLayer.ts` é escrito pela Etapa 5 e reescrito pela 7;
`GameFlow.ts`/`GameTypes.ts` são reescritos pela 10 e de novo pela 11. Paralelizar
qualquer um desses pares é garantir merge conflict em arquivo grande.

---

## 5. O que este plano não resolve

- **Oclusão real** não existe neste stack (spec §11) e nenhuma etapa tenta
  produzi-la. A oclusão da Etapa 5 é geométrica contra a torre virtual, não contra
  móveis reais.
- **Salto de relocalização do SLAM** é mitigável, nunca eliminável — o binário do
  8th Wall não expõe anchor persistente por objeto. Ficar parado (v3 não pede
  deslocamento) é a maior mitigação disponível, e é de graça.
- **Os números de tuning** (raio, custo, ritmo de fermentação, valor do cogumelo
  verde) entram como constante nomeada em `metrics.ts`/`ArenaArc.ts` para serem
  trocados sem refatorar. Nenhum deles é decidido por este plano.
