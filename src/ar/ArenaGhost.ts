import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { ARENA_LENGTH_METERS, ARENA_WIDTH_METERS } from "../arena/ArenaSystem";
import { applyMatteFinish } from "../fx/materials";
import { buildFootprintProbes } from "./hitTestSampling";
import type { PlacementPreviewState } from "./placementGate";

// Metade de cada eixo em metros — as MESMAS constantes que `ArenaSystem` usa
// para a arena real. O fantasma nao pode ter tamanho proprio: se ele mentir,
// o jogador aprende a confiar num contorno que a arena de verdade nao respeita.
const HALF_WIDTH_METERS = ARENA_WIDTH_METERS / 2;
const HALF_LENGTH_METERS = ARENA_LENGTH_METERS / 2;

// Barras finas formando uma moldura (picture frame), nao um plano preenchido:
// um retangulo solido esconderia a mesa real por baixo e mataria a leitura de
// "isto esta deitado na superficie" que e o objetivo inteiro deste componente.
// As barras norte/sul cobrem a largura INTEIRA (nao largura-espessura) e as
// barras leste/oeste cobrem o comprimento INTEIRO — elas se sobrepoem um
// pouco nos 4 cantos de proposito, o que fecha a moldura sem precisar de
// corte em 45 graus (miter join) em cada canto.
const EDGE_THICKNESS_METERS = 0.012;
const EDGE_HEIGHT_METERS = 0.006;

// Cubos pequenos exatamente sobre os 4 cantos: um pouco mais altos que a
// moldura para lerem como "marcador" a distancia — e marcas nos cantos sao o
// que mais ajuda a percepcao de perspectiva de um retangulo deitado visto de
// angulo, contra um plano preenchido ou so linhas finas (que desaparecem em
// angulo raso sobre o feed de camera).
const CORNER_SIZE_METERS = 0.028;
const CORNER_HEIGHT_METERS = 0.016;

// Cores cruas (nao vem de `PALETTE`, que e para elementos da arena/criaturas
// — este e feedback de UI/RA, mesmo territorio do "hit-cursor" antigo que
// tambem usava hex direto). Emissive == diffuse em cada uma: a cena de RA tem
// luz do ambiente real, imprevisivel, e o fantasma precisa ficar legivel
// mesmo contra uma cena mal iluminada.
const COLOR_READY = "#22c55e";
const COLOR_READY_DEGRADED = "#f59e0b";
const COLOR_TOO_SMALL = "#ef4444";
const COLOR_NEUTRAL = "#e2e8f0";

// Pulsacao sutil do estado neutro (searching/out-of-frame): alpha oscila
// devagar entre esses dois extremos. "Sutil" e literal — nada perto de
// piscar, so o suficiente pra sinalizar "ainda procurando" sem distrair.
const PULSE_ALPHA_MIN = 0.35;
const PULSE_ALPHA_MAX = 0.75;
const PULSE_PERIOD_SECONDS = 2.4;

/**
 * O "fantasma" da arena em RA: o contorno real (0,53 m x 0,80 m) deitado na
 * superficie apontada, ANTES de ancorar. Substitui o antigo torus verde
 * (`createHitCursor` em `EighthWallARManager`) — aquele reticle nao dizia
 * nada sobre o tamanho real da arena, entao o jogador so descobria que o
 * lugar nao servia DEPOIS de tocar e falhar. Este componente muda de cor
 * conforme o estado do preview, para o jogador ver ANTES de tocar.
 *
 * Todo mesh e material e criado UMA vez no construtor. `setState`/`setPose`
 * so trocam uma referencia de material ou uma transform — nenhuma alocacao,
 * porque isto roda a 60 fps num celular ao lado do SLAM.
 */
export class ArenaGhost {
  private readonly scene: Scene;
  private readonly root: TransformNode;

  private readonly edgeMeshes: Mesh[];
  private readonly cornerMeshes: Mesh[];

  private readonly materialReady: StandardMaterial;
  private readonly materialReadyDegraded: StandardMaterial;
  private readonly materialTooSmall: StandardMaterial;
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
    this.materialTooSmall = this.createStateMaterial("arena-ghost-material-too-small", COLOR_TOO_SMALL);
    this.materialNeutral = this.createStateMaterial("arena-ghost-material-neutral", COLOR_NEUTRAL);

