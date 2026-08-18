import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { FADE_END_M, FADE_START_M } from "../arena/metrics";

/**
 * Calcula a opacidade (`visibility`) de um objeto pela distancia da camera ate
 * ele, em metros. 1 = totalmente opaco (>= startM), 0 = invisivel (<= endM).
 *
 * Curva: smoothstep (3t^2 - 2t^3) sobre `t = (distanceM - endM) / (startM -
 * endM)`, nao uma rampa linear. Motivo: derivada zero nas duas pontas — perto
 * de `startM` o objeto ja estava com opacidade quase constante em 1 e comeca a
 * cair suavemente; perto de `endM` a opacidade chega a 0 desacelerando, sem
 * degrau. Uma rampa linear tem derivada constante ate a borda e para
 * abruptamente nela, o que le como um "pop" de opacidade visivel no
 * playtest — exatamente o artefato que este modulo existe para evitar.
 *
 * Robustez (os parametros vem de constantes ajustadas em playtest, alguem vai
 * digitar um valor ruim em algum momento):
 * - `startM <= endM` (degenerado: janela de fade zero ou invertida) devolve
 *   SEMPRE 0, deterministicamente. Escolha: um objeto sem janela de fade
 *   valida deve preferir "sumir" (falha visivel, facil de notar no playtest) a
 *   "ficar sempre solido" (falha silenciosa, que deixaria o near-plane cortar
 *   a malha de novo — exatamente o bug que este modulo resolve). Isso tambem
 *   evita divisao por zero quando `startM === endM`.
 * - `distanceM` negativo e tratado como distancia (nao ha "distancia
 *   negativa" fisica; usar como esta, sem `Math.abs`, mantem a funcao
 *   monotonica: valores mais negativos ficam ainda mais perto de `endM` na
 *   reta numerica e o `clamp` abaixo garante 0).
 * - `NaN` em qualquer argumento: `t` vira `NaN`, e o `clamp` final devolve 0 —
 *   nunca propaga NaN para `mesh.visibility`.
 * - O retorno e sempre finito e sempre pertence a [0, 1] (garantido pelo
 *   clamp final, que roda mesmo nos casos degenerados acima).
 */
