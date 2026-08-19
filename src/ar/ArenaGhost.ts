import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import {
  ARENA_ARC_DEG,
  ARENA_RADIUS_M,
  MIN_PLACE_RADIUS_M,
  sectorRangeDeg,
  toLocal,
  type SectorId,
} from "../arena/ArenaArc";
import { applyMatteFinish } from "../fx/materials";
import type { PlacementPreviewState } from "./placementGate";

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
const COLOR_READY_DEGRADED = "#f59e0b";
const COLOR_REFUSED = "#ef4444";
const COLOR_NEUTRAL = "#e2e8f0";

// Pulsacao sutil do estado neutro (`searching`): alpha oscila devagar entre
// esses dois extremos. "Sutil" e literal — nada perto de piscar, so o
// suficiente pra sinalizar "ainda procurando" sem distrair.
const PULSE_ALPHA_MIN = 0.35;
const PULSE_ALPHA_MAX = 0.75;
const PULSE_PERIOD_SECONDS = 2.4;

const DEG_TO_RAD = Math.PI / 180;

/**
 * O "fantasma" da arena em RA: o ARCO que vai fechar em volta do jogador,
 * desenhado no piso estimado antes da ancoragem.
 *
 * Ele mudou de assunto na v3. Antes era um retangulo de 0,53 m x 0,80 m
 * deitado na superficie APONTADA, e a pergunta que respondia era "cabe uma
 * arena de mesa ali?". Agora a arena nasce no proprio jogador (Etapa 3), entao
 * nao ha lugar apontado nenhum: o contorno fica centrado em quem segura o
 * celular e gira junto com ele, mostrando que o azimute 0 do arco sera a
 * direcao em que o celular estiver no instante do fechamento.
 *
 * Que o contorno acompanhe a rotacao do jogador nao e efeito colateral, e a
 * informacao principal: quem gira antes de confirmar esta ESCOLHENDO para onde
 * o arco vai olhar, e precisa ver isso acontecendo.
 *
 * Toda a geometria e criada UMA vez no construtor e fundida num mesh so
 * (`Mesh.MergeMeshes`): 30+ barras separadas seriam 30+ draw calls num celular
 * que ja esta rodando SLAM e feed de camera. `setState`/`setPose` so trocam uma
 * referencia de material ou uma transform — nenhuma alocacao por frame.
 */
export class ArenaGhost {
  private readonly scene: Scene;
  private readonly root: TransformNode;
  private readonly outline: Mesh;

  private readonly materialReady: StandardMaterial;
  private readonly materialReadyDegraded: StandardMaterial;
  private readonly materialRefused: StandardMaterial;
  private readonly materialNeutral: StandardMaterial;

  private currentState: PlacementPreviewState = "waiting-tracking";
  private isExternallyVisible = true;

  private pulseElapsedSeconds = 0;
  private readonly stopPulse: () => void;

  public constructor(scene: Scene) {
    this.scene = scene;
    this.root = new TransformNode("arena-ghost-root", scene);

    this.materialReady = this.createStateMaterial("arena-ghost-material-ready", COLOR_READY);
    this.materialReadyDegraded = this.createStateMaterial(
      "arena-ghost-material-ready-degraded",
      COLOR_READY_DEGRADED
    );
    this.materialRefused = this.createStateMaterial("arena-ghost-material-refused", COLOR_REFUSED);
    this.materialNeutral = this.createStateMaterial("arena-ghost-material-neutral", COLOR_NEUTRAL);

    this.outline = this.buildOutline();

    // Comeca invisivel: "waiting-tracking" e o estado inicial e so tem sentido
    // sem o fantasma — chamar hitTest antes do SLAM estar NORMAL estoura o
    // WASM, entao nao ha posicao valida pra mostrar mesmo.
    this.applyMaterialForCurrentState();
    this.updateVisibility();

    this.stopPulse = this.registerPulse();
  }

  /** Troca a aparencia do fantasma para o estado de preview atual. Sem alocacao. */
  public setState(state: PlacementPreviewState): void {
    if (state === this.currentState) {
      return;
    }

    this.currentState = state;
    this.applyMaterialForCurrentState();
    this.updateVisibility();
  }

