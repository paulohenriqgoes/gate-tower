import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { TeamId } from "../battle/BattleTypes";
import { TROOP_HEIGHT_M } from "../arena/metrics";
import type { TowerActor } from "../towers/TowerActor";
import { HealthBarMesh } from "../ui/HealthBarMesh";
import { createContactShadow } from "../fx/contactShadow";
import { IdleBehavior, type IdleBehaviorBounds } from "./idle/IdleBehavior";

/**
 * Fator de escala para os elementos de UI/ancoragem deste arquivo (anel de
 * selecao, blob de contato, barra de vida) que NAO pertencem a uma criatura
 * especifica — `BaseUnit` e compartilhado pelas quatro (`CururuBombado`,
 * `DonaBarata`, `JavaliRaivoso`, `TatuBola`), cada uma com seu proprio fator
 * de normalizacao para a PROPRIA geometria (ver o topo de cada arquivo).
 *
 * Como esses paddings nao tem um dono unico, usam `TROOP_HEIGHT_M` dividido
 * por uma altura autoral DE REFERENCIA: a media arredondada da altura autoral
 * das quatro criaturas medida na Etapa 2 (Cururu 2,86 / Barata 1,23 / Javali
 * 1,47 / Tatu 1,61 ~= 1,8). Nao e exato para nenhuma criatura, mas mantem
 * esses detalhes genericos na mesma ORDEM DE GRANDEZA relativa a uma tropa,
 * sem inventar uma quinta constante de escala.
 */
const GENERIC_TROOP_UI_SCALE = TROOP_HEIGHT_M / 1.8;

export interface BaseUnitOptions {
  attackIntervalMs: number;
  attackIntervalRangeMs?: {
    max: number;
    min: number;
  };
  contactRange: number;
  displayName: string;
  health: number;
  id: string;
  movementSpeed: number;
  scene: Scene;
  spawnPosition: Vector3;
  team: TeamId;
}

export interface UnitVisualState {
  deltaSeconds: number;
  didAttack: boolean;
  distanceToTarget: number;
  isMoving: boolean;
  nowMs: number;
}

/**
 * Contexto que o comportamento ocioso precisa para as criaturas residentes
 * (Etapa 3): camera para o estado "observando", vizinhas para "social" e os
 * limites da arena para "vagando". Quem monta a populacao ociosa (ex.:
 * `ResidentPopulation`) chama `setIdleContext` antes de `setIdleEnabled(true)`.
 */
export interface IdleContext {
  bounds: IdleBehaviorBounds;
  getCameraPosition: () => Vector3 | null;
  getNeighborPositions: () => Vector3[];
}

export abstract class BaseUnit {
  public readonly attackIntervalMs: number;
  public readonly contactRange: number;
  public readonly displayName: string;
  public readonly id: string;
  public readonly maxHealth: number;
  public readonly movementSpeed: number;
  public readonly root: TransformNode;
  public readonly scene: Scene;
  public readonly team: TeamId;

  protected readonly attackIntervalRangeMs: BaseUnitOptions["attackIntervalRangeMs"];
  protected health: number;
  protected nextAttackAt = Number.NEGATIVE_INFINITY;
  protected totalDistanceTravelled = 0;
  protected targetTower: TowerActor | null = null;
  protected readonly healthBar: HealthBarMesh;
  protected readonly visualRoot: TransformNode;

  // Modo ocioso (Etapa 3): quando ligado, update() roda IdleBehavior em vez
  // da logica de perseguir/atacar torre. Nasce desligado para nao mudar o
  // comportamento de unidades invocadas em partida.
  private idleBehavior: IdleBehavior | null = null;
  private idleContext: IdleContext | null = null;
  private idleEnabled = false;

