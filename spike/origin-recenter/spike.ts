/**
 * SPIKE DESCARTAVEL — Etapa F1 do plano de fundacao de RA.
 *
 * Nao importa nada de producao alem de `installBabylonGlobalsForXR8`, e nada em
 * `src/` importa daqui. O objetivo e responder QUATRO perguntas em UMA sessao
 * de device, antes de refatorar 1579 linhas do `EighthWallARManager` em cima de
 * suposicao:
 *
 *  Q1. Declarar `origin.y` = altura do jogador coloca o piso em y = 0?
 *      -> Os aneis desenhados em y = 0 assentam no chao real?
 *      -> `camera.y` fica perto da altura declarada com a pessoa de pe?
 *
 *  Q2. `recenter()` aplica so yaw, ou inclina o mundo pelo pitch do celular?
 *      -> Chamar RECENTER com o celular inclinado ~30 graus para baixo e ver se
 *         o PRUMO (linha vertical no centro) continua vertical.
 *
 *  Q3. `recenter()` descarta o mapa do SLAM?
 *      -> Rodada A: varrer, MARCAR, girar 360 parado, ler o desvio maximo.
 *      -> Rodada B: varrer, RECENTER, MARCAR, girar 360 parado, ler de novo.
 *      -> Se B for muito pior que A, o recenter joga o mapa fora e a varredura
 *         da F5 tem que vir DEPOIS do gesto, nao antes.
 *
 *  Q4. `camera.y` serve como sensor de deriva?
 *      -> De pe e parado, a mediana de `camera.y` fica estavel perto da altura
 *         declarada? Agachando, ela acompanha o movimento fisico?
 *
 * BONUS — lateralidade. `src/ar/arenaHeading.ts` exige cena DESTRA e afirma que
 * `src/main.ts` liga `useRightHandedSystem`; a linha nao existe no projeto. Aqui
 * ela existe, e da para forcar o oposto com `?lh=1` para ver o espelhamento.
 */

import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";

import { installBabylonGlobalsForXR8 } from "../../src/ar/babylonRuntimeGlobals";

/** Raio do arco da v3. Os aneis usam esta escala para o julgamento ser o real. */
const ARENA_RADIUS_M = 2.2;
const RING_RADII_M = [0.5, 1.0, 1.5, ARENA_RADIUS_M];
const DEFAULT_HEIGHT_M = 1.55;
const HEIGHT_STEP_M = 0.05;
/** Janela da mediana de `camera.y` (Q4). Curta o bastante para ver agachar. */
const MEDIAN_WINDOW_MS = 2000;

const RAD_TO_DEG = 180 / Math.PI;
/**
 * VELOCIDADE acima da qual o deslocamento nao e movimento fisico de mao.
 *
 * A primeira versao disto usava limiar por FRAME (5 cm), e nao funcionou: 5
 * cm/frame so vale 3 m/s se o loop estiver a 60 fps, e o painel reescrevendo
 * innerHTML junto com o SLAM derruba a taxa. A 30 fps o mesmo limiar vira 1,5
 * m/s, que a mao faz sem esforco — e o estimador passou a contar movimento
 * real como salto. Medido em device (2026-08-19): EST media 0,155 m contra
 * REAL 0,082 m, com correlacao levemente NEGATIVA entre os dois.
 *
 * Com `dt` real o limiar deixa de depender de frame rate.
 */
const JUMP_SPEED_MPS = 4;
/**
 * Salto de relocalizacao e descontinuidade de UM frame; movimento de mao e
 * sustentado. Exigir que o frame anterior estivesse lento separa os dois.
 */
const CALM_SPEED_MPS = 1.5;

