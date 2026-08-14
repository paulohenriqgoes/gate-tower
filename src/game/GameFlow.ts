import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Observable, type Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

import type { ArSessionController } from "../ar/ArSessionController";
import { type MatchOverPayload, resolveMatchResultByHpPct, type TeamId } from "../battle/BattleTypes";
import { EnemyScriptRunner, type EnemyDeployment } from "../battle/EnemyScript";
import type { MatchClock } from "../battle/MatchClock";
import type { CardDeckSystem } from "../cards/CardDeckSystem";
import type { CombatEngine } from "../combat/CombatEngine";
import { dissolveArena } from "../fx/arenaDissolve";
import type { WorldTapRouter } from "../interaction/WorldTapRouter";
import type { MushroomTower } from "../towers/MushroomTower";
import type { ProximityTrigger, WakeStage } from "../towers/ProximityTrigger";
import type { TowerWakeup } from "../towers/TowerWakeup";
import type { CardDeckHud } from "../ui/CardDeckHud";
import { HEALTH_BAR_ROOT_SUFFIX } from "../ui/HealthBarMesh";
import type { HudLayer } from "../ui/HudLayer";
import type { StartScreen } from "../ui/StartScreen";
import { enterImmersiveMode, installImmersiveModeOnGesture } from "../ui/screenOrientation";
import type { GameMode, GamePhase } from "./GameTypes";

/**
 * Quanto tempo o HUD de batalha (congelado no ultimo frame) fica visivel em
 * `match-over` ANTES da arena comecar a se desfazer (Beat 7). So o bastante
 * para o jogador registrar o resultado final na tela — a spec proibe cortar
 * para uma tela de resultado, mas tambem nao pede que a dissolucao comece no
 * mesmo frame em que a torre morre.
 */
const MATCH_OVER_HUD_HOLD_MS = 1200;

/**
 * Brilho da caverna com o jogador longe. Nao e zero de proposito: uma caverna
 * apagada nao chama ninguem, e o Beat 4 proibe qualquer prompt de HUD — a
 * brasa acesa no escuro e a UNICA coisa que puxa a pessoa para perto. Sobe
 * ate 1 conforme ela se aproxima (ver `ProximityTrigger.getGlowIntensity`).
 */
const RESTING_GLOW = 0.55;
/**
 * Respiracao lenta somada ao brilho. Fica no lugar do "psiu psiu" da
 * referencia enquanto o projeto nao tem audio (Fase 03 nao comecou): sem som,
 * o chamado precisa ser visual, e uma brasa que pulsa le como coisa viva
 * enquanto uma luz fixa le como cenario.
 */
const GLOW_PULSE_AMPLITUDE = 0.25;
const GLOW_PULSE_PERIOD_MS = 1900;

export interface GameFlowOptions {
  arManager: ArSessionController;
  arenaRoot: TransformNode;
  canvas: HTMLCanvasElement;
  cardDeckHud: CardDeckHud;
  cardDeckSystem: CardDeckSystem;
  combatEngine: CombatEngine;
  /** Torre que o jogador toca para acordar o inimigo (Beat 5). */
  enemyTowerMesh: Mesh;
  /**
   * A torre inimiga como cogumelo: e por ela que o Beat 5 por aproximacao
   * acende a caverna, abre os olhos e faz os olhos acompanharem a camera.
   */
  enemyTower: MushroomTower;
  /**
   * Posicao da camera JA convertida ao espaco local do `arenaRoot`, ou `null`
   * se nao houver camera ativa. Vem de fora (`main.ts`) porque la ja existe
   * essa conversao, cacheada por frame e compartilhada com a populacao
   * residente — refazer aqui seria uma segunda inversao de matriz por frame.
   */
  getCameraArenaLocalPosition: () => Vector3 | null;
  hudLayer: HudLayer;
  /**
   * Relogio de partida (Etapa 7). Injetado (nao criado aqui) porque o
   * `CombatEngine` tambem precisa dele — `getRemainingMs` no `card_deployed`
   * — e ambos sao construidos em `main.ts` antes de `GameFlow` existir.
   */
  matchClock: MatchClock;
  /**
   * Carta que a torre inimiga revela ao acordar. E a PRIMEIRA carta do
   * `ENEMY_SCRIPT` (ver `src/battle/EnemyScript.ts`) — a spec pede que a
   * torre revele "uma das cartas que a IA vai usar", e a demo usa a que vai
   * aparecer primeiro.
   */
  revealedEnemyCardId: string;
  /**
   * Gatilho de proximidade do Beat 5. Injetado (nao criado aqui) porque as
   * distancias sao calibradas com telemetria de device e quem monta a cena
   * precisa poder passar outra config sem mexer no fluxo.
   */
  proximityTrigger: ProximityTrigger;
  /** Cada mudanca de estagio do gatilho, para a telemetria de `main.ts`. */
  onWakeStageChanged?: (stage: WakeStage, distanceUnits: number) => void;
  /** Dona do `onBeforeRenderObservable` que a dissolucao da arena usa para escalonar a saida de cada elemento (Etapa 8). */
  scene: Scene;
  startScreen: StartScreen;
  towerWakeup: TowerWakeup;
  worldTapRouter: WorldTapRouter;
}

