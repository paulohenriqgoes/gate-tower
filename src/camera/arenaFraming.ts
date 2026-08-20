import { Camera } from "@babylonjs/core/Cameras/camera";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import { DEVICE_FOV_DEG } from "../arena/ArenaArc";
import { headingDegFromForward } from "../ar/arenaHeading";

/**
 * Altura dos olhos do jogador simulado, em metros.
 *
 * E a contraparte de tela do `DEFAULT_PLAYER_HEIGHT_M` do AR Manager — a altura
 * que a RA DECLARA ao engine para o piso cair em `y = 0`. Os dois numeros
 * respondem a mesma pergunta ("a que altura estao os olhos de quem joga?") e nao
 * precisam ser iguais: aqui e um jogador simulado, la e uma pessoa real que a
 * F3 vai deixar ajustar.
 */
export const PLAYER_EYE_HEIGHT_M = 1.6;

/**
 * Distancia do plano proximo, em metros. Menor que `FADE_END_M` (0,6 m) de
 * proposito: o fade por proximidade so consegue esconder um objeto antes do
 * corte se o corte acontecer DEPOIS dele.
 */
const NEAR_PLANE_M = 0.05;

const DEG_TO_RAD = Math.PI / 180;

/**
 * O que o modo tela precisa saber para responder "para onde o jogador esta
 * olhando". Uma interface, e nao a `Camera` do Babylon, para o teste poder
 * provar a convencao de sinal com um objeto de tres linhas — a `Camera` real
 * exige uma `Scene`, e uma `Scene` exige um engine WebGL.
 */
export interface HeadingSource {
  getDirection(localAxis: Vector3): Vector3;
}

/**
 * A camera do modo tela: o JOGADOR, parado no vertice do arco, girando o
 * tronco.
 *
 * Este arquivo mudou de assunto inteiro na v3. Ele existia para resolver
 * "quanto a camera precisa se afastar para a arena de mesa caber na tela" —
 * uma `ArcRotateCamera` orbitando um campo de 80 cm visto de cima, com o HUD
 * descontado do FOV vertical. A v3 nao tem mais nada disso: a arena e um arco
 * de 2,2 m de raio em volta do jogador, e o jogador esta DENTRO dela.
 *
 * A troca de `ArcRotateCamera` por `UniversalCamera` nao e preferencia. Uma
 * `ArcRotateCamera` orbita: arrastar o dedo move a POSICAO da camera em torno
 * de um alvo, que e "andar em volta da arena". O que a v3 pede e o oposto —
 * posicao fixa e direcao livre, que e exatamente o que a RA faz e a unica
 * coisa que torna `getCameraYawDeg()` a mesma grandeza nos dois modos. Sem
 * isso, "setor enquadrado" e "setor de spawn" nao teriam significado no modo
 * tela, e metade da v3 so poderia ser testada no celular.
 *
 * A translacao e desligada porque a v3 pede um jogador parado (spec §1): ficar
 * no lugar tambem e a maior mitigacao disponivel para o salto de relocalizacao
 * do SLAM, e simular no modo tela uma liberdade que a RA nao tem produziria
 * design que nao sobrevive ao device.
 */
export function createPlayerCamera(scene: Scene, canvas: HTMLCanvasElement): UniversalCamera {
  const camera = new UniversalCamera(
    "player-camera",
    new Vector3(0, PLAYER_EYE_HEIGHT_M, 0),
    scene
  );

  // Azimute 0 do `ArenaArc` = +Z (spec 08: numa cena canhota, que e a unica que
  // este build do 8th Wall suporta, a frente da camera com `facing` identidade
  // e o +Z). O jogador comeca olhando para o centro do arco.
  camera.setTarget(new Vector3(0, PLAYER_EYE_HEIGHT_M, 1));

  // FOV HORIZONTAL fixo, e nao o vertical do Babylon: `framedSectors` mede
  // cobertura em azimute, que e horizontal. Com o padrao (vertical fixo) o
  // arco coberto na tela mudaria com a proporcao da janela enquanto
  // `DEVICE_FOV_DEG` continuaria dizendo 60 — e o jogo passaria a nascer
  // inimigo dentro do campo de visao sem ninguem entender por que.
  camera.fovMode = Camera.FOVMODE_HORIZONTAL_FIXED;
  camera.fov = DEVICE_FOV_DEG * DEG_TO_RAD;
  camera.minZ = NEAR_PLANE_M;

  camera.attachControl(canvas, true);

  // Sem andar: nem teclado, nem inercia de translacao. So girar.
  camera.keysUp = [];
  camera.keysDown = [];
  camera.keysLeft = [];
  camera.keysRight = [];
  camera.keysUpward = [];
  camera.keysDownward = [];
  camera.speed = 0;

  return camera;
}

/**
 * Heading do jogador simulado, em graus, na convencao de `arenaHeading`
 * (0 = +Z, positivo para a direita).
 *
 * Aqui nao ha subtracao de ancora nenhuma porque a arena fica na origem do
 * mundo, sem rotacao — e desde a spec 08 isso vale nos DOIS modos, nao so no de
 * tela. A RA responde a mesma pergunta pelo mesmo caminho.
 */
export function playerYawDeg(camera: HeadingSource): number {
  const forward = camera.getDirection(Vector3.Forward());

  return headingDegFromForward(forward.x, forward.z);
}
