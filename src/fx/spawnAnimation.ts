import { Animation } from "@babylonjs/core/Animations/animation";
import { BackEase, EasingFunction } from "@babylonjs/core/Animations/easing";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

export interface SpawnAnimationOptions {
  /** Duracao total da animacao em ms. Default 320. */
  durationMs?: number;
  /**
   * Fator inicial de escala relativo ao alvo (0..1). Default 0.001 — comeca
   * praticamente do zero, mas evita 0 puro (que pode zerar matrizes/normais).
   */
  fromScale?: number;
}

/**
 * Anima a ENTRADA de um node: a escala vai de `fromScale * alvo` ate o `alvo`,
 * onde o alvo e a `scaling` ATUAL do node no momento da chamada (capturada no
 * inicio). Usa ease-out com leve overshoot (ex.: `BackEase` out ou
 * `CubicEase` out) para dar a sensacao de "surgir" em vez de aparecer de uma vez.
 *
 * Requisitos da implementacao:
 * - Capturar `target = node.scaling.clone()` no inicio.
 * - Criar uma `Animation` de `scaling` (Vector3) de `target * fromScale` -> `target`,
 *   com uma easing function `setEasingMode(EASINGMODE_EASEOUT)`.
 * - Rodar via `scene.beginDirectAnimation(node, [anim], 0, totalFrames, false)`.
 *   Nao bloqueia (retorna imediatamente).
 * - Assumir ~60 fps para converter `durationMs` em frames.
 */
export function playSpawnScaleIn(
  node: TransformNode,
  scene: Scene,
  options?: SpawnAnimationOptions
): void {
  const durationMs = options?.durationMs ?? 320;
  const fromScale = options?.fromScale ?? 0.001;

  const target = node.scaling.clone();
  const from = target.scale(fromScale);

  const fps = 60;
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));

  const anim = new Animation(
    "spawnScaleIn",
    "scaling",
    fps,
    Animation.ANIMATIONTYPE_VECTOR3,
    Animation.ANIMATIONLOOPMODE_CONSTANT
  );
  anim.setKeys([
    { frame: 0, value: from },
    { frame: totalFrames, value: target },
  ]);

  const ease = new BackEase(0.6);
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
  anim.setEasingFunction(ease);

  node.scaling.copyFrom(from);

  scene.beginDirectAnimation(node, [anim], 0, totalFrames, false);
}
