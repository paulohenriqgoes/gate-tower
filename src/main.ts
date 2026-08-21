import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";

import type { ArSessionController } from "./ar/ArSessionController";
import { framedSectors } from "./arena/ArenaArc";
import { ArenaSystem } from "./arena/ArenaSystem";
import { TOWER_ATTACK_RANGE_M } from "./arena/metrics";
import { MatchClock } from "./battle/MatchClock";
import { FIRST_WAVE_CARD_ID } from "./battle/wavePlan";
import { CARD_CATALOG } from "./cards/cardCatalog";
import { CardDeckSystem } from "./cards/CardDeckSystem";
import { CombatEngine } from "./combat/CombatEngine";
import { GameFlow } from "./game/GameFlow";
import { WorldTapRouter } from "./interaction/WorldTapRouter";
import { SessionTelemetry } from "./telemetry/SessionTelemetry";
import { createCautionSign } from "./towers/CautionSign";
import { ProximityTrigger } from "./towers/ProximityTrigger";
import { TowerWakeup } from "./towers/TowerWakeup";
import { UnitFactory } from "./units/UnitFactory";
import { ResidentPopulation } from "./units/idle/ResidentPopulation";
import { CardDeckHud } from "./ui/CardDeckHud";
import { DiagnosticsOverlay } from "./ui/DiagnosticsOverlay";
import { HudLayer } from "./ui/HudLayer";
import { OffscreenIndicator } from "./ui/OffscreenIndicator";
import { StartScreen } from "./ui/StartScreen";
import { EighthWallARManager } from "./ar/EighthWallARManager";
import { loadXR8 } from "./ar/xr8Loader";
import { createPlayerCamera, playerYawDeg } from "./camera/arenaFraming";
import { FullscreenToggle } from "./ui/FullscreenToggle";
import { onOrientationChange } from "./ui/screenOrientation";

/**
 * Divergencia em px CSS entre o canvas e o tamanho de render a partir da qual
 * vale reprojetar mesmo com a sessao de RA no ar. Acima disso o toque comeca a
 * cair visivelmente fora do alvo; abaixo, e arredondamento.
 */
const CANVAS_SYNC_TOLERANCE_PX = 2;

function formatErrorTrace(error: unknown): string {
	if (error instanceof Error) {
		return error.stack ?? `${error.name}: ${error.message}`;
	}

	if (typeof error === "string") {
		return error;
	}

	try {
		return JSON.stringify(error, null, 2);
	} catch {
		return "Erro desconhecido sem serializacao disponivel.";
	}
}

function renderFatalErrorModal(error: unknown): void {
	const trace = formatErrorTrace(error);
	const canvas = document.getElementById("renderCanvas");

	if (canvas) {
		canvas.remove();
	}

	const existing = document.getElementById("app-fatal-error");
	if (existing) {
		existing.remove();
	}

	const container = document.createElement("div");
	container.id = "app-fatal-error";
	container.style.position = "fixed";
	container.style.inset = "0";
	container.style.background = "#111827";
	container.style.color = "#f9fafb";
	container.style.padding = "24px";
	container.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
	container.style.overflow = "auto";

	const title = document.createElement("h1");
	title.textContent = "Falha na inicializacao da aplicacao";
	title.style.margin = "0 0 12px";
	title.style.fontSize = "20px";

	const hint = document.createElement("p");
	hint.textContent = "Trace capturado:";
	hint.style.margin = "0 0 12px";
	hint.style.opacity = "0.9";

	const pre = document.createElement("pre");
	pre.textContent = trace;
	pre.style.margin = "0";
	pre.style.whiteSpace = "pre-wrap";
	pre.style.wordBreak = "break-word";
	pre.style.lineHeight = "1.4";
	pre.style.background = "#1f2937";
	pre.style.padding = "14px";
	pre.style.borderRadius = "8px";

	container.appendChild(title);
	container.appendChild(hint);
	container.appendChild(pre);
	document.body.appendChild(container);
}

