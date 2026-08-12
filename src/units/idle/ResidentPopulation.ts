import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import type { ArenaLayout } from "../../arena/ArenaSystem";
import type { BaseUnit } from "../BaseUnit";
import type { UnitFactory } from "../UnitFactory";
import type { IdleBehaviorBounds } from "./IdleBehavior";

/**
 * Populacao residente da arena (Etapa 3 - "o mundo vivo").
 *
 * Estas criaturas sao CENARIO do Beat 4 da demo, nao unidades de combate: o
 * jogo existe para responder "a pessoa acredita que apareceu um mundo vivo na
 * mesa dela?", e o beat que responde isso e o jogador olhando criaturas
 * ociosas, sem HUD, sem timer, sem tutorial. Cada residente nasce com
 * `setIdleEnabled(true)`, sem torre-alvo (`setTargetTower(null)`) e nao e
 * registrado em nenhum `CombatEngine` — nada aqui ataca ou e atacado.
 *
 * Esta classe so cria e atualiza os residentes; NAO faz wiring em main.ts ou
 * GameFlow (isso e outra etapa, a fase "mundo vivo", que instancia
 * `ResidentPopulation` e chama `populate()`/`update()`/`dispose()`).
 */

interface ResidentSpawnPlan {
  bounds: IdleBehaviorBounds;
  cardId: string;
  x: number;
  z: number;
}

export interface ResidentPopulationOptions {
  arenaLayout: ArenaLayout;
  arenaRoot: TransformNode;
  getCameraPosition: () => Vector3 | null;
  scene: Scene;
  unitFactory: UnitFactory;
}

export class ResidentPopulation {
  private readonly arenaLayout: ArenaLayout;
  private readonly arenaRoot: TransformNode;
  private readonly getCameraPosition: () => Vector3 | null;
  private readonly scene: Scene;
  private readonly unitFactory: UnitFactory;

  private readonly residents: BaseUnit[] = [];
  // Buffer reutilizado por residente para "vizinhos" — evita alocar um array
  // novo por frame quando uma criatura esta no estado "social" (ver
  // getNeighborPositionsFor). O projeto roda em RA, competindo por orcamento
  // de frame com SLAM; nao alocar aqui e barato de garantir.
  private readonly neighborBuffers = new Map<BaseUnit, Vector3[]>();

  public constructor(options: ResidentPopulationOptions) {
    this.arenaLayout = options.arenaLayout;
    this.arenaRoot = options.arenaRoot;
    this.getCameraPosition = options.getCameraPosition;
    this.scene = options.scene;
    this.unitFactory = options.unitFactory;
  }

  /** Cria as criaturas ociosas nos dois lados da arena. Chamar uma unica vez. */
  public populate(): void {
    for (const plan of this.buildSpawnPlan()) {
      const spawnPosition = new Vector3(plan.x, this.arenaLayout.unitGroundY, plan.z);
      // "team" aqui e so estetico (a cor do anel de selecao sob a criatura) —
      // residentes nao lutam e nao entram na lista de unidades de nenhum
      // CombatEngine, entao o time nao tem efeito de jogo.
      const [unit] = this.unitFactory.createUnits(plan.cardId, spawnPosition, "enemy");
      if (!unit) {
        continue;
      }

      unit.root.parent = this.arenaRoot;
      unit.setTargetTower(null);
      this.residents.push(unit);
      this.neighborBuffers.set(unit, []);

      unit.setIdleContext({
        bounds: plan.bounds,
        getCameraPosition: this.getCameraPosition,
        getNeighborPositions: () => this.getNeighborPositionsFor(unit),
      });
      unit.setIdleEnabled(true);
    }
  }

  public update(deltaSeconds: number, nowMs: number): void {
    for (const unit of this.residents) {
      unit.update(deltaSeconds, nowMs);
    }
  }

  public dispose(): void {
    for (const unit of this.residents) {
      unit.dispose();
    }
    this.residents.length = 0;
    this.neighborBuffers.clear();
  }

  /** Posicoes dos demais residentes (exclui o proprio), reaproveitando o buffer da criatura. */
  private getNeighborPositionsFor(unit: BaseUnit): Vector3[] {
    const buffer = this.neighborBuffers.get(unit) ?? [];
    buffer.length = 0;

    for (const resident of this.residents) {
      if (resident !== unit) {
        buffer.push(resident.root.position);
      }
    }

    return buffer;
  }

  /**
   * 3 criaturas de cada lado (leste/oeste do caminho central), espalhadas em
   * Z, longe das torres e do caminho. Especies alternadas (javali/cururu) e
   * espelhadas entre os lados para variedade — dona-barata fica de fora do
   * cenario porque sempre nasce em esquadrao de 3 (formacao pensada para
   * combate), o que quebraria o "~3 por lado" pedido pela spec.
   *
   * Os limites sao derivados de `arenaLayout` (nao de constantes fixas do
   * tamanho atual da arena), para continuar corretos se a arena mudar de
   * tamanho — mesmo principio ja usado em ArenaSystem.buildInitialArena.
   */
  private buildSpawnPlan(): ResidentSpawnPlan[] {
    const { laneCenterX, laneHalfWidth, maxX, maxZ, minX, minZ } = this.arenaLayout;

    // Pequena folga da borda externa da arena e do caminho central, alem da
    // meia-largura ja reservada a ele.
    const edgeMargin = Math.min(maxX - laneCenterX, maxZ) * 0.05;
    const pathMargin = 0.3;
    // Mantem os residentes bem longe das torres (que ficam perto do limite Z
    // da arena), sem depender da posicao exata delas.
    const zLimit = maxZ * 0.55;

    const eastBounds: IdleBehaviorBounds = {
      maxX: maxX - edgeMargin,
      maxZ: zLimit,
      minX: laneCenterX + laneHalfWidth + pathMargin,
      minZ: -zLimit,
    };
    const westBounds: IdleBehaviorBounds = {
      maxX: laneCenterX - laneHalfWidth - pathMargin,
      maxZ: zLimit,
      minX: minX + edgeMargin,
      minZ: -zLimit,
    };

    const eastX = (eastBounds.minX + eastBounds.maxX) / 2;
    const westX = (westBounds.minX + westBounds.maxX) / 2;
    const zSpread = zLimit * 0.7;
    const zOffsets = [-zSpread, 0, zSpread];

    const speciesEast = ["javali-raivoso", "cururu-bombado", "javali-raivoso"];
    const speciesWest = ["cururu-bombado", "javali-raivoso", "cururu-bombado"];

    const plans: ResidentSpawnPlan[] = [];

    zOffsets.forEach((z, index) => {
      plans.push({ bounds: eastBounds, cardId: speciesEast[index], x: eastX, z });
      plans.push({ bounds: westBounds, cardId: speciesWest[index], x: westX, z });
    });

    return plans;
  }
}
