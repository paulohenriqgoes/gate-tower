import { Animation } from "@babylonjs/core/Animations/animation";
import { CubicEase, EasingFunction } from "@babylonjs/core/Animations/easing";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Beat 7 — "a arena se desfaz". Fim de partida SEM corte para tela de
 * resultado (spec, secao de escopo): em vez disso, cada elemento da arena
 * (tile, torre, criatura) encolhe ate sumir, com um atraso proprio, dando a
 * leitura de desmoronamento em vez de um fade global instantaneo.
 *
 * Escala e a grandeza usada para a saida (nunca posicao/tamanho absoluto):
 * `arenaRoot.scaling` e sempre 1 desde a Etapa 2 (`src/arena/metrics.ts`),
 * mas esta animacao continua trabalhando em cima da escala ATUAL de cada no
 * — captura `originalScaling` e anima ate zero a partir dela — porque e a
 * forma mais simples de "encolher ate sumir e depois voltar exatamente ao
 * que era" sem se importar com o valor de partida de cada elemento.
 */

/** Nome do no que agrupa todos os tiles do xadrez (ver `ArenaSystem`). */
const ARENA_GRID_NODE_NAME = "arena-grid";

/** Duracao padrao do desmoronamento inteiro, ponta a ponta. */
const DEFAULT_DURATION_MS = 2600;
/** Duracao do encolhimento de UM elemento, uma vez que ele comeca a sair. */
const ELEMENT_SHRINK_MS = 550;
/**
 * Fracao da duracao total reservada a ESPALHAR os atrasos de inicio entre os
 * elementos (o resto sobra de folga para o ultimo elemento terminar de
 * encolher dentro de `durationMs`).
 */
const STAGGER_FRACTION = 0.6;
/** Amplitude do jitter pseudo-aleatorio somado ao atraso de cada elemento. */
const JITTER_MS = 220;
const FPS = 60;

export interface DissolveArenaOptions {
  arenaRoot: TransformNode;
  /** Duracao total do desmoronamento, em ms. Default 2600. */
  durationMs?: number;
  onComplete?: () => void;
  scene: Scene;
}

interface DissolveElement {
  /** Toda malha descendente (incluindo o proprio no, se ele for uma malha) — alvo da animacao de `visibility`. */
  meshes: AbstractMesh[];
  node: TransformNode;
  originalScaling: Vector3;
  originalVisibilities: number[];
}

interface ScheduledElement {
  delayMs: number;
  element: DissolveElement;
  started: boolean;
}

/**
 * Hash determinístico (0..1) a partir de um inteiro — mesmo truque de
 * pseudo-aleatoriedade sem estado usado em shaders (seno + parte fracionaria
 * de um multiplicador grande). Usado no lugar de `Math.random()` para o
 * escalonamento ser REPRODUZIVEL: a mesma arena, na mesma ordem de
 * elementos, sempre desmorona na mesma sequencia.
 */
function pseudoRandom01(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Atraso de inicio (ms) de um elemento, a partir da distancia dele ao centro
 * da arena e do seu indice na lista. Elementos na BORDA (distancia alta,
 * `normalizedDistance` perto de 1) comecam quase no instante 0; elementos
 * perto do CENTRO (`normalizedDistance` perto de 0) esperam quase todo o
 * orcamento de espalhamento — e assim que "comeca pelas bordas e fecha para
 * o centro" (spec) emerge sem precisar de uma lista ordenada a parte.
 *
 * Pura e determinística (sem Babylon, sem `Math.random`) de proposito: e a
 * unica parte deste modulo com logica testavel sem montar uma `Scene`.
 */
export function computeElementDelayMs(options: {
  distanceFromCenter: number;
  durationMs: number;
  index: number;
  maxDistanceFromCenter: number;
}): number {
  const { distanceFromCenter, durationMs, index, maxDistanceFromCenter } = options;

  const normalizedDistance =
    maxDistanceFromCenter > 0 ? distanceFromCenter / maxDistanceFromCenter : 0;

  const baseDelayMs = (1 - normalizedDistance) * durationMs * STAGGER_FRACTION;
  const jitterMs = pseudoRandom01(index + 1) * JITTER_MS;
  const maxStartDelayMs = Math.max(0, durationMs - ELEMENT_SHRINK_MS);

  return Math.min(baseDelayMs + jitterMs, maxStartDelayMs);
}

/**
 * Desfaz a arena gradualmente: cada tile do grid, cada torre, cada blob de
 * sombra e cada criatura (residente ou de combate, o que estiver vivo no
 * `arenaRoot` no instante da chamada) encolhe ate escala zero com um atraso
 * proprio (`computeElementDelayMs`), depois volta ao estado original —
 * TANTO ao terminar naturalmente QUANTO ao ser cancelada. Nunca destroi
 * malha nenhuma: o jogo volta ao menu e uma partida nova precisa da mesma
 * arena de novo.
 *
 * A restauracao (escala + visibility originais) acontece DENTRO desta
 * funcao, nos dois caminhos de saida (`finish()` e o cancelamento
 * devolvido) — quem chama nunca precisa lembrar de restaurar nada por fora;
 * no instante em que `onComplete` dispara, a arena ja esta no estado normal
 * (so que ainda pode estar desabilitada/escondida por quem orquestra a
 * fase).
 *
 * Sem alocacao por frame: o observer de render so compara numeros contra um
 * array montado uma unica vez na chamada; as `Animation` de cada elemento
 * sao criadas uma unica vez, quando o atraso dele expira — nunca a cada
 * frame.
 */
export function dissolveArena(options: DissolveArenaOptions): () => void {
  const { arenaRoot, onComplete, scene } = options;
  const durationMs = options.durationMs ?? DEFAULT_DURATION_MS;

  const elements = collectDissolveElements(arenaRoot);

  if (elements.length === 0) {
    const emptyHandle = globalThis.setTimeout(() => onComplete?.(), 0);
    return () => globalThis.clearTimeout(emptyHandle);
  }

  let maxDistanceFromCenter = 0;
  for (const element of elements) {
    const distance = Math.hypot(element.node.position.x, element.node.position.z);
    if (distance > maxDistanceFromCenter) {
      maxDistanceFromCenter = distance;
    }
  }

  const schedule: ScheduledElement[] = elements.map((element, index) => {
    const distanceFromCenter = Math.hypot(element.node.position.x, element.node.position.z);

    return {
      delayMs: computeElementDelayMs({ distanceFromCenter, durationMs, index, maxDistanceFromCenter }),
      element,
      started: false,
    };
  });

  const maxStartDelayMs = Math.max(0, durationMs - ELEMENT_SHRINK_MS);
  const totalMs = maxStartDelayMs + ELEMENT_SHRINK_MS;
  const startedAtMs = performance.now();

  let isDone = false;

  const restoreAll = (): void => {
    for (const entry of schedule) {
      scene.stopAnimation(entry.element.node);
      for (const mesh of entry.element.meshes) {
        scene.stopAnimation(mesh);
      }
      restoreElement(entry.element);
    }
  };

  const finish = (): void => {
    if (isDone) {
      return;
    }

    isDone = true;
    scene.onBeforeRenderObservable.remove(renderObserver);
    restoreAll();
    onComplete?.();
  };

  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    const elapsedMs = performance.now() - startedAtMs;

    for (const entry of schedule) {
      if (!entry.started && elapsedMs >= entry.delayMs) {
        entry.started = true;
        animateElementOut(entry.element, scene, ELEMENT_SHRINK_MS);
      }
    }

    if (elapsedMs >= totalMs) {
      finish();
    }
  });

  return () => {
    if (isDone) {
      return;
    }

    isDone = true;
    scene.onBeforeRenderObservable.remove(renderObserver);
    restoreAll();
  };
}

