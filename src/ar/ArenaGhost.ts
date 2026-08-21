import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import {
  ARENA_ARC_DEG,
  ARENA_DEPTH_M,
  ARENA_WIDTH_M,
  MIN_PLACE_RADIUS_M,
  arenaEdgeRadiusAt,
  sectorRangeDeg,
  toLocal,
  type SectorId,
} from "../arena/ArenaArc";
import { applyMatteFinish } from "../fx/materials";

/**
 * O contorno tem DOIS estados, e nao os cinco do gate de colocacao que morreu
 * na spec 08 (F2): ou o SLAM ainda esta convergindo a escala absoluta, ou ele
 * chegou em NORMAL. Nao ha mais veredito a dar — a confirmacao nao pode ser
 * recusada, entao nao existe cor de recusa.
 */
export type ArenaGhostState = "calibrating" | "ready";

// Espessura radial e altura das barras. A altura e minuscula de proposito: o
// contorno tem que ler como TINTA no chao, nao como uma cerca — qualquer volume
// perceptivel denuncia que ele esta flutuando quando o fit do piso erra 1 cm.
const BAR_THICKNESS_M = 0.03;
const BAR_HEIGHT_M = 0.006;

// Tracejado do arco externo: quantos segmentos e que fracao de cada segmento e
// barra (o resto e vazio). Tracejado, e nao linha continua, porque uma linha
// continua sobre o feed de camera compete com as juntas do piso real; o ritmo
// do tracejado e o que faz o olho ler "isto e sobreposicao grafica".
const OUTER_DASH_COUNT = 18;
const SIDE_DASH_COUNT = 14;
const INNER_DASH_COUNT = 10;
const DASH_FILL_RATIO = 0.62;

// Marca de fronteira de setor: um tracinho radial encostado na borda externa.
// Ele nao "divide" o arco visualmente (isso sugeriria pista ou lane, que a v3
// matou) — so diz onde um flanco vira o outro, que e o que o alerta de flanco
// da Etapa 5 vai apontar.
const SECTOR_TICK_LENGTH_M = 0.22;

// Cores cruas (nao vem de `PALETTE`, que e para elementos da arena/criaturas —
// este e feedback de UI/RA). Emissive == diffuse em cada uma: a cena de RA tem
// luz do ambiente real, imprevisivel, e o contorno precisa ficar legivel mesmo
// contra uma cena mal iluminada.
const COLOR_READY = "#22c55e";
const COLOR_NEUTRAL = "#e2e8f0";

// Pulsacao sutil do estado neutro (`calibrating`): alpha oscila devagar entre
// esses dois extremos. "Sutil" e literal — nada perto de piscar, so o
// suficiente pra sinalizar "ainda procurando" sem distrair.
const PULSE_ALPHA_MIN = 0.35;
const PULSE_ALPHA_MAX = 0.75;
const PULSE_PERIOD_SECONDS = 2.4;

const DEG_TO_RAD = Math.PI / 180;

/**
 * O "fantasma" da arena em RA: o ARCO em volta do jogador, desenhado no piso
 * antes de o mundo vivo comecar.
 *
 * Ele ja foi tres coisas. Um retangulo de 0,53 m x 0,80 m deitado na superficie
 * APONTADA ("cabe uma arena de mesa ali?"); depois um arco que seguia a pose do
 * device e mostrava onde a arena ia CAIR. A spec 08 tirou as duas perguntas de
 * cena: a arena e autorada na origem, o piso e o `y = 0` do mundo por
 * declaracao, e o azimute 0 e o +Z. Nao ha lugar a escolher nem medicao a
 * exibir.
 *
 * Sobra o papel que ainda vale: mostrar a EXTENSAO da arena — onde o arco
 * comeca, onde termina, onde um flanco vira o outro — antes de o mundo vivo
 * aparecer. Por isso ele nao tem mais pose: fica na origem, com rotacao
 * identidade, exatamente como o `arenaRoot`.
 *
 * Toda a geometria e criada UMA vez no construtor e fundida num mesh so
 * (`Mesh.MergeMeshes`): 30+ barras separadas seriam 30+ draw calls num celular
 * que ja esta rodando SLAM e feed de camera. `setState` so troca uma referencia
 * de material — nenhuma alocacao por frame.
 */
export class ArenaGhost {
  private readonly scene: Scene;
  private readonly root: TransformNode;
  private readonly outline: Mesh;

  private readonly materialReady: StandardMaterial;
  private readonly materialNeutral: StandardMaterial;

