import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Observable, type Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

import { evaluatePlacement, toArc, toLocal, type ArcPoint } from "../arena/ArenaArc";
import { TROOP_LEASH_RADIUS_M } from "../arena/metrics";
import type { TeamId } from "../battle/BattleTypes";
import type { CombatTarget } from "../battle/CombatTarget";
import { summarizeSectorThreats, type SectorThreat } from "../battle/sectorThreats";
import { CardDeckSystem } from "../cards/CardDeckSystem";
import { TowerActor } from "../towers/TowerActor";
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

interface PendingGhostDeployment {
  cancel: () => void;
  unit: BaseUnit;
}

export interface CombatArenaTowerDefinition {
  diameter: number;
  id: string;
  lane: "left" | "center" | "right";
  mesh: Mesh;
  team: TeamId;
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
  scene: Scene;
  towerAttackCooldownMs: number;
  towerAttackDamage: number;
  /** Alcance de ataque da torre, em metros (`TOWER_ATTACK_RANGE_M`). */
  towerAttackRange: number;
  /**
   * Torres de COMBATE. Desde a JG-04 e uma so — a do jogador. Continua sendo
   * uma lista porque nada aqui assume cardinalidade 1, e a leitura de HP por
   * time ja somava varias.
   */
  towerDefinitions: CombatArenaTowerDefinition[];
  towerMaxHealth: number;
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
 * - **Alvo unico.** So existe uma torre de combate, a do jogador. O inimigo
 *   nasce na borda do arco e converge para ela; a tropa do jogador nao tem
 *   torre para atacar — ela defende o pedaco do arco onde foi colocada e bate
 *   nas UNIDADES que chegam (`CombatTarget` cobre os dois casos).
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
   * Torre do jogador levou dano; carrega a posicao de MUNDO da torre. Quem
   * ouve e o `OffscreenIndicator`, para apontar a seta quando o ataque
   * acontece fora do quadro da camera.
   */
  public readonly onPlayerTowerDamagedObservable = new Observable<Vector3>();
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
   * Uma torre chegou a 0 de vida — dispara UMA vez, no frame em que a torre
   * morre. Com uma torre de combate so, na pratica isto significa derrota; o
   * payload de time permanece porque quem decide o resultado e o `GameFlow`,
   * nao este modulo.
   */
  public readonly onTowerDestroyedObservable = new Observable<TeamId>();

  private readonly arenaRoot: TransformNode;
  private readonly cardDeckSystem: CardDeckSystem;
  private readonly getRemainingMs: () => number;
  private readonly now: () => number;
  private readonly scene: Scene;
  private readonly towers: TowerActor[];
  private readonly unitFactory: UnitFactory;
  private readonly unitGroundY: number;

  private readonly beforeRenderObserver: Observer<Scene>;
  private readonly units: BaseUnit[] = [];
  // Unidades entre "cogumelo ja debitado" e "fantasma acabou": ficam de fora
  // de `units` (nao andam, nao atacam, nao sao alvo, nao contam como ameaca de
  // flanco) ate materializar. Ver `beginGhostDeployment`.
  private readonly pendingGhostDeployments: PendingGhostDeployment[] = [];
  // Vida da rodada anterior por torre do jogador: a queda entre dois frames e
  // o gatilho de `onPlayerTowerDamagedObservable` (o dano e aplicado direto
  // pela unidade na TowerActor, sem passar por aqui).
  private readonly lastPlayerTowerHealth = new Map<TowerActor, number>();
  // Estado vivo/morta da rodada anterior — a queda de vivo para morta e o
  // gatilho de `onTowerDestroyedObservable`.
  private readonly lastTowerAliveState = new Map<TowerActor, boolean>();

  // Nasce ligado para nao mudar o comportamento de quem ainda nao chama
  // `setActive`; quem desliga fora de partida e o GameFlow.
  private isActive = true;

