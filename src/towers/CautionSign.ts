import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { applyMatteFinish, PALETTE, shadeHex } from "../fx/materials";
import { STEM_DIAMETER_BOTTOM, TOWER_SCALE } from "./MushroomTower";

/**
 * Placa "CUIDADO" encostada no pe da torre inimiga.
 *
 * Ela nao e decoracao: e a UNICA instrucao que a spec da demo permite. O Beat 4
 * proibe HUD, prompt e tutorial — mas uma placa de madeira dentro do mundo e
 * cenario, nao interface. E ela so cumpre esse papel se for **ilegivel de
 * longe**: quem quiser ler precisa aproximar o celular, e a aproximacao e
 * justamente o gesto que acorda o coelho (ver `ProximityTrigger`). O jogador
 * dispara a batalha satisfazendo a propria curiosidade.
 *
 * ## Por que a legibilidade NAO se calcula por angulo visual
 *
 * A tentacao e dimensionar a letra pela acuidade do olho (~1 arcmin). Isso
 * estaria certo para uma placa de verdade — e errado aqui: em RA o jogador nao
 * olha a placa, olha um **feed de camera renderizado na tela do celular**. O
 * limite nao e o olho, e quantos PIXELS DE TELA a letra ocupa depois de passar
 * pela camera. Uma letra pode subtender angulo de sobra para o olho e ainda
 * assim virar tres pixels borrados no feed.
 *
 * O modelo certo, entao, e em pixels de tela:
 *
 *   FOV vertical da camera traseira  ~= 60 graus
 *   altura util da tela em retrato    ~= 900 px CSS
 *   => resolucao angular              ~= 15 px CSS por grau
 *
 * Feed de camera tem ruido e borra: adotamos **10 px CSS** de altura de letra
 * como piso de leitura (o dobro do que se exigiria de texto nitido). Logo a
 * letra precisa de ~0,67 grau para ser lida, e:
 *
 *   a 30 cm: altura da letra = 30 * tan(0,67 deg) ~= 0,35 cm  -> LEGIVEL
 *   a 40 cm: a mesma letra cai para ~0,50 grau (~7,5 px)      -> ILEGIVEL
 *
 * E exatamente a janela que o design pede: **0,35 cm = 0,0035 m** de altura de
 * letra. Na v3 (1 unidade do Babylon = 1 metro, `src/arena/metrics.ts`) esse
 * numero e escrito DIRETO em metros — nao ha mais um fator global entre a
 * unidade do motor e o mundo real para converter.
 *
 * Como referencia de escala, a torre mede `TOWER_HEIGHT_M` (1,20 m) de altura
 * e `CAP_DIAMETER_XZ` de diametro no chapeu — a placa e um objeto de ~3 cm x
 * 1 cm ao pe dela, do tamanho de um rotulo, e nao de um outdoor.
 *
 * O modelo acima e uma aproximacao (FOV e resolucao variam por aparelho) e o
 * criterio de aceite e observacional no device. Por isso as medidas ficam em
 * constantes exportadas: depois do teste, ajustar e mexer em um numero so.
 */

/** Altura da letra, em metros (~3,5 mm reais — alvo fixo de legibilidade, ver docblock). */
export const CAUTION_LETTER_HEIGHT_UNITS = 0.0035;
/** Largura da placa: "CUIDADO" tem 7 caracteres em caixa alta. */
export const CAUTION_PLAQUE_WIDTH_UNITS = 0.03;
/** Altura da placa: a letra mais folga em cima e embaixo. */
export const CAUTION_PLAQUE_HEIGHT_UNITS = 0.01;

// Textura com a MESMA proporcao da placa (3:1), para o pixel sair quadrado e a
// palavra nao esticar. Potencias de dois por habito de GPU movel.
const TEXTURE_WIDTH = 384;
const TEXTURE_HEIGHT = 128;

