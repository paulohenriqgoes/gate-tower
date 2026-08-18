import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import { TROOP_HEIGHT_M } from "../../arena/metrics";

/**
 * Fator de escala para as distancias/velocidades genericas deste arquivo
 * (respiracao, passeio, raio social). `IdleBehavior` e compartilhado por
 * QUALQUER criatura ociosa (hoje Javali e Cururu, via `ResidentPopulation`) e
 * nao sabe qual delas esta rodando, entao usa a MESMA referencia generica de
 * `BaseUnit.ts` (`TROOP_HEIGHT_M` sobre a altura autoral media das quatro
 * criaturas, ~1.8) em vez do fator exato de uma unica especie. Duplicada em
 * vez de importada de `BaseUnit.ts` para nao criar import circular
 * (`BaseUnit` -> `IdleBehavior` -> `BaseUnit`).
 */
const RESIDENT_UI_SCALE = TROOP_HEIGHT_M / 1.8;

/**
 * Maquina de estados do comportamento ocioso (Etapa 3 - "o mundo vivo").
 *
 * Responde a pergunta que a demo inteira existe para responder: a pessoa
 * acredita que apareceu um mundo vivo na mesa dela? O estado mais importante
 * daqui e "observando" (a cabeca acompanhando a camera do jogador) - e o mais
 * barato e o que mais entrega sensacao de vida, por isso tem o maior peso no
 * sorteio de transicao.
 *
 * Contrato de espaco: `root.position` e usado diretamente (sem conversao para
 * espaco absoluto) para respeitar `bounds`, comparar com `getNeighborPositions()`
 * e mirar em `getCameraPosition()`. Isso funciona porque, no resto do projeto,
 * torres e unidades compartilham o mesmo parent (`arenaRoot`) e ficam todas no
 * mesmo espaco local dele (ver `CombatEngine.tryDeploySelectedCardAtWorldPoint`,
 * que converte o ponto de mundo para esse espaco antes de posicionar a unidade).
 * Quem monta o `getCameraPosition` desta instancia e responsavel por devolver a
 * posicao da camera nesse MESMO espaco (convertendo se a camera viver em espaco
 * de mundo diferente do `arenaRoot`, como acontece em RA).
 */
export type IdleState = "parado" | "vagando" | "observando" | "social";

export interface IdleBehaviorBounds {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
}

export interface IdleBehaviorOptions {
  /** Nos de posicao/rotacao da criatura. */
  root: TransformNode;
  /** Sofre o bob de respiracao; tambem serve de base para animacoes de combate. */
  visualRoot: TransformNode;
  /** Gira no estado "observando". Se null, cai para uma leve rotacao do corpo. */
  headNode: TransformNode | null;
  /** Camera ativa (RA ou nao). Retorna null quando nao ha camera disponivel. */
  getCameraPosition: () => Vector3 | null;
  /** Posicoes das outras criaturas, para o estado "social". */
  getNeighborPositions: () => Vector3[];
  bounds: IdleBehaviorBounds;
  /** Injetavel para teste; default `Math.random`. */
  random?: () => number;
}

/** Janela de tempo entre transicoes de estado, dessincronizada por criatura. */
export const MIN_TRANSITION_MS = 2000;
export const MAX_TRANSITION_MS = 6000;

/**
 * Pesos do sorteio de transicao. "observando" e o mais pesado de proposito -
 * ver o comentario no topo do arquivo. A soma nao precisa ser 100; o sorteio
 * normaliza pelo total dos candidatos restantes (o estado atual e excluido
 * para nunca repetir).
 */
const STATE_ENTRIES: ReadonlyArray<readonly [IdleState, number]> = [
  ["observando", 40],
  ["parado", 25],
  ["vagando", 20],
  ["social", 15],
];