/**
 * Orquestrador unico do fluxo de jogo. Liga e desliga cada subsistema
 * conforme a fase (`menu`, `ar-setup`, `world-alive`, `playing`, `match-over`)
 * — e o unico modulo que conhece todos os outros; nenhum deles conhece este.
 *
 * O coracao da demo e a fase `world-alive` (Beat 4): arena ancorada, criaturas
 * ociosas e ZERO elemento de HUD na tela. Nao ha timer, prompt ou tutorial — o
 * jogador fica ali o tempo que quiser. A unica saida e o Beat 5: aproximar o
 * celular da torre inimiga e tocar nela. Nao existe botao de "comecar" em
 * lugar nenhum, e tocar em qualquer outra coisa nao faz absolutamente nada
 * (se a pessoa nao se aproxima sozinha, isso e resultado do teste, nao falha
 * do teste).
 */
export class GameFlow {
  /** Fase mudou. Quem monta a cena usa para ligar/desligar o que e dele. */
  public readonly onPhaseChangedObservable = new Observable<GamePhase>();
  /**
   * Instante EXATO do toque que acorda o inimigo — antes da animacao, nao
   * depois. E o fim do Beat 4 para a telemetria (`enemy_awakened`), e a
   * diferenca para `arena_placed` e a metrica principal do teste.
   */
  public readonly onEnemyAwakenedObservable = new Observable<void>();
  /**
   * Fim de partida: torre destruida ou tempo esgotado. Dispara ao ENTRAR em
   * `match-over`, antes do HUD congelado ficar visivel e antes da arena
   * comecar a se desfazer (Beat 7, `endMatch`) — e a UNICA leitura do
   * resultado (`match_ended` na telemetria, ver `main.ts`); nao existe tela
   * de resultado em nenhum ponto deste fluxo (a spec proibe cortar para uma).
   */
  public readonly onMatchOverObservable = new Observable<MatchOverPayload>();

  private readonly options: GameFlowOptions;
  // Dono do script fixo do inimigo (Etapa 7). Construido aqui (nao injetado)
  // porque nao tem nenhuma dependencia de Babylon nem de outro modulo — so
  // precisa do callback que liga `EnemyDeployment` ao `CombatEngine`.
  private readonly enemyScriptRunner: EnemyScriptRunner;

  private phase: GamePhase = "menu";
  // Modo escolhido na tela inicial. So existe a partir da primeira escolha;
  // decide se `playing` pode mexer em `arenaRoot.setEnabled` (ver spec).
  private mode: GameMode | null = null;
  // `installImmersiveModeOnGesture` so pode ser chamado uma vez por gesto
  // instalado; reinstalar a cada volta ao menu duplicaria o listener.
  private hasInstalledImmersiveGesture = false;
  // Beat 5 em andamento: o toque repetido durante a animacao nao pode
  // reiniciar o "acordar" nem entrar duas vezes em `playing`.
  private isAwakeningEnemy = false;
  private isDisposed = false;
  // Beat 7 (`match-over`): timer do "HUD congelado por um instante" antes da
  // dissolucao comecar, e a funcao de cancelamento devolvida por
  // `dissolveArena` enquanto ela esta rodando. Os dois sao nulos fora de
  // `match-over` — `dispose()` os usa para nao deixar timer solto nem a
  // arena presa pela metade se a cena for descartada no meio do Beat 7.
  private matchOverHoldTimeoutHandle: number | null = null;
  private cancelArenaDissolve: (() => void) | null = null;