    this.edgeMeshes = this.buildEdgeMeshes();
    this.cornerMeshes = this.buildCornerMeshes();

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
   * Posiciona e orienta o fantasma no mundo. A rotacao vem pronta de quem
   * chama, e precisa ser a MESMA que `applyPlacement` vai usar na arena —
   * inclusive o alinhamento a normal real do piso.
   *
   * Antes isto recebia so um `yaw` e deitava o contorno na horizontal do
   * mundo. Quando a world-up do SLAM nao bate com o piso real (o caso comum, e
   * a razao de `buildGroundAlignedRotation` existir), o contorno aparecia
   * visivelmente inclinado em relacao ao chao — e as sondas tiradas da pose
   * dele iam parar longe da superficie.
   */
  public setPose(position: Vector3, rotation: Quaternion): void {
    this.root.rotationQuaternion = rotation;
    this.root.position.copyFrom(position);
  }

  /** Visibilidade externa (ex.: esconder o fantasma inteiro apos ancorar a arena). */
  public setVisible(visible: boolean): void {
    if (visible === this.isExternallyVisible) {
      return;
    }

    this.isExternallyVisible = visible;
    this.updateVisibility();
  }

  /**
   * 8 pontos de MUNDO na pose atual: os 4 cantos e os 4 meios de borda da
   * arena, para quem consome projetar cada um pra tela e disparar um hitTest
   * nele.
   *
   * Os offsets NAO sao redefinidos aqui: quem os possui e
   * `buildFootprintProbes`, o mesmo que `measureFootprintCoverage` documenta.
   * Duas listas de cantos em arquivos diferentes divergiriam no primeiro
   * ajuste de forma da arena — e a divergencia seria silenciosa, porque a
   * contagem de cobertura nao depende da ordem.
   */
  public getProbePoints(): Vector3[] {
    // Forca a world matrix a refletir a pose atual mesmo se `getProbePoints`
    // for chamado logo apos `setPose`, antes do proximo tick de render.
    this.root.computeWorldMatrix(true);
    const worldMatrix = this.root.getWorldMatrix();

    return buildFootprintProbes(ARENA_WIDTH_METERS, ARENA_LENGTH_METERS).map(({ dx, dz }) =>
      Vector3.TransformCoordinates(new Vector3(dx, 0, dz), worldMatrix)
    );
  }

  /** Descarta meshes, materiais e o observer da pulsacao. */
  public dispose(): void {
    this.stopPulse();

    for (const mesh of this.edgeMeshes) {
      mesh.dispose();
    }

    for (const mesh of this.cornerMeshes) {
      mesh.dispose();
    }

    this.materialReady.dispose();
    this.materialReadyDegraded.dispose();
    this.materialTooSmall.dispose();
    this.materialNeutral.dispose();

    this.root.dispose();
  }

  /**
   * Material dedicado por estado (nao usa o cache de `createMatteMaterial`,
   * de proposito — a doc daquela funcao pede exatamente isso para efeitos com
   * emissive proprio como este, para nao arriscar dois usos diferentes da
   * mesma cor colidindo no cache). `applyMatteFinish` zera o especular para
   * ficar no acabamento fosco do guideline.
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

  /** As 4 barras da moldura, uma por borda, todas filhas do no raiz. */
  private buildEdgeMeshes(): Mesh[] {
    const northSouth = { width: ARENA_WIDTH_METERS, depth: EDGE_THICKNESS_METERS };
    const eastWest = { width: EDGE_THICKNESS_METERS, depth: ARENA_LENGTH_METERS };

    const south = MeshBuilder.CreateBox(
      "arena-ghost-edge-south",
      { width: northSouth.width, height: EDGE_HEIGHT_METERS, depth: northSouth.depth },
      this.scene
    );
    south.position.set(0, EDGE_HEIGHT_METERS / 2, -HALF_LENGTH_METERS);

    const north = MeshBuilder.CreateBox(
      "arena-ghost-edge-north",
      { width: northSouth.width, height: EDGE_HEIGHT_METERS, depth: northSouth.depth },
      this.scene
    );
    north.position.set(0, EDGE_HEIGHT_METERS / 2, HALF_LENGTH_METERS);

    const west = MeshBuilder.CreateBox(
      "arena-ghost-edge-west",
      { width: eastWest.width, height: EDGE_HEIGHT_METERS, depth: eastWest.depth },
      this.scene
    );
    west.position.set(-HALF_WIDTH_METERS, EDGE_HEIGHT_METERS / 2, 0);

    const east = MeshBuilder.CreateBox(
      "arena-ghost-edge-east",
      { width: eastWest.width, height: EDGE_HEIGHT_METERS, depth: eastWest.depth },
      this.scene
    );
    east.position.set(HALF_WIDTH_METERS, EDGE_HEIGHT_METERS / 2, 0);

    const meshes = [south, north, west, east];

    for (const mesh of meshes) {
      mesh.parent = this.root;
      this.configureGhostMesh(mesh);
    }

    return meshes;
  }

