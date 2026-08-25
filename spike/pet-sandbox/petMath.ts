/**
 * Matematica pura do spike `pet-sandbox` — sem `import` de Babylon, sem DOM.
 *
 * ## Por que existe um arquivo so para isto
 *
 * O diario do projeto (`docs/experimentos/arena-180-atencao.md`, 2026-08-21)
 * nomeia a causa recorrente dos erros espaciais deste repo: *"toda posicao e
 * escrita por dead reckoning aritmetico, sem nenhuma forma de perceber que a
 * malha caiu dentro de outra, atras da camera ou abaixo do piso"*. A cena
 * canhota e o azimute 0 em `+Z` multiplicam a chance de erro de sinal, que e
 * invisivel em review e obvio na tela — depois de vinte minutos montando o
 * celular.
 *
 * Tudo que da para decidir com aritmetica mora aqui, com teste ao lado. O que
 * sobra no `spike.ts` e fiacao: quem chama quem, e o que vira malha.
 *
 * Os tipos sao ESTRUTURAIS (`{x, y, z}`) de proposito: `Vector3` do Babylon
 * satisfaz a assinatura sem o modulo precisar conhecer o Babylon, entao o teste
 * roda em Node puro e o runtime passa os vetores de verdade.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Superficie que o JOGADOR declarou — nao ha medicao, ver o SPEC e o plano. */
export type Surface = "chao" | "mesa";

/** Limites da pinca. Abaixo de 15% o pet vira sujeira; acima de 4x nao cabe na sala. */
export const MIN_SCALE = 0.15;
export const MAX_SCALE = 4;

/**
 * Intersecao de um raio com o plano horizontal `y = planeY`.
 *
 * ORACULO do picking do Babylon: o spike coloca por `scene.pick` contra a malha
 * de chao, e o teste desta funcao e o que garante que a matematica concorda com
 * o picking. Serve tambem de rede — se o `pick` devolver `null` (raio saindo
 * pela borda do ground finito de 40 m), o spike cai aqui.
 *
 * Devolve `null` quando o raio nao encontra o plano ADIANTE dele: direcao
 * paralela (|dy| desprezivel) ou apontando para o lado oposto ao plano. Nao ha
 * intersecao "atras da camera" — `t` negativo e recusa, nao resultado. Este e
 * exatamente o erro de sinal que poe conteudo nas costas do jogador.
 */
export function rayPlaneY(origin: Vec3, direction: Vec3, planeY: number): Vec3 | null {
  const dy = direction.y;

  // Paralelo ao plano: a razao explodiria. 1e-6 e folga numerica, nao tolerancia
  // de produto — um raio mais horizontal que isso ja bate a quilometros daqui.
  if (Math.abs(dy) < 1e-6) {
    return null;
  }

  const t = (planeY - origin.y) / dy;

  if (!Number.isFinite(t) || t <= 0) {
    return null;
  }

  return {
    x: origin.x + direction.x * t,
    y: planeY,
    z: origin.z + direction.z * t,
  };
}

/**
 * Angulo entre o raio e o PLANO (nao a normal), em graus, sempre positivo.
 *
 * Vai ao painel porque incidencia rasante e onde a intersecao com plano
 * amplifica erro de pose: o mesmo grau de erro angular desloca centimetros
 * olhando para baixo e metros olhando para o horizonte. Se um toque distante
 * cair no lugar errado em device, e este numero que explica — e nao "o SLAM
 * esta ruim".
 */
export function incidenceDeg(direction: Vec3): number {
  const horizontal = Math.hypot(direction.x, direction.z);

  if (horizontal < 1e-9) {
    return 90;
  }

  return Math.abs(Math.atan2(direction.y, horizontal)) * (180 / Math.PI);
}

/**
 * Escala resultante de uma pinca, SEMPRE relativa ao inicio do gesto.
 *
 * `baseScale` e a escala no `pointerdown` do segundo dedo, e `startDist` a
 * distancia entre os dedos naquele instante. Acumular frame a frame
 * (`escala *= atual/anterior`) parece equivalente e nao e: cada frame arredonda,
 * o erro se acumula, e soltar e repinicar nunca volta ao mesmo numero. Com a
 * referencia fixa no inicio do gesto, a mesma abertura de dedos da sempre a
 * mesma escala.
 */
export function pinchToScale(baseScale: number, startDist: number, currentDist: number): number {
  if (!Number.isFinite(startDist) || startDist < 1e-6 || !Number.isFinite(currentDist)) {
    return clampScale(baseScale);
  }

  return clampScale(baseScale * (currentDist / startDist));
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return 1;
  }

  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Escala do preset de um dedo so.
 *
 * O `hitTest` saiu do spike, entao ninguem MEDE se o jogador apontou para a mesa
 * ou para o chao — ele declara, num botao. O tamanho natural (`chao` = 100%) e a
 * altura real do bicho; na mesa o mesmo bicho fica desconfortavel, e 45% e o
 * chute inicial que o device vai confirmar ou corrigir.
 */
export function presetScaleFor(surface: Surface): number {
  return surface === "mesa" ? 0.45 : 1;
}

export interface StepResult {
  position: Vec3;
  arrived: boolean;
}

/**
 * Um passo da caminhada do pet ate a comida.
 *
 * O movimento e resolvido em XZ e o `y` acompanha o progresso HORIZONTAL — os
 * dois objetos vivem no mesmo plano de chao neste spike, entao na pratica o `y`
 * nao muda; a interpolacao existe para o caso de o plano ser ajustado no meio da
 * caminhada (os botoes de chao +-5 cm) sem o pet dar um pulo.
 *
 * `arrived` sai `true` quando a distancia HORIZONTAL entra no `stopRadiusM` — o
 * criterio 4 do SPEC e "o pet para EM CIMA da comida, nao ao lado dela", e quem
 * decide isso e a pegada, nao a distancia 3D.
 */
export function stepToward(
  from: Vec3,
  to: Vec3,
  speedMps: number,
  dtS: number,
  stopRadiusM: number
): StepResult {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const horizontal = Math.hypot(dx, dz);

  if (horizontal <= stopRadiusM) {
    return { position: { x: from.x, y: to.y, z: from.z }, arrived: true };
  }

  const step = Math.max(0, speedMps) * Math.max(0, dtS);

  // Passo maior que o que falta: pousa na borda do raio de parada, nunca passa
  // do alvo. Sem isso o pet oscila em torno da comida a cada frame.
  const remaining = horizontal - stopRadiusM;

  if (step >= remaining) {
    const ratio = remaining / horizontal;
    return {
      position: { x: from.x + dx * ratio, y: to.y, z: from.z + dz * ratio },
      arrived: true,
    };
  }

  const ratio = step / horizontal;
  const progress = step / remaining;

  return {
    position: {
      x: from.x + dx * ratio,
      y: from.y + (to.y - from.y) * Math.min(1, progress),
      z: from.z + dz * ratio,
    },
    arrived: false,
  };
}

/** Distancia horizontal (XZ). E a unica que importa para julgar "em cima de". */
export function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Angulo, em radianos, para o pet OLHAR na direcao do alvo.
 *
 * Convencao CANHOTA deste build, confirmada em device (2026-08-19): a frente do
 * mundo e `+Z`, e o azimute sai de `atan2(x, z)` — NAO de `atan2(x, -z)`, que e
 * a formula destra e poe o alvo nas costas. O spike anterior mediu esse erro
 * exato pondo o cubo azul atras do jogador.
 */
export function yawToward(from: Vec3, to: Vec3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