  // Posicao da boca da caverna no espaco do `arenaRoot`, calculada uma vez.
  // O `body` da torre nao tem rotacao nem escala propria (ele E o no que o
  // `ArenaSystem` pendura no `arenaRoot`), entao somar a posicao local do
  // marcador basta — nao precisa de matriz de mundo, que em RA ainda traria a
  // escala de ~0.033 junto e faria a distancia sair em metros no meio de uma
  // conta em unidades autorais.
  private readonly caveMouthArenaLocal: Vector3;
  private lastWakeStage: WakeStage = "asleep";

  private readonly modeSelectedObserver: Observer<GameMode>;
  private readonly arenaPlacedObserver: Observer<void>;
  private readonly sessionFailedObserver: Observer<string>;
  private readonly towerDestroyedObserver: Observer<TeamId>;
  private readonly matchExpiredObserver: Observer<void>;
  private readonly finalMinuteObserver: Observer<void>;

  public constructor(options: GameFlowOptions) {
    this.options = options;

    this.caveMouthArenaLocal = options.enemyTower.body.position.add(
      options.enemyTower.caveMouth.position
    );

    this.enemyScriptRunner = new EnemyScriptRunner({
      onDeploy: (deployment) => this.handleEnemyDeployment(deployment),
    });

    this.modeSelectedObserver = options.startScreen.onModeSelectedObservable.add((mode) => {
      this.handleModeSelected(mode);
    });

    // Ancorar a arena JA entra no mundo vivo: nao ha mais confirmacao no meio
    // (o botao "Comecar" saiu junto com o painel de setup).
    this.arenaPlacedObserver = options.arManager.onArenaPlacedObservable.add(() => {
      this.handleArenaPlaced();
    });

    this.sessionFailedObserver = options.arManager.onSessionFailedObservable.add((message) => {
      this.handleSessionFailed(message);
    });

    // Condicao de vitoria/derrota imediata: a torre de QUALQUER time morreu.
    this.towerDestroyedObserver = options.combatEngine.onTowerDestroyedObservable.add((destroyedTeam) => {
      this.handleTowerDestroyed(destroyedTeam);
    });

    // Tempo esgotado: desempate por percentual de HP (ver `resolveMatchResultByHpPct`).
    this.matchExpiredObserver = options.matchClock.onExpiredObservable.add(() => {
      this.handleMatchTimeExpired();
    });

    // Cogumelo em dobro no ultimo minuto. `setRegenerationMultiplier` volta a
    // 1 sozinho quando a regeneracao para (ver `CardDeckSystem.stopRegeneration`).
    this.finalMinuteObserver = options.matchClock.onFinalMinuteObservable.add(() => {
      this.options.cardDeckSystem.setRegenerationMultiplier(2);
    });

    this.registerWorldTapHandlers();
  }