// A tipagem de producao (`src/types/xr8.d.ts`) nao declara
// `updateCameraProjectionMatrix` — e justamente o buraco que o spike investiga.
// Fica local para nao contaminar o contrato de producao antes da F2.
interface SpikeXr8 {
  Babylonjs: { xrCameraBehavior: (config?: unknown, xrConfig?: unknown) => never };
  XrConfig: { camera: () => { BACK: unknown } };
  XrController: {
    configure: (config: Record<string, unknown>) => void;
    recenter: () => void;
    updateCameraProjectionMatrix: (params: {
      cam?: Record<string, number>;
      facing?: { w: number; x: number; y: number; z: number };
      origin?: { x: number; y: number; z: number };
      updateRecenterPoint?: boolean;
    }) => void;
  };
  addCameraPipelineModule: (module: Record<string, unknown>) => void;
}

/**
 * Carrega o engine DEPOIS de instalar `window.BABYLON`.
 *
 * Esta ordem nao e detalhe: no bundle, `XR8.Babylonjs` sai de `mQ()`, chamada
 * na construcao do namespace (`Babylonjs: mQ()`), e a primeira coisa que ela
 * faz e
 *
 *     let A, g, I
 *     window.BABYLON && (A = new BABYLON.Matrix, g = new BABYLON.Quaternion,
 *                        I = new BABYLON.Vector3)
 *
 * Sem `window.BABYLON` naquele instante, `g` e `I` ficam `undefined` para
 * sempre. O ramo DESTRO do conversor de quaternion usa os dois
 * (`g.copyFrom(A)`) e estoura; o ramo canhoto nao toca neles. E por isso que a
 * producao, canhota, nunca viu este bug — e por isso que ligar
 * `useRightHandedSystem` sem consertar a ordem da tela preta.
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

const params = new URLSearchParams(window.location.search);
/**
 * CANHOTA e o padrao, confirmado em device (2026-08-19): o ramo DESTRO do
 * modulo Babylon deste build produz quaternion NaN e a pose morre — nada
 * projeta. Canhoto e tambem o default do Babylon e o que a producao ja roda.
 * `?rh=1` ainda entra no caminho destro, so para reproduzir o defeito.
 */
const forceRightHanded = params.get("rh") === "1";
/** `?nooverlay=1` sobe a sessao SEM o coaching overlay, para isolar a excecao. */
const skipOverlay = params.get("nooverlay") === "1";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const panel = document.getElementById("panel") as HTMLDivElement;

/**
 * Celular nao tem console acessivel: todo evento de ciclo de vida e toda
 * excecao vao para a tela. Sem isso, "canvas preto" e um beco sem saida.
 */
const logLines: string[] = [];

function log(message: string): void {
  logLines.push(`${(performance.now() / 1000).toFixed(1)}s ${message}`);
  while (logLines.length > 14) logLines.shift();
}

window.addEventListener("error", (e) => log(`ERRO ${e.message}`));
window.addEventListener("securitypolicyviolation", (e) => log(`CSP ${e.blockedURI}`));
window.addEventListener("unhandledrejection", (e) => log(`REJEICAO ${String(e.reason).slice(0, 80)}`));

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0, 0, 0, 1);
// A LINHA QUE FALTA EM PRODUCAO. `arenaHeading` mede azimute a partir do -Z,
// positivo para a direita, e isso so fecha numa cena destra.
scene.useRightHandedSystem = forceRightHanded;

function unlit(name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.emissiveColor = color;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  return material;
}

function marker(name: string, position: Vector3, color: Color3, size: number): Mesh {
  const box = CreateBox(name, { size }, scene);
  box.position.copyFrom(position);
  box.material = unlit(`${name}-mat`, color);
  return box;
}

/**
 * Aneis concentricos em y = 0. Sao a prova visual de Q1: se o piso declarado
 * estiver certo, eles pousam no chao real; se a altura estiver errada, flutuam
 * ou afundam por igual.
 */