// Respiracao: amplitude pequena frente ao tamanho real das criaturas
// (~0,35 m, `TROOP_HEIGHT_M`) e da arena (4,4 m no maior eixo) - perceptivel
// sem parecer flutuacao. Periodo lento, tipo respiracao mesmo, nao um tremor.
const BREATH_PERIOD_SECONDS = 3.2;
const BREATH_AMPLITUDE = 0.05 * RESIDENT_UI_SCALE;
const BREATH_ANGULAR_FREQUENCY = (Math.PI * 2) / BREATH_PERIOD_SECONDS;

// Uma cabeca nao gira 180 graus. ~70 graus para a cabeca de verdade; bem menos
// para o corpo inteiro no fallback sem headNode (senao vira uma criatura
// inteira encarando o jogador, que nao e o efeito pedido).
export const HEAD_YAW_CLAMP_RAD = (70 * Math.PI) / 180;
const BODY_YAW_CLAMP_RAD_NO_HEAD = (20 * Math.PI) / 180;

// Taxas de suavizacao (1/s) do damping exponencial independente de framerate.
const HEAD_TURN_SMOOTHING_RATE = 6;
const BODY_TURN_SMOOTHING_RATE = 4;

// "Poucos passos": velocidade baixa e distancia curta, sem pathfinding de
// verdade - so um passeio numa direcao aleatoria ate parar. Espaciais —
// escalam com `RESIDENT_UI_SCALE` (regra da Etapa 2 para velocidades e
// distancias de unidade).
const WANDER_SPEED = 0.6 * RESIDENT_UI_SCALE;
const WANDER_MIN_DISTANCE = 1.2 * RESIDENT_UI_SCALE;
const WANDER_MAX_DISTANCE = 2.8 * RESIDENT_UI_SCALE;

const SOCIAL_RADIUS = 4.5 * RESIDENT_UI_SCALE;
const SOCIAL_RADIUS_SQ = SOCIAL_RADIUS * SOCIAL_RADIUS;

/** Normaliza um angulo para o intervalo [-PI, PI]. Sem alocacao. */
function normalizeAngle(angleRad: number): number {
  let result = angleRad % (Math.PI * 2);
  if (result > Math.PI) {
    result -= Math.PI * 2;
  } else if (result < -Math.PI) {
    result += Math.PI * 2;
  }
  return result;
}

/**
 * Interpola `current` em direcao a `target` pelo caminho angular mais curto,
 * com suavizacao exponencial independente de framerate. Sem alocacao.
 */
function dampAngle(current: number, target: number, rateHz: number, deltaSeconds: number): number {
  const factor = 1 - Math.exp(-rateHz * deltaSeconds);
  return current + normalizeAngle(target - current) * factor;
}

export class IdleBehavior {
  private readonly root: TransformNode;
  private readonly visualRoot: TransformNode;
  private readonly headNode: TransformNode | null;
  private readonly getCameraPosition: () => Vector3 | null;
  private readonly getNeighborPositions: () => Vector3[];
  private readonly bounds: IdleBehaviorBounds;
  private readonly random: () => number;

  // Pose de repouso, capturada na construcao - dispose() volta pra ela.
  private readonly restRootRotationY: number;
  private readonly restVisualRootY: number;
  private readonly restHeadRotation: Vector3 | null;
  private readonly headYawBaseline: number;

  // Offset de fase sorteado na construcao: garante que duas criaturas
  // construidas no mesmo frame nao respirem em unissono nem troquem de
  // estado juntas (ver comentario da classe).
  private readonly breathPhaseOffset: number;

  private state: IdleState = "parado";
  private nextTransitionAt: number | null = null;

  // Alvos de yaw recalculados a cada update() pelo estado atual, depois
  // aplicados com damping. Campos reutilizados em vez de retorno de objeto -
  // zero alocacao no caminho quente.
  private targetBodyYaw = 0;
  private targetHeadYaw = 0;

  // Estado do passeio ("vagando"), sorteado uma vez ao entrar no estado.
  private wanderDirX = 0;
  private wanderDirZ = 0;
  private wanderTargetYaw = 0;
  private wanderRemainingDistance = 0;