  /** Entra na fase `menu`. Chamar uma vez, no bootstrap. */
  public start(): void {
    this.setPhase("menu");
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  /**
   * Chamar a cada frame do render loop (`scene.onBeforeRenderObservable`,
   * ligado em `main.ts` — GameFlow nao tem `scene` proprio, so orquestra).
   * So faz algo durante `playing`: avanca o relogio (que dispara os
   * observables de ultimo minuto/expiracao por conta propria via `tick()`),
   * roda o script do inimigo e atualiza o HUD de timer + HP das duas torres.
   * Fora de `playing` — inclusive em `match-over` — e no-op: o ultimo estado
   * exibido fica congelado, que e o que "relogio para" pede.
   */
  public update(): void {
    // Beat 5 por APROXIMACAO. O toque na torre continua funcionando (ver
    // `handleWorldAliveTap`), mas deixou de ser o unico caminho — e era o
    // unico, num gesto que falhou em quatro testes de device seguidos. A
    // telemetria de 2026-08-14 fecha o argumento: a pessoa chegou a 25 cm da
    // torre, ficou 3,5 s abaixo de 30 cm, e a partida nunca comecou.
    //
    // Aproximar-se tambem alinha a mecanica com a METRICA da demo, que e
    // justamente o quanto a pessoa se aproxima da arena: o gesto que o teste
    // mede passou a ser o gesto que o jogo pede.
    if (this.phase === "world-alive") {
      this.updateEnemyProximity();
      return;
    }

    if (this.phase !== "playing") {
      return;
    }

    const { combatEngine, hudLayer, matchClock } = this.options;

    matchClock.tick();
    this.enemyScriptRunner.update(matchClock.getElapsedMs());

    hudLayer.setMatchTimer(matchClock.getRemainingMs());

    const playerHealth = combatEngine.getTowerHealth("player");
    hudLayer.setTowerHealth("player", playerHealth.current, playerHealth.max);

    const enemyHealth = combatEngine.getTowerHealth("enemy");
    hudLayer.setTowerHealth("enemy", enemyHealth.current, enemyHealth.max);
  }

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    // Beat 7 pode estar em andamento no momento do dispose (cena descartada
    // no meio do "HUD congelado" ou no meio da dissolucao) — sem isto o
    // timer dispararia depois do jogo desmontado, e a dissolucao deixaria a
    // arena presa na metade (a propria `dissolveArena` restaura tudo ao
    // cancelar, mas so se a funcao devolvida for de fato chamada).
    if (this.matchOverHoldTimeoutHandle !== null) {
      window.clearTimeout(this.matchOverHoldTimeoutHandle);
      this.matchOverHoldTimeoutHandle = null;
    }

    if (this.cancelArenaDissolve) {
      this.cancelArenaDissolve();
      this.cancelArenaDissolve = null;
    }

    this.options.startScreen.onModeSelectedObservable.remove(this.modeSelectedObserver);
    this.options.arManager.onArenaPlacedObservable.remove(this.arenaPlacedObserver);
    this.options.arManager.onSessionFailedObservable.remove(this.sessionFailedObserver);
    this.options.combatEngine.onTowerDestroyedObservable.remove(this.towerDestroyedObserver);
    this.options.matchClock.onExpiredObservable.remove(this.matchExpiredObserver);
    this.options.matchClock.onFinalMinuteObservable.remove(this.finalMinuteObserver);
    this.onPhaseChangedObservable.clear();
    this.onEnemyAwakenedObservable.clear();
    this.onMatchOverObservable.clear();
  }

  /**
   * Cada fase tem UM dono do toque, registrado de uma vez so aqui. O
   * `WorldTapRouter` assina `onPointerObservable` uma unica vez e despacha
   * conforme a fase corrente — antes disso o AR Manager e o CombatEngine
   * assinavam o ponteiro cada um por si e se guardavam com flags.
   */
  private registerWorldTapHandlers(): void {
    const { arManager, combatEngine, worldTapRouter } = this.options;

    worldTapRouter.setHandler("ar-setup", () => {
      arManager.tryPlaceArenaAtPointer();
    });

    worldTapRouter.setHandler("world-alive", (_pickedPoint, pickedMesh) => {
      // O "Reposicionar" de `?debug=1` devolve a sessao ao modo de ancoragem
      // sem sair da fase; nesse caso o toque e da ancoragem, nao do Beat 5.
      if (arManager.tryPlaceArenaAtPointer()) {
        return;
      }

      this.handleWorldAliveTap(pickedMesh);
    });

    // Ponto de extensao da etapa de invocacao em dois toques: ela reescreve o
    // miolo do deploy no CombatEngine, sem precisar mexer em quem roteia.
    worldTapRouter.setHandler("playing", (pickedPoint) => {
      if (arManager.tryPlaceArenaAtPointer()) {
        return;
      }

      if (!pickedPoint) {
        return;
      }

      combatEngine.tryDeployAtWorldPoint(pickedPoint);
    });
  }