export function computeFadeAlpha(distanceM: number, startM: number, endM: number): number {
  if (!(startM > endM)) {
    // startM <= endM (inclui NaN em qualquer um dos dois, ja que qualquer
    // comparacao com NaN e false, e `!(false)` cai aqui): janela invalida.
    return 0;
  }

  const t = (distanceM - endM) / (startM - endM);
  const clampedT = clamp01(t);

  // smoothstep: 3t^2 - 2t^3. Se `t` veio de NaN, `clamp01` ja devolveu 0.
  const eased = clampedT * clampedT * (3 - 2 * clampedT);

  return clamp01(eased);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/**
 * Decide se um novo alpha calculado justifica escrever em `mesh.visibility`.
 * Extraida como funcao pura para ser testavel sem instanciar uma `Scene`:
 * escrever `visibility` "sujo" (mesmo quando o valor nao mudou de verdade)
 * dispara reavaliacao de material no Babylon, o que e caro em mobile com RA
 * (camera + SLAM ja competem pelo orcamento de frame).
 */
export function shouldWriteVisibility(nextAlpha: number, lastApplied: number, epsilon = 0.001): boolean {
  return Math.abs(nextAlpha - lastApplied) > epsilon;
}

export interface ProximityFadeOptions {
  /** Distancia (m) em que o objeto comeca a desaparecer. Default `FADE_START_M`. */
  startM?: number;
  /** Distancia (m) em que o objeto fica totalmente invisivel. Default `FADE_END_M`. */
  endM?: number;
}

interface OriginalMeshState {
  mesh: AbstractMesh;
  visibility: number;
  isPickable: boolean;
}

/**
 * Liga o fade por proximidade a um ator (e a todos os meshes debaixo dele): a
 * cada frame, mede a distancia entre a camera e a posicao ABSOLUTA do no (nao
 * `node.position`, que e espaço local — o ator e filho de um `TransformNode`
 * de arena) e aplica a opacidade resultante via `mesh.visibility`.
 *
 * O parametro e um `TransformNode`, e nao um `AbstractMesh`, porque os atores
 * deste projeto sao HIERARQUIAS: `MushroomTower.root` e um no de transform que
 * agrupa corpo, chapeu, olhos, boca da caverna e halo, cada um um mesh
 * separado. Exigir mesh aqui obrigaria quem chama a passar `tower.body` e o
 * fade deixaria o resto da torre solido — o chapeu flutuando sozinho a 40 cm
 * do rosto do jogador e pior do que nao ter fade nenhum. Um `Mesh` continua
 * sendo aceito (todo mesh e um `TransformNode`) e entra na lista de alvos.
 *
 * Por que `visibility` e nao `material.alpha`: os materiais deste jogo sao
 * compartilhados entre atores (cache por cor em `src/fx/materials.ts`).
 * Mexer em `material.alpha` apagaria TODAS as torres que usam aquele material,
 * nao so esta. `visibility` e uma propriedade por-mesh, e o Babylon liga o
 * alpha blending sozinho quando ela cai abaixo de 1 — nao precisa mexer em
 * `material.alphaMode` na mao.
 *
 * Quando o alpha calculado chega a 0, `isPickable` e desligado (em todos os
 * meshes tocados): um objeto invisivel nao pode continuar roubando toque do
 * jogador. Volta a `true` assim que o alpha sobe de 0 de novo, e ao `dispose()`
 * cada mesh tocado volta exatamente ao `visibility`/`isPickable` que tinha no
 * momento do attach.
 */
export function attachProximityFade(
  node: TransformNode,
  getCameraPosition: () => Vector3,
  opts?: ProximityFadeOptions
): { dispose(): void } {
  const startM = opts?.startM ?? FADE_START_M;
  const endM = opts?.endM ?? FADE_END_M;

  const targets: AbstractMesh[] = node instanceof AbstractMesh
    ? [node, ...node.getChildMeshes(false)]
    : node.getChildMeshes(false);
  const originalStates: OriginalMeshState[] = targets.map((target) => ({
    mesh: target,
    visibility: target.visibility,
    isPickable: target.isPickable,
  }));

  let lastAppliedAlpha = 1;

  const scene: Scene = node.getScene();
  const observer: Observer<Scene> = scene.onBeforeRenderObservable.add(() => {
    const cameraPosition = getCameraPosition();
    const distanceM = Vector3.Distance(cameraPosition, node.getAbsolutePosition());
    const alpha = computeFadeAlpha(distanceM, startM, endM);

    if (!shouldWriteVisibility(alpha, lastAppliedAlpha)) {
      return;
    }

    lastAppliedAlpha = alpha;
    const pickable = alpha > 0;

    // O fade MULTIPLICA o estado original de cada mesh, nunca o sobrescreve.
    // Isso importa por dois idiomas que este projeto ja usa:
    // - `visibility = 0` para manter uma mesh invisivel MAS pickavel (o
    //   `arena-ground` e assim). Sobrescrever com `alpha` faria essa mesh
    //   APARECER quando o jogador se afastasse — o oposto do que o fade quer;
    // - meshes deliberadamente translucidas (halo aditivo da caverna em
    //   `MushroomTower`), que perderiam a translucidez propria.
    // Mesmo raciocinio para `isPickable`: quem ja era nao-pickavel continua
    // nao-pickavel; o fade so pode TIRAR o toque, nunca conceder.
    for (const state of originalStates) {
      state.mesh.visibility = state.visibility * alpha;
      state.mesh.isPickable = state.isPickable && pickable;
    }
  });

  return {
    dispose(): void {
      scene.onBeforeRenderObservable.remove(observer);
      for (const state of originalStates) {
        state.mesh.visibility = state.visibility;
        state.mesh.isPickable = state.isPickable;
      }
    },
  };
}