interface TelemetryWiringOptions {
	arManager: ArSessionController;
	arenaRoot: TransformNode;
	combatEngine: CombatEngine;
	gameFlow: GameFlow;
	scene: Scene;
	telemetry: SessionTelemetry;
}

/**
 * Liga a instrumentacao da sessao de teste aos eventos reais do jogo. Fica
 * fora do `createScene` para deixar explicito ONDE cada evento da spec e
 * logado:
 *
 * - `arena_placed`: na confirmacao da arena (inicio do Beat 4), com o status de
 *   tracking do instante — o unico dado do fechamento que sobreviveu a spec 08,
 *   porque a arena deixou de ter posicao, direcao e piso medido a reportar;
 * - `enemy_awakened`: no toque que acorda a torre inimiga (fim do Beat 4);
 * - `camera_distance_sample`: a cada 500 ms a partir de `arena_placed`;
 * - `tracking_lost` / `tracking_recovered`: nas mudancas de `trackingStatus`;
 * - `card_deployed`: uma invocacao de fato aconteceu (cogumelo ja debitado),
 *   no `CombatEngine.onCardDeployedObservable` (Etapa 6);
 * - `deploy_cancelled`: toque fora da zona valida com carta selecionada, no
 *   `CombatEngine.onDeployCancelledObservable` (Etapa 6).
 * - `match_ended`: fim de partida (torre destruida ou tempo esgotado), no
 *   `GameFlow.onMatchOverObservable` (Etapa 7).
 *
 * A diferenca entre os dois primeiros e a METRICA PRINCIPAL do teste (abaixo
 * de 5 s: o mundo nao convenceu; acima de 30 s: validado).
 */
function wireSessionTelemetry(options: TelemetryWiringOptions): () => void {
	const { arManager, arenaRoot, combatEngine, gameFlow, scene, telemetry } = options;

	// A distancia e medida em ESPACO DE MUNDO, que em RA ja esta em metros —
	// tanto a camera quanto o centro da arena sao lidos em posicao absoluta, e
	// desde a Etapa 2 a escala da arena e sempre 1 (nunca precisou entrar
	// nesta conta, mas agora e literalmente irrelevante).
	const measureCameraDistanceMeters = (): number => {
		const activeCamera = scene.activeCamera;

		if (!activeCamera) {
			return Number.NaN;
		}

		return Vector3.Distance(activeCamera.globalPosition, arenaRoot.getAbsolutePosition());
	};

	// So vale monitorar perda de tracking depois de ancorar: antes disso o SLAM
	// esta calibrando por definicao (INITIALIZING/LIMITED -> NORMAL), e logar
	// aquilo como "perdeu e recuperou" poluiria a leitura da sessao.
	let isTrackingMonitorActive = false;
	let hasLostTracking = false;

	const arenaClosedObserver = arManager.onArenaClosedObservable.add((report) => {
		telemetry.log({
			type: "arena_placed",
			trackingStatus: report.trackingStatus ?? null,
		});
		isTrackingMonitorActive = true;
		telemetry.startCameraSampling(measureCameraDistanceMeters);
	});

	const enemyAwakenedObserver = gameFlow.onEnemyAwakenedObservable.add(() => {
		telemetry.log({ type: "enemy_awakened" });
	});

	const cardDeployedObserver = combatEngine.onCardDeployedObservable.add((info) => {
		telemetry.log({ type: "card_deployed", ...info });
	});

	const deployCancelledObserver = combatEngine.onDeployCancelledObservable.add(() => {
		telemetry.log({ type: "deploy_cancelled" });
	});

	const matchOverObserver = gameFlow.onMatchOverObservable.add((payload) => {
		telemetry.log({ type: "match_ended", ...payload });
		// A amostragem de distancia media o Beat 4 e a partida; depois do fim ela
		// so registra ruido. Na primeira partida completa em device ela continuou
		// rodando e gravou 45 amostras identicas de 58,17 m — a arena ja tinha
		// voltado ao estado fora de RA, onde "metros" nao quer dizer nada.
		telemetry.stopCameraSampling();
		isTrackingMonitorActive = false;
	});

	const trackingObserver = arManager.onTrackingStatusChangedObservable.add((status) => {
		if (!isTrackingMonitorActive) {
			return;
		}

		if (status === "NORMAL") {
			if (hasLostTracking) {
				hasLostTracking = false;
				telemetry.log({ status, type: "tracking_recovered" });
			}

			return;
		}

		if (!hasLostTracking) {
			hasLostTracking = true;
			telemetry.log({ status, type: "tracking_lost" });
		}
	});

	return () => {
		arManager.onArenaClosedObservable.remove(arenaClosedObserver);
		arManager.onTrackingStatusChangedObservable.remove(trackingObserver);
		gameFlow.onEnemyAwakenedObservable.remove(enemyAwakenedObserver);
		combatEngine.onCardDeployedObservable.remove(cardDeployedObserver);
		combatEngine.onDeployCancelledObservable.remove(deployCancelledObserver);
		gameFlow.onMatchOverObservable.remove(matchOverObserver);
	};
}