// Altura de caixa alta em fontes sans bold fica em ~0,72 do `font-size`, entao
// o tamanho da fonte e a altura de letra desejada dividida por esse fator.
const CAP_HEIGHT_RATIO = 0.72;
const LETTER_HEIGHT_TEXELS =
  (CAUTION_LETTER_HEIGHT_UNITS / CAUTION_PLAQUE_HEIGHT_UNITS) * TEXTURE_HEIGHT;
const FONT_SIZE_TEXELS = Math.round(LETTER_HEIGHT_TEXELS / CAP_HEIGHT_RATIO);

/**
 * O poste e a posicao default abaixo nasceram no MESMO espaco local do
 * `body` da torre (ja com o `TOWER_SCALE` da Etapa 1, 1.7, aplicado — sao
 * comparados direto contra `STEM_DIAMETER_BOTTOM/2`, que tambem ja carregava
 * aquele fator). Esta etapa troca o `TOWER_SCALE` da torre por um valor
 * derivado de `TOWER_HEIGHT_M` (ver `MushroomTower.ts`); para o poste e a
 * placa continuarem na MESMA proporcao relativa ao caule, os literais
 * autorais abaixo (0.06, 0.55, 0.5, 1.5, -0.7) sao reescalados pela razao
 * entre o `TOWER_SCALE` novo e o antigo, em vez de pelo fator fixo de metros
 * usado na altura da letra acima (que vem de um alvo real de legibilidade,
 * nao da proporcao da torre).
 */
const LEGACY_TOWER_SCALE = 1.7;
const TOWER_RESCALE = TOWER_SCALE / LEGACY_TOWER_SCALE;

const POST_DIAMETER_UNITS = 0.06 * TOWER_RESCALE;
const POST_HEIGHT_UNITS = 0.55 * TOWER_RESCALE;
// Centro da placa acima do pe: a metade de baixo dela sobrepoe o topo do poste,
// que e o que faz a placa parecer pregada e nao flutuando.
const PLAQUE_CENTER_Y_UNITS = 0.5 * TOWER_RESCALE;
// Placa torta le como "alguem largou aqui"; placa no esquadro le como sinalizacao
// oficial, que e o oposto do tom.
const LEAN_RADIANS = -0.12;

// Posicao X default: FORA do caule, com a MESMA folga proporcional de antes
// (1.5 / 1.105 ~= 1.357 vezes o raio da base) — mas derivada do raio REAL
// (`STEM_DIAMETER_BOTTOM`, ja em metros) em vez de um literal solto, entao
// mexer em `TOWER_HEIGHT_M` nunca mais afunda a placa dentro do caule.
const DEFAULT_POSITION_X = (STEM_DIAMETER_BOTTOM / 2) * 1.357;
const DEFAULT_POSITION_Z = -0.7 * TOWER_RESCALE;

export interface CautionSignOptions {
  /**
   * Posicao no espaco LOCAL de `parent`, com a origem no PE da torre (y = 0).
   * Sem valor, a placa fica ao lado da boca da caverna, deslocada no eixo X
   * para nao tapa-la, e um pouco na direcao de quem se aproxima.
   *
   * O X padrao precisa ficar FORA do caule: o raio da base do cogumelo e
   * `STEM_DIAMETER_BOTTOM / 2` (ver `MushroomTower.ts`), hoje ~0,29 m com
   * `TOWER_HEIGHT_M` = 1,20 m. Mexeu em `TOWER_HEIGHT_M`/`TOWER_SCALE`,
   * confira este numero — a placa some dentro do caule sem avisar.
   */
  position?: Vector3;
}

/**
 * Cria a placa e a parenteia. `parent` deve ter a origem no PE da torre —
 * quem chama e responsavel por isso, porque a placa nao tem como adivinhar o
 * pivo do no que recebe.
 *
 * A face da frente do plano do Babylon aponta para **-Z** (normal `(0,0,-1)`
 * em `planeBuilder`), e o jogador se aproxima da torre inimiga vindo de -Z (a
 * torre dele esta em z = -2,0 m). Ou seja: sem rotacao nenhuma em Y o texto ja
 * nasce virado para quem chega. Nao "conserte" isso com `rotation.y = PI`.
 */
