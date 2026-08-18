import { Animation } from "@babylonjs/core/Animations/animation";
import { BackEase, CubicEase, EasingFunction } from "@babylonjs/core/Animations/easing";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { RABBIT_HEIGHT_M } from "../arena/metrics";
import { applyMatteFinish, createMatteMaterial, PALETTE, shadeHex } from "../fx/materials";

/**
 * O coelho que mora dentro da torre inimiga.
 *
 * Referencia do usuario: "um coelho maluco de olhos bem grandes dormindo
 * debaixo da torre", que "salta de dentro tipo o coelho do Crash Bandicoot"
 * quando o jogador chega perto. Ele e o pagamento da promessa que a caverna
 * acesa e a placa "CUIDADO" vinham fazendo — e o instante em que a batalha
 * comeca.
 *
 * ## Duas regras herdadas da Etapa 1 (ainda validas, motivo mudou)
 *
 * 1. **Nada em deslocamento absoluto fora das constantes deste arquivo.**
 *    `arenaRoot.scaling` e 1 nos dois modos desde a Etapa 2
 *    (`src/arena/metrics.ts`), mas o salto continua todo em keyframes
 *    RELATIVOS, no espaco LOCAL da boca da caverna — que ja e filha da torre,
 *    que e filha do `arenaRoot`. Isso mantem a mesma leitura em RA e no modo
 *    tela, e sobrevive a qualquer mudanca futura de escala sem precisar tocar
 *    nesta animacao.
 * 2. **O lado do salto vem da torre**, via `facingSignZ`, e nao de um `-1`
 *    cravado aqui. A caverna da torre inimiga aponta para -Z (o lado do
 *    jogador), mas quem sabe disso e o `MushroomTower`.
 *
 * ## Orcamento
 *
 * 5 draw calls: corpo+orelhas soldados, o par de olhos soldado, o par de
 * pupilas soldado, aba+copa da cartola soldadas, e a fita (mesh propria so
 * porque a cor e outra).
 *
 * Ele nasce desligado (`setEnabled(false)`) e, depois do salto, **fica na
 * arena pelo resto da partida** — ao lado da torre, respirando. Ou seja, os 5
 * draw calls valem durante a partida inteira. E um custo aceito de propósito:
 * bicho que aparece, cumpre a funcao e some e um efeito; bicho que continua
 * ali e um habitante, e e nisso que a demo esta apostando.
 */

const FPS = 60;

/**
 * Fator unico que multiplica TODAS as medidas lineares do coelho, no mesmo
 * espirito do `TOWER_SCALE` de `MushroomTower.ts`. `AUTHORED_RABBIT_HEIGHT` e
 * a extensao em Y da geometria abaixo COM fator 1: do fundo do torso
 * (esfera de diametro `BODY_DIAMETER_Y` = 1.0, centrada em y=0 -> fundo em
 * -0.5) ate o topo da orelha (centro em
 * `BODY_DIAMETER_Y/2 + EAR_HEIGHT/2 - 0.12` = 0.955, altura `EAR_HEIGHT` = 1.15
 * -> topo em 1.53). `1.53 - (-0.5)` = 2.03. Dividindo `RABBIT_HEIGHT_M`
 * (0,70 m) por isso, o coelho passa a medir exatamente 0,70 m de orelha a pe.
 */
const AUTHORED_RABBIT_HEIGHT = 2.03;
const RABBIT_SCALE = RABBIT_HEIGHT_M / AUTHORED_RABBIT_HEIGHT;

// Corpo em forma de ovo, mais fundo que largo: le como coelho agachado, nao
// como bola. Cabe pela boca da caverna (abertura de ~1,44 de largura autoral).
const BODY_DIAMETER_X = 1.15 * RABBIT_SCALE;
const BODY_DIAMETER_Y = 1.0 * RABBIT_SCALE;
const BODY_DIAMETER_Z = 1.3 * RABBIT_SCALE;

// Orelhas compridas e finas, abertas em V. Sao a silhueta que identifica o
// bicho a distancia — mais do que qualquer detalhe de rosto.
const EAR_HEIGHT = 1.15 * RABBIT_SCALE;
const EAR_WIDTH = 0.24 * RABBIT_SCALE;
const EAR_DEPTH = 0.12 * RABBIT_SCALE;
const EAR_OFFSET_X = 0.26 * RABBIT_SCALE;
/** Radianos — angulo, nao encolhe/cresce com a escala do bicho. */
const EAR_TILT = 0.28;