  private handleModeSelected(mode: GameMode): void {
    if (this.phase !== "menu") {
      return;
    }

    this.mode = mode;
    this.options.startScreen.setMessage("");

    if (mode === "canvas") {
      this.installImmersiveModeGestureOnce();
      // O modo tela nao tem ancoragem, entao entra direto no mundo vivo: os
      // beats 4 e 5 valem igual (a logica de jogo e independente do modo de
      // render), e e assim que da para testar o gesto fora do celular.
      this.setPhase("world-alive");
      return;
    }

    // A fase entra ANTES de `enterAR`: o caminho de "RA indisponivel" notifica
    // a falha de forma sincrona, e se a fase so mudasse depois esse setPhase
    // sobrescreveria a volta ao menu — o jogo ficaria em `ar-setup` sem menu e
    // sem sessao.
    this.setPhase("ar-setup");
    // O lock de retrato e pedido ANTES de subir a sessao, de proposito: pedir
    // fullscreen/lock com a RA no ar redimensiona o canvas e reprojeta a cena
    // no meio do tracking (ver screenOrientation.ts). `applyArOrientationPolicy`
    // pode falhar sem lancar (iOS Safari nao tem a API de lock) — nesse caso o
    // overlay CSS de retrato de index.html assume, e `enterAR` sobe do mesmo
    // jeito.
    void this.applyArOrientationPolicy().then(() => this.options.arManager.enterAR());
  }

  /** Arena ancorada no piso real: comeca o Beat 4. */
  private handleArenaPlaced(): void {
    if (this.phase !== "ar-setup") {
      return;
    }

    this.setPhase("world-alive");
  }

  /**
   * Beat 5. So a torre inimiga (ou um filho dela — a barra de vida e o proprio
   * cilindro sao nos distintos) responde ao toque. Qualquer outro alvo: NADA
   * acontece. Sem mensagem, sem dica, sem tutorial.
   */
  private handleWorldAliveTap(pickedMesh: AbstractMesh | null): void {
    if (!this.isEnemyTowerPick(pickedMesh)) {
      return;
    }

    this.awakenEnemy();
  }

  /**
   * Estagio do gatilho de proximidade + feedback continuo da caverna. Roda por
   * frame durante `world-alive`, e e o unico lugar que mexe no visual da torre
   * inimiga nessa fase.
   *
   * O feedback e CONTINUO de proposito: a caverna nao liga num degrau ao
   * cruzar um limiar, ela responde a cada centimetro. E o que ensina o gesto
   * sem instrucao nenhuma — a pessoa percebe que chegar perto faz mais coisa
   * acontecer e chega mais perto de proposito, que e exatamente o
   * comportamento que a demo existe para medir.
   */
  private updateEnemyProximity(): void {
    const { enemyTower, getCameraArenaLocalPosition, proximityTrigger } = this.options;
    const cameraLocal = getCameraArenaLocalPosition();

    if (!cameraLocal) {
      return;
    }

    const nowMs = performance.now();
    const distanceUnits = Vector3.Distance(cameraLocal, this.caveMouthArenaLocal);
    const stage = proximityTrigger.update(distanceUnits, nowMs);
    const approach = proximityTrigger.getGlowIntensity();

    // Respiracao somada ao brilho de aproximacao, e nao multiplicada: pulso
    // proporcional sumiria justo quando a caverna esta apagada, que e quando
    // ela mais precisa chamar atencao.
    const pulse = GLOW_PULSE_AMPLITUDE * Math.sin((nowMs / GLOW_PULSE_PERIOD_MS) * Math.PI * 2);

    enemyTower.setGlow(RESTING_GLOW + (1 - RESTING_GLOW) * approach + pulse);
    enemyTower.setEyesOpen(approach);
    enemyTower.lookAt(cameraLocal);

    if (stage !== this.lastWakeStage) {
      this.lastWakeStage = stage;
      this.options.onWakeStageChanged?.(stage, distanceUnits);
    }

    if (stage === "leaping") {
      this.awakenEnemy();
    }
  }

