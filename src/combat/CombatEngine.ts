import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Observable, type Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

import { evaluateDeployment, refusalReason, toArc, toLocal, type ArcPoint } from "../arena/ArenaArc";
import { TROOP_LEASH_RADIUS_M } from "../arena/metrics";
import type { TeamId } from "../battle/BattleTypes";
import type { CombatTarget } from "../battle/CombatTarget";
import { summarizeSectorThreats, type SectorThreat } from "../battle/sectorThreats";
import { CardDeckSystem } from "../cards/CardDeckSystem";
import {
  FIREBALL_AIM_CONE_DEG,
  FIREBALL_COST_MUSHROOMS,
  FIREBALL_DAMAGE,
  FIREBALL_SPEED_MPS,
} from "../arena/metrics";
import { Fireball } from "./Fireball";
import { pickFireballTarget } from "./fireballAim";
import { PlayerCore } from "./PlayerCore";
import type { BaseUnit } from "../units/BaseUnit";
import { UnitFactory } from "../units/UnitFactory";
import { playGhostThenMaterialize } from "../fx/spawnAnimation";

/** Payload de `card_deployed` (telemetria) — ver `SessionTelemetry.ts`. */
export interface CardDeployedInfo {
  cardId: string;
  /** Posicao LOCAL da arena (nao mundo): reconstroi o ponto de invocacao
   * independente de onde a arena foi ancorada em RA. */
  x: number;
  z: number;
  /** Tempo restante de partida em ms no instante da invocacao. */
  remainingMs: number;
}

// Duracao do fantasma antes de materializar a unidade. Ver
// `playGhostThenMaterialize` em `src/fx/spawnAnimation.ts`.
const GHOST_DURATION_MS = 200;

/**
 * Onde a bola nasce, em metros a frente do jogador. Fora da camera de RA (que o
 * engine fixa a 1 m) e dentro do quadro.
 */
const FIREBALL_ORIGIN_RADIUS_M = 0.4;

/**
 * Ate onde voa um tiro que nao acertou ninguem. Alem do fundo da arena de
 * proposito: a bola tem de sair de cena, e nao parar no ar no meio do campo.
 */
const FIREBALL_MISS_RANGE_M = 2.4;

interface PendingGhostDeployment {
  cancel: () => void;
  unit: BaseUnit;
}

export interface CombatEngineOptions {
  arenaRoot: TransformNode;
  cardDeckSystem: CardDeckSystem;
  /** Tempo restante de partida, em ms — vai no payload de telemetria `card_deployed`. */
  getRemainingMs?: () => number;
  /**
   * Fonte de tempo dos cooldowns de ataque, injetavel. Default:
   * `performance.now`. Mesmo padrao do `MatchClock`, e pela mesma razao: sem
   * isto, um teste headless que simula 60 s de partida em 300 ms de relogio real
   * ve a unidade andar o campo inteiro e atacar duas vezes.
   */
  now?: () => number;
  /**
   * Para onde o celular aponta AGORA, em graus. Injetado, e nunca lido da camera
   * aqui dentro: e o invariante 1 do quadro (a logica de jogo e independente do
   * modo de renderizacao), e e o que mantem o modo tela jogavel com o jogador
   * simulado.
   *
   * O combate precisa disto desde 2026-08-21, quando colocar carta passou a
   * depender do cone de acao — antes, onde da para colocar nao dependia de para
   * onde se olha.
   */
  getCameraYawDeg: () => number;
  /** Raio do corpo do jogador, em metros (`PLAYER_BODY_RADIUS_M`). */
  playerBodyRadius: number;
  playerMaxHealth: number;
  scene: Scene;
  /**
   * Fabrica de unidades INJETADA. Antes o CombatEngine criava a sua propria,
   * o que impedia a `ResidentPopulation` (o "mundo vivo") de usar a mesma —
   * agora quem monta a cena constroi a fabrica e a entrega aos dois.
   */
  unitFactory: UnitFactory;
  /** Altura do "chao" da arena, em metros: onde os pes de uma unidade nascem. */
  unitGroundY: number;
}

