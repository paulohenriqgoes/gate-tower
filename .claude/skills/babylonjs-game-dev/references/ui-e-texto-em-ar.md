# HUD, GUI e texto no mundo em AR

## Armadilhas do GUI 2D que só aparecem no device

- **`width`/`height` aceitam apenas `px` e `%`.** Qualquer outra unidade é engolida em
  silêncio: o regex de `ValueAndUnit` casa string vazia contra `"auto"`,
  `parseFloat("")` devolve `NaN`, e o controle não renderiza. Não lança, não avisa, e o
  `tsc` não pega porque a propriedade é tipada como `string`. Um HUD inteiro some com
  build verde. Vale um teste que varra o código-fonte da UI atrás de literais inválidos.

- **`idealWidth`/`idealHeight` mudam a escala física de tudo.** Com `useSmallestIdeal`, o
  Babylon divide pela largura em retrato e pela altura em paisagem. Num celular retrato
  com `idealWidth = 720`, 1 px ideal vale ~0,54 px CSS — **todo valor em px encolhe quase
  pela metade**. Um alvo de toque precisa de ~82 px ideais para chegar aos 44 px CSS
  recomendados, e texto sem `fontSize` explícito vira ilegível. Não confie no desktop.

- **Controles que aparecem e não respondem: é TAMANHO, não câmera.** O
  `AdvancedDynamicTexture` fullscreen converte o toque com
  `x * textureSize.width / engine.getRenderWidth()`, e `textureSize` só é recalculado
  quando `engine.onResizeObservable` dispara — o que só acontece se alguém chamar
  `engine.resize()`. Se o canvas muda sem passar por lá (entrar/sair de tela cheia, um
  app que pula o resize durante a AR), a textura fica com o tamanho velho e o toque cai
  fora do alvo. O erro cresce conforme se desce na tela: **os controles do rodapé param
  primeiro**, dando a impressão de que só alguns quebraram.

  `scene.cameraToUseForPointers` raramente é a causa — o Babylon faz fallback em
  `scene.activeCamera`, então trocar de câmera em runtime normalmente não quebra nada.

  Diagnóstico em um olhar — jogue na tela `canvas.clientWidth/clientHeight`,
  `engine.getRenderWidth()/getRenderHeight()`, `getHardwareScalingLevel()` e
  `advancedTexture.getSize()`. Se `clientHeight !== getRenderHeight() * hardwareScalingLevel`,
  é tamanho.

  Regra prática em AR: pule `engine.resize()` por padrão, mas redimensione quando
  `canvas.clientWidth/Height` divergir de
  `getRenderWidth/Height() * getHardwareScalingLevel()` além de ~2 px. Em regime normal
  nunca dispara; quando dispara, a alternativa é um ponteiro permanentemente quebrado.

  Teste decisivo: entre em AR **já** em tela cheia e confirme que o HUD responde; depois
  **saia** da tela cheia no meio da sessão. Se só o segundo caso quebra, é este bug.

- **Painel de debug:** com `textWrapping = false` e `resizeToFit = true`, a linha mais
  larga define a largura do container. Um único campo comprido (um `join(",")`) empurra
  o resto para fora da tela e esconde os números que você foi ler. Trunque os valores.

## Texto no mundo 3D (placas, rótulos, tags diegéticas)

- **Legibilidade se calcula em PIXELS DE TELA, não em ângulo visual.** O jogador não olha
  o objeto: olha um feed de câmera renderizado numa tela de celular. Uma letra pode
  subtender ângulo de sobra para o olho e ainda virar três pixels borrados no feed.

  Modelo prático: FOV vertical da traseira ~60°, altura útil em retrato ~900 px CSS →
  **~15 px CSS por grau**. Piso de **10 px CSS** de altura de letra (o dobro do que se
  exigiria de texto nítido, porque feed de câmera tem ruído e borra). Daí:

  ```
  altura_física = distância × tan(altura_em_px / 15°)
  ```

  Dimensionar por acuidade do olho (~1 arcmin) produziu, num caso real, uma placa ~8×
  maior que o pretendido — legível do outro lado da sala quando o design pedia que só
  fosse legível de perto.

- **`DynamicTexture.update(false)` sobe a imagem de cabeça para baixo.** O canvas 2D tem
  origem em cima à esquerda; a textura WebGL, embaixo. O parâmetro é `invertY` e o padrão
  (`true`) reconcilia os dois — chame `update()`, sem argumento. Passa despercebido em
  textura simétrica (xadrez, gradiente radial), então o `false` sobrevive no código até
  alguém desenhar o primeiro texto.