  public constructor(options: BaseUnitOptions) {
    this.attackIntervalMs = options.attackIntervalMs;
    this.attackIntervalRangeMs = options.attackIntervalRangeMs;
    this.contactRange = options.contactRange;
    this.displayName = options.displayName;
    this.id = options.id;
    this.maxHealth = options.health;
    this.movementSpeed = options.movementSpeed;
    this.scene = options.scene;
    this.team = options.team;
    this.health = options.health;

    this.root = new TransformNode(`${this.id}-root`, this.scene);
    this.root.position.copyFrom(options.spawnPosition);
    this.visualRoot = new TransformNode(`${this.id}-visual-root`, this.scene);
    this.visualRoot.parent = this.root;

    const selectionRing = MeshBuilder.CreateTorus(
      `${this.id}-selection-ring`,
      {
        diameter: 1.8 * GENERIC_TROOP_UI_SCALE,
        thickness: 0.06 * GENERIC_TROOP_UI_SCALE,
      },
      this.scene
    );
    const ringMaterial = new StandardMaterial(`${this.id}-selection-material`, this.scene);
    ringMaterial.diffuseColor = this.team === "player"
      ? Color3.FromHexString("#c084fc")
      : Color3.FromHexString("#fb7185");
    ringMaterial.emissiveColor = ringMaterial.diffuseColor;

    selectionRing.material = ringMaterial;
    selectionRing.parent = this.root;
    selectionRing.position.y = 0.08 * GENERIC_TROOP_UI_SCALE;
    selectionRing.rotation.x = Math.PI / 2;
    selectionRing.isPickable = false;

    this.createVisual();
    this.createContactShadow();
    this.healthBar = this.createHealthBar();
  }

  /** Sombra de contato sob a unidade, dimensionada pela sua caixa envolvente. */
  private createContactShadow(): void {
    const { min, max } = this.root.getHierarchyBoundingVectors(true);
    const span = Math.max(max.x - min.x, max.z - min.z);
    // `span` ja vem em metros (bounding box da geometria ja escalada por
    // cada criatura); so o PISO/TETO do clamp (antes 1..3 em unidades
    // autorais) precisa do fator generico deste arquivo.
    const diameter = Scalar.Clamp(span * 1.2, 1 * GENERIC_TROOP_UI_SCALE, 3 * GENERIC_TROOP_UI_SCALE);

    const blob = createContactShadow(this.scene, {
      diameter,
      opacity: 0.4,
      name: `${this.id}-shadow`,
    });
    blob.parent = this.root;
    blob.position.y = 0.02 * GENERIC_TROOP_UI_SCALE;
  }

  protected abstract createVisual(): void;

  protected abstract computeAttackDamage(): number;

  /**
   * No que representa a cabeca no visual da criatura, para o estado
   * "observando" do comportamento ocioso. `null` por padrao; cada criatura
   * sobrescreve devolvendo o no correspondente do seu `createVisual`.
   */
  public getHeadNode(): TransformNode | null {
    return null;
  }

  protected updateVisual(_state: UnitVisualState): void {}

  protected getHealthRatio(): number {
    if (this.maxHealth <= 0) {
      return 0;
    }

    return this.health / this.maxHealth;
  }

  public isAlive(): boolean {
    return this.health > 0;
  }

  public getHealth(): number {
    return this.health;
  }

  public getTotalDistanceTravelled(): number {
    return this.totalDistanceTravelled;
  }

  public setTargetTower(tower: TowerActor | null): void {
    this.targetTower = tower;
  }

  public getTargetTower(): TowerActor | null {
    return this.targetTower;
  }

  /**
   * Fornece camera/vizinhos/bounds para o `IdleBehavior`. Pode ser chamado
   * antes ou depois de `setIdleEnabled(true)` — se ja estiver ocioso, o
   * comportamento e recriado com o contexto novo.
   */
  public setIdleContext(context: IdleContext): void {
    this.idleContext = context;

    if (this.idleEnabled) {
      this.idleBehavior?.dispose();
      this.idleBehavior = this.createIdleBehavior();
    }
  }

  /**
   * Liga/desliga o modo ocioso. Ligado, `update()` roda o `IdleBehavior` em
   * vez da logica de perseguir/atacar torre; desligado, o comportamento de
   * combate de sempre continua intacto. Seguro chamar sem `setIdleContext`
   * previo — usa camera/vizinhos/bounds neutros nesse caso.
   */
  public setIdleEnabled(enabled: boolean): void {
    if (enabled === this.idleEnabled) {
      return;
    }

    this.idleEnabled = enabled;

    if (enabled) {
      this.idleBehavior = this.createIdleBehavior();
    } else {
      this.idleBehavior?.dispose();
      this.idleBehavior = null;
    }
  }