function buildFloorRings(): void {
  for (const radius of RING_RADII_M) {
    const points: Vector3[] = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      points.push(new Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const ring = CreateLines(`ring-${radius}`, { points }, scene);
    ring.color = radius === ARENA_RADIUS_M ? new Color3(1, 0.85, 0.2) : new Color3(0.35, 0.55, 0.8);
  }
}

/**
 * Prumo: 1 m vertical na origem, mais um "T" no topo. E o detector de Q2 — se
 * `recenter()` levar o pitch do celular junto, esta linha deixa de ser vertical
 * contra o mundo real.
 */
/**
 * Totens verticais no anel — e nao linhas no chao.
 *
 * Medido em device (2026-08-19): com o celular na HORIZONTAL, os aneis deitados
 * a 2,2 m sao vistos em incidencia rasante, perto do horizonte, e ali a
 * projecao AMPLIFICA qualquer erro de pose. A mesma deriva que quase nao
 * aparece olhando para baixo vira escorregao gritante olhando de raspao. Linha
 * fina no chao esticando ate o horizonte e o pior alvo possivel para julgar
 * ancoragem.
 *
 * Um totem vertical resolve porque voce julga a posicao pelo PE dele contra o
 * piso real logo abaixo — angulo favoravel, erro nao amplificado — e nao por
 * uma linha que foge para o infinito.
 */
function buildTotems(): void {
  for (const deg of [0, 90, 180, 270]) {
    const a = (deg * Math.PI) / 180;
    const x = Math.sin(a) * ARENA_RADIUS_M;
    const z = Math.cos(a) * ARENA_RADIUS_M;

    // Mastro de 1,5 m: altura de peito de quem esta de pe, entao entra no
    // quadro com o celular nivelado.
    const mast = CreateBox(`totem-${deg}`, { width: 0.06, height: 1.5, depth: 0.06 }, scene);
    mast.position.set(x, 0.75, z);
    mast.material = unlit(`totem-mat-${deg}`, new Color3(0.25, 0.95, 0.85));

    // Pe do totem: e ISTO que se compara com o piso real para julgar deriva.
    const foot = CreateBox(`pe-${deg}`, { width: 0.24, height: 0.02, depth: 0.24 }, scene);
    foot.position.set(x, 0.01, z);
    foot.material = unlit(`pe-mat-${deg}`, new Color3(1, 0.95, 0.3));
  }
}

function buildPlumbLine(): void {
  const pole = CreateLines("prumo", {
    points: [new Vector3(0, 0, 0), new Vector3(0, 1, 0)],
  }, scene);
  pole.color = new Color3(1, 1, 1);

  const cross = CreateLines("prumo-t", {
    points: [new Vector3(-0.15, 1, 0), new Vector3(0.15, 1, 0)],
  }, scene);
  cross.color = new Color3(1, 1, 1);
}

/**
 * Convencao de `arenaHeading`: frente = -Z, direita = +X, cena destra.
 * Se a lateralidade estiver errada, o cubo VERDE aparece a esquerda.
 */
function buildHeadingMarkers(): void {
  // +Z, nao -Z. `arenaHeading` usa `atan2(x, -z)` (frente = -Z, convencao
  // DESTRA); no runtime canhoto a frente e +Z, e o device confirmou pondo o
  // cubo azul nas costas do jogador. A convencao certa aqui e `atan2(x, z)`.
  marker("azimute-0", new Vector3(0, 0.12, ARENA_RADIUS_M), new Color3(0.4, 0.7, 1), 0.24);
  marker("direita", new Vector3(1.2, 0.12, 0), new Color3(0.3, 1, 0.4), 0.18);
  marker("esquerda", new Vector3(-1.2, 0.12, 0), new Color3(1, 0.35, 0.35), 0.18);
}

buildFloorRings();
buildPlumbLine();
buildTotems();
buildHeadingMarkers();

/**
 * Camera de pre-visualizacao, antes da RA. Existe por dois motivos: a producao
 * nunca deixa a cena sem `activeCamera` (e `scene.render()` sem camera so
 * reclama), e ela e o DISCRIMINADOR do canvas preto — se os aneis nao
 * aparecerem aqui, o problema e a cena, nao o 8th Wall.
 */
const previewCamera = new FreeCamera("preview", new Vector3(0, DEFAULT_HEIGHT_M, 3), scene);
previewCamera.setTarget(new Vector3(0, 0, 0));
previewCamera.minZ = 0.01;
previewCamera.maxZ = 1000;
scene.activeCamera = previewCamera;

// ---------------------------------------------------------------- estado

let declaredHeightM = DEFAULT_HEIGHT_M;
let trackingStatus = "-";
let inAR = false;
let arCamera: FreeCamera | null = null;

/** Amostras recentes de `camera.y` para a mediana de Q4. */
const heightSamples: { t: number; y: number }[] = [];
/** Ponto fisico marcado pelo jogador; a base da medicao de deriva de Q3. */
let mark: { x: number; z: number } | null = null;
let driftMaxM = 0;
/** Excursao de `camera.y` desde a marca — o numero que Q4 pede. */
let heightMinM = Number.POSITIVE_INFINITY;
let heightMaxM = Number.NEGATIVE_INFINITY;
/** A marca cai sozinha no primeiro NORMAL: ninguem precisa lembrar do botao. */
let autoMarked = false;
/**
 * Residuo de laco fechado: o jogador volta FISICAMENTE ao ponto marcado e
 * aperta o botao. So esse numero e deriva — `driftMaxM` mistura deriva com o
 * circulo que o celular percorre quando voce pivota e com passo real.
 */
let closedLoopM: number | null = null;
/** Ultima posicao vista, para detectar descontinuidade entre frames. */
let lastPos: { x: number; z: number } | null = null;
let lastPosAtMs = 0;
/** Velocidade do frame anterior: um salto real vem precedido de calmaria. */
let lastSpeedMps = 0;
/** Taxa de quadros observada — o limiar antigo dependia dela sem saber. */
let fps = 0;
/** Soma VETORIAL dos saltos: a estimativa de deriva acumulada. */
let jumpNetX = 0;
let jumpNetZ = 0;
/** Soma ESCALAR e contagem: quanto o SLAM se mexeu no total, e quantas vezes. */
let jumpTotalM = 0;
let jumpCount = 0;
let recenterCount = 0;
let lastRecenterAtMs: number | null = null;

function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function xr8(): SpikeXr8 | null {
  return (window as unknown as { XR8?: SpikeXr8 }).XR8 ?? null;
}

// ---------------------------------------------------------------- painel

function fmt(n: number | string, digits = 2): string {
  if (typeof n === "string") return n;
  return Number.isFinite(n) ? n.toFixed(digits) : "-";
}

function render(): void {
  const cam = arCamera;
  const now = performance.now();

  let x = Number.NaN, y = Number.NaN, z = Number.NaN;
  let pitch = Number.NaN, yaw = Number.NaN, roll = Number.NaN;
  // `position` e `rotationQuaternion` sao o que o engine escreve DIRETO; se o
  // NaN aparece aqui, ele veio do modulo Babylon, nao do nosso calculo.
  let rawPos = "-", rawQuat = "-";

  if (cam) {
    const raw = cam.position;
    rawPos = `${raw.x.toFixed(2)},${raw.y.toFixed(2)},${raw.z.toFixed(2)}`;
    const rq = cam.rotationQuaternion;
    rawQuat = rq
      ? `${rq.w.toFixed(2)},${rq.x.toFixed(2)},${rq.y.toFixed(2)},${rq.z.toFixed(2)}`
      : "NULO";

    const p = cam.globalPosition;
    x = p.x; y = p.y; z = p.z;

    const q = cam.rotationQuaternion;
    if (q) {
      const e = q.toEulerAngles();
      pitch = e.x * RAD_TO_DEG;
      yaw = e.y * RAD_TO_DEG;
      roll = e.z * RAD_TO_DEG;
    }

    if (Number.isFinite(y)) {
      heightSamples.push({ t: now, y });
      while (heightSamples.length && now - heightSamples[0].t > MEDIAN_WINDOW_MS) {
        heightSamples.shift();
      }
    }

    if (!autoMarked && trackingStatus === "NORMAL" && Number.isFinite(x)) {
      mark = { x, z };
      driftMaxM = 0;
      heightMinM = Number.POSITIVE_INFINITY;
      heightMaxM = Number.NEGATIVE_INFINITY;
      autoMarked = true;
      log("marca AUTOMATICA no primeiro NORMAL");
    }

    // Detector de salto, agora em velocidade real.
    if (lastPos && Number.isFinite(x)) {
      const dtS = Math.max((now - lastPosAtMs) / 1000, 1e-4);
      const dx = x - lastPos.x;
      const dz = z - lastPos.z;
      const step = Math.hypot(dx, dz);
      const speed = step / dtS;

      fps = fps === 0 ? 1 / dtS : fps * 0.9 + (1 / dtS) * 0.1;

      // Salto = pico isolado. Rapido AGORA, calmo no frame anterior.
      if (speed > JUMP_SPEED_MPS && lastSpeedMps < CALM_SPEED_MPS) {
        jumpNetX += dx;
        jumpNetZ += dz;
        jumpTotalM += step;
        jumpCount += 1;
      }

      lastSpeedMps = speed;
    }

    if (Number.isFinite(x)) {
      lastPos = { x, z };
      lastPosAtMs = now;
    }

    if (mark) {
      const d = Math.hypot(x - mark.x, z - mark.z);
      if (d > driftMaxM) driftMaxM = d;
      if (y < heightMinM) heightMinM = y;
      if (y > heightMaxM) heightMaxM = y;
    }
  }

  const jumpEstimateM = Math.hypot(jumpNetX, jumpNetZ);
  const medianY = median(heightSamples.map((s) => s.y));
  const deltaY = medianY - declaredHeightM;
  const drift = mark && cam ? Math.hypot(x - mark.x, z - mark.z) : Number.NaN;

  const statusClass =
    trackingStatus === "NORMAL" ? "good" : trackingStatus === "LIMITED" ? "warn" : "bad";
  const driftClass = driftMaxM > 0.5 ? "bad" : driftMaxM > 0.2 ? "warn" : "good";

  panel.innerHTML =
    `<b>tracking</b> <span class="${statusClass}">${trackingStatus}</span>` +
    `   <b>cena</b> ${scene.useRightHandedSystem ? "DESTRA (?rh=1 — QUEBRADA)" : "CANHOTA"}\n` +
    `<b>altura declarada</b> ${fmt(declaredHeightM)} m` +
    `   <b>recenters</b> ${recenterCount}` +
    (lastRecenterAtMs ? ` (ha ${fmt((now - lastRecenterAtMs) / 1000, 0)}s)` : "") + `\n` +
    `\n` +
    `<b>Q1/Q4 camera.y</b>  agora ${fmt(y)}  mediana ${fmt(medianY)}  delta ${fmt(deltaY)} m\n` +
    `<b>Q2 pitch/roll</b>   ${fmt(pitch, 1)}° / ${fmt(roll, 1)}°   yaw ${fmt(yaw, 1)}°\n` +
    `<b>Q3 deriva XZ</b>    agora ${fmt(drift)}  <span class="${driftClass}">max ${fmt(driftMaxM)} m</span>\n` +
    `<b>Q4 faixa de y</b>   ${fmt(heightMinM)} .. ${fmt(heightMaxM)}` +
    `  amplitude ${fmt(heightMaxM - heightMinM)} m\n` +
    `<b>DERIVA REAL</b>     ${closedLoopM === null ? "(volte ao ponto e toque)" : `${fmt(closedLoopM)} m`}\n` +
    `<b>ESTIMADA</b>        ${fmt(jumpEstimateM)} m` +
    `   (${jumpCount} saltos, ${fmt(jumpTotalM)} m total, ${fmt(fps, 0)} fps)\n` +
    `<b>pose crua</b>      pos ${fmt(rawPos)}   quat ${fmt(rawQuat)}\n` +
    `<b>camera XZ</b>       ${fmt(x)} , ${fmt(z)}` +
    (mark ? `   marca ${fmt(mark.x)} , ${fmt(mark.z)}` : "   (sem marca)") + `\n` +
    `\n` +
    `De frente para o cubo AZUL, o VERDE deve estar a sua DIREITA.\n` +
    `Julgue a deriva pelo PE AMARELO dos totens, nao pelos aneis.\n` +
    `\n` +
    `<b>canvas</b> css ${canvas.clientWidth}x${canvas.clientHeight}` +
    `  render ${engine.getRenderWidth()}x${engine.getRenderHeight()}` +
    `  <b>XR8</b> ${xr8() ? "ok" : "AUSENTE"}\n` +
    `<b>log</b>\n${logLines.map((l) => `  ${l}`).join("\n") || "  (vazio)"}`;
}

// Uma excecao aqui rodaria ANTES do `runRender` do 8th Wall (que o behavior
// registra depois) e mataria o desenho do feed — exatamente o sintoma de tela
// preta. O try/catch garante que o painel nunca derrube o loop de render.
scene.onBeforeRenderObservable.add(() => {
  try {
    render();
  } catch (error) {
    log(`RENDER ${String(error).slice(0, 110)}`);
  }
});

// ---------------------------------------------------------------- RA

function statusModule(): Record<string, unknown> {
  return {
    name: "spike-status",
    onAttach: (event: { canvasWidth?: number; canvasHeight?: number }) => {
      log(`onAttach canvas ${event?.canvasWidth}x${event?.canvasHeight}`);
    },
    onStart: () => log("onStart"),
    onCameraStatusChange: (event: { status?: string }) => log(`camera ${event?.status}`),
    onVideoSizeChange: (event: { videoWidth?: number; videoHeight?: number }) => {
      log(`video ${event?.videoWidth}x${event?.videoHeight}`);
    },
    onException: (error: unknown) => {
      const err = error as { message?: string; stack?: string } | undefined;
      const frame = err?.stack?.split("\n")[1]?.trim().slice(0, 60) ?? "";
      log(`EXCECAO ${String(err?.message ?? error).slice(0, 110)}`);
      if (frame) log(`   em ${frame}`);
    },
    onUpdate: (event: {
      processCpuResult?: { reality?: { trackingStatus?: string } };
    }) => {
      trackingStatus = event?.processCpuResult?.reality?.trackingStatus ?? "-";
    },
  };
}

/**
 * Redeclara a origem da camera. E o coracao de Q1: em producao isso hoje so
 * acontece implicitamente, quando o `xrCameraBehavior` le a posicao da camera
 * no attach. Aqui e explicito, como no exemplo oficial do three.js.
 */
function applyOrigin(updateRecenterPoint: boolean): void {
  const api = xr8();
  if (!api || !arCamera) return;

  const p = arCamera.globalPosition;

  // Blindagem: `origin` nao-finito contamina o frame do engine de forma
  // permanente — nao existe caminho de volta sem reiniciar a sessao.
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) {
    log(`applyOrigin RECUSADO: pos nao-finita (${p.x}, ${p.z})`);
    return;
  }

  api.XrController.updateCameraProjectionMatrix({
    origin: { x: p.x, y: declaredHeightM, z: p.z },
    updateRecenterPoint,
  });
  log(`origin y=${declaredHeightM.toFixed(2)}`);
}