  /**
   * O acordar propriamente dito, compartilhado pelos DOIS caminhos de entrada
   * (aproximacao e toque). Idempotente por `isAwakeningEnemy`: com o gatilho
   * de proximidade rodando por frame, isto seria chamado a cada frame depois
   * do salto se nao fosse a guarda.
   */
  private awakenEnemy(): void {
    if (this.phase !== "world-alive" || this.isAwakeningEnemy) {
      return;
    }

    this.isAwakeningEnemy = true;
    // Notifica ANTES da animacao: o que a metrica mede e o tempo ate a pessoa
    // decidir se aproximar, nao a duracao do efeito.
    this.onEnemyAwakenedObservable.notifyObservers();

    void this.options.towerWakeup
      .play(this.options.enemyTower, this.options.revealedEnemyCardId)
      .then(() => {
        this.isAwakeningEnemy = false;

        // A sessao pode ter caido (volta ao menu) — ou a cena inteira ter sido
        // descartada, que resolve a promessa no meio do beat — durante a
        // animacao.
        if (this.isDisposed || this.phase !== "world-alive") {
          return;
        }

        this.setPhase("playing");
      });
  }

  private isEnemyTowerPick(pickedMesh: AbstractMesh | null): boolean {
    if (!pickedMesh) {
      return false;
    }

    const enemyTower = this.options.enemyTowerMesh;

    return pickedMesh === enemyTower || pickedMesh.isDescendantOf(enemyTower);
  }

  private handleSessionFailed(message: string): void {
    // Falha em qualquer fase manda de volta ao menu com o motivo visivel.
    this.options.startScreen.setMessage(message);
    this.setPhase("menu");
  }

  /** Ponte entre `EnemyScriptRunner` (puro) e `CombatEngine` (Babylon). */
  private handleEnemyDeployment(deployment: EnemyDeployment): void {
    if (this.phase !== "playing") {
      return;
    }

    this.options.combatEngine.deployEnemyUnit(deployment.cardId, new Vector3(deployment.x, 0, deployment.z));
  }

  /** Torre destruida encerra na hora: quem perdeu a torre perde a partida. */
  private handleTowerDestroyed(destroyedTeam: TeamId): void {
    if (this.phase !== "playing") {
      return;
    }

    this.endMatch(destroyedTeam === "enemy" ? "win" : "loss");
  }

  /** Tempo esgotado: desempate por percentual de HP da torre. */
  private handleMatchTimeExpired(): void {
    if (this.phase !== "playing") {
      return;
    }

    const playerHpPct = this.options.combatEngine.getTowerHealthPct("player");
    const enemyHpPct = this.options.combatEngine.getTowerHealthPct("enemy");

    this.endMatch(resolveMatchResultByHpPct(playerHpPct, enemyHpPct));
  }

  private endMatch(result: MatchOverPayload["result"]): void {
    if (this.phase === "match-over") {
      return;
    }

    const playerHpPct = this.options.combatEngine.getTowerHealthPct("player");
    const enemyHpPct = this.options.combatEngine.getTowerHealthPct("enemy");

    this.setPhase("match-over");
    // Telemetria PRIMEIRO, antes do HUD sumir ou da arena comecar a se
    // desfazer: e a UNICA leitura do resultado, ja que a spec proibe
    // qualquer tela de vitoria/derrota (ver `match_ended` em `main.ts`).
    this.onMatchOverObservable.notifyObservers({ result, playerHpPct, enemyHpPct });

    // Beat 7: HUD fica congelado por um instante curto, DEPOIS a arena
    // comeca a se desfazer. Sem essa espera a dissolucao comecaria no MESMO
    // frame em que a torre morre, cortando o resultado antes de o jogador
    // conseguir ler o ultimo estado do HUD.
    this.matchOverHoldTimeoutHandle = window.setTimeout(() => {
      this.matchOverHoldTimeoutHandle = null;
      this.beginArenaDissolve();
    }, MATCH_OVER_HUD_HOLD_MS);
  }