/**
 * Motor de combate da v3 (JG-04).
 *
 * O que mudou em relacao ao duelo torre-contra-torre da v2:
 *
 * - **Alvo unico, e desde a JG-12 ele e o proprio JOGADOR** (`PlayerCore`).
 *   Nao existe mais torre de combate: o inimigo nasce na borda do arco e
 *   converge para a origem, que e onde quem joga esta. A tropa do jogador nao
 *   tem torre para atacar — ela defende o pedaco do arco onde foi colocada e
 *   bate nas UNIDADES que chegam (`CombatTarget` cobre os dois casos).
 * - **Nada do lado do jogador ataca sozinho.** A torre tinha 1,0 m de alcance e
 *   ataque automatico, e isso resolvia a partida sem o jogador fazer nada — duas
 *   partidas medidas em device terminaram com 100% e 99,1% de vida. Quem
 *   defende e carta; o recurso de emergencia e a fireball, que custa cogumelo.
 * - **Colocacao polar.** Quem decide se um ponto e legal e `evaluatePlacement`
 *   do modelo polar (dentro do arco, entre `MIN_PLACE_RADIUS_M` e
 *   `ARENA_RADIUS_M`), e nao mais o retangulo "metade do jogador" da
 *   `DeploymentZone`, que saiu do projeto junto com o caminho central.
 * - **Leitura de flanco.** `getSectorThreats()` publica quantos inimigos ha em
 *   cada setor e a que distancia esta o mais proximo. E o que a JG-05 consome
 *   para desenhar a seta de borda.
 *
 * O ONDE de cada nascimento inimigo NAO se decide aqui: quem escolhe o setor e
 * o `WaveDirector` (puro), olhando para onde o jogador esta apontando o
 * celular. Este modulo so recebe o ponto polar ja validado.
 */
export class CombatEngine {
  /**
   * O jogador levou dano; carrega a posicao de MUNDO de onde ele esta (a origem
   * da arena). Quem ouve e o `OffscreenIndicator`, para apontar a seta quando o
   * ataque acontece fora do quadro da camera, e o HUD, para a vinheta.
   */
  public readonly onPlayerDamagedObservable = new Observable<Vector3>();
  /** Uma invocacao de fato aconteceu (cogumelo ja debitado). Ver `CardDeployedInfo`. */
  public readonly onCardDeployedObservable = new Observable<CardDeployedInfo>();
  /** Toque fora do anel valido com carta selecionada: selecao cancelada, nada foi gasto. */
  public readonly onDeployCancelledObservable = new Observable<void>();
  /**
   * Uma unidade do INIMIGO acabou de nascer; carrega a posicao de MUNDO do
   * spawn. Quem ouve e o `OffscreenIndicator`, para apontar a invocacao quando
   * ela acontece fora do quadro da camera.
   */
  public readonly onEnemyUnitDeployedObservable = new Observable<Vector3>();
  /**
   * Uma criatura inimiga foi abatida, com a carta que a gerou. E a entrada da
   * economia do album (spec v3 §8: "derrotado vira carta", e vale tambem em
   * derrota) — a JG-09 assina isto. Dispara UMA vez por unidade, no frame em
   * que ela sai do campo.
   */
  public readonly onEnemyDefeatedObservable = new Observable<{ cardId: string }>();
  /**
   * O jogador lancou uma fireball (cogumelo ja debitado). Quem ouve e o HUD, para
   * o feedback de disparo. Nao carrega alvo de proposito: o tiro sai antes de se
   * saber se acerta, e e assim que ele e sentido.
   */
  public readonly onFireballCastObservable = new Observable<void>();
  /**
   * O jogador chegou a 0 de vida — dispara UMA vez, no frame da transicao. E a
   * derrota (`DJ-5`, que dizia "a torre cair" e desde a JG-12 diz "o jogador
   * cair"), mas quem decide o resultado da partida continua sendo o `GameFlow`:
   * este modulo so avisa.
   */
  public readonly onPlayerDefeatedObservable = new Observable<void>();

