import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

import type { GamePhase } from "../game/GameTypes";

export type WorldTapHandler = (
  pickedPoint: Vector3 | null,
  pickedMesh: AbstractMesh | null
) => void;

/**
 * Dono unico do toque no mundo. Antes existiam DOIS assinantes de
 * `scene.onPointerObservable` disputando o mesmo POINTERDOWN — o
 * `EighthWallARManager` (ancorar a arena) e o `CombatEngine` (invocar carta) —
 * cada um com o seu proprio guarda de "sera que agora e comigo?". Com tres
 * comportamentos (ancorar, acordar o inimigo, invocar) isso deixa de escalar:
 * a regra de quem responde ao toque vira uma funcao da FASE, e ela passa a
 * morar em um lugar so.
 *
 * O router assina o ponteiro UMA vez e despacha para o handler registrado para
 * a fase atual. Fase sem handler = toque ignorado (que e exatamente o
 * comportamento pedido pela spec em `world-alive` quando o jogador toca em
 * qualquer coisa que nao seja a torre inimiga: nada acontece, sem mensagem e
 * sem tutorial).
 *
 * O handler recebe o resultado bruto do picking. O AR Manager ignora os dois
 * argumentos: desde a spec 08 o toque de RA nao carrega informacao de posicao
 * nenhuma — a arena ja esta na origem, e o dedo so diz "agora".
 */
export class WorldTapRouter {
  private readonly scene: Scene;
  private readonly handlers = new Map<GamePhase, WorldTapHandler>();
  private readonly pointerObserver: Observer<unknown>;

  private phase: GamePhase = "menu";
  private isDisposed = false;

  public constructor(scene: Scene) {
    this.scene = scene;

    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) {
        return;
      }

      const handler = this.handlers.get(this.phase);

      if (!handler) {
        return;
      }

      handler(pointerInfo.pickInfo?.pickedPoint ?? null, pointerInfo.pickInfo?.pickedMesh ?? null);
    });
  }

  /** Registra (ou remove, com `null`) o comportamento de toque de uma fase. */
  public setHandler(phase: GamePhase, handler: WorldTapHandler | null): void {
    if (handler) {
      this.handlers.set(phase, handler);
      return;
    }

    this.handlers.delete(phase);
  }

  /** Fase atual. Quem chama e o `GameFlow`, a cada transicao. */
  public setPhase(phase: GamePhase): void {
    this.phase = phase;
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.scene.onPointerObservable.remove(this.pointerObserver);
    this.handlers.clear();
  }
}