/**
 * Exportacao do JSON da sessao, so com `?debug=1`: um botao DOM no canto
 * inferior esquerdo (o celular nao tem teclado nem console) e, no desktop, a
 * tecla `J`. E DOM de proposito — nao pode virar mais um controle no HUD do
 * jogo, que a spec exige vazio durante o Beat 4.
 */
function installTelemetryExportShortcut(telemetry: SessionTelemetry): () => void {
	if (!DiagnosticsOverlay.isEnabled()) {
		return () => {};
	}

	const button = document.createElement("button");
	button.id = "telemetry-export";
	button.textContent = "JSON";
	button.style.position = "fixed";
	button.style.left = "12px";
	button.style.bottom = "12px";
	button.style.zIndex = "500";
	button.style.padding = "10px 14px";
	button.style.borderRadius = "8px";
	button.style.border = "1px solid #475569";
	button.style.background = "#0f172ad9";
	button.style.color = "#e2e8f0";
	button.style.fontFamily = "ui-monospace, monospace";
	button.style.fontSize = "13px";
	button.addEventListener("click", () => telemetry.downloadJson());
	document.body.appendChild(button);

	const handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key?.toLowerCase() === "j") {
			telemetry.downloadJson();
		}
	};

	window.addEventListener("keydown", handleKeyDown);

	return () => {
		window.removeEventListener("keydown", handleKeyDown);
		button.remove();
	};
}

/**
 * Publica yaw e setores enquadrados no painel de `?debug=1`.
 *
 * E o instrumento de validacao da ancoragem egocentrica: girando o tronco no
 * device, o yaw tem que variar continuamente e o setor enquadrado tem que
 * mudar quando o arco muda — e, ao voltar para a posicao inicial, o yaw tem que
 * voltar para perto de zero. Um deslize sistematico aqui e o drift do SLAM
 * aparecendo em numero, antes de aparecer como torre andando sozinha.
 *
 * A 5 Hz, e nao por frame: o painel e texto, e reescrever `DynamicTexture` a
 * 60 fps custa mais que o resto do overlay junto.
 */
const YAW_DIAGNOSTICS_INTERVAL_MS = 200;

function installYawDiagnostics(
	scene: Scene,
	diagnostics: DiagnosticsOverlay | null,
	getCameraYawDeg: () => number
): void {
	if (!diagnostics) {
		return;
	}

	let lastUpdateMs = 0;

	scene.onBeforeRenderObservable.add(() => {
		const nowMs = performance.now();

		if (nowMs - lastUpdateMs < YAW_DIAGNOSTICS_INTERVAL_MS) {
			return;
		}

		lastUpdateMs = nowMs;

		const yawDeg = getCameraYawDeg();
		const framed = framedSectors(yawDeg);

		diagnostics.setFields({
			cameraYawDeg: yawDeg.toFixed(1),
			framedSectors: framed.length > 0 ? framed.join(",") : "nenhum",
		});
	});
}