  private readonly arenaRoot: TransformNode;
  private readonly cardDeckSystem: CardDeckSystem;
  private readonly getCameraYawDeg: () => number;
  private readonly getRemainingMs: () => number;
  private readonly now: () => number;
  private readonly player: PlayerCore;
  private readonly scene: Scene;
  private readonly unitFactory: UnitFactory;
  private readonly unitGroundY: number;

  private readonly beforeRenderObserver: Observer<Scene>;
  private readonly units: BaseUnit[] = [];
  // Projeteis em voo. Vivem fora de `units` porque nao sao unidades: nao andam
  // por navegacao, nao sao alvo, nao contam como ameaca de flanco.
  private readonly fireballs: { projectile: Fireball; target: BaseUnit | null }[] = [];
  // Unidades entre "cogumelo ja debitado" e "fantasma acabou": ficam de fora
  // de `units` (nao andam, nao atacam, nao sao alvo, nao contam como ameaca de
  // flanco) ate materializar. Ver `beginGhostDeployment`.
  private readonly pendingGhostDeployments: PendingGhostDeployment[] = [];
  // Vida do jogador na rodada anterior: a queda entre dois frames e o gatilho
  // de `onPlayerDamagedObservable` (o dano e aplicado direto pela unidade no
  // `PlayerCore`, sem passar por aqui).
  private lastPlayerHealth: number;
  // Vivo/morto da rodada anterior — a queda de vivo para morto e o gatilho de
  // `onPlayerDefeatedObservable`.
  private lastPlayerAlive: boolean;

  // Nasce ligado para nao mudar o comportamento de quem ainda nao chama
  // `setActive`; quem desliga fora de partida e o GameFlow.
  private isActive = true;

