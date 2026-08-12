import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Observable, type Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

import type { TeamId } from "../battle/BattleTypes";
import type { CardDeckSnapshot } from "../cards/CardDeckSystem";
import { CardDeckSystem } from "../cards/CardDeckSystem";
import { TowerActor } from "../towers/TowerActor";
import type { BaseUnit } from "../units/BaseUnit";
import { UnitFactory } from "../units/UnitFactory";
import { DeploymentZone } from "./DeploymentZone";
import { playGhostThenMaterialize } from "../fx/spawnAnimation";

/** Payload de `card_deployed` (telemetria) — ver `SessionTelemetry.ts`. */
export interface CardDeployedInfo {
  cardId: string;
  /** Posicao LOCAL da arena (nao mundo): reconstroi o ponto de invocacao
   * independente de onde a arena foi ancorada em RA. */
  x: number;
  z: number;
  /** Tempo restante de partida em ms no instante da invocacao. O relogio de
   * partida ainda nao existe (proxima etapa) — ate la, vem de
   * `CombatEngineOptions.getRemainingMs`, que tem default `() => 0`. */
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

export interface CombatArenaLayout {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
  /** Metade do jogador: so da para invocar em z <= este valor. */
  playerDeploymentMaxZ: number;
  unitGroundY: number;
}

export interface CombatEngineOptions {
  arenaLayout: CombatArenaLayout;
  arenaRoot: TransformNode;
  cardDeckSystem: CardDeckSystem;
  /**
   * Overlay que acende a metade do jogador quando ha carta selecionada.
   * Injetado (nao criado aqui) porque quem monta a cena tambem precisa dele
   * para parenta-lo no `arenaRoot` correto — mesmo motivo do `unitFactory`
   * abaixo.
   */
  deploymentZone: DeploymentZone;
  /**
   * Tempo restante de partida, em ms, no instante de cada invocacao — vai no
   * payload de telemetria `card_deployed`. O relogio de 3 minutos e da
   * proxima etapa; ate la o default `() => 0` mantem a telemetria valida
   * (campo sempre presente, so que zerado) sem este modulo inventar um timer
   * que nao e dele.
   */
  getRemainingMs?: () => number;
  scene: Scene;
  towerAttackCooldownMs: number;
  towerAttackDamage: number;
  /** Alcance ja resolvido em unidades autorais (diametro da torre x multiplicador). */
  towerAttackRange: number;
  towerDefinitions: CombatArenaTowerDefinition[];
  towerMaxHealth: number;
  /**
   * Fabrica de unidades INJETADA. Antes o CombatEngine criava a sua propria,
   * o que impedia a `ResidentPopulation` (o "mundo vivo" do Beat 4) de usar a
   * mesma — agora quem monta a cena e quem constroi a fabrica e a entrega aos
   * dois.
   */
  unitFactory: UnitFactory;
}

export class CombatEngine {
  /**
   * Torre do jogador levou dano; carrega a posicao de MUNDO da torre. Quem
   * ouve e o `OffscreenIndicator`, para apontar a seta quando o ataque
   * acontece fora do quadro da camera.
   */
  public readonly onPlayerTowerDamagedObservable = new Observable<Vector3>();
  /** Uma invocacao de fato aconteceu (cogumelo ja debitado). Ver `CardDeployedInfo`. */
  public readonly onCardDeployedObservable = new Observable<CardDeployedInfo>();
  /** Toque fora da zona valida com carta selecionada: selecao cancelada, nada foi gasto. */
  public readonly onDeployCancelledObservable = new Observable<void>();
  /**
   * Uma unidade do INIMIGO acabou de ser invocada (script fixo, Etapa 7);
   * carrega a posicao de MUNDO do spawn. Quem ouve e o `OffscreenIndicator`,
   * para apontar a invocacao quando ela acontece fora do quadro da camera.
   */
  public readonly onEnemyUnitDeployedObservable = new Observable<Vector3>();
  /**
   * Uma torre chegou a 0 de vida — dispara UMA vez, no frame em que a torre
   * morre. Quem ouve (GameFlow) decide o resultado da partida: torre do
   * jogador destruida = derrota, torre do inimigo destruida = vitoria.
   */
  public readonly onTowerDestroyedObservable = new Observable<TeamId>();

