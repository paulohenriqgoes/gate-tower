import { Animation } from "@babylonjs/core/Animations/animation";
import { BackEase, EasingFunction } from "@babylonjs/core/Animations/easing";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

// Visibilidade da criatura durante a janela de fantasma: baixa o bastante
// para ler como "etereo", alta o bastante para a silhueta ainda informar
// posicao/tamanho de onde ela vai materializar.
const GHOST_VISIBILITY = 0.32;

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

/**
 * Fantasma (~`ghostMs`) seguido de materializacao: por `ghostMs` a criatura
 * fica translucida/parada no lugar de spawn, depois volta a opacidade normal
 * e toca `playSpawnScaleIn` (o "pop" de entrada ja existente).
 *
 * Mexe em `mesh.visibility` de CADA malha descendente de `root`, nunca em
 * alpha de material: `src/fx/materials.ts` cacheia material por cor+cena
 * (`createMatteMaterial`), entao abaixar o alpha de um material cacheado
 * fantasmaria TODAS as criaturas daquela cor na cena, nao so esta instancia.
 * `visibility` e uma propriedade por malha — seguro por construcao, sem
 * precisar clonar nenhum material.
 *
 * Quem chama e responsavel por NAO deixar a unidade agir (andar/atacar)
 * enquanto o fantasma roda — aqui so mexemos em aparencia. No `CombatEngine`
 * isso e feito mantendo a unidade fora do array de unidades ativas ate
 * `onMaterialized` disparar.
 *
 * @returns funcao de cancelamento: limpa o timer pendente e restaura a
 * visibilidade original das malhas SEM disparar `onMaterialized` nem tocar
 * `playSpawnScaleIn`. Uso: dispose no meio do fantasma (ex.: partida
 * encerrada) nao deve deixar timers soltos nem malhas presas em opacidade
 * reduzida.
 */
export function playGhostThenMaterialize(
  root: TransformNode,
  scene: Scene,
  ghostMs = 200,
  onMaterialized?: () => void
): () => void {
  const meshes = root.getChildMeshes(false);
  const originalVisibilities = meshes.map((mesh) => mesh.visibility);

  for (const mesh of meshes) {
    mesh.visibility = GHOST_VISIBILITY;
  }

  const restoreVisibility = (): void => {
    for (let index = 0; index < meshes.length; index += 1) {
      meshes[index].visibility = originalVisibilities[index];
    }
  };

  let isSettled = false;

  const timeoutHandle = globalThis.setTimeout(() => {
    isSettled = true;
    restoreVisibility();
    playSpawnScaleIn(root, scene);
    onMaterialized?.();
  }, ghostMs);

  return () => {
    if (isSettled) {
      return;
    }

    isSettled = true;
    globalThis.clearTimeout(timeoutHandle);
    restoreVisibility();
  };
}
