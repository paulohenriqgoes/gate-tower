# Experimento: pet sandbox — colocar, mover, escalar, alimentar

Diario do spike que testa as quatro acoes de um jogo de pet em RA. Contrato em
[`spike/pet-sandbox/SPEC.md`](../../spike/pet-sandbox/SPEC.md).

Ultima atualizacao: **2026-08-24**.

## Objetivo

> **O pet e a comida, colocados em momentos diferentes, continuam a mesma
> distancia um do outro depois que o jogador anda pela sala?**

Um objeto ancorado pode escorregar junto com o mundo sem ninguem notar. Dois
objetos precisam escorregar **juntos** — a diferenca entre eles e visivel.

## Linha do tempo

### (sem commit) — o chao digital venceu o hitTest (2026-08-24)

**Feito:** o spike inteiro. `spike/pet-sandbox/` (`index.html`, `spike.ts`,
`petMath.ts` puro + 26 testes), `public/pets/animal-dog.glb` (Kenney), a
dependencia `@babylonjs/loaders` (o repo nunca tinha carregado um `.glb`), e
`vitest.config.ts` incluindo `spike/**/*.test.ts`.

Decisao do dono do projeto no planejamento: **`hitTest` e custoso demais e sai**.
No lugar, uma malha de chao invisivel de 40 m em `y = 0` (`visibility = 0`,
`isPickable = true`) e picking do Babylon. Pet, comida e arrasto saem todos da
mesma intersecao raio x plano.

**Provou** (device 2026-08-24, Android/Chrome, retrato, testado pelo autor):

- **O chao digital ancora.** Nos quadros do video, o pet colocado aos ~26 s
  continua no mesmo ponto do piso aos 69 s, com o jogador andando e aproximando
  ate ~40 cm — inclusive ao aproximar, onde ancora na profundidade errada
  denuncia. Sem `hitTest`, fit de plano ou gate de colocacao.
- **A altura do plano nao precisou de ajuste.** Os botoes `chao +-5 cm` existiam
  para compensar o `origin.y = 1 m` que o engine forca em `scale: "absolute"`. O
  autor nao os usou. Nao prova erro zero — prova erro **abaixo do limiar de
  percepcao** entre ~0,4 m e ~2 m. Corrobora o resultado de 2026-08-19 em
  [`arena-180-atencao.md`](arena-180-atencao.md).
- **Dois objetos coexistem.** Saindo da mesma intersecao raio x plano, o erro de
  distancia entre eles some por construcao; sobra so a deriva do SLAM entre as
  duas colocacoes. Confirmado a olho: o pet caminhou ate a comida e parou em
  cima. Numeros nao lidos (hipotese 2).
- **`scene.pick` nao existe sem `@babylonjs/core/Culling/ray`.** O picking e
  anexado ao `Scene` por efeito colateral desse modulo. Com imports granulares o
  codigo tipa, builda, e quebra so no primeiro toque, em device.
- **Painel de diagnostico cobrindo a tela invalida a sessao.** A primeira versao
  usava ~60% do quadro; o autor: "nao consigo testar nada do jeito que esta",
  com 20 fps. Em RA o feed da camera **e** o instrumento de medicao. Separar HUD
  contextual de gaveta `···` devolveu tela e frame.
- **Blob de sombra tem dois numeros errados possiveis, e eles puxam em sentidos
  opostos.** Com gradiente indo do centro direto a zero e disco a 1,15x a pegada,
  a parte escura cai toda sob o corpo do pet e so o rabo do gradiente escapa —
  autor: "tem sombra, so esta um pouco fraca". Com **plato** de opacidade ate 35%
  do raio e disco a 1,6x, ela apareceu, mas: "melhorou, mas ficou um pouco
  grande" — 1,6x deixa ~17 cm de sombra para fora do corpo, o que le como poca e
  nao como contato. A regra que sai disso: **empurre o plato para fora, nao o
  disco**. Plato a 55% do raio deixa apertar o disco para 1,25x mantendo o anel
  visivel. O valor ajustado nao voltou a device.
- **Objeto colocado sem escrever rotacao nasce de costas.** O `+Z` do modelo (a
  frente, na convencao canhota) apontava para o `+Z` do mundo, que e para onde o
  jogador olhava ao entrar. A caminhada ja acertava isso; so a colocacao ficou
  sem. Corrigido e **confirmado em device no mesmo dia**: virar o pet para o
  jogador na colocacao, no fim do lerp de mover, ao soltar o arrasto e depois de
  comer. O autor: "reposiciono o pet e ele passa a olhar para mim". O ganho nao e
  de acabamento — o rosto e a unica parte do modelo que faz o objeto ler como
  bicho em vez de caixa, e ele so aparece se alguem escrever a rotacao.

**Nao resolveu:**