  public constructor(options: CombatEngineOptions) {
    this.arenaRoot = options.arenaRoot;
    this.cardDeckSystem = options.cardDeckSystem;
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
    this.towers = options.towerDefinitions.map((towerDefinition) => {
      return new TowerActor({
        attackCooldownMs: options.towerAttackCooldownMs,
        attackDamage: options.towerAttackDamage,
        attackRange: options.towerAttackRange,
        diameter: towerDefinition.diameter,
        id: towerDefinition.id,
        lane: towerDefinition.lane,
        maxHealth: options.towerMaxHealth,
        mesh: towerDefinition.mesh,
        scene: this.scene,
        team: towerDefinition.team,
      });
    });

    for (const tower of this.towers) {
      if (tower.team === "player") {
        this.lastPlayerTowerHealth.set(tower, tower.getHealth());
      }

      this.lastTowerAliveState.set(tower, tower.isAlive());
    }

    this.beforeRenderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.update();
    });
  }

  /** Fora da partida o combate nao roda nem responde a toque. */
  public setActive(isActive: boolean): void {
    this.isActive = isActive;
  }

  /**
   * HP atual/maximo somado das torres de um time. Usado pelo HUD
   * (`hudLayer.setTowerHealth`) e pela telemetria de fim de partida.
   */
  public getTowerHealth(team: TeamId): { current: number; max: number } {
    const teamTowers = this.towers.filter((tower) => tower.team === team);

    return {
      current: teamTowers.reduce((sum, tower) => sum + tower.getHealth(), 0),
      max: teamTowers.reduce((sum, tower) => sum + tower.maxHealth, 0),
    };
  }

  /** `getTowerHealth` como percentual (0-100). Vai no `match_ended` da telemetria. */
  public getTowerHealthPct(team: TeamId): number {
    const { current, max } = this.getTowerHealth(team);
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
   * anterior, viva ou presa em fantasma, e devolve as torres a vida cheia. Os
   * mapas de "ultimo estado" sao reconstruidos depois do reset — sem isso a
   * proxima partida herdaria vida velha e `notifyTowerDestruction` nunca
   * dispararia de novo.
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

    for (const tower of this.towers) {
      tower.reset();

      if (tower.team === "player") {
        this.lastPlayerTowerHealth.set(tower, tower.getHealth());
      }

      this.lastTowerAliveState.set(tower, tower.isAlive());
    }
  }

  public dispose(): void {
    this.scene.onBeforeRenderObservable.remove(this.beforeRenderObserver);
    this.onPlayerTowerDamagedObservable.clear();
    this.onCardDeployedObservable.clear();
    this.onDeployCancelledObservable.clear();
    this.onEnemyUnitDeployedObservable.clear();
    this.onEnemyDefeatedObservable.clear();
    this.onTowerDestroyedObservable.clear();

    // Unidades presas no meio do fantasma: cancela o timer pendente (restaura
    // visibilidade, nao deixa o `setTimeout` disparar depois do engine ja
    // desmontado) e descarta a unidade — ela nunca chegou a entrar em
    // `this.units`, entao o loop abaixo nao a alcancaria.
    for (const pendingDeployment of this.pendingGhostDeployments) {
      pendingDeployment.cancel();
      pendingDeployment.unit.dispose();
    }
    this.pendingGhostDeployments.length = 0;

    for (const tower of this.towers) {
      tower.dispose();
    }

    for (const unit of this.units) {
      unit.dispose();
    }
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

    // Fora do anel valido: cancela a selecao e NENHUM cogumelo e gasto — este
    // `return false` acontece antes de qualquer `tryConsumeSelectedCard`. A
    // regra e a do modelo polar, a MESMA que o `WaveDirector` usa para nascer
    // inimigo e que o anel da JG-06 vai desenhar: uma fonte de verdade so.
    if (!evaluatePlacement(arcPoint).ok) {
      this.cardDeckSystem.clearSelection();
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

    for (const tower of this.towers) {
      if (!tower.isAlive()) {
        continue;
      }

      const targetUnit = this.findNearestAliveEnemyUnit(tower.team, tower.mesh.position, tower.getAttackRange());
      if (!targetUnit) {
        continue;
      }

      tower.tryAttack(targetUnit, nowMs);
    }

    this.notifyPlayerTowerDamage();
    this.notifyTowerDestruction();
    this.cleanupDefeatedUnits();
  }

  /**
   * Quem esta unidade persegue.
   *
   * - **Inimigo**: sempre a torre do jogador. Como a torre fica no vertice do
   *   arco (`PLAYER_TOWER_RADIUS_M`, logo a frente de quem joga) e o inimigo
   *   nasceu na borda, ir ate ela E convergir radialmente — o inimigo atravessa
   *   o proprio setor de fora para dentro, que e o que mantem a seta de flanco
   *   dizendo a verdade ate o fim do trajeto.
   * - **Tropa do jogador**: a unidade inimiga mais proxima DENTRO da coleira
   *   (`TROOP_LEASH_RADIUS_M` a partir do ponto de colocacao, mais o proprio
   *   alcance de contato). Fora disso ela nao sai do lugar.
   */
  private acquireTargetFor(unit: BaseUnit): CombatTarget | null {
    if (unit.team === "enemy") {
      return this.findNearestAliveTower("player", unit.root.position);
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
   * Compara a vida das torres do jogador com a do frame anterior e avisa quem
   * ouve. A comparacao mora aqui (e nao dentro da TowerActor) porque quem
   * aplica o dano e a propria unidade, chamando `receiveCombatDamage` direto.
   */
  private notifyPlayerTowerDamage(): void {
    for (const [tower, previousHealth] of this.lastPlayerTowerHealth) {
      const currentHealth = tower.getHealth();

      if (currentHealth >= previousHealth) {
        continue;
      }

      this.lastPlayerTowerHealth.set(tower, currentHealth);
      this.onPlayerTowerDamagedObservable.notifyObservers(tower.mesh.getAbsolutePosition());
    }
  }

  /**
   * Uma torre acabou de morrer. Dispara `onTowerDestroyedObservable` uma unica
   * vez, no frame exato da transicao viva -> morta.
   */
  private notifyTowerDestruction(): void {
    for (const [tower, wasAlive] of this.lastTowerAliveState) {
      const isAlive = tower.isAlive();

      if (!wasAlive || isAlive) {
        continue;
      }

      this.lastTowerAliveState.set(tower, false);
      this.onTowerDestroyedObservable.notifyObservers(tower.team);
    }
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

  private findNearestAliveTower(team: TeamId, position: Vector3): TowerActor | null {
    const aliveTowers = this.towers.filter((tower) => tower.team === team && tower.isAlive());

    if (!aliveTowers.length) {
      return null;
    }

    let nearestTower: TowerActor | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const tower of aliveTowers) {
      const distance = tower.mesh.position.subtract(position).length();
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestTower = tower;
      }
    }

    return nearestTower;
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