  private readonly arenaLayout: CombatArenaLayout;
  private readonly arenaRoot: TransformNode;
  private readonly cardDeckSystem: CardDeckSystem;
  private readonly deploymentZone: DeploymentZone;
  private readonly getRemainingMs: () => number;
  private readonly scene: Scene;
  private readonly towers: TowerActor[];
  private readonly unitFactory: UnitFactory;

  private readonly beforeRenderObserver: Observer<Scene>;
  private readonly cardSelectionObserver: Observer<CardDeckSnapshot>;
  private readonly units: BaseUnit[] = [];
  // Unidades entre "cogumelo ja debitado" e "fantasma acabou": ficam de fora
  // de `units` (nao andam, nao atacam, nao sao alvo) ate materializar. Ver
  // `beginGhostDeployment`.
  private readonly pendingGhostDeployments: PendingGhostDeployment[] = [];
  // Vida da rodada anterior por torre do jogador: a queda entre dois frames e
  // o gatilho de `onPlayerTowerDamagedObservable` (o dano e aplicado direto
  // pela unidade na TowerActor, sem passar por aqui).
  private readonly lastPlayerTowerHealth = new Map<TowerActor, number>();
  // Estado vivo/morta da rodada anterior, para as DUAS equipes — a queda de
  // vivo para morta e o gatilho de `onTowerDestroyedObservable` (condicao de
  // vitoria/derrota da Etapa 7). Mapa separado de `lastPlayerTowerHealth`
  // porque sao dois eventos com donos diferentes: aquele e so do time do
  // jogador (cue de "sua torre apanhou"), este cobre os dois lados (fim de
  // partida).
  private readonly lastTowerAliveState = new Map<TowerActor, boolean>();

  // Nasce ligado para nao mudar o comportamento de quem ainda nao chama
  // `setActive`; quem desliga fora de partida e o GameFlow.
  private isActive = true;

  public constructor(options: CombatEngineOptions) {
    this.arenaLayout = options.arenaLayout;
    this.arenaRoot = options.arenaRoot;
    this.cardDeckSystem = options.cardDeckSystem;
    this.deploymentZone = options.deploymentZone;
    this.getRemainingMs = options.getRemainingMs ?? (() => 0);
    this.scene = options.scene;
    this.unitFactory = options.unitFactory;

    // Toque 1 da invocacao em dois toques: a zona acende/apaga em reacao
    // direta a selecao do CardDeckSystem, nao a um evento de toque. Isso
    // cobre de graca tanto o tap na carta (seleciona) quanto o cancelamento
    // por toque fora da zona e o consumo bem-sucedido (ambos zeram
    // `selectedCardId`, que e o que este observer escuta).
    this.cardSelectionObserver = this.cardDeckSystem.onStateChangedObservable.add((snapshot) => {
      this.deploymentZone.setHighlighted(this.isActive && snapshot.selectedCardId !== null);
    });

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

    if (!isActive) {
      this.deploymentZone.setHighlighted(false);
    }
  }

  /**
   * HP atual/maximo somado das torres de um time (hoje 1 torre por time, mas
   * soma para nao quebrar se a arena ganhar mais lanes). Usado pelo HUD
   * (`hudLayer.setTowerHealth`) e pela resolucao de vencedor por tempo
   * esgotado (`GameFlow`, via `getTowerHealthPct`).
   */
  public getTowerHealth(team: TeamId): { current: number; max: number } {
    const teamTowers = this.towers.filter((tower) => tower.team === team);

    return {
      current: teamTowers.reduce((sum, tower) => sum + tower.getHealth(), 0),
      max: teamTowers.reduce((sum, tower) => sum + tower.maxHealth, 0),
    };
  }

  /** `getTowerHealth` como percentual (0-100). Usado no desempate por tempo esgotado e na telemetria `match_ended`. */
  public getTowerHealthPct(team: TeamId): number {
    const { current, max } = this.getTowerHealth(team);
    return max <= 0 ? 0 : (current / max) * 100;
  }

