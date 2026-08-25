/**
 * SPIKE DESCARTAVEL — pet sandbox. Contrato em `SPEC.md`, ao lado deste arquivo.
 *
 * Nao importa nada de producao alem de `installBabylonGlobalsForXR8`, e nada em
 * `src/` importa daqui. A duplicacao do blob de sombra e do pop de entrada
 * (`src/fx/contactShadow.ts`, `src/fx/spawnAnimation.ts`) e DELIBERADA: spike
 * que importa producao vira producao por acidente, e este aqui pode morrer
 * inteiro dependendo do que o device responder.
 *
 * ## A pergunta
 *
 *   O pet e a comida, colocados em momentos DIFERENTES, continuam a mesma
 *   distancia um do outro depois que o jogador anda pela sala?
 *
 * Se o mundo inteiro escorrega, o jogador nao percebe — pet e comida escorregam
 * juntos. O que quebra a ilusao e a distancia ENTRE os dois mudar.
 *
 * ## A decisao que define este spike: chao digital, sem `hitTest`
 *
 * O `hitTest` do 8th Wall saiu (decisao do dono do projeto: custo). No lugar
 * dele, uma malha de chao invisivel em `y = 0` do SLAM e picking do Babylon.
 *
 * A consequencia BOA, e o motivo de o spike ainda valer a pena: com um plano
 * compartilhado, o erro de distancia entre pet e comida some POR CONSTRUCAO —
 * os dois saem da mesma intersecao raio x plano, no mesmo referencial. O que
 * resta a medir e a deriva do SLAM acumulada ENTRE as duas colocacoes, e o
 * projeto ja tem linha de base para isso: 0,075 m de mediana em varredura de
 * +-90 lento, 0,78 m no pior caso (360 sobre carpete liso).
 *
 * As consequencias RUINS, assumidas:
 *
 *  - **Criterio 7 (mesa vs chao) fica sem medicao.** Sem sensor de superficie
 *    ninguem sabe para onde o jogador apontou. Virou escolha de um dedo:
 *    botoes MESA / CHAO, que o SPEC ja exigia por ergonomia.
 *  - **`y = 0` NAO e o piso real.** Em `scale: "absolute"` o engine descarta a
 *    altura declarada e fixa `origin.y = 1 m` (quatro medicoes em device,
 *    2026-08-20, `src/ar/EighthWallARManager.ts`). O plano nasce a 1 m abaixo do
 *    celular no instante da colocacao: mao a 1,5 m = pet flutuando 50 cm, por
 *    igual e o tempo todo. E UM grau de liberdade, e os botoes `chao +-5 cm`
 *    entregam ele ao dedo.
 *  - **A armadilha do arrasto que o SPEC previa some junto.** "Deslizar por uma
 *    superficie imaginaria" era o defeito esperado — mas agora TODA colocacao
 *    usa a mesma superficie imaginaria, coerentemente. O A/B toque vs arrasto
 *    deixa de ser "real vs imaginario" e vira "qual se sente melhor".
 *
 * ## Invariantes que este arquivo NAO tem liberdade de mudar
 *
 *  - cena CANHOTA: o ramo destro deste build produz quaternion NaN e a pose
 *    morre (device, 2026-08-19). Frente do mundo = +Z, azimute `atan2(x, z)`;
 *  - `window.BABYLON` ANTES do `xr.js`, senao tela preta sem pista;
 *  - chao virtual e `visibility = 0`, NUNCA `isVisible = false` — o segundo
 *    tira a malha do picking, que e o mecanismo inteiro do spike;
 *  - nada aparece antes de `trackingStatus === "NORMAL"`: em escala absoluta a
 *    escala so converge depois de paralaxe;
 *  - escala vai no no `scaler`, NUNCA no no ancorado — escalar o ancora desloca
 *    o ponto colocado e le como drift (criterio 5).
 */

import { Animation } from "@babylonjs/core/Animations/animation";
import { BackEase, EasingFunction } from "@babylonjs/core/Animations/easing";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
/*
 * `scene.pick` e `scene.createPickingRay` NAO existem no `Scene` — eles sao
 * ANEXADOS ao prototipo por este modulo, por efeito colateral. Com imports
 * granulares ninguem o traz junto, e o sintoma em device foi exatamente este:
 * cada toque na tela lancava "Ray needs to be imported before as it contains a
 * side-effect required by your code", nada era colocado, e o erro so aparecia
 * porque o spike joga excecao na tela. Sem o painel, seria um toque que nao faz
 * nada.
 */
import "@babylonjs/core/Culling/ray";
// Registra o plugin de glTF/glb no `SceneLoader`. Import por efeito colateral:
// sem ele o `LoadAssetContainerAsync` nao sabe ler `.glb` e falha em runtime,
// nao em compilacao.
import "@babylonjs/loaders/glTF/2.0";

import { installBabylonGlobalsForXR8 } from "../../src/ar/babylonRuntimeGlobals";
import {
  clampScale,
  horizontalDistance,
  incidenceDeg,
  pinchToScale,
  presetScaleFor,
  rayPlaneY,
  stepToward,
  yawToward,
  type Surface,
  type Vec3,
} from "./petMath";

// ------------------------------------------------------------ constantes

/** Altura real do bicho, em metros. O GLB do Kenney e normalizado para isto. */
const PET_REAL_HEIGHT_M = 0.45;
/** Velocidade de caminhada a 100% de escala. Escala junto com o pet. */
const PET_SPEED_MPS = 0.35;
/** Duracao da batida de "comer" antes de a comida sumir. */
const EAT_MS = 600;
/** Lerp do reposicionamento por toque: teletransporte le como bug. */
const MOVE_LERP_MS = 180;
/** Passo do ajuste de chao. Um grau de liberdade, no dedo. */
const FLOOR_STEP_M = 0.05;
/**
 * Lado do chao digital. Nao e infinito de verdade: 40 m cobre qualquer comodo,
 * e finito evita raio quase paralelo batendo a quilometros de distancia.
 */
const FLOOR_SIZE_M = 40;
/** Altura em que a camera de RA nasce, antes do attach. */
const CAMERA_START_HEIGHT_M = 1.55;
/**
 * Teto do gate de calibracao. Sala de parede lisa nunca chega a NORMAL, e sem
 * escape o spike trava para sempre em vez de devolver um veredito.
 */
const CALIBRATION_ESCAPE_MS = 30000;