async function enterAR(): Promise<void> {
  const api = xr8();
  if (!api || inAR) return;

  // iOS exige gesto do usuario para os sensores de movimento.
  const motion = (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> });
  if (typeof motion?.requestPermission === "function") {
    try { await motion.requestPermission(); } catch { /* segue sem */ }
  }

  const probe = api as unknown as Record<string, unknown>;
  const ctrl = (probe.XrController ?? {}) as Record<string, unknown>;
  log(
    `XR8: slam=${typeof ctrl.hitTest === "function" ? "ok" : "FALTA"}` +
    ` recenter=${typeof ctrl.recenter === "function" ? "ok" : "FALTA"}` +
    ` glTex=${probe.GlTextureRenderer ? "ok" : "FALTA"}` +
    ` run=${typeof probe.run === "function" ? "ok" : "FALTA"}`
  );
  log("enterAR: inicio");
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
    // A producao chama `configure` ANTES de `pipelineModule()`; o spike nao
    // chamava. O bundle traz dois modulos (`coaching-overlay` de escala
    // absoluta e `sky-coaching-overlay`), e o do ceu le
    // `processCpuResult.layerscontroller` no `onUpdate` — ausente em world
    // tracking. Logar o nome resolve qual dos dois veio.
    overlay.configure({
      promptText: "Mova o celular para frente e para tras",
      promptColor: "#f8fafc",
      animationColor: "#22c55e",
    });
    const mod = overlay.pipelineModule();
    api.addCameraPipelineModule(mod as unknown as Record<string, unknown>);
    log(`overlay anexado: ${mod?.name ?? "sem nome"}`);
  } else {
    log("overlay AUSENTE");
  }

  // A posicao ANTES do attach e o que o `babylonjsrenderer` le para declarar a
  // origem do mundo. Piso em y = 0 nasce daqui.
  arCamera = new FreeCamera("spike-cam", new Vector3(0, declaredHeightM, 0), scene);
  arCamera.minZ = 0.01;
  arCamera.maxZ = 1000;
  scene.activeCamera = arCamera;

  const behavior = api.Babylonjs.xrCameraBehavior({
    cameraConfig: { direction: api.XrConfig.camera().BACK },
  });
  arCamera.addBehavior(behavior, true);
  log("behavior anexado");

  // A camera de preview some: quem manda na sessao e a de RA.
  previewCamera.setEnabled(false);

  inAR = true;
  (document.getElementById("btn-enter") as HTMLButtonElement).textContent = "RA ATIVA";
}