  /**
   * Invoca a carta selecionada no ponto de mundo tocado. E o ponto de entrada
   * publico do deploy: o CombatEngine NAO assina mais `onPointerObservable`
   * (quem faz isso e o `WorldTapRouter`, dono unico do toque, que chama este
   * metodo na fase `playing`). A etapa da invocacao em dois toques reescreve o
   * miolo daqui sem precisar mexer em quem roteia o toque.
   */
  public tryDeployAtWorldPoint(worldPoint: Vector3): boolean {
    if (!this.isActive) {
      return false;
    }

    return this.tryDeploySelectedCardAtWorldPoint(worldPoint);
  }

  /**
   * Invoca uma unidade PELO INIMIGO (script fixo — `EnemyScriptRunner`, quem
   * chama este metodo e o `GameFlow`). Reaproveita o mesmo caminho de criacao
   * e fantasma do deploy do jogador (`beginGhostDeployment`), so que com
   * `team: "enemy"`, alvo = torre do JOGADOR, e SEM debitar cogumelo — a
   * economia de cogumelos e exclusiva do jogador, o inimigo age pelo relogio
   * do script, nao pelo `CardDeckSystem`.
   */
  public deployEnemyUnit(cardId: string, localPosition: Vector3): boolean {
    if (!this.isActive || !this.arenaRoot.isEnabled()) {
      return false;
    }

    const spawnPosition = this.clampToSpawnPosition(localPosition, "enemy");

    const targetTower = this.findNearestAliveTower("player", spawnPosition);
    if (!targetTower) {
      return false;
    }

    const createdUnits = this.unitFactory.createUnits(cardId, spawnPosition, "enemy");
    if (!createdUnits.length) {
      return false;
    }

    for (const createdUnit of createdUnits) {
      createdUnit.root.parent = this.arenaRoot;
      this.beginGhostDeployment(createdUnit, targetTower);
    }

    this.onEnemyUnitDeployedObservable.notifyObservers(this.convertArenaLocalToWorld(spawnPosition));

    return true;
  }

  /**
   * Reseta o combate para uma partida nova (Etapa 8 — "a segunda partida
   * funciona"): descarta toda unidade da partida anterior, viva ou presa em
   * fantasma (`pendingGhostDeployments`), e devolve as duas torres a vida
   * cheia com `TowerActor.reset()`. Os mapas de "ultimo estado" (dano/morte
   * das torres) sao reconstruidos depois do reset — sem isso a proxima
   * partida herdaria vida velha nesses mapas e `notifyTowerDestruction`
   * nunca disparia de novo (a torre já "estava morta" do ponto de vista do
   * mapa antigo).
   *
   * NAO mexe em `isActive`: quem liga o combate de volta e o `GameFlow`, na
   * entrada da fase `playing` — chamar isto antes ou depois de `setActive`
   * da o mesmo resultado.
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

    this.deploymentZone.setHighlighted(false);
  }

  public dispose(): void {
    this.scene.onBeforeRenderObservable.remove(this.beforeRenderObserver);
    this.cardDeckSystem.onStateChangedObservable.remove(this.cardSelectionObserver);
    this.onPlayerTowerDamagedObservable.clear();
    this.onCardDeployedObservable.clear();
    this.onDeployCancelledObservable.clear();
    this.onEnemyUnitDeployedObservable.clear();
    this.onTowerDestroyedObservable.clear();

    // Unidades presas no meio do fantasma (ex.: dispose no meio de uma
    // partida): cancela o timer pendente (restaura visibilidade, nao deixa o
    // `setTimeout` disparar depois do engine ja desmontado) e descarta a
    // unidade — ela nunca chegou a entrar em `this.units`, entao o loop
    // abaixo nao a alcancaria.
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

    // Toque 2 fora da zona valida: cancela a selecao (a zona apaga sozinha,
    // via `cardSelectionObserver` reagindo a esse mesmo `clearSelection`) e
    // NENHUM cogumelo e gasto — este `return false` acontece antes de
    // qualquer chamada a `tryConsumeSelectedCard`. `isInside` e a UNICA fonte
    // de verdade da zona (delegado ao `DeploymentZone`, nao reimplementado
    // aqui).
    if (!this.deploymentZone.isInside(localPoint)) {
      this.cardDeckSystem.clearSelection();
      this.onDeployCancelledObservable.notifyObservers();
      return false;
    }

    const spawnPosition = this.clampToSpawnPosition(localPoint, "player");

    const targetTower = this.findNearestAliveTower("enemy", spawnPosition);
    if (!targetTower) {
      return false;
    }

    const createdUnits = this.unitFactory.createUnits(selectedCard.id, spawnPosition, "player");
    if (!createdUnits.length) {
      return false;
    }

    // O cogumelo SO e debitado aqui — depois da posicao validada pela zona e
    // das unidades ja criadas com sucesso. O fantasma (abaixo) so comeca a
    // tocar DEPOIS deste consumo ter sucesso, entao nunca existe um caminho
    // onde o fantasma aparece e o consumo falha em seguida (o requisito
    // central desta etapa).
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
      this.beginGhostDeployment(createdUnit, targetTower);
    }

    return true;
  }

  /**
   * Fantasma (~200ms) e so depois materializa: a unidade fica FORA de
   * `this.units` (portanto fora do loop de `update()` — nao anda, nao ataca,
   * nao e alvo de torre nem de outra unidade) ate `playGhostThenMaterialize`
   * chamar de volta. So entao ela ganha alvo e entra no combate de verdade.
   */
  private beginGhostDeployment(unit: BaseUnit, fallbackTargetTower: TowerActor): void {
    const pendingDeployment: PendingGhostDeployment = { cancel: () => {}, unit };
    this.pendingGhostDeployments.push(pendingDeployment);

    pendingDeployment.cancel = playGhostThenMaterialize(unit.root, this.scene, GHOST_DURATION_MS, () => {
      const index = this.pendingGhostDeployments.indexOf(pendingDeployment);
      if (index !== -1) {
        this.pendingGhostDeployments.splice(index, 1);
      }

      unit.setTargetTower(
        this.findNearestAliveTower(this.opposingTeam(unit.team), unit.root.position) ?? fallbackTargetTower
      );
      this.units.push(unit);
    });
  }