/** Velocidade acima da qual o deslocamento nao e movimento fisico de mao. */
const JUMP_SPEED_MPS = 4;
/** Salto de relocalizacao e descontinuidade de UM frame; mao e sustentado. */
const CALM_SPEED_MPS = 1.5;

const params = new URLSearchParams(window.location.search);
/** `?only=colocar|mover|escalar|comida` isola uma acao em device. */
const only = params.get("only");
/** `?nooverlay=1` sobe a sessao sem o coaching overlay, para isolar excecao. */
const skipOverlay = params.get("nooverlay") === "1";

function allows(action: "colocar" | "mover" | "escalar" | "comida"): boolean {
  // "colocar" nunca desliga: sem pet nao ha o que medir em nenhuma das outras.
  return !only || only === action || action === "colocar";
}

// ------------------------------------------------------------ painel e log

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/**
 * A tela tem DUAS camadas, e a separacao e o conserto de um defeito medido em
 * device: a primeira versao cobria 60% do quadro com metricas e o resto com
 * botoes, sobrava uma faixa de camera, e o spike ficou impossivel de testar.
 *
 *  - HUD: pilula de estado, chip de escala, dica e os controles do momento. So
 *    o que se pode fazer AGORA.
 *  - GAVETA: tudo que e diagnostico — as metricas dos criterios, o log, o
 *    ajuste de chao e o laco fechado. Atras do "···".
 *
 * O numero continua existindo; ele so parou de disputar espaco com o objeto de
 * teste, que e o feed da camera.
 */
const ui = {
  status: el<HTMLDivElement>("status"),
  escala: el<HTMLDivElement>("escala"),
  dica: el<HTMLDivElement>("dica"),
  barra: el<HTMLDivElement>("barra"),
  barraFill: el<HTMLElement>("barra").firstElementChild as HTMLElement,
  enter: el<HTMLButtonElement>("btn-enter"),
  chipsEscala: el<HTMLDivElement>("chips-escala"),
  chipsAcao: el<HTMLDivElement>("chips-acao"),
  gaveta: el<HTMLDivElement>("gaveta"),
  metricas: el<HTMLDivElement>("metricas"),
};

/**
 * Celular nao tem console acessivel: todo evento de ciclo de vida e toda
 * excecao vao para a tela. Sem isso, "canvas preto" e um beco sem saida.
 */
const logLines: string[] = [];

function log(message: string): void {
  logLines.push(`${(performance.now() / 1000).toFixed(1)}s ${message}`);
  while (logLines.length > 10) logLines.shift();
}

window.addEventListener("error", (e) => log(`ERRO ${e.message}`));
window.addEventListener("securitypolicyviolation", (e) => log(`CSP ${e.blockedURI}`));
window.addEventListener("unhandledrejection", (e) => log(`REJEICAO ${String(e.reason).slice(0, 80)}`));

// ------------------------------------------------------------ cena

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0, 0, 0, 1);
/**
 * CANHOTA, e isto e medicao, nao preferencia: o ramo DESTRO do modulo Babylon
 * deste build produz quaternion NaN e a pose morre (device, 2026-08-19). E
 * tambem o default do Babylon e o que a producao ja roda.
 */
scene.useRightHandedSystem = false;

// Uma hemisferica e uma direcional. Sem shadow map: caro em mobile e fragil
// fora da escala 1 — e o pet aqui vive entre 15% e 400%.
const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.85;
const dir = new DirectionalLight("dir", new Vector3(0.3, -1, 0.5), scene);
dir.intensity = 0.55;

/**
 * Camera de pre-visualizacao, antes da RA. Existe por dois motivos: `render()`
 * sem `activeCamera` reclama, e ela e o DISCRIMINADOR do canvas preto — se o
 * conteudo nao aparecer aqui, o problema e a cena, nao o 8th Wall.
 */
const previewCamera = new FreeCamera("preview", new Vector3(0, CAMERA_START_HEIGHT_M, -1.5), scene);
previewCamera.setTarget(new Vector3(0, 0, 0.5));
previewCamera.minZ = 0.01;
previewCamera.maxZ = 1000;
scene.activeCamera = previewCamera;

// ------------------------------------------------------------ fx locais

function unlit(name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.emissiveColor = color;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  return material;
}

/**
 * Blob de sombra de contato — copia local de `src/fx/contactShadow.ts`.
 *
 * E o que faz o objeto parecer POUSADO. Em RA isso vale mais que precisao de
 * pose: o tracking pode estar perfeito e o objeto ainda ler como flutuando, e o
 * que resolve e pista visual, nao mais medicao.
 */
function createContactShadow(name: string, diameter: number, opacity = 0.55): Mesh {
  const mesh = CreateGround(name, { width: diameter, height: diameter }, scene);
  mesh.isPickable = false;
  mesh.receiveShadows = false;

  const size = 256;
  const texture = new DynamicTexture(`${name}-tex`, { width: size, height: size }, scene, true);
  texture.hasAlpha = true;

  const context = texture.getContext();
  const center = size / 2;
  context.clearRect(0, 0, size, size);

  /*
   * PLATO no centro, e nao gradiente puro — medido em device (2026-08-24).
   *
   * A primeira versao ia de `opacity` no centro direto a zero na borda. Sobre
   * um pet cujo corpo cobre a propria pegada, isso significa que a unica parte
   * escura do disco fica embaixo do bicho, e o que escapa para fora do corpo ja
   * esta com alpha abaixo de 0,1 — invisivel sobre porcelanato branco. No video
   * de device o pet aparece perfeitamente ancorado e SEM sombra nenhuma: ela
   * estava sendo desenhada o tempo todo, toda por baixo do cachorro.
   *
   * Com o plato ate 55% do raio, a queda acontece no anel que de fato aparece
   * ao redor das patas, e o disco pode ser bem menor: a primeira correcao usou
   * plato de 35% com disco a 1,6x a pegada, e o device respondeu "melhorou, mas
   * ficou um pouco grande" — 1,6x deixa ~17 cm de sombra para fora do corpo, o
   * que le como poca, nao como contato. Empurrar o plato para fora deixa apertar
   * o disco sem a sombra voltar a sumir.
   */
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, `rgba(0, 0, 0, ${opacity})`);
  gradient.addColorStop(0.55, `rgba(0, 0, 0, ${opacity})`);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  texture.update();

  const material = new StandardMaterial(`${name}-mat`, scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.Black();
  material.diffuseColor = Color3.Black();
  material.opacityTexture = texture;
  material.backFaceCulling = false;
  mesh.material = material;

  return mesh;
}