  public constructor(options: IdleBehaviorOptions) {
    this.root = options.root;
    this.visualRoot = options.visualRoot;
    this.headNode = options.headNode;
    this.getCameraPosition = options.getCameraPosition;
    this.getNeighborPositions = options.getNeighborPositions;
    this.bounds = options.bounds;
    this.random = options.random ?? Math.random;

    this.restRootRotationY = this.root.rotation.y;
    this.restVisualRootY = this.visualRoot.position.y;
    this.restHeadRotation = this.headNode ? this.headNode.rotation.clone() : null;
    this.headYawBaseline = this.restHeadRotation ? this.restHeadRotation.y : 0;

    this.targetBodyYaw = this.restRootRotationY;
    this.targetHeadYaw = this.headYawBaseline;

    this.breathPhaseOffset = this.random() * Math.PI * 2;
  }

  public getState(): IdleState {
    return this.state;
  }

  public update(deltaSeconds: number, nowMs: number): void {
    this.applyBreathing(nowMs);

    if (this.nextTransitionAt === null) {
      // Primeira chamada: agenda a partir de nowMs, nao da construcao (o
      // construtor nao recebe relogio). O offset em si ja veio do `random`
      // proprio desta instancia, entao duas criaturas construidas juntas
      // ainda assim trocam de estado em instantes diferentes.
      this.scheduleNextTransition(nowMs);
    } else if (nowMs >= this.nextTransitionAt) {
      this.transitionTo(this.pickNextState(), nowMs);
    }

    this.targetBodyYaw = this.restRootRotationY;
    this.targetHeadYaw = this.headYawBaseline;

    switch (this.state) {
      case "vagando":
        this.updateWander(deltaSeconds);
        break;
      case "observando":
        this.updateObserving();
        break;
      case "social":
        this.updateSocial(nowMs);
        break;
      case "parado":
      default:
        break;
    }

    this.root.rotation.y = dampAngle(
      this.root.rotation.y,
      this.targetBodyYaw,
      BODY_TURN_SMOOTHING_RATE,
      deltaSeconds
    );

    if (this.headNode) {
      this.headNode.rotation.y = dampAngle(
        this.headNode.rotation.y,
        this.targetHeadYaw,
        HEAD_TURN_SMOOTHING_RATE,
        deltaSeconds
      );
    }
  }

  public dispose(): void {
    this.root.rotation.y = this.restRootRotationY;
    this.visualRoot.position.y = this.restVisualRootY;

    if (this.headNode && this.restHeadRotation) {
      this.headNode.rotation.copyFrom(this.restHeadRotation);
    }
  }

  /** Bob vertical continuo, sobreposto a qualquer estado - roda sempre. */
  private applyBreathing(nowMs: number): void {
    const phase = (nowMs / 1000) * BREATH_ANGULAR_FREQUENCY + this.breathPhaseOffset;
    this.visualRoot.position.y = this.restVisualRootY + Math.sin(phase) * BREATH_AMPLITUDE;
  }

  private scheduleNextTransition(nowMs: number): void {
    this.nextTransitionAt = nowMs + MIN_TRANSITION_MS + this.random() * (MAX_TRANSITION_MS - MIN_TRANSITION_MS);
  }

  /** Sorteia o proximo estado por peso, excluindo sempre o estado atual. */
  private pickNextState(): IdleState {
    let totalWeight = 0;
    for (const [candidateState, weight] of STATE_ENTRIES) {
      if (candidateState !== this.state) {
        totalWeight += weight;
      }
    }

    let roll = this.random() * totalWeight;
    for (const [candidateState, weight] of STATE_ENTRIES) {
      if (candidateState === this.state) {
        continue;
      }
      if (roll < weight) {
        return candidateState;
      }
      roll -= weight;
    }

    // So chega aqui por erro de ponto flutuante no ultimo candidato; devolve
    // o ultimo estado elegivel em vez de deixar o tipo sem retorno.
    for (let i = STATE_ENTRIES.length - 1; i >= 0; i -= 1) {
      const [candidateState] = STATE_ENTRIES[i];
      if (candidateState !== this.state) {
        return candidateState;
      }
    }
    return this.state;
  }

