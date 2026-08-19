/**
 * Amostragem de tela para o `hitTest` do 8th Wall.
 *
 * O que este arquivo NAO faz mais: o fit de plano. Ele morava aqui
 * (`fitGroundPlane`, `GroundPlaneFit`) junto com o anel de amostras ao redor do
 * ponto tocado (`buildSampleOffsets`), e os dois sairam quando a arena deixou de
 * ser colocada num toque. Medir o piso virou responsabilidade de
 * `src/ar/floorEstimate.ts`, que mede ALTURA (estavel no tempo) em vez de
 * devolver um plano com normal — a normal era exatamente a parte que, aplicada
 * numa arena de 2,2 m de raio, inclinava a arena inteira.
 *
 * `normalizeToCanvas` sobrevive sem chamador de proposito: a colocacao de tropa
 * por mira (Etapa 6 do plano da v3) precisa converter ponto de tela para
 * coordenada de hitTest, e o comentario dela guarda um bug de QA que ja custou
 * uma sessao de device.
 */

/**
 * Converte um ponto tocado em pixels CSS (ex.: `scene.pointerX/Y` ou
 * `touch.clientX/Y`) para coordenadas normalizadas [0,1] esperadas por
 * `XR8.XrController.hitTest`, onde (0,0) = topo-esquerdo e (1,1) = base-direita.
 *
 * GOTCHA (bug real de QA): normalizar SEMPRE por `clientWidth/clientHeight`
 * (px CSS) — nunca por `engine.getRenderWidth/Height()` (px de dispositivo,
 * ×devicePixelRatio ~3 no mobile). Misturar faz o hitTest mirar no lugar errado.
 *
 * O resultado deve ser clampeado em [0,1].
 */
export function normalizeToCanvas(
  clientX: number,
  clientY: number,
  canvas: { clientWidth: number; clientHeight: number }
): { x: number; y: number } {
  let x: number;
  let y: number;

  if (canvas.clientWidth === 0) {
    x = 0;
  } else {
    x = clientX / canvas.clientWidth;
  }

  if (canvas.clientHeight === 0) {
    y = 0;
  } else {
    y = clientY / canvas.clientHeight;
  }

  // Clamp to [0, 1]
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));

  return { x, y };
}

/**
 * Amostras (normalizadas [0,1], (0,0) = topo-esquerdo) de uma FAIXA na metade
 * inferior da tela — onde, em retrato, aparece o chão à frente de quem está de
 * pé segurando o celular. É a amostragem que substituiu o anel ao redor do
 * ponto tocado quando a arena deixou de ser colocada num toque e passou a
 * nascer no jogador: não há mais ponto de toque para amostrar em volta.
 *
 * A faixa é uma grade `rows x cols`, distribuída uniformemente entre `yTop` e
 * `yBottom` na vertical e recuada de `xInset` de cada borda na horizontal. O
 * recuo lateral existe porque as quinas inferiores da tela pegam o chão em
 * incidência rasíssima (quase paralelo ao raio), onde o hitTest do SLAM é mudo
 * ou impreciso — e um ponto ruim ali entra no fit como outlier de altura.
 *
 * Ordem estável: linha de cima para baixo, e dentro de cada linha da esquerda
 * para a direita. Nada depende da ordem hoje (o fit é robusto a permutação),
 * mas depuração em device depende de a lista não embaralhar entre execuções.
 */
export function buildFloorBandSamples(
  rows: number,
  cols: number,
  yTop: number,
  yBottom: number,
  xInset: number
): Array<{ x: number; y: number }> {
  const samples: Array<{ x: number; y: number }> = [];

  if (rows < 1 || cols < 1) {
    return samples;
  }

  // Com uma linha/coluna só, o ponto vai para o meio da faixa em vez de colar
  // numa das pontas — divisão por zero seria o resultado ingênuo aqui.
  const rowStep = rows > 1 ? (yBottom - yTop) / (rows - 1) : 0;
  const xStart = xInset;
  const xEnd = 1 - xInset;
  const colStep = cols > 1 ? (xEnd - xStart) / (cols - 1) : 0;

  for (let row = 0; row < rows; row += 1) {
    const y = rows > 1 ? yTop + row * rowStep : (yTop + yBottom) / 2;

    for (let col = 0; col < cols; col += 1) {
      const x = cols > 1 ? xStart + col * colStep : 0.5;

      samples.push({
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      });
    }
  }

  return samples;
}