// Olhos DESPROPORCIONAIS de proposito: o pedido foi "olhos bem grandes", e a
// desproporcao e o que faz o bicho ler como maluco em vez de fofo. Quase
// metade da largura do corpo, cada um.
const EYE_DIAMETER = 0.46 * RABBIT_SCALE;
const EYE_OFFSET_X = 0.27 * RABBIT_SCALE;
const EYE_OFFSET_Y = 0.16 * RABBIT_SCALE;
const PUPIL_DIAMETER = 0.2 * RABBIT_SCALE;

// Cartola do Chapeleiro Maluco. A aba e mais larga que a distancia entre as
// orelhas de proposito: elas atravessam a aba, e um chapeu enfiado na marra
// por cima de orelhas que nao cabem le mais "maluco" do que qualquer detalhe
// de modelagem que se pusesse nele.
const HAT_BRIM_DIAMETER = 1.05 * RABBIT_SCALE;
const HAT_BRIM_HEIGHT = 0.07 * RABBIT_SCALE;
const HAT_CROWN_DIAMETER = 0.64 * RABBIT_SCALE;
const HAT_CROWN_HEIGHT = 0.66 * RABBIT_SCALE;
const HAT_BAND_DIAMETER = 0.69 * RABBIT_SCALE;
const HAT_BAND_HEIGHT = 0.16 * RABBIT_SCALE;
// Torto. Cartola no esquadro vira cartola de mordomo. Radianos — angulo.
const HAT_TILT = 0.19;
// O "10/6" que o Chapeleiro carrega na fita continua NAO entrando: mesmo com
// o coelho agora medindo `RABBIT_HEIGHT_M` (0,70 m) de verdade, a fita
// (`HAT_BAND_HEIGHT` * `RABBIT_SCALE`, uns 5,5 cm) e uma decisao de conteudo
// separada da conversao de escala desta etapa — nao entra so por a etiqueta
// caber fisicamente agora.

/**
 * Onde o coelho pousa — e FICA —, no espaco local da boca da caverna.
 *
 * Ele nao volta para dentro: depois do salto ele mora ao lado da torre, como
 * morador do mundo. Um bicho que aparece, cumpre a funcao e some e um efeito;
 * um que continua ali durante a partida inteira e um habitante, que e o que a
 * demo esta tentando fazer a pessoa acreditar.
 *
 * `LANDING_X` tira ele do CAMINHO: a faixa de invocacao vai de x = -tileSize a
 * x = +tileSize em espaco de arena (`ArenaSystem.laneHalfWidth`, hoje 0,55 m),
 * e o coelho parado no meio dela ficaria sendo atravessado pelas criaturas a
 * partida toda. `LANDING_X` (~-0,90 m) fica fora da faixa e, somado ao Z
 * (~0,69 m), a ~1,13 m do eixo da torre — livre da aba do chapeu, que tem
 * raio `CAP_DIAMETER_XZ / 2` (~0,53 m).
 *
 * A placa "CUIDADO" fica do lado +X (ver `CautionSign.ts`): coelho de um
 * lado, placa do outro, a caverna acesa no meio.
 *
 * `LANDING_Y` desce da boca (perto da metade da altura da torre) ate o chao,
 * menos a meia-altura do corpo, deixando ele apoiado.
 */
const LANDING_X = -2.6 * RABBIT_SCALE;
const LANDING_Y = -1.1 * RABBIT_SCALE;
const LANDING_Z = 2.0 * RABBIT_SCALE;
const APEX_X = -1.3 * RABBIT_SCALE;
const APEX_Y = 1.5 * RABBIT_SCALE;
const APEX_Z = 1.2 * RABBIT_SCALE;

// Respiracao continua depois do pouso. Roda num no PROPRIO, filho do root: o
// salto anima `root.scaling` e a respiracao anima o filho, entao as duas nunca
// disputam a mesma propriedade. Sem isso, um coelho parado e imovel no meio de
// um "mundo vivo" denuncia que ele e cenario.
const BREATH_PERIOD_MS = 2600;
const BREATH_AMOUNT = 0.055;