/**
 * Pop de entrada — copia local de `src/fx/spawnAnimation.ts`.
 *
 * Nao e enfeite: a animacao mascara o snap da ancoragem. Um objeto que aparece
 * de uma vez denuncia o instante em que a pose foi decidida.
 */
function playSpawnScaleIn(node: TransformNode, durationMs = 320): void {
  const target = node.scaling.clone();
  const from = target.scale(0.001);
  const fps = 60;
  const frames = Math.max(1, Math.round((durationMs / 1000) * fps));

  const anim = new Animation(
    "spawnScaleIn", "scaling", fps,
    Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT
  );
  anim.setKeys([{ frame: 0, value: from }, { frame: frames, value: target }]);

  const ease = new BackEase(0.6);
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
  anim.setEasingFunction(ease);

  node.scaling.copyFrom(from);
  scene.beginDirectAnimation(node, [anim], 0, frames, false);
}

// ------------------------------------------------------------ chao digital

/**
 * O chao digital, e o unico alvo de picking do spike.
 *
 * `floorNode` carrega o grau de liberdade (`position.y`, mexido pelos botoes) e
 * TUDO pendura nele — pet e comida inclusive. E assim que ajustar o chao sobe e
 * desce a cena junta, em vez de deixar os objetos para tras no ar.
 */
const floorNode = new TransformNode("floor", scene);

const ground = CreateGround("ground", { width: FLOOR_SIZE_M, height: FLOOR_SIZE_M }, scene);
ground.parent = floorNode;
/**
 * `visibility = 0`, NUNCA `isVisible = false`: o segundo tira a malha do
 * picking, e o picking e o mecanismo inteiro deste spike. Invisivel tambem por
 * necessidade de RA — um chao virtual opaco compete com o piso real e denuncia
 * o plano flutuante.
 */
ground.visibility = 0;
ground.isPickable = true;

// ------------------------------------------------------------ pet

/**
 * Hierarquia de QUATRO nos, e cada um so pode escrever o que o nome diz:
 *
 *   floorNode -> petAnchor (posicao do toque) -> petScaler (escala do jogador)
 *             -> petSpawnFx (animacao de entrada) -> malha normalizada
 *
 * Separar `scaler` de `anchor` e o que faz o criterio 5 passar: escalar o
 * ancora reescala a propria origem e desloca o ponto colocado — o pet
 * "escorrega" a cada pinca e parece drift. Separar `spawnFx` de `scaler` e o
 * que impede a pinca de brigar com o pop de entrada, que tambem escreve escala.
 */
const petAnchor = new TransformNode("petAnchor", scene);
petAnchor.parent = floorNode;
petAnchor.setEnabled(false);

const petScaler = new TransformNode("petScaler", scene);
petScaler.parent = petAnchor;

const petSpawnFx = new TransformNode("petSpawnFx", scene);
petSpawnFx.parent = petScaler;

let petFootprintM = 0.4;
let petShadow: Mesh | null = null;
let petLoaded = false;

async function loadPet(): Promise<void> {
  const container = await LoadAssetContainerAsync("/pets/animal-dog.glb", scene);
  const entries = container.instantiateModelsToScene((name) => name, false);

  const root = entries.rootNodes[0] as TransformNode;

  /*
   * Normalizacao. O GLB do Kenney ja nasce com a base em y = 0, mas medir e
   * barato e trocar de bicho nao pode exigir recalcular constante na mao.
   *
   * A medicao acontece com o `root` AINDA SEM PAI, de proposito:
   * `getHierarchyBoundingVectors` devolve MUNDO, e so enquanto o no esta solto
   * na origem o mundo dele coincide com o espaco local que vamos escalar. Medir
   * depois de pendurar em `petSpawnFx` faria a normalizacao herdar a escala do
   * jogador e o pet mudaria de tamanho a cada recarga.
   */
  root.position.setAll(0);
  root.rotationQuaternion = null;
  root.rotation.setAll(0);
  root.scaling.setAll(1);
  root.computeWorldMatrix(true);

  const bounds = root.getHierarchyBoundingVectors(true);
  const minY = bounds.min.y;
  const maxRadius = Math.max(
    Math.abs(bounds.min.x), Math.abs(bounds.max.x),
    Math.abs(bounds.min.z), Math.abs(bounds.max.z)
  );

  root.parent = petSpawnFx;

  const heightUnits = bounds.max.y - bounds.min.y;
  const normalize = heightUnits > 1e-6 ? PET_REAL_HEIGHT_M / heightUnits : 1;

  root.scaling.setAll(normalize);
  // Base em y = 0 DEPOIS da escala: com a base no chao, escalar cresce para
  // cima e o pet nao afunda nem levanta — que e literalmente o criterio 5.
  root.position.y = -minY * normalize;

  petFootprintM = Math.max(0.12, maxRadius * 2 * normalize);

  // 1,25x a pegada: o anel visivel escapa de baixo do corpo, mas so por ~7 cm.
  // Sombra de contato ancora quando e justa; larga demais vira poca.
  petShadow = createContactShadow("pet-shadow", petFootprintM * 1.25);
  petShadow.parent = petScaler;
  petShadow.position.y = 0.002;

  petLoaded = true;
  log(`pet carregado: ${heightUnits.toFixed(2)}u -> ${PET_REAL_HEIGHT_M} m, pegada ${petFootprintM.toFixed(2)} m`);
}

// ------------------------------------------------------------ comida

const foodAnchor = new TransformNode("foodAnchor", scene);
foodAnchor.parent = floorNode;
foodAnchor.setEnabled(false);

const FOOD_RADIUS_M = 0.07;

const foodBowl = CreateCylinder("food-bowl", { diameter: FOOD_RADIUS_M * 2, height: 0.03, tessellation: 20 }, scene);
foodBowl.parent = foodAnchor;
foodBowl.position.y = 0.015;
foodBowl.material = unlit("food-bowl-mat", new Color3(0.95, 0.6, 0.2));
foodBowl.isPickable = false;

const foodRim = CreateTorus("food-rim", { diameter: FOOD_RADIUS_M * 2, thickness: 0.014, tessellation: 20 }, scene);
foodRim.parent = foodAnchor;
foodRim.position.y = 0.03;
foodRim.material = unlit("food-rim-mat", new Color3(1, 0.85, 0.4));
foodRim.isPickable = false;

const foodShadow = createContactShadow("food-shadow", FOOD_RADIUS_M * 2.6, 0.45);
foodShadow.parent = foodAnchor;
foodShadow.position.y = 0.002;