  private update(): void {
    if (!this.isActive) {
      return;
    }

    const deltaSeconds = this.scene.getEngine().getDeltaTime() / 1000;
    const nowMs = performance.now();

    for (const unit of this.units) {
      if (!unit.isAlive()) {
        continue;
      }

      const currentTarget = unit.getTargetTower();
      if (!currentTarget || !currentTarget.isAlive()) {
        unit.setTargetTower(this.findNearestAliveTower(this.opposingTeam(unit.team), unit.root.position));
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
   * Compara a vida das torres do jogador com a do frame anterior e avisa quem
   * ouve. A comparacao mora aqui (e nao dentro da TowerActor) porque quem
   * aplica o dano e a propria unidade, chamando `receiveDamage` direto.
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
   * Condicao de vitoria/derrota da Etapa 7: uma torre (de QUALQUER time)
   * acabou de morrer. Dispara `onTowerDestroyedObservable` uma unica vez, no
   * frame exato da transicao viva -> morta.
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
   * So chamado depois de `deploymentZone.isInside` confirmar o ponto do
   * jogador (ou, para o inimigo, direto do script — sem zona de UI, mas com o
   * mesmo afastamento de borda). Falta afastar o spawn 0.8 unidades das
   * bordas (para a unidade nao nascer colada na parede/rio); o lado Z valido
   * depende do time — jogador fica em z <= `playerDeploymentMaxZ`, inimigo em
   * z >= `playerDeploymentMaxZ`, cada um limitado pela borda externa da sua
   * metade.
   */
  private clampToSpawnPosition(localPoint: Vector3, team: TeamId): Vector3 {
    const minZ = team === "player" ? this.arenaLayout.minZ + 0.8 : this.arenaLayout.playerDeploymentMaxZ;
    const maxZ = team === "player" ? this.arenaLayout.playerDeploymentMaxZ : this.arenaLayout.maxZ - 0.8;

    return new Vector3(
      Scalar.Clamp(localPoint.x, this.arenaLayout.minX + 0.8, this.arenaLayout.maxX - 0.8),
      this.arenaLayout.unitGroundY,
      Scalar.Clamp(localPoint.z, minZ, maxZ)
    );
  }

  private opposingTeam(team: TeamId): TeamId {
    return team === "player" ? "enemy" : "player";
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