/**
 * Duracao total do beat, casada com `TowerWakeup`.
 *
 * O numero sai de uma restricao: a carta revelada gruda no coelho
 * (`linkWithMesh`), entao ele precisa continuar no chao durante o miolo
 * legivel dela. Com as fracoes de tempo abaixo, o coelho fica parado de
 * ~1,10 s a ~2,26 s, e o `TowerWakeup` mostra a carta a partir de 1,15 s.
 * Mexeu em um dos dois, confira o outro — desencaixados, a carta fica
 * pendurada num alvo que ja voltou para dentro da caverna.
 */
export const RABBIT_LEAP_DURATION_MS = 2900;

export interface CrazyRabbit {
  root: TransformNode;
  /**
   * Mesh a que o painel da carta revelada se prende (`linkWithMesh`). E o
   * corpo, e nao o `root`: `linkWithMesh` do Babylon GUI exige uma mesh de
   * verdade, com posicao no mundo.
   */
  anchor: Mesh;
  /** Toca o salto inteiro: sai, pousa, espera, volta. Nao resolve promessa — quem cronometra e o `TowerWakeup`. */
  play(): void;
  dispose(): void;
}

/**
 * `parent` deve ser a boca da caverna (`MushroomTower.caveMouth`), e
 * `facingSignZ` o lado para onde ela aponta (`MushroomTower.facingSignZ`).
 */
export function createCrazyRabbit(
  scene: Scene,
  parent: TransformNode,
  facingSignZ: number
): CrazyRabbit {
  const root = new TransformNode("crazy-rabbit", scene);
  root.parent = parent;
  root.position.setAll(0);
  // Nasce encolhido dentro da caverna: o primeiro frame do salto e ele
  // crescendo ao atravessar a boca, que e o que vende o "estava espremido ai
  // dentro esse tempo todo".
  root.scaling.setAll(0.15);
  root.setEnabled(false);

  // Pivo da respiracao: o salto anima `root`, a respiracao anima este no. Duas
  // animacoes na mesma propriedade do mesmo no se sobrescreveriam.
  const breathPivot = new TransformNode("rabbit-breath-pivot", scene);
  breathPivot.parent = root;

  const body = createBody(scene);
  body.parent = breathPivot;

  const eyes = createEyes(scene, facingSignZ);
  eyes.parent = breathPivot;

  const pupils = createPupils(scene, facingSignZ);
  pupils.parent = breathPivot;

  // Chapeu e fita compartilham UM pivo de inclinacao. Inclinar cada um por si
  // os giraria em torno da origem do coelho com raios diferentes, e a fita
  // descolaria da copa.
  const hatPivot = new TransformNode("rabbit-hat-pivot", scene);
  hatPivot.parent = breathPivot;
  hatPivot.rotation.z = HAT_TILT;

  createHat(scene).parent = hatPivot;
  createHatBand(scene).parent = hatPivot;

  // O coelho e cenario: NADA nele pode ser alvo de picking. Durante a partida
  // o toque no mundo vira invocacao de carta (`tryDeployAtWorldPoint`), e uma
  // mesh pickavel no meio do campo devolveria um ponto em cima do coelho como
  // se fosse chao.
  for (const mesh of root.getChildMeshes()) {
    mesh.isPickable = false;
  }

  startBreathing(scene, breathPivot);

  return new CrazyRabbitImpl(scene, root, body, facingSignZ);
}

class CrazyRabbitImpl implements CrazyRabbit {
  public readonly root: TransformNode;
  public readonly anchor: Mesh;

  private readonly scene: Scene;
  private readonly facingSignZ: number;
  private isDisposed = false;

  public constructor(scene: Scene, root: TransformNode, anchor: Mesh, facingSignZ: number) {
    this.scene = scene;
    this.root = root;
    this.anchor = anchor;
    this.facingSignZ = facingSignZ;
  }