  private currentState: ArenaGhostState = "calibrating";
  private isExternallyVisible = true;

  private pulseElapsedSeconds = 0;
  private readonly stopPulse: () => void;

  public constructor(scene: Scene) {
    this.scene = scene;
    this.root = new TransformNode("arena-ghost-root", scene);

    this.materialReady = this.createStateMaterial("arena-ghost-material-ready", COLOR_READY);
    this.materialNeutral = this.createStateMaterial("arena-ghost-material-neutral", COLOR_NEUTRAL);

    this.outline = this.buildOutline();

    // O contorno nasce na ORIGEM, sem rotacao, e nunca mais se move. Mesma
    // invariante do `arenaRoot` (spec 08, F2): o que a RA move e a origem da
    // camera, nunca o conteudo.
    this.applyMaterialForCurrentState();
    this.updateVisibility();

    this.stopPulse = this.registerPulse();
  }

  /** Troca a aparencia do fantasma para o estado atual. Sem alocacao. */
  public setState(state: ArenaGhostState): void {
    if (state === this.currentState) {
      return;
    }

    this.currentState = state;
    this.applyMaterialForCurrentState();
    this.updateVisibility();
  }

  /** Visibilidade externa (ex.: esconder o fantasma inteiro apos fechar a arena). */
  public setVisible(visible: boolean): void {
    if (visible === this.isExternallyVisible) {
      return;
    }

    this.isExternallyVisible = visible;
    this.updateVisibility();
  }

  /** Descarta mesh, materiais e o observer da pulsacao. */
  public dispose(): void {
    this.stopPulse();

    this.outline.dispose();

    this.materialReady.dispose();
    this.materialNeutral.dispose();

    this.root.dispose();
  }

  /**
   * Material dedicado por estado (nao usa o cache de `createMatteMaterial`, de
   * proposito — a doc daquela funcao pede exatamente isso para efeitos com
   * emissive proprio como este, para nao arriscar dois usos diferentes da mesma
   * cor colidindo no cache). `applyMatteFinish` zera o especular para ficar no
   * acabamento fosco do guideline.
   */
  private createStateMaterial(name: string, colorHex: string): StandardMaterial {
    const material = new StandardMaterial(name, this.scene);
    const color = Color3.FromHexString(colorHex);
    material.diffuseColor = color;
    material.emissiveColor = color;
    material.backFaceCulling = false;
    applyMatteFinish(material);

    return material;
  }

  /**
   * Monta as barras do contorno e as funde num mesh so.
   *
   * **A borda externa e RETANGULAR desde 2026-08-21**, e nao mais um arco: a
   * arena virou um retangulo a frente do jogador, dimensionado para caber
   * inteiro no FOV. A borda INTERNA continua sendo um arco, porque ela nao e
   * uma parede — e a folga em volta do corpo de quem joga, e folga de corpo e
   * radial.
   *
   * Nada aqui e literal: largura, profundidade e a folga interna vem de
   * `ArenaArc`, e as fronteiras de setor de `sectorRangeDeg`. Trocar qualquer
   * uma dessas constantes tem que redesenhar o contorno sozinho — um numero
   * copiado aqui faria o preview mentir sobre a arena que vai fechar, que e o
   * unico jeito de este componente ser pior do que nao existir.
   */
  private buildOutline(): Mesh {
    const halfWidth = ARENA_WIDTH_M / 2;

    const bars: Mesh[] = [
      // Fundo: uma linha tracejada reta, de canto a canto.
      ...this.buildDashedLine(
        "back",
        { x: -halfWidth, z: ARENA_DEPTH_M },
        { x: halfWidth, z: ARENA_DEPTH_M },
        OUTER_DASH_COUNT
      ),
      // Laterais: do jogador ate o fundo, nos dois limites de largura.
      ...this.buildDashedLine(
        "side-left",
        { x: -halfWidth, z: 0 },
        { x: -halfWidth, z: ARENA_DEPTH_M },
        SIDE_DASH_COUNT
      ),
      ...this.buildDashedLine(
        "side-right",
        { x: halfWidth, z: 0 },
        { x: halfWidth, z: ARENA_DEPTH_M },
        SIDE_DASH_COUNT
      ),
      // A folga em volta do jogador continua sendo um arco.
      ...this.buildDashedArc("inner", MIN_PLACE_RADIUS_M, INNER_DASH_COUNT),
      ...this.buildSectorTicks(),
    ];

    // `MergeMeshes` devolve `null` so se a lista vier vazia, o que aqui nao
    // acontece (o arco tem barras fixas). O `?? bars[0]` existe para o tipo, e
    // nao como caminho esperado.
    const merged =
      Mesh.MergeMeshes(bars, true, true, undefined, false, false) ?? bars[0];

    merged.name = "arena-ghost-outline";
    merged.parent = this.root;
    merged.isPickable = false;
    merged.receiveShadows = false;
    // Puramente informativo — nao deve competir com o picking do chao real.
    merged.doNotSyncBoundingInfo = true;

    return merged;
  }