/**
 * Monta a lista de elementos que desmoronam. O grid xadrez fica sob o no
 * `arena-grid` (ver `ArenaSystem`, criado para poder ser escondido de uma vez
 * em RA); aqui descemos UM nivel dentro dele para que cada tile seja seu
 * proprio elemento — senao o grid inteiro sumiria como um bloco so, sem o
 * efeito escalonado que a spec pede. Todo outro filho direto do `arenaRoot`
 * (chao invisivel-mas-pickavel, torres, blobs de sombra de contato, raiz de
 * cada criatura residente ou de combate) vira um elemento por si.
 */
function collectDissolveElements(arenaRoot: TransformNode): DissolveElement[] {
  const elements: DissolveElement[] = [];

  for (const child of arenaRoot.getChildren()) {
    if (!(child instanceof TransformNode)) {
      continue;
    }

    if (child.name === ARENA_GRID_NODE_NAME) {
      for (const tile of child.getChildren()) {
        if (tile instanceof TransformNode) {
          elements.push(buildElement(tile));
        }
      }
      continue;
    }

    elements.push(buildElement(child));
  }

  return elements;
}

function buildElement(node: TransformNode): DissolveElement {
  // `false` = TODAS as malhas descendentes, nao so as filhas diretas — uma
  // criatura tem varias malhas (corpo, patas, anel de selecao, barra de
  // vida, blob de sombra) que precisam sumir juntas com o no.
  const meshes = node.getChildMeshes(false);

  if (node instanceof AbstractMesh) {
    meshes.unshift(node);
  }

  return {
    meshes,
    node,
    originalScaling: node.scaling.clone(),
    originalVisibilities: meshes.map((mesh) => mesh.visibility),
  };
}

function restoreElement(element: DissolveElement): void {
  element.node.scaling.copyFrom(element.originalScaling);

  for (let index = 0; index < element.meshes.length; index += 1) {
    element.meshes[index].visibility = element.originalVisibilities[index];
  }
}

/**
 * Encolhe UM elemento ate escala zero + visibility zero, com ease-in (o
 * movimento acelera ao sumir — o oposto do ease-out de `playSpawnScaleIn`,
 * que desacelera ao aparecer). Chamada uma unica vez por elemento, no
 * instante em que o atraso dele expira — nunca por frame.
 */
function animateElementOut(element: DissolveElement, scene: Scene, durationMs: number): void {
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * FPS));

  const scaleEase = new CubicEase();
  scaleEase.setEasingMode(EasingFunction.EASINGMODE_EASEIN);

  const scaleAnimation = new Animation(
    "arenaDissolveScale",
    "scaling",
    FPS,
    Animation.ANIMATIONTYPE_VECTOR3,
    Animation.ANIMATIONLOOPMODE_CONSTANT
  );
  scaleAnimation.setKeys([
    { frame: 0, value: element.node.scaling.clone() },
    { frame: totalFrames, value: Vector3.Zero() },
  ]);
  scaleAnimation.setEasingFunction(scaleEase);

  scene.beginDirectAnimation(element.node, [scaleAnimation], 0, totalFrames, false);

  for (const mesh of element.meshes) {
    const visibilityEase = new CubicEase();
    visibilityEase.setEasingMode(EasingFunction.EASINGMODE_EASEIN);

    const visibilityAnimation = new Animation(
      "arenaDissolveVisibility",
      "visibility",
      FPS,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    visibilityAnimation.setKeys([
      { frame: 0, value: mesh.visibility },
      { frame: totalFrames, value: 0 },
    ]);
    visibilityAnimation.setEasingFunction(visibilityEase);

    scene.beginDirectAnimation(mesh, [visibilityAnimation], 0, totalFrames, false);
  }
}