// ------------------------------------------------------------ estado

let trackingStatus = "-";
let inAR = false;
let arCamera: FreeCamera | null = null;
let arEnteredAtMs = 0;
/** Escape do gate: sem ele, sala de parede lisa trava o spike para sempre. */
let calibrationEscaped = false;

let petPlaced = false;
let petScale = 1;
let surface: Surface = "chao";
/** Alvo do lerp de reposicionamento por toque. */
let moveFrom: Vec3 | null = null;
let moveTo: Vec3 | null = null;
let moveStartedAtMs = 0;
/** Vira o pet para o jogador quando o lerp de reposicionamento termina. */
let facePlayerAfterMove = false;

let foodPlaced = false;
let armFood = false;
let walking = false;
let eatingUntilMs = 0;

type MoveMode = "tocar" | "arrastar";
let moveMode: MoveMode = "tocar";
let dragging = false;

/** Ponteiros ativos, para a pinca. */
const pointers = new Map<number, { x: number; y: number }>();
let pinchStartDist = 0;
let pinchBaseScale = 1;

// --- metricas ---
/**
 * O criterio 4, em tres numeros.
 *
 * `d0M` e a distancia pet<->comida no instante em que a comida caiu, e `gapS`
 * quanto tempo de SLAM correu entre as duas colocacoes — a unica fonte de erro
 * que sobra quando os dois saem do mesmo plano.
 *
 * `arrivalResidualM` e o que realmente decide: a distancia que sobrou quando o
 * pet parou. Ela tem que bater com `stopRadius` (a soma das duas pegadas), que
 * e onde o pet DEVERIA parar. Sobrou muito mais que isso = ele parou ao lado da
 * comida, e e exatamente o sintoma que o SPEC descreve.
 *
 * Uma versao anterior media a FAIXA de `d` ao longo do tempo. Nao media nada: o
 * pet sai andando no mesmo frame em que a comida cai, entao a distancia muda
 * por projeto, e a faixa so registrava a caminhada.
 */
let d0M: number | null = null;
let arrivalResidualM: number | null = null;
let expectedStopM = 0;
/** Segundos entre a colocacao do pet e a da comida: quanto SLAM correu entre elas. */
let gapS = 0;
let petPlacedAtMs = 0;

/** Excursao de y do pet durante o arrasto. Deve ser ZERO por construcao. */
let dragYMin = Number.POSITIVE_INFINITY;
let dragYMax = Number.NEGATIVE_INFINITY;
let dragDistanceM = 0;

/** Laco fechado da camera: a unica medida de deriva comparavel com a linha de base. */
let mark: { x: number; z: number } | null = null;
let closedLoopM: number | null = null;
let camPetMinM = Number.POSITIVE_INFINITY;
let camPetMaxM = Number.NEGATIVE_INFINITY;

let lastPos: { x: number; z: number } | null = null;
let lastPosAtMs = 0;
let lastSpeedMps = 0;
let jumpCount = 0;
let jumpTotalM = 0;
let fps = 0;

let lastTouch = { distM: Number.NaN, incDeg: Number.NaN };

// ------------------------------------------------------------ colocacao

function isPlacementAllowed(): boolean {
  // O gate de calibracao E o modelo. Colocar antes de o GLB chegar habilita um
  // ancora vazio: o toque "funciona", nada aparece, e o jogador conclui que a
  // colocacao esta quebrada.
  return petLoaded && (trackingStatus === "NORMAL" || calibrationEscaped);
}

/**
 * Resolve o toque contra o chao digital.
 *
 * Primeiro tenta o picking do Babylon (o mecanismo que a decisao pediu).
 * `rayPlaneY` e a rede: o ground tem 40 m de lado, entao um raio bem rasante
 * sai pela borda e o `pick` devolve nada — e sem a rede o toque simplesmente
 * nao responderia, sintoma que le como "o spike travou".
 */
function pickFloor(screenX: number, screenY: number): { point: Vector3; incDeg: number } | null {
  const camera = scene.activeCamera;

  if (!camera) {
    return null;
  }

  const ray = scene.createPickingRay(screenX, screenY, null, camera);
  const inc = incidenceDeg(ray.direction);

  const pick = scene.pick(screenX, screenY, (mesh) => mesh === ground);

  if (pick?.hit && pick.pickedPoint) {
    return { point: pick.pickedPoint, incDeg: inc };
  }

  const fallback = rayPlaneY(ray.origin, ray.direction, floorNode.position.y);

  if (!fallback) {
    return null;
  }

  return { point: new Vector3(fallback.x, fallback.y, fallback.z), incDeg: inc };
}

/** Converte ponto de MUNDO para local do `floorNode`, que e onde tudo pendura. */
function toFloorLocal(worldPoint: Vector3): Vector3 {
  return new Vector3(
    worldPoint.x - floorNode.position.x,
    0,
    worldPoint.z - floorNode.position.z
  );
}

/**
 * Vira o pet para o jogador.
 *
 * Colocar um bicho no chao e ele nascer DE COSTAS foi o primeiro defeito que a
 * sessao de device de 2026-08-24 mostrou — e nao e detalhe de acabamento: o
 * rosto e a unica parte do modelo que diz "isto e um bicho, e ele reparou em
 * voce". De costas, o Kenney vira uma caixa laranja.
 *
 * A frente do modelo e o +Z LOCAL dele, o que casa com a convencao canhota
 * deste build (frente do mundo = +Z, azimute por `atan2(x, z)`) — e e a mesma
 * suposicao que a caminhada ja fazia ao virar o pet para a comida. Sem rotacao
 * nenhuma na colocacao, o +Z do pet apontava para o +Z do mundo, que e mais ou
 * menos para onde o jogador estava olhando: ou seja, para longe dele.
 */
function facePlayer(): void {
  const camera = arCamera ?? scene.activeCamera;

  if (!camera) {
    return;
  }

  petAnchor.rotation.y = yawToward(petAnchor.getAbsolutePosition(), camera.globalPosition);
}