  /** Um anel tracejado de raio fixo cobrindo o arco inteiro. */
  private buildDashedArc(name: string, radiusM: number, dashCount: number): Mesh[] {
    const half = ARENA_ARC_DEG / 2;
    const stepDeg = ARENA_ARC_DEG / dashCount;
    const dashSpanDeg = stepDeg * DASH_FILL_RATIO;
    // Comprimento de arco do traco, usado como largura (tangencial) da barra.
    // Aproximar arco por corda a essa escala erra menos de 1 mm.
    const dashLengthM = radiusM * dashSpanDeg * DEG_TO_RAD;

    const bars: Mesh[] = [];

    for (let i = 0; i < dashCount; i += 1) {
      // Centro do traco no meio de cada celula, para o tracejado ficar
      // simetrico nas duas pontas do arco.
      const azimuthDeg = -half + (i + 0.5) * stepDeg;
      bars.push(
        this.buildBar(`arena-ghost-${name}-${i}`, azimuthDeg, radiusM, dashLengthM, BAR_THICKNESS_M)
      );
    }

    return bars;
  }

  /** Barra radial (aponta para fora), de `fromRadiusM` ate `toRadiusM`. */
  private buildRadialBar(name: string, azimuthDeg: number, fromRadiusM: number, toRadiusM: number): Mesh {
    const lengthM = toRadiusM - fromRadiusM;
    const centerRadiusM = (fromRadiusM + toRadiusM) / 2;

    return this.buildBar(
      `arena-ghost-${name}`,
      azimuthDeg,
      centerRadiusM,
      BAR_THICKNESS_M,
      lengthM
    );
  }

  /**
   * Um tracinho radial em cada fronteira INTERNA entre flancos, encostado na
   * borda do fundo.
   *
   * Eles importam mais do que antes: os tres flancos deixaram de ser pedacos de
   * mundo escondidos e viraram as tres ZONAS DE ACAO do cone de deploy. Estes
   * tracinhos sao a unica pista, no chao, de onde uma zona acaba e a outra
   * comeca.
   *
   * O raio de cada tique vem de `arenaEdgeRadiusAt`, e nao de uma constante: com
   * a borda retangular, a distancia ate o fundo depende do azimute.
   */
  private buildSectorTicks(): Mesh[] {
    const half = ARENA_ARC_DEG / 2;
    const sectors: SectorId[] = ["left", "center", "right"];
    const bars: Mesh[] = [];

    for (const sector of sectors) {
      const [startDeg] = sectorRangeDeg(sector);

      // A fronteira externa esquerda ja e a lateral do retangulo; so as
      // internas ganham tique.
      if (Math.abs(startDeg + half) < 1e-6) {
        continue;
      }

      const edgeRadius = arenaEdgeRadiusAt(startDeg);
      bars.push(
        this.buildRadialBar(`tick-${sector}`, startDeg, edgeRadius - SECTOR_TICK_LENGTH_M, edgeRadius)
      );
    }

    return bars;
  }

  /**
   * Uma linha RETA tracejada entre dois pontos do piso. E o que desenha a borda
   * retangular; o `buildDashedArc` continua existindo para a folga interna, que
   * e curva.
   */
  private buildDashedLine(
    name: string,
    from: { x: number; z: number },
    to: { x: number; z: number },
    dashCount: number
  ): Mesh[] {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lengthM = Math.hypot(dx, dz);
    const dashLengthM = (lengthM / dashCount) * DASH_FILL_RATIO;
    // Angulo da linha medido na MESMA convencao do azimute (`atan2(x, z)`), para
    // a rotacao das barras concordar com o resto do modelo.
    const rotationY = Math.atan2(dx, dz);

    const bars: Mesh[] = [];

    for (let i = 0; i < dashCount; i += 1) {
      // Centro do traco no meio de cada celula: o tracejado fica simetrico nas
      // duas pontas da linha.
      const t = (i + 0.5) / dashCount;
      bars.push(
        this.buildBarAt(
          `arena-ghost-${name}-${i}`,
          from.x + dx * t,
          from.z + dz * t,
          BAR_THICKNESS_M,
          dashLengthM,
          rotationY
        )
      );
    }

    return bars;
  }

