/** Modo de render escolhido antes da partida, na tela inicial. */
export type GameMode = "ar" | "canvas";

/**
 * Fase do fluxo de jogo. A ordem e `menu -> ar-setup -> world-alive ->
 * playing -> match-over`.
 *
 * `world-alive` e o Beat 4 da demo: a arena ja esta ancorada, as criaturas
 * residentes estao ociosas e NAO existe nenhum elemento de HUD na tela — sem
 * cartas, cogumelos, barra de HP, botao, timer ou texto de status. Nao ha
 * prompt nem tutorial: o jogador fica ali o tempo que quiser. A saida dessa
 * fase e o Beat 5 (tocar na torre inimiga), nunca um botao.
 *
 * `match-over` (Etapa 7/8) e o fim da partida — torre destruida ou tempo
 * esgotado. Relogio parado, combate para de aceitar toque, e o HUD de
 * batalha fica visivel por um instante curto (congelado no ultimo frame):
 * a spec proibe cortar para uma tela de resultado ("a arena se desfaz
 * gradualmente, nao corta para tela de resultado"). Depois desse instante a
 * arena se desfaz de fato (`dissolveArena`, ver `src/fx/arenaDissolve.ts`) e
 * o fluxo volta sozinho a `menu` quando a dissolucao termina — nunca ha um
 * botao ou toque para sair de `match-over` (ver `GameFlow.endMatch` e
 * `GameFlow.onMatchOverObservable`).
 */
export type GamePhase = "menu" | "ar-setup" | "world-alive" | "playing" | "match-over";