  private createIdleBehavior(): IdleBehavior {
    const context = this.idleContext;

    return new IdleBehavior({
      bounds: context?.bounds ?? {
        maxX: Number.POSITIVE_INFINITY,
        maxZ: Number.POSITIVE_INFINITY,
        minX: Number.NEGATIVE_INFINITY,
        minZ: Number.NEGATIVE_INFINITY,
      },
      getCameraPosition: context?.getCameraPosition ?? (() => null),
      getNeighborPositions: context?.getNeighborPositions ?? (() => []),
      headNode: this.getHeadNode(),
      root: this.root,
      visualRoot: this.visualRoot,
    });
  }

  public takeDamage(amount: number): void {
    if (!this.isAlive()) {
      return;
    }

    this.health = Math.max(0, this.health - amount);
    this.healthBar.setRemainingHealth(this.health, this.maxHealth);

    if (!this.isAlive()) {
      this.root.setEnabled(false);
    }
  }

  public update(deltaSeconds: number, nowMs: number): void {
    if (this.idleEnabled) {
      this.idleBehavior?.update(deltaSeconds, nowMs);
      return;
    }

    if (!this.isAlive() || !this.targetTower || !this.targetTower.isAlive()) {
      this.updateVisual({
        deltaSeconds,
        didAttack: false,
        distanceToTarget: Number.POSITIVE_INFINITY,
        isMoving: false,
        nowMs,
      });
      return;
    }

    const direction = this.targetTower.mesh.position.subtract(this.root.position);
    direction.y = 0;

    const distanceToTarget = direction.length();
    let isMoving = false;

    if (distanceToTarget > this.contactRange) {
      const movementDistance = Math.min(
        this.movementSpeed * deltaSeconds,
        Math.max(0, distanceToTarget - this.contactRange)
      );

      if (movementDistance > 0) {
        const movementDirection = direction.normalize();
        const movement = movementDirection.scale(movementDistance);
        this.root.position.addInPlace(movement);
        this.totalDistanceTravelled += movementDistance;
        this.root.rotation.y = Math.atan2(movementDirection.x, movementDirection.z);
        isMoving = true;
      }

      this.nextAttackAt = Number.NEGATIVE_INFINITY;
      this.updateVisual({
        deltaSeconds,
        didAttack: false,
        distanceToTarget,
        isMoving,
        nowMs,
      });
      return;
    }

    const isAttackReady = nowMs >= this.nextAttackAt;
    if (!isAttackReady) {
      this.updateVisual({
        deltaSeconds,
        didAttack: false,
        distanceToTarget,
        isMoving: false,
        nowMs,
      });
      return;
    }

    this.targetTower.receiveDamage(this.computeAttackDamage());
    this.nextAttackAt = nowMs + this.resolveNextAttackIntervalMs();
    this.updateVisual({
      deltaSeconds,
      didAttack: true,
      distanceToTarget,
      isMoving: false,
      nowMs,
    });
  }

  public dispose(): void {
    this.idleBehavior?.dispose();
    this.root.dispose(false, true);
  }

  private createHealthBar(): HealthBarMesh {
    const { max, min } = this.root.getHierarchyBoundingVectors(true);
    const absoluteRootPosition = this.root.getAbsolutePosition();
    const unitHeight = max.y - absoluteRootPosition.y;
    const widestSpan = Math.max(max.x - min.x, max.z - min.z);

    return new HealthBarMesh({
      borderColorHex: "#f5d0fe",
      emissiveIntensity: 0.85,
      fillColorHex: "#ff00ff",
      height: 0.22 * GENERIC_TROOP_UI_SCALE,
      id: this.id,
      parent: this.root,
      scene: this.scene,
      // `widestSpan` ja vem em metros (bounding box real da criatura); so o
      // PISO/TETO do clamp (antes 1.1..1.7 em unidades autorais) usa o fator
      // generico deste arquivo.
      width: Scalar.Clamp(widestSpan * 0.8, 1.1 * GENERIC_TROOP_UI_SCALE, 1.7 * GENERIC_TROOP_UI_SCALE),
      yOffset: unitHeight + 0.45 * GENERIC_TROOP_UI_SCALE,
    });
  }

  private resolveNextAttackIntervalMs(): number {
    if (!this.attackIntervalRangeMs) {
      return this.attackIntervalMs;
    }

    const min = Math.min(this.attackIntervalRangeMs.min, this.attackIntervalRangeMs.max);
    const max = Math.max(this.attackIntervalRangeMs.min, this.attackIntervalRangeMs.max);
    return min + Math.random() * (max - min);
  }
}