  /**
   * Uma barra deitada no piso, no ponto polar (azimute, raio).
   *
   * `widthM` e a dimensao TANGENCIAL e `depthM` a RADIAL, e isso e garantido
   * pela rotacao: girar a barra por `+azimute` faz o +Z local dela apontar para
   * fora. O SINAL virou junto com o zero do azimute (spec 08, bug 3): numa cena
   * canhota `RotationY(t)` leva o +Z local para `(sin t, cos t)`, que e
   * exatamente a direcao do azimute `t`. Sem essa rotacao as barras ficariam
   * todas paralelas ao eixo X e o "arco" viraria uma escada.
   */
  private buildBar(
    name: string,
    azimuthDeg: number,
    radiusM: number,
    widthM: number,
    depthM: number
  ): Mesh {
    const bar = MeshBuilder.CreateBox(
      name,
      { width: widthM, height: BAR_HEIGHT_M, depth: depthM },
      this.scene
    );

    const { x, z } = toLocal({ azimuthDeg, radiusM });
    bar.position.set(x, BAR_HEIGHT_M / 2, z);
    bar.rotation.y = azimuthDeg * DEG_TO_RAD;

    return bar;
  }

  /** Como `buildBar`, mas posicionada em coordenadas do piso em vez de polares. */
  private buildBarAt(
    name: string,
    x: number,
    z: number,
    widthM: number,
    depthM: number,
    rotationY: number
  ): Mesh {
    const bar = MeshBuilder.CreateBox(
      name,
      { width: widthM, height: BAR_HEIGHT_M, depth: depthM },
      this.scene
    );

    bar.position.set(x, BAR_HEIGHT_M / 2, z);
    bar.rotation.y = rotationY;

    return bar;
  }

  /** So troca a REFERENCIA de material do mesh fundido — nada e criado aqui. */
  private applyMaterialForCurrentState(): void {
    this.outline.material = this.materialForState(this.currentState);
  }

  /**
   * Uma cor por estado. Nao ha mais cor de recusa porque nao ha mais recusa: o
   * branco pulsando diz "o SLAM ainda esta convergindo a escala" e o verde diz
   * "pode tocar". As duas sao informativas, nenhuma e um veredito sobre o lugar.
   */
  private materialForState(state: ArenaGhostState): StandardMaterial {
    return state === "ready" ? this.materialReady : this.materialNeutral;
  }

  /**
   * Quem esconde o contorno agora e so quem chama `setVisible` — o estado nao
   * esconde mais nada. Enquanto o SLAM calibra o contorno CONTINUA visivel: ele
   * nao depende de medicao nenhuma para saber onde esta.
   */
  private updateVisibility(): void {
    this.root.setEnabled(this.isExternallyVisible);
  }

  /**
   * Pulsacao sutil do material neutro (`searching`): o alpha oscila devagar via
   * seno. Registrada UMA vez no construtor em `onBeforeRenderObservable` — o
   * padrao ja usado em `fx/arenaDissolve.ts` — e removida no `dispose()`. So
   * mexe numa propriedade (`alpha`) de um material ja existente a cada frame,
   * sem alocar nada.
   */
  private registerPulse(): () => void {
    const observer = this.scene.onBeforeRenderObservable.add(() => {
      // So vale a pena calcular quando o material neutro esta de fato em uso —
      // nos outros estados o pulso nao aparece em tela, entao pular o trabalho
      // e gratis.
      if (this.currentState !== "calibrating") {
        return;
      }

      const deltaSeconds = this.scene.getEngine().getDeltaTime() / 1000;
      this.pulseElapsedSeconds += deltaSeconds;

      const phase = (this.pulseElapsedSeconds / PULSE_PERIOD_SECONDS) * Math.PI * 2;
      const t = (Math.sin(phase) + 1) / 2; // normaliza pra [0, 1]
      this.materialNeutral.alpha = PULSE_ALPHA_MIN + t * (PULSE_ALPHA_MAX - PULSE_ALPHA_MIN);
    });

    return () => {
      this.scene.onBeforeRenderObservable.remove(observer);
    };
  }
}