function placePet(worldPoint: Vector3): void {
  const local = toFloorLocal(worldPoint);
  petAnchor.position.copyFrom(local);

  if (!petPlaced) {
    petPlaced = true;
    petPlacedAtMs = performance.now();
    petAnchor.setEnabled(true);
    facePlayer();
    applyScale(presetScaleFor(surface));
    petSpawnFx.scaling.setAll(1);
    playSpawnScaleIn(petSpawnFx);
    finishCoaching();
    log(`pet colocado a ${lastTouch.distM.toFixed(2)} m, incidencia ${lastTouch.incDeg.toFixed(0)}deg`);
    return;
  }

  if (walking) {
    // Caminhando, o lerp e o passo escreveriam a MESMA posicao no mesmo frame e
    // o pet ficaria vibrando entre os dois. Aqui o toque so reposiciona o
    // ponto de partida; a caminhada continua dali.
    petAnchor.position.copyFrom(local);
    moveFrom = null;
    moveTo = null;
    return;
  }

  facePlayerAfterMove = true;

  // Reposicionamento por toque: lerp curto. Teletransporte le como bug, e o
  // criterio 6 julga se o pet fica COLADO — um salto instantaneo tira a
  // referencia de contato antes de o olho conseguir julgar.
  moveFrom = { x: petAnchor.position.x, y: petAnchor.position.y, z: petAnchor.position.z };
  moveTo = { x: local.x, y: local.y, z: local.z };
  moveStartedAtMs = performance.now();
}

function placeFood(worldPoint: Vector3): void {
  const local = toFloorLocal(worldPoint);
  foodAnchor.position.copyFrom(local);
  foodAnchor.setEnabled(true);
  foodPlaced = true;
  armFood = false;
  walking = true;
  eatingUntilMs = 0;

  // O NUMERO QUE DECIDE O SPIKE. `d0` e a distancia pet<->comida no instante da
  // colocacao; `gapS` diz quanto SLAM correu entre as duas, que e a unica fonte
  // de erro que sobra quando os dois saem do mesmo plano.
  d0M = horizontalDistance(petAnchor.position, foodAnchor.position);
  expectedStopM = petFootprintM * petScale * 0.5 + FOOD_RADIUS_M;
  arrivalResidualM = null;
  gapS = (performance.now() - petPlacedAtMs) / 1000;

  el("btn-food").classList.remove("armado");
  log(`comida a ${d0M.toFixed(2)} m do pet, ${gapS.toFixed(0)}s depois dele`);
}

function applyScale(next: number): void {
  petScale = clampScale(next);
  petScaler.scaling.setAll(petScale);
}

function finishCoaching(): void {
  // O overlay reaparece por cima do jogo se o tracking degradar. Sair dele na
  // primeira colocacao e o que impede isso.
  const api = xr8();

  if (!api) {
    return;
  }

  try {
    api.removeCameraPipelineModule("coaching-overlay");
  } catch { /* ja saiu, ou nunca entrou */ }
}

// ------------------------------------------------------------ input

/**
 * Toque, arrasto e pinca em UM lugar so.
 *
 * O `onPointerObservable` do Babylon e a fonte porque ele ja entrega as
 * coordenadas em px CSS de cena (`scene.pointerX/Y`) — que e a mesma unidade que
 * o picking consome. Misturar isso com px de dispositivo (`getRenderWidth`, dpr
 * ~3 no celular) e um erro classico deste stack e daria toque tres vezes fora
 * do lugar.
 */
scene.onPointerObservable.add((info) => {
  const event = info.event as PointerEvent;

  if (info.type === PointerEventTypes.POINTERDOWN) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2 && allows("escalar") && petPlaced) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchBaseScale = petScale;
      dragging = false;
      return;
    }

    if (pointers.size !== 1 || !isPlacementAllowed()) {
      return;
    }

    const hit = pickFloor(scene.pointerX, scene.pointerY);

    if (!hit) {
      log("toque sem chao: raio saiu pela borda");
      return;
    }

    const camera = scene.activeCamera;
    lastTouch = {
      distM: camera ? Vector3.Distance(camera.globalPosition, hit.point) : Number.NaN,
      incDeg: hit.incDeg,
    };

    if (armFood && allows("comida")) {
      placeFood(hit.point);
      return;
    }

    if (!petPlaced) {
      placePet(hit.point);
      return;
    }

    if (!allows("mover")) {
      return;
    }

    if (moveMode === "arrastar") {
      // "O dedo puxa o pet" (SPEC): o arrasto so pega se comecar EM CIMA dele.
      // Sem isso, tocar longe e mover faria o pet teletransportar para o dedo —
      // que e o modo TOCAR disfarcado, e o A/B mediria a mesma coisa duas vezes.
      const grabRadiusM = Math.max(0.15, petFootprintM * petScale);

      if (horizontalDistance(toFloorLocal(hit.point), petAnchor.position) > grabRadiusM) {
        log("arrasto: comece o gesto em cima do pet");
        return;
      }

      dragging = true;
      dragYMin = Number.POSITIVE_INFINITY;
      dragYMax = Number.NEGATIVE_INFINITY;
      dragDistanceM = 0;
      return;
    }

    placePet(hit.point);
    return;
  }

  if (info.type === PointerEventTypes.POINTERMOVE) {
    if (pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (pointers.size === 2 && pinchStartDist > 0) {
      const [a, b] = [...pointers.values()];
      applyScale(pinchToScale(pinchBaseScale, pinchStartDist, Math.hypot(a.x - b.x, a.y - b.y)));
      return;
    }

    if (!dragging || !petPlaced) {
      return;
    }

    const hit = pickFloor(scene.pointerX, scene.pointerY);

    if (!hit) {
      return;
    }

    const local = toFloorLocal(hit.point);
    dragDistanceM += horizontalDistance(petAnchor.position, local);
    petAnchor.position.copyFrom(local);
    // Excursao de y do pet durante o arrasto. DEVE ser zero: o pet vive no
    // plano do `floorNode` e nada aqui escreve y. Se aparecer numero, alguem
    // esta escrevendo posicao de mundo num filho — e e isso que faz o objeto
    // flutuar ou afundar ao arrastar.
    dragYMin = Math.min(dragYMin, petAnchor.absolutePosition.y);
    dragYMax = Math.max(dragYMax, petAnchor.absolutePosition.y);
    return;
  }

  if (info.type === PointerEventTypes.POINTERUP) {
    pointers.delete(event.pointerId);

    if (pointers.size < 2) {
      pinchStartDist = 0;
    }

    if (pointers.size === 0) {
      // Soltar o pet o vira de volta para o jogador. Durante o arrasto ele NAO
      // gira: girar seguindo o dedo faz o bicho rodopiar a cada tremida da mao.
      if (dragging && petPlaced) {
        facePlayer();
      }

      dragging = false;
    }
  }
});

// ------------------------------------------------------------ simulacao

let lastFrameAtMs = performance.now();