  /** Os 4 marcadores de canto, um pouco mais altos que as barras da moldura. */
  private buildCornerMeshes(): Mesh[] {
    const corners: Array<[string, number, number]> = [
      ["arena-ghost-corner-sw", -HALF_WIDTH_METERS, -HALF_LENGTH_METERS],
      ["arena-ghost-corner-se", HALF_WIDTH_METERS, -HALF_LENGTH_METERS],
      ["arena-ghost-corner-ne", HALF_WIDTH_METERS, HALF_LENGTH_METERS],
      ["arena-ghost-corner-nw", -HALF_WIDTH_METERS, HALF_LENGTH_METERS],
    ];

    const meshes = corners.map(([name, x, z]) => {
      const mesh = MeshBuilder.CreateBox(
        name,
        { width: CORNER_SIZE_METERS, height: CORNER_HEIGHT_METERS, depth: CORNER_SIZE_METERS },
        this.scene
      );
      mesh.position.set(x, CORNER_HEIGHT_METERS / 2, z);
      mesh.parent = this.root;
      this.configureGhostMesh(mesh);

      return mesh;
    });

    return meshes;
  }

  /** Configuracao comum a todo mesh do fantasma: nunca picking, nunca sombra. */
  private configureGhostMesh(mesh: Mesh): void {
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    // Puramente decorativo/informativo — nao deve competir com o picking do
    // chao real (o `baseGround` invisivel-mas-pickavel da arena de verdade).
    mesh.doNotSyncBoundingInfo = true;
  }

  /** So troca a REFERENCIA de material nos 8 meshes — nada e criado aqui. */
  private applyMaterialForCurrentState(): void {
    const material = this.materialForState(this.currentState);

    for (const mesh of this.edgeMeshes) {
      mesh.material = material;
    }

    for (const mesh of this.cornerMeshes) {
      mesh.material = material;
    }
  }

  private materialForState(state: PlacementPreviewState): StandardMaterial {
    switch (state) {
      case "ready":
        return this.materialReady;
      case "ready-degraded":
        return this.materialReadyDegraded;
      case "too-small":
        return this.materialTooSmall;
      case "searching":
      case "out-of-frame":
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
   * Pulsacao sutil do material neutro (searching/out-of-frame): o alpha
   * oscila devagar via seno. Registrada UMA vez no construtor em
   * `onBeforeRenderObservable` — o padrao ja usado em `fx/arenaDissolve.ts` —
   * e removida no `dispose()`. So mexe numa propriedade (`alpha`) de um
   * material ja existente a cada frame, sem alocar nada.
   */
  private registerPulse(): () => void {
    const observer = this.scene.onBeforeRenderObservable.add(() => {
      // So vale a pena calcular quando o material neutro esta de fato em uso
      // — nos outros estados (ready/too-small/waiting-tracking) o pulso nao
      // aparece em tela, entao pular o trabalho e gratis.
      const isNeutralStateActive = this.currentState === "searching" || this.currentState === "out-of-frame";

      if (!isNeutralStateActive) {
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