interface GameRuntime {
	/** Se a sessao de RA do 8th Wall esta ativa no momento. */
	isArSessionActive: () => boolean;
	/** Reenquadra a camera e o HUD apos resize/mudanca de orientacao. */
	relayout: () => void;
	scene: Scene;
}

async function createScene(engine: Engine, canvas: HTMLCanvasElement): Promise<GameRuntime> {
	const scene = new Scene(engine);
	scene.clearColor = new Color4(0.7, 0.8, 0.95, 1);

	// O jogador simulado no vertice do arco: posicao fixa, direcao livre — o
	// mesmo rig que a RA impoe. Ver `src/camera/arenaFraming.ts`.
	const camera = createPlayerCamera(scene, canvas);

	const light = new HemisphericLight("main-light", new Vector3(0, 1, 0), scene);
	light.intensity = 0.95;

	const arenaSystem = new ArenaSystem(scene);
	const arena = arenaSystem.buildInitialArena();

	const hudLayer = new HudLayer(scene);
	// Sem torre inimiga no combate desde a JG-04: o lado direito do topo nao tem
	// mais o que mostrar. A barra volta a existir quando houver alvo — hoje o
	// Coelho, que e onda final e nao torre (`DJ-6`).
	hudLayer.setTowerHealthVisible("enemy", false);

	// Painel de debug so existe com `?debug=1`: em RA o celular nao tem console,
	// e sem esses numeros nao da para investigar viewport/orientacao/tracking.
	const diagnosticsOverlay = DiagnosticsOverlay.isEnabled()
		? new DiagnosticsOverlay(hudLayer, scene)
		: null;

	// O botao de tela cheia saiu do HUD de jogo (a spec da demo quer um HUD
	// minimo de batalha): so existe atras de `?debug=1`, junto do painel de
	// diagnostico, como ferramenta de teste — nao mais na barra de jogo.
	const fullscreenToggle = DiagnosticsOverlay.isEnabled() ? new FullscreenToggle() : null;
	if (fullscreenToggle?.isAvailable()) {
		hudLayer.getTexture().addControl(fullscreenToggle.root);
	}

	const arManager = new EighthWallARManager(scene, arena.root, hudLayer, diagnosticsOverlay);
	arManager.initialize();

	/**
	 * A UNICA fonte de "para onde o jogador esta olhando", em graus contra o
	 * azimute 0 do arco. Diretor de ondas, alerta de flanco e anel de colocacao
	 * consomem daqui — nenhum deles pode ler a camera do Babylon por conta
	 * propria (`.github/copilot-instructions.md` §2, invariante 1 do plano).
	 *
	 * Os dois modos respondem a mesma grandeza por caminhos diferentes: em RA a
	 * medida e contra a ancora do fechamento, no modo tela a ancora e implicita
	 * (arena na origem, sem rotacao) e o heading da camera JA e o yaw relativo.
	 * Encapsular a escolha aqui e o que mantem o resto do jogo sem saber em que
	 * modo esta rodando.
	 */
	const getCameraYawDeg = (): number => {
		if (arManager.isSessionActive()) {
			return arManager.getCameraYawDeg();
		}

		return scene.activeCamera ? playerYawDeg(scene.activeCamera) : 0;
	};

	installYawDiagnostics(scene, diagnosticsOverlay, getCameraYawDeg);

	const towerCombatSettings = {
		attackCooldownMs: 900,
		attackDamage: 35,
		maxHealth: 1000,
	};

	const cardDeckSystem = new CardDeckSystem({
		cards: CARD_CATALOG,
		initialMushrooms: 4,
		maxMushrooms: 10,
		regenerationIntervalMs: 1800,
	});
	// A regeneracao de cogumelos nao comeca no boot: quem liga e o GameFlow ao
	// entrar em partida, para o contador nao correr durante o menu.
	const cardDeckHud = new CardDeckHud(scene, cardDeckSystem, hudLayer);

	// Alcance da torre: constante de metrica desde a JG-04, e nao mais um
	// multiplicador do diametro do chapeu. O multiplicador foi calibrado na
	// arena retangular e, com a torre no vertice do arco, cobria a arena
	// inteira. Continua sendo resolvido AQUI porque tambem alimenta a
	// `UnitFactory` (o alcance de arremesso da Dona Barata deriva dele).
	const towerAttackRange = TOWER_ATTACK_RANGE_M;
	const unitFactory = new UnitFactory(scene, towerCombatSettings.maxHealth, towerAttackRange);

	// Relogio de partida (Etapa 7). Construido ANTES do CombatEngine porque
	// `getRemainingMs` (usado no payload de telemetria `card_deployed`) precisa
	// dele desde a construcao; o GameFlow (que liga start()/stop() as fases)
	// so existe mais abaixo, entao o relogio e injetado nos dois.
	const matchClock = new MatchClock();

	// So a torre do JOGADOR entra no combate (JG-04): o inimigo nao tem mais
	// torre para o jogador derrubar — ele vem em ondas. A torre inimiga continua
	// na cena como cenario do Beat 5 ate a JG-10 reescrever a intro, mas nao e
	// mais um `TowerActor`: nao ataca, nao apanha e nao decide partida.
	const playerTowerDefinitions = arena.towerDefinitions.filter(
		(towerDefinition) => towerDefinition.team === "player"
	);

	const combatEngine = new CombatEngine({
		arenaRoot: arena.root,
		cardDeckSystem,
		getRemainingMs: () => matchClock.getRemainingMs(),
		scene,
		towerAttackCooldownMs: towerCombatSettings.attackCooldownMs,
		towerAttackDamage: towerCombatSettings.attackDamage,
		towerAttackRange,
		towerDefinitions: playerTowerDefinitions,
		towerMaxHealth: towerCombatSettings.maxHealth,
		unitFactory,
		unitGroundY: arena.arenaLayout.unitGroundY,
	});

	// Populacao residente (Beat 4): criaturas que so vivem na arena, sem
	// combate. O `IdleBehavior` compara a posicao da camera com a posicao LOCAL
	// das criaturas (todas filhas de `arena.root`), entao a camera precisa ser
	// convertida para o espaco do root — em RA o root esta transladado e
	// rotacionado (a escala e sempre 1 desde a Etapa 2, mas a translacao/rotacao
	// continuam), e sem a conversao o estado "observando" miraria num ponto
	// errado.
	const invertedArenaMatrix = new Matrix();
	const cameraArenaLocalPosition = new Vector3();
	let cachedCameraFrameId = -1;

	const getCameraPosition = (): Vector3 | null => {
		// SEMPRE a camera ativa: em RA e a FreeCamera dirigida pelo 8th Wall,
		// nunca a camera do jogador simulado do modo tela.
		const activeCamera = scene.activeCamera;

		if (!activeCamera) {
			return null;
		}

		// Uma conversao por frame, compartilhada por todas as residentes.
		const frameId = scene.getFrameId();

		if (frameId !== cachedCameraFrameId) {
			cachedCameraFrameId = frameId;
			arena.root.getWorldMatrix().invertToRef(invertedArenaMatrix);
			Vector3.TransformCoordinatesToRef(
				activeCamera.globalPosition,
				invertedArenaMatrix,
				cameraArenaLocalPosition
			);
		}

		return cameraArenaLocalPosition;
	};

	const residentPopulation = new ResidentPopulation({
		arenaLayout: arena.arenaLayout,
		arenaRoot: arena.root,
		getCameraPosition,
		scene,
		unitFactory,
	});
	residentPopulation.populate();

	const startScreen = new StartScreen(hudLayer);
	startScreen.setArAvailable(arManager.isARAvailable());

	// O engine do 8th Wall carrega de forma assincrona: o menu abre com o botao
	// de RA esmaecido e so libera quando o engine responde.
	const availabilityObserver = arManager.onAvailabilityChangedObservable.add((isAvailable) => {
		startScreen.setArAvailable(isAvailable);
	});

	// A altura escolhida no menu vai para o AR Manager, que e o dono unico de
	// `origin.y`: e ele que normaliza, persiste e declara ao engine. A tela
	// inicial so oferece a escolha.
	const playerHeightObserver = startScreen.onPlayerHeightChangedObservable.add((heightM) => {
		arManager.setPlayerHeight(heightM);
	});

	const enemyTowerMesh = arena.towerDefinitions.find(
		(towerDefinition) => towerDefinition.team === "enemy"
	)?.mesh;

	if (!enemyTowerMesh) {
		throw new Error("Arena sem torre inimiga: o Beat 5 nao teria alvo de toque.");
	}

	// Dono unico do toque: rotear por fase substitui os dois assinantes de
	// `onPointerObservable` que disputavam o mesmo POINTERDOWN (AR Manager e
	// CombatEngine).
	const worldTapRouter = new WorldTapRouter(scene);
	const towerWakeup = new TowerWakeup(scene);
	const offscreenIndicator = new OffscreenIndicator({ hud: hudLayer, scene });

	// Beat 5 por aproximacao. As distancias default saem da telemetria de
	// device de 2026-08-14 (ver `ProximityTrigger`), nao de palpite.
	const proximityTrigger = new ProximityTrigger();

	// A placa "CUIDADO" e a unica instrucao que a spec do Beat 4 permite: ela e
	// cenario dentro do mundo, nao HUD. E ela so cumpre o papel porque e
	// ilegivel de longe — quem quiser ler tem que chegar perto, e chegar perto
	// E o gatilho. Encostada na torre INIMIGA, a que tem a caverna.
	createCautionSign(scene, arena.mushroomTowers.enemy.body);

	// A demo existe para medir UMA coisa: quanto tempo a pessoa fica no mundo
	// vivo antes de acordar o inimigo (`arena_placed` -> `enemy_awakened`).
	const telemetry = new SessionTelemetry();

	const gameFlow = new GameFlow({
		arManager,
		arenaRoot: arena.root,
		canvas,
		cardDeckHud,
		cardDeckSystem,
		combatEngine,
		enemyTowerMesh,
		enemyTower: arena.mushroomTowers.enemy,
		// Mesma conversao ja usada pela populacao residente: uma inversao de
		// matriz por frame, compartilhada. Sem ela a distancia ate a caverna
		// sairia no espaco de mundo em vez do espaco local do `arenaRoot`.
		getCameraArenaLocalPosition: getCameraPosition,
		// Mesma fonte unica de "para onde o jogador olha" que o painel de debug
		// usa: e por ela que o diretor de ondas nunca nasce um inimigo no flanco
		// enquadrado.
		getCameraYawDeg,
		hudLayer,
		matchClock,
		proximityTrigger,
		onWakeStageChanged: (stage, distanceMeters) => {
			telemetry.log({
				type: "wake_stage_changed",
				stage,
				// Etapa 2: 1 unidade do Babylon = 1 metro (`src/arena/metrics.ts`),
				// entao a distancia local do `arenaRoot` JA e metros — nao ha mais
				// fator de escala global nenhum para multiplicar.
				distanceMeters,
			});
		},
		// Carta que a torre revela ao acordar: a PRIMEIRA do plano de ondas
		// (JG-04) — a mesma que vai aparecer primeiro na partida.
		revealedEnemyCardId: FIRST_WAVE_CARD_ID,
		scene,
		startScreen,
		towerWakeup,
		worldTapRouter,
	});

	const disposeTelemetryWiring = wireSessionTelemetry({
		arManager,
		arenaRoot: arena.root,
		combatEngine,
		gameFlow,
		scene,
		telemetry,
	});

	// Seta de borda apontando para a torre do jogador quando ela apanha fora do
	// quadro — em RA a arena tem 80 cm e o jogador quase sempre esta com a
	// camera perto de UMA parte do campo, entao "estao batendo na sua torre" e
	// justamente o tipo de evento que se perde sem indicador.
	const towerDamagedObserver = combatEngine.onPlayerTowerDamagedObservable.add((position) => {
		offscreenIndicator.point(position, 1400);
	});

	// Mesma seta de borda, agora para invocacoes do inimigo (Etapa 7, item 10
	// da spec: "indicador direcional quando algo importante acontece fora de
	// quadro"). O script inimigo dispara em qualquer instante da partida — se
	// o jogador estiver com a camera virada para o proprio lado, a seta e o
	// unico jeito de saber que algo nasceu do outro lado do campo.
	const enemyUnitDeployedObserver = combatEngine.onEnemyUnitDeployedObservable.add((position) => {
		offscreenIndicator.point(position, 1400);
	});

	// Relogio, script do inimigo e HUD de timer/HP: um unico `gameFlow.update()`
	// por frame, no-op fora de `playing` (ver docblock de `GameFlow.update`).
	const gameFlowUpdateObserver = scene.onBeforeRenderObservable.add(() => {
		gameFlow.update();
	});

	// As residentes sao cenario, nao unidades de combate: elas rodam no "mundo
	// vivo" E continuam vivas durante a partida (um mundo que congela quando a
	// batalha comeca deixa de ser um mundo). Fora dessas duas fases — menu e
	// setup de RA — nada se mexe.
	const residentObserver = scene.onBeforeRenderObservable.add(() => {
		const phase = gameFlow.getPhase();

		if (phase !== "world-alive" && phase !== "playing") {
			return;
		}

		residentPopulation.update(scene.getEngine().getDeltaTime() / 1000, performance.now());
	});

	const disposeTelemetryExport = installTelemetryExportShortcut(telemetry);

	gameFlow.start();

	scene.onDisposeObservable.add(() => {
		arManager.onAvailabilityChangedObservable.remove(availabilityObserver);
		startScreen.onPlayerHeightChangedObservable.remove(playerHeightObserver);
		combatEngine.onPlayerTowerDamagedObservable.remove(towerDamagedObserver);
		combatEngine.onEnemyUnitDeployedObservable.remove(enemyUnitDeployedObserver);
		scene.onBeforeRenderObservable.remove(gameFlowUpdateObserver);
		scene.onBeforeRenderObservable.remove(residentObserver);
		disposeTelemetryExport();
		disposeTelemetryWiring();
		telemetry.dispose();
		matchClock.dispose();
		gameFlow.dispose();
		worldTapRouter.dispose();
		towerWakeup.dispose();
		offscreenIndicator.dispose();
		residentPopulation.dispose();
		startScreen.dispose();
		diagnosticsOverlay?.dispose();
		combatEngine.dispose();
		cardDeckHud.dispose();
		cardDeckSystem.dispose();
		fullscreenToggle?.dispose();
		hudLayer.dispose();
	});

	// Reenquadrar a camera no resize deixou de existir junto com a camera que
	// orbitava a arena: o jogador esta parado DENTRO do arco, e a proporcao da
	// janela nao muda onde ele esta nem para onde olha. O FOV horizontal e fixo
	// (`createPlayerCamera`), entao girar o aparelho tambem nao muda o arco
	// coberto. Sobra o HUD, que continua precisando da area segura.
	const relayout = (): void => {
		hudLayer.refreshSafeArea();
	};

	return { isArSessionActive: () => arManager.isSessionActive(), relayout, scene };
}