  private transitionTo(newState: IdleState, nowMs: number): void {
    this.state = newState;
    this.scheduleNextTransition(nowMs);

    if (newState === "vagando") {
      this.beginWander();
    }
  }

  private beginWander(): void {
    const angle = this.random() * Math.PI * 2;
    this.wanderDirX = Math.sin(angle);
    this.wanderDirZ = Math.cos(angle);
    this.wanderTargetYaw = Math.atan2(this.wanderDirX, this.wanderDirZ);
    this.wanderRemainingDistance =
      WANDER_MIN_DISTANCE + this.random() * (WANDER_MAX_DISTANCE - WANDER_MIN_DISTANCE);
  }

  /** Poucos passos na direcao sorteada, clampados nos bounds da arena. */
  private updateWander(deltaSeconds: number): void {
    if (this.wanderRemainingDistance > 0) {
      const step = Math.min(WANDER_SPEED * deltaSeconds, this.wanderRemainingDistance);
      const nextX = this.root.position.x + this.wanderDirX * step;
      const nextZ = this.root.position.z + this.wanderDirZ * step;
      const clampedX = Scalar.Clamp(nextX, this.bounds.minX, this.bounds.maxX);
      const clampedZ = Scalar.Clamp(nextZ, this.bounds.minZ, this.bounds.maxZ);

      if (clampedX !== nextX || clampedZ !== nextZ) {
        // Bateu na borda da arena: para o passeio bem aqui.
        this.wanderRemainingDistance = 0;
      } else {
        this.wanderRemainingDistance -= step;
      }

      this.root.position.x = clampedX;
      this.root.position.z = clampedZ;
    }

    this.targetBodyYaw = this.wanderTargetYaw;
  }

  /** Cabeca (ou corpo, no fallback) gira para acompanhar a camera. */
  private updateObserving(): void {
    const cameraPosition = this.getCameraPosition();
    if (!cameraPosition) {
      return;
    }

    const dx = cameraPosition.x - this.root.position.x;
    const dz = cameraPosition.z - this.root.position.z;
    if (dx === 0 && dz === 0) {
      return;
    }

    const worldYawToCamera = Math.atan2(dx, dz);

    if (this.headNode) {
      const relativeYaw = normalizeAngle(worldYawToCamera - this.root.rotation.y);
      const clamped = Scalar.Clamp(relativeYaw, -HEAD_YAW_CLAMP_RAD, HEAD_YAW_CLAMP_RAD);
      this.targetHeadYaw = this.headYawBaseline + clamped;
    } else {
      const relativeYaw = normalizeAngle(worldYawToCamera - this.restRootRotationY);
      const clamped = Scalar.Clamp(relativeYaw, -BODY_YAW_CLAMP_RAD_NO_HEAD, BODY_YAW_CLAMP_RAD_NO_HEAD);
      this.targetBodyYaw = this.restRootRotationY + clamped;
    }
  }

  /** Vira o corpo para o vizinho mais proximo dentro do raio; sem vizinho, cai pra "parado". */
  private updateSocial(nowMs: number): void {
    const neighbors = this.getNeighborPositions();

    let nearestDistanceSq = SOCIAL_RADIUS_SQ;
    let nearestDx = 0;
    let nearestDz = 0;
    let found = false;

    for (const neighbor of neighbors) {
      const dx = neighbor.x - this.root.position.x;
      const dz = neighbor.z - this.root.position.z;
      const distanceSq = dx * dx + dz * dz;

      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearestDx = dx;
        nearestDz = dz;
        found = true;
      }
    }

    if (!found) {
      this.transitionTo("parado", nowMs);
      return;
    }

    this.targetBodyYaw = Math.atan2(nearestDx, nearestDz);
  }
}