function update(): void {
  const now = performance.now();
  const dtS = Math.min(0.1, Math.max(1e-4, (now - lastFrameAtMs) / 1000));
  lastFrameAtMs = now;

  // Lerp do reposicionamento por toque.
  if (moveFrom && moveTo) {
    const t = Math.min(1, (now - moveStartedAtMs) / MOVE_LERP_MS);
    petAnchor.position.set(
      moveFrom.x + (moveTo.x - moveFrom.x) * t,
      0,
      moveFrom.z + (moveTo.z - moveFrom.z) * t
    );

    if (t >= 1) {
      moveFrom = null;
      moveTo = null;

      if (facePlayerAfterMove) {
        facePlayerAfterMove = false;
        facePlayer();
      }
    }
  }

  // Arrastando, o dedo manda: o passo da caminhada sobrescreveria a posicao a
  // cada frame e o pet fugiria do dedo de volta para a comida.
  if (walking && petPlaced && foodPlaced && !dragging) {
    const from = { x: petAnchor.position.x, y: petAnchor.position.y, z: petAnchor.position.z };
    const to = {
      x: foodAnchor.position.x,
      y: foodAnchor.position.y,
      z: foodAnchor.position.z,
    };

    // A velocidade acompanha a escala: um pet de 45% andando a 0,35 m/s
    // atravessaria a sala em passadas de gigante.
    expectedStopM = petFootprintM * petScale * 0.5 + FOOD_RADIUS_M;

    const step = stepToward(from, to, PET_SPEED_MPS * petScale, dtS, expectedStopM);

    petAnchor.position.set(step.position.x, step.position.y, step.position.z);
    petAnchor.rotation.y = yawToward(from, to);

    if (step.arrived) {
      walking = false;
      eatingUntilMs = now + EAT_MS;
      // O numero do criterio 4, lido no unico instante em que ele significa
      // alguma coisa: onde o pet parou, contra onde deveria ter parado.
      arrivalResidualM = horizontalDistance(petAnchor.position, foodAnchor.position);
      log(`parou a ${arrivalResidualM.toFixed(3)} m (esperado ${expectedStopM.toFixed(3)} m)`);
    }
  }

  if (eatingUntilMs > 0) {
    if (now >= eatingUntilMs) {
      eatingUntilMs = 0;
      foodAnchor.setEnabled(false);
      foodPlaced = false;
      petSpawnFx.scaling.setAll(1);
      // Terminou de comer, olha de volta para quem deu — o pet fica de frente
      // para o jogador em todo estado de repouso.
      facePlayer();
      log("comeu");
    } else {
      // Batida de comer: bob de escala no no de FX, nunca no `scaler` — senao
      // ele sobrescreve a escala escolhida pelo jogador.
      const phase = Math.sin((now / EAT_MS) * Math.PI * 6);
      petSpawnFx.scaling.set(1, 1 + phase * 0.06, 1);
    }
  }

  // Deriva da camera, e detector de salto de relocalizacao em velocidade REAL.
  // Limiar por FRAME ja falhou uma vez neste projeto: 5 cm/frame vale 3 m/s a
  // 60 fps e 1,5 m/s a 30 fps, e a 30 fps ele passou a contar movimento de mao
  // como salto.
  const cam = arCamera;

  if (cam) {
    const p = cam.globalPosition;

    if (Number.isFinite(p.x)) {
      if (lastPos) {
        const dx = p.x - lastPos.x;
        const dz = p.z - lastPos.z;
        const stepM = Math.hypot(dx, dz);
        const dt = Math.max((now - lastPosAtMs) / 1000, 1e-4);
        const speed = stepM / dt;
        fps = fps === 0 ? 1 / dt : fps * 0.9 + (1 / dt) * 0.1;

        if (speed > JUMP_SPEED_MPS && lastSpeedMps < CALM_SPEED_MPS) {
          jumpCount += 1;
          jumpTotalM += stepM;
        }

        lastSpeedMps = speed;
      }

      lastPos = { x: p.x, z: p.z };
      lastPosAtMs = now;

      if (petPlaced) {
        const d = Vector3.Distance(p, petAnchor.absolutePosition);
        camPetMinM = Math.min(camPetMinM, d);
        camPetMaxM = Math.max(camPetMaxM, d);
      }
    }
  }

  // Escape do gate de calibracao.
  if (inAR && !calibrationEscaped && trackingStatus !== "NORMAL"
      && now - arEnteredAtMs > CALIBRATION_ESCAPE_MS) {
    calibrationEscaped = true;
    log("ESCAPE: 30s sem NORMAL, colocacao liberada mesmo assim");
  }
}

// ------------------------------------------------------------ HUD e gaveta

function fmt(n: number, digits = 2): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "-";
}

function show(node: HTMLElement, visible: boolean): void {
  node.classList.toggle("oculto", !visible);
}

let gavetaAberta = false;

/**
 * O estado do jogo em UMA frase, que e o que a pilula de cima mostra.
 *
 * Nao e enfeite de UX: em device, sem console, a pilula e o unico jeito de
 * saber por que um toque nao fez nada. "calibrando" e "carregando o modelo"
 * sao os dois motivos, e os dois eram invisiveis antes.
 */
function estado(): { texto: string; classe: string } {
  if (!inAR) {
    return { texto: petLoaded ? "pronto" : "carregando o modelo", classe: "" };
  }

  if (!petLoaded) {
    return { texto: "carregando o modelo", classe: "" };
  }

  if (!isPlacementAllowed()) {
    return { texto: "calibrando", classe: "ruim" };
  }

  if (eatingUntilMs > 0) {
    return { texto: "comendo", classe: "" };
  }

  if (walking && foodPlaced) {
    const falta = horizontalDistance(petAnchor.position, foodAnchor.position);
    return { texto: `indo até a comida · ${falta.toFixed(1)} m`, classe: "andando" };
  }

  if (armFood) {
    return { texto: "toque no chão para largar", classe: "andando" };
  }

  if (!petPlaced) {
    return { texto: calibrationEscaped ? "chão liberado (escape)" : "chão pronto", classe: "" };
  }

  return { texto: "pet colocado", classe: "" };
}