  public play(): void {
    if (this.isDisposed) {
      return;
    }

    // Uma segunda partida na mesma sessao chama `play` de novo com o coelho
    // ja parado do lado da torre. Parar a animacao anterior devolve o controle
    // do `root` para os keyframes novos, que comecam dentro da caverna.
    this.scene.stopAnimation(this.root);
    this.root.setEnabled(true);

    const totalFrames = Math.round((RABBIT_LEAP_DURATION_MS / 1000) * FPS);
    const at = (fraction: number): number => Math.round(totalFrames * fraction);
    const z = (value: number): number => value * this.facingSignZ;

    // Arco do salto. As fracoes sao de tempo, nao de espaco: sair da caverna e
    // rapido (o susto), o voo e curto, e a maior parte do beat e o coelho
    // PARADO no chao — e ali que a carta revelada fica legivel, e o olhar do
    // jogador precisa estar num alvo imovel para ler.
    const position = new Animation(
      "rabbit-leap-position",
      "position",
      FPS,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    position.setKeys([
      { frame: 0, value: new Vector3(0, 0, 0) },
      { frame: at(0.08), value: new Vector3(0, 0.15 * RABBIT_SCALE, z(0.6 * RABBIT_SCALE)) },
      { frame: at(0.22), value: new Vector3(APEX_X, APEX_Y, z(APEX_Z)) },
      { frame: at(0.36), value: new Vector3(LANDING_X, LANDING_Y, z(LANDING_Z)) },
      // Repique curto: coelho que para seco parece objeto, coelho que quica
      // uma vez parece bicho.
      { frame: at(0.44), value: new Vector3(LANDING_X, LANDING_Y + 0.28 * RABBIT_SCALE, z(LANDING_Z)) },
      // Ultimo keyframe E o lugar onde ele fica. Nao ha volta para a caverna.
      { frame: at(0.54), value: new Vector3(LANDING_X, LANDING_Y, z(LANDING_Z)) },
      { frame: totalFrames, value: new Vector3(LANDING_X, LANDING_Y, z(LANDING_Z)) },
    ]);
    position.setEasingFunction(createEase());

    // Squash-and-stretch em ESCALA, sempre proporcional — nunca em tamanho
    // absoluto, pelo mesmo motivo do docblock do arquivo.
    const scaling = new Animation(
      "rabbit-leap-scaling",
      "scaling",
      FPS,
      Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    scaling.setKeys([
      { frame: 0, value: new Vector3(0.15, 0.15, 0.15) },
      // Espremido ao atravessar a boca: fino nos lados, esticado na direcao do
      // movimento.
      { frame: at(0.08), value: new Vector3(0.62, 0.62, 1.15) },
      { frame: at(0.22), value: new Vector3(0.86, 1.16, 1.0) },
      // Achatado no impacto.
      { frame: at(0.36), value: new Vector3(1.28, 0.74, 1.2) },
      { frame: at(0.46), value: new Vector3(0.94, 1.1, 0.94) },
      { frame: at(0.56), value: new Vector3(1, 1, 1) },
      { frame: totalFrames, value: new Vector3(1, 1, 1) },
    ]);
    scaling.setEasingFunction(createEase());

    // Giro e ROTACAO, invariante a escala. O coelho sai de costas para a
    // caverna, gira no ar e pousa encarando o jogador — e a cara dele, com os
    // olhos enormes, que fecha o beat.
    const spin = new Animation(
      "rabbit-leap-spin",
      "rotation.y",
      FPS,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    // Termina em 2*PI (uma volta inteira) e FICA: 2*PI e o mesmo angulo que 0,
    // entao ele pousa e permanece encarando o lado do jogador — que e de onde
    // a caverna aponta e de onde a pessoa esta olhando.
    spin.setKeys([
      { frame: 0, value: 0 },
      { frame: at(0.22), value: Math.PI * 0.8 },
      { frame: at(0.36), value: Math.PI * 2 },
      { frame: totalFrames, value: Math.PI * 2 },
    ]);
    spin.setEasingFunction(createEase());

    // Tombo lateral: as orelhas balancam por tabela, sem precisar de esqueleto.
    const tilt = new Animation(
      "rabbit-leap-tilt",
      "rotation.z",
      FPS,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
    tilt.setKeys([
      { frame: 0, value: 0 },
      { frame: at(0.22), value: -0.22 },
      { frame: at(0.4), value: 0.16 },
      { frame: at(0.52), value: -0.06 },
      { frame: at(0.62), value: 0 },
      { frame: totalFrames, value: 0 },
    ]);
    tilt.setEasingFunction(createBounceEase());

    this.scene.beginDirectAnimation(this.root, [position, scaling, spin, tilt], 0, totalFrames, false);
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.scene.stopAnimation(this.root);
    // Materiais do corpo e das pupilas vem do cache por cor de
    // `createMatteMaterial`, compartilhado com as criaturas — descartar aqui
    // quebraria quem mais usa a mesma cor.
    this.root.dispose(false, false);
  }
}

/**
 * Respiracao em loop, iniciada na construcao e nunca parada. Roda no
 * `breathPivot` — filho do `root` —, entao ela convive com o salto sem que as
 * duas animacoes disputem a mesma propriedade do mesmo no.
 */
function startBreathing(scene: Scene, breathPivot: TransformNode): void {
  const frames = Math.round((BREATH_PERIOD_MS / 1000) * FPS);

  const breath = new Animation(
    "rabbit-breath",
    "scaling",
    FPS,
    Animation.ANIMATIONTYPE_VECTOR3,
    Animation.ANIMATIONLOOPMODE_CYCLE
  );
  // Infla no eixo Y e encolhe de leve nos outros dois: volume aproximadamente
  // constante, que e o que separa "respirando" de "inchando".
  breath.setKeys([
    { frame: 0, value: new Vector3(1, 1, 1) },
    {
      frame: Math.round(frames * 0.5),
      value: new Vector3(1 - BREATH_AMOUNT * 0.5, 1 + BREATH_AMOUNT, 1 - BREATH_AMOUNT * 0.5),
    },
    { frame: frames, value: new Vector3(1, 1, 1) },
  ]);
  breath.setEasingFunction(createEase());

  scene.beginDirectAnimation(breathPivot, [breath], 0, frames, true);
}

/** Corpo + orelhas soldados numa mesh so (1 draw call). */
function createBody(scene: Scene): Mesh {
  // Corpo levemente rebaixado do branco puro para os olhos (esses sim
  // `neutralLight`) terem contraste contra ele. Sem isso o rosto some.
  const material = createMatteMaterial(
    scene,
    shadeHex(PALETTE.neutralLight, 0.82),
    "rabbit-body-material"
  );

  const torso = MeshBuilder.CreateSphere(
    "rabbit-torso-temp",
    {
      diameterX: BODY_DIAMETER_X,
      diameterY: BODY_DIAMETER_Y,
      diameterZ: BODY_DIAMETER_Z,
      segments: 10,
    },
    scene
  );

  const ears = [-1, 1].map((side) => {
    const ear = MeshBuilder.CreateBox(
      `rabbit-ear-temp-${side}`,
      { width: EAR_WIDTH, height: EAR_HEIGHT, depth: EAR_DEPTH },
      scene
    );
    ear.position.set(side * EAR_OFFSET_X, BODY_DIAMETER_Y / 2 + EAR_HEIGHT / 2 - 0.12 * RABBIT_SCALE, 0);
    ear.rotation.z = -side * EAR_TILT;
    return ear;
  });

  const body = new Mesh("rabbit-body", scene);
  Mesh.MergeMeshes([torso, ...ears], true, true, body);
  body.material = material;

  return body;
}

/**
 * Cartola: aba + copa soldadas numa mesh so (1 draw call).
 *
 * Cor: `accentTatu` (roxo). A paleta do projeto nao tem uma cor de chapeleiro
 * propria, e inventar uma entrada nova para um adereco de 2 cm contraria o
 * guideline de paleta limitada. O roxo e a unica cor escura e saturada
 * disponivel, ele contrasta com o corpo esbranquicado e — importante — NAO e
 * o vermelho da torre inimiga nem o laranja da brasa da caverna, entao o
 * chapeu nao se confunde com o cenario de onde o coelho acabou de sair.
 */
function createHat(scene: Scene): Mesh {
  const material = createMatteMaterial(scene, PALETTE.accentTatu, "rabbit-hat-material");
  const baseY = BODY_DIAMETER_Y / 2 - 0.05 * RABBIT_SCALE;

  const brim = MeshBuilder.CreateCylinder(
    "rabbit-hat-brim-temp",
    { diameter: HAT_BRIM_DIAMETER, height: HAT_BRIM_HEIGHT, tessellation: 14 },
    scene
  );
  brim.position.y = baseY;

  const crown = MeshBuilder.CreateCylinder(
    "rabbit-hat-crown-temp",
    {
      // Copa levemente mais larga em cima: e a silhueta classica de cartola,
      // e o afunilamento invertido ajuda a ler a forma mesmo a 3,8 cm.
      diameterBottom: HAT_CROWN_DIAMETER,
      diameterTop: HAT_CROWN_DIAMETER * 1.08,
      height: HAT_CROWN_HEIGHT,
      tessellation: 14,
    },
    scene
  );
  crown.position.y = baseY + HAT_BRIM_HEIGHT / 2 + HAT_CROWN_HEIGHT / 2;

  const hat = new Mesh("rabbit-hat", scene);
  Mesh.MergeMeshes([brim, crown], true, true, hat);
  hat.material = material;

  return hat;
}

/** Fita da cartola: mesh separada so porque a cor e outra. */
function createHatBand(scene: Scene): Mesh {
  const material = createMatteMaterial(scene, PALETTE.accentCururu, "rabbit-hat-band-material");

  const band = MeshBuilder.CreateCylinder(
    "rabbit-hat-band",
    { diameter: HAT_BAND_DIAMETER, height: HAT_BAND_HEIGHT, tessellation: 14 },
    scene
  );
  band.material = material;
  // Na base da copa, logo acima da aba — e com a MESMA inclinacao do chapeu,
  // senao a fita descola dele.
  band.position.y = BODY_DIAMETER_Y / 2 - 0.05 * RABBIT_SCALE + HAT_BRIM_HEIGHT / 2 + HAT_BAND_HEIGHT / 2;

  return band;
}

/** Par de olhos soldado (1 draw call). */
function createEyes(scene: Scene, facingSignZ: number): Mesh {
  const material = createMatteMaterial(scene, PALETTE.neutralLight, "rabbit-eye-material");
  return mergePair(scene, "rabbit-eyes", material, EYE_DIAMETER, {
    offsetX: EYE_OFFSET_X,
    offsetY: EYE_OFFSET_Y,
    offsetZ: facingSignZ * (BODY_DIAMETER_Z / 2 - 0.1 * RABBIT_SCALE),
  });
}

/**
 * Pupilas: par soldado, com material PROPRIO e emissivo baixo. Nao passam
 * pelo cache de `createMatteMaterial` justamente por causa do emissivo — o
 * cache devolve a mesma instancia por cor, e mexer no emissivo dela sujaria
 * todo mundo que usa `neutralDark` (que e quase todo bicho do jogo).
 *
 * O emissivo existe porque o coelho sai de dentro de um buraco escuro: sem um
 * minimo de brilho proprio, os olhos — a coisa que o pedido do usuario
 * enfatizou — chegariam pretos e chapados no frame que mais importa.
 */
function createPupils(scene: Scene, facingSignZ: number): Mesh {
  const material = new StandardMaterial("rabbit-pupil-material", scene);
  material.diffuseColor = Color3.FromHexString(PALETTE.neutralDark);
  material.emissiveColor = Color3.FromHexString(PALETTE.neutralDark).scale(0.9);
  applyMatteFinish(material);

  return mergePair(scene, "rabbit-pupils", material, PUPIL_DIAMETER, {
    offsetX: EYE_OFFSET_X,
    offsetY: EYE_OFFSET_Y,
    // Mais protuberante que o olho, pelo mesmo motivo das pupilas do Tatu
    // Bola: duas esferas no mesmo plano brigam por z-fighting.
    offsetZ: facingSignZ * (BODY_DIAMETER_Z / 2 + 0.06 * RABBIT_SCALE),
  });
}

interface PairOffsets {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

function mergePair(
  scene: Scene,
  name: string,
  material: StandardMaterial,
  diameter: number,
  { offsetX, offsetY, offsetZ }: PairOffsets
): Mesh {
  const spheres = [-1, 1].map((side) => {
    const sphere = MeshBuilder.CreateSphere(`${name}-temp-${side}`, { diameter, segments: 8 }, scene);
    sphere.position.set(side * offsetX, offsetY, offsetZ);
    return sphere;
  });

  const merged = new Mesh(name, scene);
  Mesh.MergeMeshes(spheres, true, true, merged);
  merged.material = material;

  return merged;
}

function createEase(): CubicEase {
  const ease = new CubicEase();
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
  return ease;
}

/** Sobressalto no tombo lateral: a orelha passa do ponto e volta. */
function createBounceEase(): BackEase {
  const ease = new BackEase(0.6);
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
  return ease;
}