async function bootstrap(): Promise<void> {
	const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;

	if (!canvas) {
		throw new Error("Canvas renderCanvas nao encontrado.");
	}

	// O engine do 8th Wall e carregado AQUI, e nao por uma tag no `index.html`.
	// `XR8.Babylonjs` e construido eager no load do bundle e so cria os
	// temporarios internos dela se `window.BABYLON` ja existir naquele instante
	// — ou seja, o shim precisa vir antes do script, e so por JS da para
	// garantir a ordem (spec 08, bug 1). Nao esperamos a promise: o menu abre
	// com o botao de RA esmaecido e o AR Manager libera quando o engine chega.
	void loadXR8().catch((error) => {
		console.error("[main] Falha ao carregar o engine do 8th Wall.", error);
	});

	const engine = new Engine(canvas, true);
	const { isArSessionActive, relayout, scene } = await createScene(engine, canvas);

	engine.runRenderLoop(() => {
		scene.render();
	});

	// Tela cheia e trava de orientacao NAO sao mais aplicadas no boot: elas
	// disparavam no primeiro toque, que agora e o toque do proprio menu — antes
	// de o jogador dizer se vai jogar em RA (que roda destravada, sem tela
	// cheia) ou na tela. Quem aplica a politica de cada modo e o GameFlow.

	// Fora da RA, sempre redimensiona. DENTRO da RA, so quando o canvas CSS e o
	// tamanho de render de fato divergiram.
	//
	// A regra antiga era "nunca redimensionar durante a RA", pelo motivo certo:
	// o engine do 8th Wall detecta mudanca de canvas sozinho a cada frame, e
	// reprojetar no meio do tracking e ruido gratuito. O que ela nao previu e
	// que `engine.resize()` e tambem o UNICO gatilho de
	// `engine.onResizeObservable` — e e nele que o `AdvancedDynamicTexture` de
	// tela cheia recalcula o proprio tamanho. Pulado o resize, a textura do HUD
	// congela no tamanho antigo enquanto o canvas muda, e o picking do GUI
	// (`textureSize / getRenderHeight()`) passa a mapear o toque para o lugar
	// errado: os controles aparecem e nao respondem.
	//
	// Prova em device (2026-08-14): entrando em RA ja em tela cheia — caso em
	// que o resize acontece ANTES da sessao subir, quando ainda e permitido —
	// as cartas funcionaram e a partida foi jogada ate o fim. SAINDO da tela
	// cheia com a sessao no ar, nenhuma carta respondeu mais. E exatamente o
	// caminho que a regra antiga deixava sem conserto.
	//
	// A guarda por divergencia mantem o espirito da regra: em regime normal
	// nada acontece, e o resize so entra quando a alternativa e um ponteiro
	// permanentemente quebrado. `relayout()` continua rodando sempre.
	const isCanvasOutOfSync = (): boolean => {
		const canvas = engine.getRenderingCanvas();

		if (!canvas) {
			return false;
		}

		const scaling = engine.getHardwareScalingLevel();

		return (
			Math.abs(canvas.clientWidth - engine.getRenderWidth() * scaling) > CANVAS_SYNC_TOLERANCE_PX
			|| Math.abs(canvas.clientHeight - engine.getRenderHeight() * scaling) > CANVAS_SYNC_TOLERANCE_PX
		);
	};

	onOrientationChange(() => {
		if (!isArSessionActive() || isCanvasOutOfSync()) {
			engine.resize();
		}

		relayout();
	});
}

window.addEventListener("error", (event) => {
	renderFatalErrorModal(event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
	renderFatalErrorModal(event.reason);
});

void bootstrap().catch((error) => {
	renderFatalErrorModal(error);
});