  public constructor(options: CombatEngineOptions) {
    this.arenaRoot = options.arenaRoot;
    this.cardDeckSystem = options.cardDeckSystem;
    this.getCameraYawDeg = options.getCameraYawDeg;
    this.getRemainingMs = options.getRemainingMs ?? (() => 0);
    this.now = options.now ?? (() => performance.now());
    this.scene = options.scene;
    this.unitFactory = options.unitFactory;
    this.unitGroundY = options.unitGroundY;

    // Selecionar carta nao acende mais overlay nenhum: a `DeploymentZone` (o
    // retangulo da "metade do jogador") saiu com a JG-04, junto com o caminho
    // central que a justificava. O feedback espacial de onde da para colocar
    // volta na JG-06, como anel projetado no ponto mirado — e la que uma
    // assinatura de `onStateChangedObservable` volta a fazer sentido.
    this.player = new PlayerCore({
      bodyRadius: options.playerBodyRadius,
      groundY: this.unitGroundY,
      maxHealth: options.playerMaxHealth,
    });

    this.lastPlayerHealth = this.player.getHealth();
    this.lastPlayerAlive = this.player.isAlive();

    this.beforeRenderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });
  }

  /**
   * Lanca uma fireball na direcao em que o celular aponta. Devolve `false` — sem
   * gastar nada — quando o combate esta parado ou falta cogumelo.
   *
   * **O alvo e decidido no disparo, nao no impacto.** O projetil viaja ate onde
   * o inimigo escolhido estava, e o dano so e aplicado se ele ainda estiver vivo
   * na chegada. A alternativa — recalcular o alvo no impacto — faria a bola
   * "curvar" atras de quem se moveu, e o jogador aprenderia que mirar nao
   * importa. Aqui, errar por atraso e uma consequencia legivel de ter demorado.
   *
   * O tiro sai mesmo sem ninguem no cone: voa e apaga. Cobrar o cogumelo por um
   * tiro perdido e o que faz atirar a esmo custar caro.
   */
  public castFireball(): boolean {
    if (!this.isActive || !this.arenaRoot.isEnabled()) {
      return false;
    }

    if (!this.cardDeckSystem.tryConsumeMushrooms(FIREBALL_COST_MUSHROOMS)) {
      return false;
    }

    const aimAzimuthDeg = this.getCameraYawDeg();
    const aliveEnemies = this.units.filter((unit) => unit.team === "enemy" && unit.isAlive());
    const candidates = aliveEnemies.map((unit) =>
      toArc({ x: unit.root.position.x, z: unit.root.position.z })
    );

    const hitIndex = pickFireballTarget(aimAzimuthDeg, candidates, FIREBALL_AIM_CONE_DEG);
    const target = hitIndex === null ? null : aliveEnemies[hitIndex];

    const from = this.fireballOrigin();
    const to = target
      ? target.root.position.clone()
      : this.toSpawnPosition({ azimuthDeg: aimAzimuthDeg, radiusM: FIREBALL_MISS_RANGE_M });

    const projectile = new Fireball({ from, to, scene: this.scene, speedMps: FIREBALL_SPEED_MPS });
    projectile.root.parent = this.arenaRoot;
    this.fireballs.push({ projectile, target });

    this.onFireballCastObservable.notifyObservers();

    return true;
  }

  /** Fora da partida o combate nao roda nem responde a toque. */
  public setActive(isActive: boolean): void {
    this.isActive = isActive;
  }

  /**
   * HP atual/maximo do JOGADOR. Usado pelo HUD (`hudLayer.setHealth`) e pela
   * telemetria de fim de partida.
   */
  public getPlayerHealth(): { current: number; max: number } {
    return { current: this.player.getHealth(), max: this.player.maxHealth };
  }

  /** `getPlayerHealth` como percentual (0-100). Vai no `match_ended` da telemetria. */
  public getPlayerHealthPct(): number {
    const { current, max } = this.getPlayerHealth();
    return max <= 0 ? 0 : (current / max) * 100;
  }

  /**
   * Quantos inimigos vivos em cada flanco, e a que distancia esta o mais
   * proximo do jogador. Os TRES setores vem sempre, mesmo vazios (ver
   * `summarizeSectorThreats`).
   *
   * Unidades ainda em fantasma nao contam: elas nao andam nem atacam, e
   * alertar sobre uma ameaca que ainda nao existe faria o jogador girar para
   * um flanco vazio — o oposto do que a seta existe para fazer.
   */
  public getSectorThreats(): SectorThreat[] {
    const points: ArcPoint[] = [];

    for (const unit of this.units) {
      if (unit.team !== "enemy" || !unit.isAlive()) {
        continue;
      }

      // A posicao da unidade e local ao `arenaRoot`, que desde a RA-F2 vive na
      // origem sem rotacao — entao este par x/z ja esta no mesmo referencial em
      // que o modelo polar foi definido.
      points.push(toArc({ x: unit.root.position.x, z: unit.root.position.z }));
    }

    return summarizeSectorThreats(points);
  }

  /**
   * Invoca a carta selecionada no ponto de mundo tocado. E o ponto de entrada
   * publico do deploy: o CombatEngine NAO assina `onPointerObservable` (quem
   * faz isso e o `WorldTapRouter`, dono unico do toque, que chama este metodo
   * na fase `playing`). A JG-06 troca o miolo daqui pelo anel de colocacao sem
   * precisar mexer em quem roteia o toque.
   */
  public tryDeployAtWorldPoint(worldPoint: Vector3): boolean {
    if (!this.isActive) {
      return false;
    }

    return this.tryDeploySelectedCardAtWorldPoint(worldPoint);
  }

  /**
   * Faz nascer um inimigo num ponto POLAR do arco. Quem chama e o `GameFlow`,
   * repassando cada `SpawnOrder` do `WaveDirector` — que ja garantiu setor
   * livre e raio legal (`evaluatePlacement`). Sem debito de cogumelo: a
   * economia e exclusiva do jogador; o inimigo age pelo relogio da partida.
   */
  public deployEnemyAtArcPoint(cardId: string, point: ArcPoint): boolean {
    if (!this.isActive || !this.arenaRoot.isEnabled()) {
      return false;
    }

    const spawnPosition = this.toSpawnPosition(point);

    const createdUnits = this.unitFactory.createUnits(cardId, spawnPosition, "enemy");
    if (!createdUnits.length) {
      return false;
    }

    for (const createdUnit of createdUnits) {
      createdUnit.root.parent = this.arenaRoot;
      // Inimigo nao tem ancora (ele veio para chegar na torre) e atravessa o
      // campo pela propria reta que sai do jogador — e o que mantem a seta de
      // flanco dizendo a verdade do nascimento ate a chegada.
      createdUnit.setNavigation("radial");
      this.beginGhostDeployment(createdUnit);
    }

    this.onEnemyUnitDeployedObservable.notifyObservers(this.convertArenaLocalToWorld(spawnPosition));

    return true;
  }

  /**
   * Reseta o combate para uma partida nova: descarta toda unidade da partida
   * anterior, viva ou presa em fantasma, e devolve o jogador a vida cheia. O
   * "ultimo estado" e reconstruido depois do reset — sem isso a proxima partida
   * herdaria vida velha e `notifyPlayerDefeat` nunca dispararia de novo.
   *
   * NAO mexe em `isActive`: quem liga o combate de volta e o `GameFlow`.
   */
  public reset(): void {
    for (const pendingDeployment of this.pendingGhostDeployments) {
      pendingDeployment.cancel();
      pendingDeployment.unit.dispose();
    }
    this.pendingGhostDeployments.length = 0;

    for (const unit of this.units) {
      unit.dispose();
    }
    this.units.length = 0;

    for (const { projectile } of this.fireballs) {
      projectile.dispose();
    }
    this.fireballs.length = 0;

    this.player.reset();
    this.lastPlayerHealth = this.player.getHealth();
    this.lastPlayerAlive = this.player.isAlive();
  }

  public dispose(): void {
    this.scene.onBeforeRenderObservable.remove(this.beforeRenderObserver);
    this.onPlayerDamagedObservable.clear();
    this.onCardDeployedObservable.clear();
    this.onDeployCancelledObservable.clear();
    this.onEnemyUnitDeployedObservable.clear();
    this.onEnemyDefeatedObservable.clear();
    this.onFireballCastObservable.clear();
    this.onPlayerDefeatedObservable.clear();

    // Unidades presas no meio do fantasma: cancela o timer pendente (restaura
    // visibilidade, nao deixa o `setTimeout` disparar depois do engine ja
    // desmontado) e descarta a unidade — ela nunca chegou a entrar em
    // `this.units`, entao o loop abaixo nao a alcancaria.
    for (const pendingDeployment of this.pendingGhostDeployments) {
      pendingDeployment.cancel();
      pendingDeployment.unit.dispose();
    }
    this.pendingGhostDeployments.length = 0;

    for (const unit of this.units) {
      unit.dispose();
    }

    for (const { projectile } of this.fireballs) {
      projectile.dispose();
    }
    this.fireballs.length = 0;
  }

  private tryDeploySelectedCardAtWorldPoint(worldPoint: Vector3): boolean {
    if (!this.arenaRoot.isEnabled()) {
      return false;
    }

    const selectedCard = this.cardDeckSystem.getSelectedCard();
    if (!selectedCard) {
      return false;
    }

    const localPoint = this.convertWorldToArenaLocal(worldPoint);
    const arcPoint = toArc({ x: localPoint.x, z: localPoint.z });

    // Fora do que da para colocar: NENHUM cogumelo e gasto — este `return
    // false` acontece antes de qualquer `tryConsumeSelectedCard`. A regra vem do
    // modelo e tem duas metades: a arena (a mesma que o `WaveDirector` usa para
    // nascer inimigo) e o CONE DE ACAO, que so vale para o jogador.
    const verdict = evaluateDeployment(arcPoint, this.getCameraYawDeg());

    if (!verdict.ok) {
      // **A recusa por cone NAO cancela a selecao.** As duas recusas dizem
      // coisas diferentes: `fora-da-arena` e erro de mira ("voce apontou para a
      // parede") e desfaz a intencao; `fora-do-cone` e uma regra do jogo ("gire
      // para la"), e a carta continua na mao esperando o giro.
      //
      // A distincao nao e cosmetica. A telemetria de 2026-08-21 mediu 54% de
      // recusa de colocacao — 25 recusas contra 21 aceitas, com rajadas de seis
      // seguidas em 13 segundos — e cada uma delas devolvia o jogador para a
      // fileira de cartas para escolher de novo. Com o cone de acao a recusa
      // por direcao passa a ser a MAIS comum de todas, entao cancelar nela
      // transformaria o recurso escasso do jogo num castigo por usa-lo.
      if (refusalReason(verdict) !== "fora-do-cone") {
        this.cardDeckSystem.clearSelection();
      }

      this.onDeployCancelledObservable.notifyObservers();
      return false;
    }

    const spawnPosition = this.toSpawnPosition(arcPoint);

    const createdUnits = this.unitFactory.createUnits(selectedCard.id, spawnPosition, "player");
    if (!createdUnits.length) {
      return false;
    }

    // O cogumelo SO e debitado aqui — depois do ponto validado e das unidades
    // ja criadas com sucesso. O fantasma so comeca DEPOIS deste consumo ter
    // sucesso, entao nunca existe um caminho onde o fantasma aparece e o
    // consumo falha em seguida.
    const consumedCard = this.cardDeckSystem.tryConsumeSelectedCard();
    if (!consumedCard) {
      for (const createdUnit of createdUnits) {
        createdUnit.dispose();
      }
      return false;
    }

    this.onCardDeployedObservable.notifyObservers({
      cardId: consumedCard.id,
      remainingMs: this.getRemainingMs(),
      x: spawnPosition.x,
      z: spawnPosition.z,
    });

    for (const createdUnit of createdUnits) {
      createdUnit.root.parent = this.arenaRoot;
      // A ancora e a posicao REAL de cada unidade, nao o ponto tocado: um
      // esquadrao (Dona Barata) nasce em formacao, e cada barata defende o seu
      // lugar na formacao.
      createdUnit.setAnchor(createdUnit.root.position);
      this.beginGhostDeployment(createdUnit);
    }

    return true;
  }

  /**
   * Fantasma (~200ms) e so depois materializa: a unidade fica FORA de
   * `this.units` (portanto fora do loop de `update()` — nao anda, nao ataca,
   * nao e alvo, nao conta como ameaca) ate `playGhostThenMaterialize` chamar
   * de volta. So entao ela ganha alvo e entra no combate de verdade.
   */
  private beginGhostDeployment(unit: BaseUnit): void {
    const pendingDeployment: PendingGhostDeployment = { cancel: () => {}, unit };
    this.pendingGhostDeployments.push(pendingDeployment);

    pendingDeployment.cancel = playGhostThenMaterialize(unit.root, this.scene, GHOST_DURATION_MS, () => {
      const index = this.pendingGhostDeployments.indexOf(pendingDeployment);
      if (index !== -1) {
        this.pendingGhostDeployments.splice(index, 1);
      }

      unit.setTarget(this.acquireTargetFor(unit));
      this.units.push(unit);
    });
  }

  private update(): void {
    if (!this.isActive) {
      return;
    }

    const deltaSeconds = this.scene.getEngine().getDeltaTime() / 1000;
    const nowMs = this.now();

    for (const unit of this.units) {
      if (!unit.isAlive()) {
        continue;
      }

      // Alvo perdido (morreu, ou saiu da coleira da tropa) e reprocurado por
      // frame. Para o inimigo isso e barato e estavel: o alvo e sempre a torre
      // do jogador. Para a tropa e o que faz ela trocar de inimigo assim que o
      // atual cai, sem esperar frame nenhum.
      const currentTarget = unit.getTarget();
      if (!currentTarget || !currentTarget.isAlive()) {
        unit.setTarget(this.acquireTargetFor(unit));
      }

      unit.update(deltaSeconds, nowMs);
    }

    this.updateFireballs(deltaSeconds);

    // Nao ha loop de torre atacando: desde a JG-12 nada do lado do jogador
    // dispara sozinho. O que defende e a tropa que ele colocou, e a fireball
    // que ele mira — as duas exigem uma decisao dele.
    this.notifyPlayerDamage();
    this.notifyPlayerDefeat();
    this.cleanupDefeatedUnits();
  }

  /**
   * Quem esta unidade persegue.
   *
   * - **Inimigo**: sempre o JOGADOR, que e a origem do arco. Como ele nasceu na
   *   borda, ir ate a origem E convergir radialmente: o inimigo atravessa o
   *   proprio setor de fora para dentro e nunca troca de flanco no caminho, que
   *   e o que mantem a seta da JG-05 dizendo a verdade do nascimento ate a
   *   chegada. Enquanto o alvo era a torre — que ficava a 0,9 m no azimute 0,
   *   e nao na origem — isso exigia navegacao de duas fases; com o alvo no
   *   vertice, a reta ate ele ja e a reta radial.
   * - **Tropa do jogador**: a unidade inimiga mais proxima DENTRO da coleira
   *   (`TROOP_LEASH_RADIUS_M` a partir do ponto de colocacao, mais o proprio
   *   alcance de contato). Fora disso ela nao sai do lugar.
   */
  private acquireTargetFor(unit: BaseUnit): CombatTarget | null {
    if (unit.team === "enemy") {
      return this.player.isAlive() ? this.player : null;
    }

    return this.findEngageableEnemyUnit(unit);
  }

  private findEngageableEnemyUnit(troop: BaseUnit): BaseUnit | null {
    const anchor = troop.getAnchor() ?? troop.root.position;
    const engageRadius = TROOP_LEASH_RADIUS_M + troop.contactRange;

    let nearestUnit: BaseUnit | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of this.units) {
      if (!candidate.isAlive() || candidate.team === troop.team) {
        continue;
      }

      if (candidate.root.position.subtract(anchor).length() > engageRadius) {
        continue;
      }

      const distance = candidate.root.position.subtract(troop.root.position).length();
      if (distance >= nearestDistance) {
        continue;
      }

      nearestDistance = distance;
      nearestUnit = candidate;
    }

    return nearestUnit;
  }

  /**
   * Compara a vida do jogador com a do frame anterior e avisa quem ouve. A
   * comparacao mora aqui (e nao dentro do `PlayerCore`) porque quem aplica o
   * dano e a propria unidade, chamando `receiveCombatDamage` direto.
   */
  private notifyPlayerDamage(): void {
    const currentHealth = this.player.getHealth();

    if (currentHealth >= this.lastPlayerHealth) {
      return;
    }

    this.lastPlayerHealth = currentHealth;
    this.onPlayerDamagedObservable.notifyObservers(
      this.convertArenaLocalToWorld(this.player.getCombatPosition())
    );
  }

  /**
   * O jogador acabou de cair. Dispara `onPlayerDefeatedObservable` uma unica
   * vez, no frame exato da transicao vivo -> morto: sem esta guarda, cada
   * inimigo ainda em campo faria a derrota disparar de novo a cada frame.
   */
  private notifyPlayerDefeat(): void {
    const isAlive = this.player.isAlive();

    if (!this.lastPlayerAlive || isAlive) {
      return;
    }

    this.lastPlayerAlive = false;
    this.onPlayerDefeatedObservable.notifyObservers();
  }

  /**
   * Avanca os projeteis em voo e resolve os que chegaram.
   *
   * O alvo pode ter morrido no caminho (uma tropa o abateu antes): nesse caso a
   * bola apaga sem dano, e nao "procura" outro. O jogador ja pagou pelo tiro que
   * decidiu dar.
   */
  private updateFireballs(deltaSeconds: number): void {
    for (let index = this.fireballs.length - 1; index >= 0; index -= 1) {
      const { projectile, target } = this.fireballs[index];

      if (!projectile.update(deltaSeconds)) {
        continue;
      }

      if (target && target.isAlive()) {
        target.takeDamage(FIREBALL_DAMAGE);
      }

      projectile.dispose();
      this.fireballs.splice(index, 1);
    }
  }

  /**
   * De onde a bola sai: logo a frente do jogador, na altura do chao da arena.
   *
   * Nao e a origem exata. Um projetil nascendo em (0,0) sairia de DENTRO da
   * camera de RA e o jogador so veria o primeiro frame dele ja longe — o
   * feedback de "o tiro saiu" morre justamente no frame que importa.
   */
  private fireballOrigin(): Vector3 {
    return this.toSpawnPosition({
      azimuthDeg: this.getCameraYawDeg(),
      radiusM: FIREBALL_ORIGIN_RADIUS_M,
    });
  }

  private cleanupDefeatedUnits(): void {
    for (let index = this.units.length - 1; index >= 0; index -= 1) {
      const unit = this.units[index];

      if (unit.isAlive()) {
        continue;
      }

      // Antes de descartar: criatura inimiga abatida vira carta (spec v3 §8).
      // Notificar aqui, e nao em `takeDamage`, garante uma notificacao por
      // unidade — `takeDamage` pode ser chamado de novo depois da morte.
      if (unit.team === "enemy") {
        this.onEnemyDefeatedObservable.notifyObservers({ cardId: unit.cardId });
      }

      unit.dispose();
      this.units.splice(index, 1);
    }
  }

  private convertWorldToArenaLocal(worldPoint: Vector3): Vector3 {
    this.arenaRoot.computeWorldMatrix(true);
    const invertedWorld = Matrix.Invert(this.arenaRoot.getWorldMatrix());
    return Vector3.TransformCoordinates(worldPoint, invertedWorld);
  }

  /** Inverso de `convertWorldToArenaLocal` — usado para o payload de `onEnemyUnitDeployedObservable`. */
  private convertArenaLocalToWorld(localPoint: Vector3): Vector3 {
    this.arenaRoot.computeWorldMatrix(true);
    return Vector3.TransformCoordinates(localPoint, this.arenaRoot.getWorldMatrix());
  }

  /**
   * Ponto polar -> posicao de nascimento no espaco da arena. Nao ha clamp
   * nenhum aqui de proposito: os dois caminhos que chamam isto ja passaram pelo
   * `evaluatePlacement` (o jogador, no toque; o inimigo, dentro do
   * `WaveDirector`). Um clamp silencioso aqui esconderia justamente o bug de
   * quem esquecesse de validar.
   */
  private toSpawnPosition(point: ArcPoint): Vector3 {
    const { x, z } = toLocal(point);
    return new Vector3(x, this.unitGroundY, z);
  }

  private findNearestAliveEnemyUnit(team: TeamId, position: Vector3, maxRange: number): BaseUnit | null {
    let nearestUnit: BaseUnit | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const unit of this.units) {
      if (!unit.isAlive() || unit.team === team) {
        continue;
      }

      const distance = unit.root.position.subtract(position).length();
      if (distance > maxRange || distance >= nearestDistance) {
        continue;
      }

      nearestDistance = distance;
      nearestUnit = unit;
    }

    return nearestUnit;
  }
}