function dicaTexto(): string {
  if (!inAR) {
    return "Toque em ENTRAR para ligar a câmera";
  }

  if (!petLoaded) {
    return "Carregando o modelo do pet…";
  }

  if (!isPlacementAllowed()) {
    return "Mova o celular devagar, para frente e para trás";
  }

  if (armFood) {
    return "Toque no chão para largar a comida";
  }

  if (!petPlaced) {
    return "Toque no chão onde o pet deve aparecer";
  }

  if (walking) {
    return "O pet está indo até a comida";
  }

  return moveMode === "arrastar"
    ? "Arraste o pet pelo chão · pinça para redimensionar"
    : "Toque em outro ponto para mover · pinça para redimensionar";
}

function renderHud(): void {
  const atual = estado();
  ui.status.className = atual.classe;
  ui.status.innerHTML = `<span class="ponto"></span>${atual.texto}`;

  ui.dica.firstChild!.textContent = dicaTexto();

  // A barra so aparece durante a calibracao, e o que ela mede e honesto: o
  // tempo que falta para o escape liberar a colocacao a forca. Nao existe
  // "percentual de calibracao" no XR8 para mostrar.
  const calibrando = inAR && petLoaded && !isPlacementAllowed();
  show(ui.barra, calibrando);

  if (calibrando) {
    const t = Math.min(1, (performance.now() - arEnteredAtMs) / CALIBRATION_ESCAPE_MS);
    ui.barraFill.style.width = `${(t * 100).toFixed(0)}%`;
  }

  show(ui.enter, !inAR);
  show(ui.escala, petPlaced);
  show(ui.chipsEscala, petPlaced && allows("escalar"));
  show(ui.chipsAcao, petPlaced);

  ui.escala.textContent = `${(petScale * 100).toFixed(0)}%`;

  if (gavetaAberta) {
    renderGaveta();
  }
}

function renderGaveta(): void {
  const statusClass =
    trackingStatus === "NORMAL" ? "good" : trackingStatus === "LIMITED" ? "warn" : "bad";

  const dragY = Number.isFinite(dragYMax - dragYMin) ? dragYMax - dragYMin : 0;
  const dragClass = dragY > 0.005 ? "bad" : "good";

  // Parou onde a geometria manda, ou ao lado da comida? Meio centimetro de
  // folga sobre o raio de parada e ruido de passo; mais que isso e o sintoma.
  const residuoClass =
    arrivalResidualM === null ? "dim"
      : arrivalResidualM - expectedStopM > 0.005 ? "bad"
        : "good";

  ui.metricas.innerHTML =
    `<b>tracking</b> <span class="${statusClass}">${trackingStatus}</span>` +
    (calibrationEscaped ? `  <span class="warn">escape usado</span>` : "") +
    (only ? `  <span class="warn">?only=${only}</span>` : "") + `\n` +
    `<b>chao y</b> ${fmt(floorNode.position.y)} m` +
    `  <b>escala</b> ${(petScale * 100).toFixed(0)}% (${surface})` +
    `  <b>modo</b> ${moveMode}\n` +
    `<b>pet</b> ${petPlaced ? `${fmt(petAnchor.position.x)} , ${fmt(petAnchor.position.z)}` : "(nao colocado)"}` +
    `  altura ${(PET_REAL_HEIGHT_M * petScale * 100).toFixed(0)} cm\n` +
    `\n` +
    `<b>4 COERENCIA</b> d0 ${d0M === null ? "-" : `${fmt(d0M)} m`}  gap ${fmt(gapS, 0)}s\n` +
    `<b>  parou a</b>  <span class="${residuoClass}">` +
    `${arrivalResidualM === null ? "(largue a comida e espere)" : `${fmt(arrivalResidualM, 3)} m`}</span>` +
    `  esperado ${fmt(expectedStopM, 3)} m\n` +
    `<b>1/2/3 cam-pet</b> ${fmt(camPetMinM)} .. ${fmt(camPetMaxM)} m` +
    `  amplitude ${fmt(camPetMaxM - camPetMinM)} m\n` +
    `<b>6 ARRASTO</b> y <span class="${dragClass}">${fmt(dragY, 3)} m</span>` +
    `  percorrido ${fmt(dragDistanceM)} m\n` +
    `<b>DERIVA REAL</b> ${closedLoopM === null ? "(marque e volte ao ponto)" : `${fmt(closedLoopM)} m`}` +
    `  <span class="dim">(base: 0,075 m)</span>\n` +
    `<b>saltos SLAM</b> ${jumpCount} (${fmt(jumpTotalM)} m)  <b>fps</b> ${fmt(fps, 0)}\n` +
    `<b>ultimo toque</b> ${fmt(lastTouch.distM)} m, inc ${fmt(lastTouch.incDeg, 0)}deg` +
    (lastTouch.incDeg < 12 ? ` <span class="warn">RASANTE</span>` : "") + `\n` +
    `\n` +
    `<b>log</b>\n${logLines.map((l) => `  ${l}`).join("\n") || "  (vazio)"}`;
}

/**
 * Uma excecao aqui rodaria ANTES do `runRender` do 8th Wall (que o behavior
 * registra depois) e mataria o desenho do feed — exatamente o sintoma de tela
 * preta. O try/catch garante que painel e simulacao nunca derrubem o render.
 */
scene.onBeforeRenderObservable.add(() => {
  try {
    update();
    renderHud();
  } catch (error) {
    log(`LOOP ${String(error).slice(0, 110)}`);
  }
});

// ------------------------------------------------------------ RA

interface SpikeXr8 {
  Babylonjs: { xrCameraBehavior: (config?: unknown, xrConfig?: unknown) => never };
  XrConfig: { camera: () => { BACK: unknown } };
  XrController: { configure: (config: Record<string, unknown>) => void };
  addCameraPipelineModule: (module: Record<string, unknown>) => void;
  removeCameraPipelineModule: (name: string) => void;
}

function xr8(): SpikeXr8 | null {
  return (window as unknown as { XR8?: SpikeXr8 }).XR8 ?? null;
}

/**
 * Carrega o engine DEPOIS de instalar `window.BABYLON`.
 *
 * No bundle, `XR8.Babylonjs` sai de `mQ()`, chamada na CONSTRUCAO do namespace,
 * e a fabrica so cria os temporarios internos se `window.BABYLON` ja existir
 * naquele instante. Sem ele, o ramo destro do conversor de quaternion estoura
 * para sempre — e a cena canhota esconde o defeito ate alguem ligar
 * `useRightHandedSystem` e ver tela preta.
 */