  /** Dispara `dissolveArena` (Beat 7) e guarda o cancelamento para `dispose()`. */
  private beginArenaDissolve(): void {
    if (this.isDisposed) {
      return;
    }

    this.cancelArenaDissolve = dissolveArena({
      arenaRoot: this.options.arenaRoot,
      onComplete: () => {
        this.cancelArenaDissolve = null;

        if (this.isDisposed) {
          return;
        }

        this.finishMatchOver();
      },
      scene: this.options.scene,
    });
  }

  /**
   * Fim do Beat 7: a arena ja esta com escala/visibilidade restauradas (
   * `dissolveArena` faz isso sozinha antes de chamar `onComplete` — ver
   * `src/fx/arenaDissolve.ts`). Falta so devolver o resto do jogo ao estado
   * de "pronto para outra partida": unidades de combate da partida anterior
   * fora (`combatEngine.reset()`), torres com vida cheia, cogumelos de volta
   * ao valor inicial (`cardDeckSystem.reset()`) — e so entao `setPhase("menu")`,
   * que desabilita `arenaRoot` e esconde o HUD (nenhuma tela de resultado em
   * nenhum momento deste caminho).
   *
   * NAO mexe na `ResidentPopulation`: ela nunca foi tocada pelo combate nem
   * pela dissolucao (so teve escala/visibility animadas e restauradas junto
   * com o resto da arena), entao continua viva e pronta sem reconstrucao.
   */
  private finishMatchOver(): void {
    this.options.combatEngine.reset();
    this.options.cardDeckSystem.reset();
    this.setPhase("menu");
  }

  // Unico lugar que liga/desliga subsistemas. Idempotente: chamar de novo com
  // a mesma fase repete as mesmas chamadas, todas seguras de repetir.
  private setPhase(phase: GamePhase): void {
    this.phase = phase;

    const {
      arManager,
      arenaRoot,
      cardDeckHud,
      cardDeckSystem,
      combatEngine,
      hudLayer,
      startScreen,
      worldTapRouter,
    } = this.options;

    worldTapRouter.setPhase(phase);

    switch (phase) {
      case "menu": {
        if (arManager.isSessionActive()) {
          arManager.exitAR();
        }

        startScreen.show();
        arenaRoot.setEnabled(false);
        cardDeckHud.setVisible(false);
        hudLayer.setStatusVisible(false);
        cardDeckSystem.stopRegeneration();
        combatEngine.setActive(false);
        break;
      }

      case "ar-setup": {
        // Arena fica por conta do ArSessionController: ele que habilita
        // quando o jogador ancorar (ver README.md do spec).
        startScreen.hide();
        cardDeckHud.setVisible(false);
        combatEngine.setActive(false);
        break;
      }

      case "world-alive": {
        // Beat 4: NADA de HUD. `setVisible(false)` derruba as duas zonas de
        // batalha inteiras (cogumelos, cartas, HP das torres e timer);
        // `setArStatusVisible(false)` cala o texto de posicionamento de RA; e
        // as barras de vida do MUNDO (torres e criaturas) tambem somem, porque
        // "sem barra de HP" vale para as que flutuam na arena tambem.
        startScreen.hide();
        cardDeckHud.setVisible(false);
        hudLayer.setStatusVisible(false);
        hudLayer.setArStatusVisible(false);
        this.setWorldHealthBarsVisible(false);
        // Sem economia correndo: o contador de cogumelos nao pode avancar
        // enquanto a batalha nao comecou.
        cardDeckSystem.stopRegeneration();
        combatEngine.setActive(false);

        // Gatilho de proximidade zerado a cada entrada no mundo vivo: ele e
        // TERMINAL depois do salto, entao sem isto a segunda partida da mesma
        // sessao comecaria ja disparada.
        this.options.proximityTrigger.reset();
        this.lastWakeStage = "asleep";

        // Em RA quem ancorou a arena foi o ArSessionController; reabilitar
        // aqui e inofensivo, mas mexer em posicao nao e — entao so ligamos o
        // root fora da RA.
        if (this.mode !== "ar") {
          arenaRoot.setEnabled(true);
        }
        break;
      }

      case "playing": {
        // No modo tela a transicao e menu -> world-alive -> playing, sem
        // passar por `ar-setup`: sem este hide o menu fica travado por cima do
        // jogo.
        startScreen.hide();

        // No modo AR quem posicionou a arena foi o ArSessionController;
        // reabilitar aqui e inofensivo mas reposicionar nao e, entao so
        // mexemos em setEnabled fora da RA.
        if (this.mode !== "ar") {
          arenaRoot.setEnabled(true);
        }

        this.setWorldHealthBarsVisible(true);
        cardDeckHud.setVisible(true);
        hudLayer.setStatusVisible(true);
        cardDeckSystem.startRegeneration();
        combatEngine.setActive(true);

        // O relogio COMECA aqui, nunca antes: durante o "mundo vivo" (Beat 4)
        // nao existe timer nenhum. Uma segunda partida na mesma sessao passa
        // por aqui de novo (match-over -> menu -> world-alive -> playing): o
        // `start()` rearma do zero porque `match-over` ja chamou `stop()`, e
        // `finishMatchOver` ja resetou combate e cogumelos antes do menu.
        this.options.matchClock.start();
        this.enemyScriptRunner.reset();
        break;
      }

      case "match-over": {
        // Relogio para. Combate para de aceitar toque E de simular (reusa
        // `setActive(false)`, que ja cobre os dois: nenhuma unidade anda ou
        // ataca depois do fim). O HUD de batalha continua visivel de
        // proposito — a spec proibe cortar para uma tela de resultado ("a
        // arena se desfaz gradualmente"). O congelamento e so o INICIO do
        // Beat 7: `endMatch` (quem chamou `setPhase("match-over")`) ja
        // agendou o resto — espera `MATCH_OVER_HUD_HOLD_MS`, dispara
        // `dissolveArena`, e ao terminar reseta combate/cogumelos e volta a
        // `menu` (`finishMatchOver`).
        this.options.matchClock.stop();
        combatEngine.setActive(false);
        // Volta a taxa normal de cogumelo (efeito colateral documentado de
        // `stopRegeneration`) — sem efeito pratico ja que a economia nao
        // roda mais, mas mantem o estado interno coerente caso algo ainda
        // leia o multiplicador.
        cardDeckSystem.stopRegeneration();
        break;
      }
    }

    this.onPhaseChangedObservable.notifyObservers(phase);
  }