export function createCautionSign(
  scene: Scene,
  parent: TransformNode,
  options: CautionSignOptions = {}
): TransformNode {
  const root = new TransformNode("caution-sign", scene);
  root.parent = parent;
  root.position = options.position?.clone() ?? new Vector3(DEFAULT_POSITION_X, 0, DEFAULT_POSITION_Z);
  // A inclinacao vai no root, e nao na placa: inclinar so a placa a giraria em
  // torno do proprio centro e ela descolaria do poste.
  root.rotation.z = LEAN_RADIANS;

  const woodMaterial = createWoodMaterial(scene);

  const post = MeshBuilder.CreateCylinder(
    "caution-post",
    { diameter: POST_DIAMETER_UNITS, height: POST_HEIGHT_UNITS, tessellation: 8 },
    scene
  );
  post.material = woodMaterial;
  post.position = new Vector3(0, POST_HEIGHT_UNITS / 2, 0);
  post.parent = root;
  post.isPickable = false;

  const plaque = MeshBuilder.CreatePlane(
    "caution-plaque",
    { width: CAUTION_PLAQUE_WIDTH_UNITS, height: CAUTION_PLAQUE_HEIGHT_UNITS },
    scene
  );
  plaque.material = createCautionTextureMaterial(scene);
  plaque.position = new Vector3(0, PLAQUE_CENTER_Y_UNITS, -POST_DIAMETER_UNITS / 2);
  plaque.parent = root;
  plaque.isPickable = false;

  return root;
}

/**
 * Textura da placa, no padrao de `createPatternMaterial` do `ArenaSystem`.
 * `backFaceCulling` desligado porque o jogador circula a arena e vai ver a
 * placa por tras — de la o texto sai espelhado, o que e aceitavel (e ate
 * coerente) para um pedaco de madeira escrito a mao.
 */
function createCautionTextureMaterial(scene: Scene): StandardMaterial {
  const texture = new DynamicTexture(
    "caution-texture",
    { width: TEXTURE_WIDTH, height: TEXTURE_HEIGHT },
    scene,
    false
  );
  const context = texture.getContext() as CanvasRenderingContext2D;

  context.fillStyle = PALETTE.neutralLight;
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

  context.fillStyle = PALETTE.neutralDark;
  context.font = `bold ${FONT_SIZE_TEXELS}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("CUIDADO", TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2);

  // `update()` com o invertY PADRAO (true), e nao `update(false)`.
  //
  // O canvas 2D tem origem em cima a esquerda; a textura WebGL, embaixo a
  // esquerda. `invertY = true` e o que reconcilia os dois — passar `false`
  // sobe a imagem de cabeca para baixo. O `createPatternMaterial` do
  // `ArenaSystem` passa `false` e ninguem nunca percebeu porque o xadrez dele
  // e simetrico nos dois eixos: virado ou nao, e o mesmo xadrez. Texto nao
  // perdoa isso, e foi o defeito visto em device em 2026-08-14.
  texture.update();

  const material = new StandardMaterial("caution-material", scene);
  material.diffuseTexture = texture;
  material.backFaceCulling = false;
  applyMatteFinish(material);

  return material;
}

/**
 * Madeira derivada de `neutralLight`. A paleta do projeto nao tem marrom de
 * proposito (o guideline proibe marrom/bege como cor dominante), entao o poste
 * usa um tom rebaixado do neutro claro em vez de uma cor nova.
 */
function createWoodMaterial(scene: Scene): StandardMaterial {
  const material = new StandardMaterial("caution-wood-material", scene);
  material.diffuseColor = Color3.FromHexString(shadeHex(PALETTE.neutralLight, 0.72));
  applyMatteFinish(material);

  return material;
}