function loadEngine(): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as { XR8?: unknown };

    if (w.XR8) {
      log("xr.js ja carregado — ORDEM NAO GARANTIDA");
      resolve();
      return;
    }

    installBabylonGlobalsForXR8();
    log("BABYLON instalado ANTES do xr.js");

    const settle = () => {
      log("engine pronto");
      resolve();
    };

    window.addEventListener("xrloaded", settle, { once: true });

    const tag = document.createElement("script");
    tag.src = "/8thwall/xr.js";
    tag.crossOrigin = "anonymous";
    tag.setAttribute("data-preload-chunks", "slam");
    tag.addEventListener("load", () => { if (w.XR8) settle(); });
    tag.addEventListener("error", () => reject(new Error("falha ao carregar /8thwall/xr.js")));
    document.head.appendChild(tag);
  });
}

function statusModule(): Record<string, unknown> {
  return {
    name: "pet-sandbox-status",
    onStart: () => log("onStart"),
    onCameraStatusChange: (event: { status?: string }) => log(`camera ${event?.status}`),
    onException: (error: unknown) => {
      const err = error as { message?: string } | undefined;
      log(`EXCECAO ${String(err?.message ?? error).slice(0, 110)}`);
    },
    onUpdate: (event: { processCpuResult?: { reality?: { trackingStatus?: string } } }) => {
      trackingStatus = event?.processCpuResult?.reality?.trackingStatus ?? "-";
    },
  };
}

async function enterAR(): Promise<void> {
  const api = xr8();

  if (!api || inAR) {
    return;
  }

  // iOS exige gesto do usuario para os sensores de movimento.
  const motion = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };

  if (typeof motion?.requestPermission === "function") {
    try { await motion.requestPermission(); } catch { /* segue sem */ }
  }

  api.XrController.configure({ scale: "absolute" });
  api.addCameraPipelineModule(statusModule());

  const overlay = (window as unknown as {
    CoachingOverlay?: {
      configure: (p: Record<string, string>) => void;
      pipelineModule: () => { name?: string };
    };
  }).CoachingOverlay;

  if (skipOverlay) {
    log("overlay PULADO (?nooverlay=1)");
  } else if (overlay) {
    // `configure` ANTES de `pipelineModule()`: o bundle traz dois modulos, e o
    // do ceu le um campo que world tracking nao tem.
    overlay.configure({
      promptText: "Mova o celular para frente e para tras",
      promptColor: "#f8fafc",
      animationColor: "#22c55e",
    });
    api.addCameraPipelineModule(overlay.pipelineModule() as unknown as Record<string, unknown>);
    log("overlay anexado");
  } else {
    log("overlay AUSENTE");
  }

  // A posicao ANTES do attach e o que o `babylonjsrenderer` le para declarar a
  // origem do mundo — o engine sobrescreve o `y` para 1 m em escala absoluta,
  // e e dai que sai o desalinhamento que os botoes de chao corrigem.
  arCamera = new FreeCamera("ar-cam", new Vector3(0, CAMERA_START_HEIGHT_M, 0), scene);
  arCamera.minZ = 0.01;
  arCamera.maxZ = 1000;
  scene.activeCamera = arCamera;

  arCamera.addBehavior(api.Babylonjs.xrCameraBehavior({
    cameraConfig: { direction: api.XrConfig.camera().BACK },
  }), true);
  log("behavior anexado");

  previewCamera.setEnabled(false);

  inAR = true;
  arEnteredAtMs = performance.now();
}

// ------------------------------------------------------------ botoes

function on(id: string, handler: () => void): void {
  document.getElementById(id)?.addEventListener("click", handler);
}

on("btn-enter", () => { void enterAR(); });

on("btn-floor-down", () => { floorNode.position.y -= FLOOR_STEP_M; });
on("btn-floor-up", () => { floorNode.position.y += FLOOR_STEP_M; });

on("btn-debug", () => {
  gavetaAberta = true;
  show(ui.gaveta, true);
  renderGaveta();
});

on("btn-fechar", () => {
  gavetaAberta = false;
  show(ui.gaveta, false);
});

/** Marca qual preset esta valendo. O chip aceso e a resposta do criterio 7. */
function refreshChips(): void {
  el("btn-mesa").classList.toggle("ativo", surface === "mesa" && petScale === presetScaleFor("mesa"));
  el("btn-chao").classList.toggle("ativo", surface === "chao" && petScale === presetScaleFor("chao"));
  el("btn-mode").classList.toggle("ativo", moveMode === "arrastar");
  el("btn-mode").textContent = `mover: ${moveMode}`;
}

on("btn-mode", () => {
  moveMode = moveMode === "tocar" ? "arrastar" : "tocar";
  refreshChips();
});

on("btn-mesa", () => { surface = "mesa"; applyScale(presetScaleFor(surface)); refreshChips(); });
on("btn-chao", () => { surface = "chao"; applyScale(presetScaleFor(surface)); refreshChips(); });
on("btn-real", () => { surface = "chao"; applyScale(1); refreshChips(); });

on("btn-food", () => {
  if (!petPlaced) {
    log("coloque o pet primeiro");
    return;
  }

  armFood = true;
  el("btn-food").classList.add("armado");
  log("toque no chao para largar a comida");
});

on("btn-mark", () => {
  const cam = arCamera;

  if (!cam) {
    return;
  }

  const p = cam.globalPosition;
  mark = { x: p.x, z: p.z };
  closedLoopM = null;
  log("marcado");
});

on("btn-back", () => {
  const cam = arCamera;

  if (!cam || !mark) {
    return;
  }

  const p = cam.globalPosition;

  if (!Number.isFinite(p.x)) {
    return;
  }

  // So este numero e deriva. A distancia ate um ponto marcado, lida a qualquer
  // instante, mistura deriva com o passo real do jogador e com o circulo que o
  // celular percorre quando a pessoa pivota.
  closedLoopM = Math.hypot(p.x - mark.x, p.z - mark.z);
  log(`DERIVA REAL ${closedLoopM.toFixed(2)} m`);
});

on("btn-reset", () => {
  mark = null;
  closedLoopM = null;
  camPetMinM = Number.POSITIVE_INFINITY;
  camPetMaxM = Number.NEGATIVE_INFINITY;
  dragYMin = Number.POSITIVE_INFINITY;
  dragYMax = Number.NEGATIVE_INFINITY;
  dragDistanceM = 0;
  jumpCount = 0;
  jumpTotalM = 0;
  lastPos = null;
  lastSpeedMps = 0;

});

// ------------------------------------------------------------ boot

refreshChips();

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

void loadPet().catch((error) => log(`PET ${String(error).slice(0, 100)}`));
void loadEngine().catch((error) => log(`ENGINE ${String(error).slice(0, 100)}`));