  /**
   * Liga/desliga TODAS as barras de vida do mundo (torres e criaturas) de uma
   * vez, pelo no raiz que o `HealthBarMesh` cria para cada uma. Em
   * `world-alive` elas somem: seis criaturas residentes com barra cheia
   * flutuando em cima seriam exatamente o "HUD na tela" que o Beat 4 proibe.
   *
   * Varre a hierarquia da arena em vez de guardar referencias porque as
   * unidades sao criadas e destruidas o tempo todo durante a partida; unidade
   * invocada ja em `playing` nasce com a barra ligada, que e o certo.
   */
  private setWorldHealthBarsVisible(isVisible: boolean): void {
    const healthBarRoots = this.options.arenaRoot.getDescendants(
      false,
      (node) => node.name.endsWith(HEALTH_BAR_ROOT_SUFFIX)
    );

    for (const node of healthBarRoots) {
      node.setEnabled(isVisible);
    }
  }

  /**
   * Pede o modo imersivo (fullscreen + lock de retrato) para o modo RA. Ao
   * contrario do modo canvas, aqui nao esperamos um gesto adicional: o toque
   * que escolheu "RA" na tela inicial ja E o gesto do usuario, entao chamamos
   * `enterImmersiveMode` direto. Pode falhar sem lancar (iOS Safari nao tem
   * `screen.orientation.lock`) — nesse caso o overlay CSS de retrato de
   * index.html e quem garante a orientacao, e a RA sobe do mesmo jeito.
   */
  private async applyArOrientationPolicy(): Promise<void> {
    await enterImmersiveMode();
  }

  private installImmersiveModeGestureOnce(): void {
    if (this.hasInstalledImmersiveGesture) {
      return;
    }

    this.hasInstalledImmersiveGesture = true;

    installImmersiveModeOnGesture(this.options.canvas, () => this.options.arManager.isSessionActive());
  }
}