// ---------------------------------------------------------------- botoes

function on(id: string, handler: () => void): void {
  document.getElementById(id)?.addEventListener("click", handler);
}

on("btn-enter", () => { void enterAR(); });

on("btn-h-plus", () => {
  declaredHeightM = Math.min(2.05, declaredHeightM + HEIGHT_STEP_M);
  applyOrigin(true);
});

on("btn-h-minus", () => {
  declaredHeightM = Math.max(1.3, declaredHeightM - HEIGHT_STEP_M);
  applyOrigin(true);
});

on("btn-mark", () => {
  if (!arCamera) return;
  const p = arCamera.globalPosition;
  mark = { x: p.x, z: p.z };
  driftMaxM = 0;
  heightMinM = Number.POSITIVE_INFINITY;
  heightMaxM = Number.NEGATIVE_INFINITY;
  autoMarked = true;
});

on("btn-back", () => {
  if (!arCamera || !mark) return;
  const p = arCamera.globalPosition;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
  closedLoopM = Math.hypot(p.x - mark.x, p.z - mark.z);
  const est = Math.hypot(jumpNetX, jumpNetZ);
  log(`REAL ${closedLoopM.toFixed(2)} m vs ESTIMADA ${est.toFixed(2)} m (${jumpCount} saltos)`);
});

on("btn-recenter", () => {
  const api = xr8();
  if (!api) return;
  api.XrController.recenter();
  recenterCount += 1;
  lastRecenterAtMs = performance.now();
});

on("btn-reset", () => {
  mark = null;
  driftMaxM = 0;
  autoMarked = false;
  closedLoopM = null;
  jumpNetX = 0;
  jumpNetZ = 0;
  jumpTotalM = 0;
  jumpCount = 0;
  lastPos = null;
  lastSpeedMps = 0;
  heightMinM = Number.POSITIVE_INFINITY;
  heightMaxM = Number.NEGATIVE_INFINITY;
  heightSamples.length = 0;
  recenterCount = 0;
  lastRecenterAtMs = null;
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());

void loadEngine().catch((error) => log(`ENGINE ${String(error).slice(0, 100)}`));