- **Nenhuma metrica numerica foi lida.** `parou a` vs `esperado`, `DERIVA REAL`,
  saltos de SLAM: a gaveta nao foi aberta depois da alimentacao. O veredito da
  sessao e visual e por relato.
- **O tamanho final da sombra nao foi a device.** Plato a 55% do raio e disco a
  1,25x a pegada: compila, testes verdes, build limpo — nao testado. E o terceiro
  valor tentado para o mesmo numero, e os dois primeiros so falharam em device.
- **Criterio 7 perdeu o dado.** "O tamanho sugerido acerta o contexto" dependia
  de medir superficie. Virou botao manual; o device confirmou que o preset
  funciona, nao que o jogo acerta sozinho.
- **Nada em iPhone.** O SPEC pede os dois sistemas.

**Revoga** — a prescricao de ancoragem da skill `babylonjs-game-dev`, em dois
lugares:

- `SKILL.md` §2 abria com "Ordem obrigatoria: calibrar -> tocar -> **hitTest** ->
  travar". O `hitTest` passou a exigir pedido explicito; o padrao e o chao
  digital.
- `references/ar-drift-e-grounding.md` "Passo 2" prescrevia grid de `hitTest` +
  fit de plano + mediana dos inliers. Marcado como **nao recomendado**, com o
  motivo que o autor nomeou: as probes mudam de posicao a cada ciclo, a altura
  estimada oscila e o conteudo treme. Os numeros de campo (32 cm de dispersao
  mediana, 11 de 12 pontos passando pela rejeicao) ficam la como evidencia de
  *por que* a medicao nao paga.

**Resultado em device.** Tres sessoes: (1) 8:57, o `Ray` faltando — nada colocado,
20 fps, tela poluida; (2) 9:12, video de 71,8 s — so colocar e ancorar
(escala em 100%, modo `tocar`, comida nunca armada); foi nela que apareceu o pet
de costas e sem sombra visivel; (3) sem video, relatada pelo autor — comida,
caminhada, arrasto e pinca, nenhuma acao reprovou, nenhum numero lido.

**Nota de metodo.** O relato chegou como video que nenhuma ferramenta da sessao
lia. Um script Swift com `AVAssetImageGenerator` extraiu 19 quadros e virou a
fonte dos tempos citados acima. Sem isso a entrada seria "o autor disse que
funcionou".

## Hipoteses

Progresso de validacao. Numeracao **estavel**: item novo entra no fim.

| # | Hipotese | Situacao |
|---|---|---|
| 1 | o chao digital falha em superficie que nao e o chao (mesa, sofa) | **VIVA** — a troca explicita feita ao tirar o `hitTest`; toda a sessao foi no chao |
| 2 | a distancia pet-comida se mantem, mas ninguem mediu | **VIVA** — confirmada a olho (2026-08-24), nunca em numero |
| 3 | a deriva acumula em sessao longa | **VIVA** — a mais longa medida foi 71,8 s |
| 4 | o plato no gradiente conserta a sombra fraca | **RESPONDIDA** (2026-08-24) — conserta: com plato a sombra aparece. O que continua aberto e o DIAMETRO, ver 7 |
| 5 | virar o pet para o jogador resolve o "de costas" | **RESPONDIDA** (2026-08-24) — confirmado em device pelo autor: o pet passa a olhar para quem o reposiciona |
| 6 | o `hitTest` nunca foi necessario para ancorar neste projeto | **VIVA** — venceu no chao; nada diz que vence no resto |
| 7 | disco a 1,25x a pegada e o tamanho certo da sombra | **VIVA** (2026-08-24) — 1,15x sumiu, 1,6x ficou grande; 1,25x nao foi a device |

**Testes que decidem cada uma:**

1. Apontar para uma mesa a ~1 m e tocar. Se o pet cair no chao atras dela, a
   saida e um segundo plano ajustavel — nao o `hitTest` de volta.
2. Comida a >2 m, deixar caminhar, ler `parou a` contra `esperado`. Diferenca
   acima de ~5 mm = parou ao lado.
3. `MARCAR` e medir `VOLTEI AO PONTO` a cada minuto por 3 minutos. Comparar com
   os 0,075 m de mediana ja medidos na v3.
4. Ja rodado (2026-08-24): o plato fez a sombra aparecer. Nao ha teste pendente
   aqui — o que sobrou virou a hipotese 7.
5. Ja rodado (2026-08-24): colocar e reposicionar o pet, e ver se ele encara o
   jogador. Passou em device. Nao ha teste pendente aqui.
6. Nao se decide num experimento so. Cada caso de uso que o chao digital atender
   empurra a hipotese; o primeiro que exigir medicao real a derruba. A hipotese 1
   e a primeira parcela.
7. Pet a ~1 m sobre piso claro, de pe: a sombra tem que aparecer sem procurar
   **e** parar perto das patas. Se ainda ler como poca, aperte o disco antes de
   mexer na opacidade — foi o plato, e nao o tamanho, que resolveu a visibilidade.