  /**
   * Posiciona e orienta o contorno no mundo.
   *
   * `position` e a ORIGEM DO ARCO — o jogador projetado no piso estimado, e nao
   * um ponto apontado na tela. A rotacao vem pronta de quem chama e precisa ser
   * a MESMA que o fechamento vai aplicar no `arenaRoot` — se o contorno mostrar
   * uma pose e o fechamento aplicar outra, o toque deixa de confirmar o que
   * esta na tela, que e a regra que sustenta o gate inteiro.
   *
   * Ate a Etapa 3 essa rotacao incluia o alinhamento a normal medida do piso, e
   * este comentario defendia isso dizendo que a world-up do SLAM "nao bate com
   * o chao no caso comum". A sessao de device desmentiu: o que nao batia era o
   * FIT — 3 hitTests rasos estimam normal muito pior do que o IMU estima a
   * gravidade, e num arco de 2,2 m de raio o erro do fit virava 47 cm de
   * inclinacao. Hoje a rotacao e so o yaw. Ver `buildAnchorRotation` em
   * `EighthWallARManager.ts`.
   */
  public setPose(position: Vector3, rotation: Quaternion): void {
    this.root.rotationQuaternion = rotation;
    this.root.position.copyFrom(position);
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
    this.materialReadyDegraded.dispose();
    this.materialRefused.dispose();
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
   * Nada aqui e literal: o raio externo, o raio interno e a abertura vem de
   * `ArenaArc`, e as fronteiras de setor vem de `sectorRangeDeg`. Trocar
   * `ARENA_ARC_DEG` para 120 (decisao D7 do plano) tem que redesenhar o
   * contorno sozinho — um numero copiado aqui faria o preview mentir sobre a
   * arena que vai fechar, que e o unico jeito de este componente ser pior do
   * que nao existir.
   */
  private buildOutline(): Mesh {
    const half = ARENA_ARC_DEG / 2;

    const bars: Mesh[] = [
      ...this.buildDashedArc("outer", ARENA_RADIUS_M, OUTER_DASH_COUNT),
      ...this.buildDashedArc("inner", MIN_PLACE_RADIUS_M, INNER_DASH_COUNT),
      // As duas pontas fechando o arco: barras radiais do raio minimo ao
      // externo, nos limites laterais.
      this.buildRadialBar("edge-left", -half, MIN_PLACE_RADIUS_M, ARENA_RADIUS_M),
      this.buildRadialBar("edge-right", half, MIN_PLACE_RADIUS_M, ARENA_RADIUS_M),
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

  /** Um tracinho radial em cada fronteira INTERNA entre setores. */
  private buildSectorTicks(): Mesh[] {
    const half = ARENA_ARC_DEG / 2;
    const sectors: SectorId[] = ["left", "center", "right"];
    const bars: Mesh[] = [];

    for (const sector of sectors) {
      const [startDeg] = sectorRangeDeg(sector);

      // A fronteira externa esquerda ja e a barra `edge-left`; so as internas
      // ganham tique.
      if (Math.abs(startDeg + half) < 1e-6) {
        continue;
      }

      bars.push(
        this.buildRadialBar(
          `tick-${sector}`,
          startDeg,
          ARENA_RADIUS_M - SECTOR_TICK_LENGTH_M,
          ARENA_RADIUS_M
        )
      );
    }

    return bars;
  }

  /**
   * Uma barra deitada no piso, no ponto polar (azimute, raio).
   *
   * `widthM` e a dimensao TANGENCIAL e `depthM` a RADIAL, e isso e garantido
   * pela rotacao: girar a barra por `-azimute` faz o -Z local dela apontar para
   * fora (a mesma convencao de `arenaHeading.arenaRootYawRad`, um nivel abaixo
   * — la e o mundo, aqui e o espaco local da arena). Sem essa rotacao as barras
   * ficariam todas paralelas ao eixo X e o "arco" viraria uma escada.
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
    bar.rotation.y = -azimuthDeg * DEG_TO_RAD;

    return bar;
  }

  /** So troca a REFERENCIA de material do mesh fundido — nada e criado aqui. */
  private applyMaterialForCurrentState(): void {
    this.outline.material = this.materialForState(this.currentState);
  }

  /**
   * Uma cor por VEREDITO, nao uma por estado: verde fecha, ambar fecha com
   * ressalva, vermelho tem uma recusa concreta que o jogador consegue desfazer
   * (ficar de pe, segurar o celular na frente do corpo), branco pulsando e
   * "ainda medindo".
   */
  private materialForState(state: PlacementPreviewState): StandardMaterial {
    switch (state) {
      case "ready":
        return this.materialReady;
      case "ready-degraded":
        return this.materialReadyDegraded;
      case "bad-height":
        return this.materialRefused;
      case "searching":
        return this.materialNeutral;
      case "waiting-tracking":
        // Invisivel de qualquer forma (ver `updateVisibility`) — a referencia
        // aqui nao importa, mas materialNeutral evita deixar `material` nulo.
        return this.materialNeutral;
    }
  }

  /** Visibilidade combinada = nao esta em waiting-tracking E ninguem de fora pediu pra esconder. */
  private updateVisibility(): void {
    const shouldBeVisible = this.isExternallyVisible && this.currentState !== "waiting-tracking";
    this.root.setEnabled(shouldBeVisible);
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
      if (this.currentState !== "searching") {
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
