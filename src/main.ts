import { Engine } from "@babylonjs/core/Engines/engine";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";

import type { ArSessionController } from "./ar/ArSessionController";
import { ArenaSystem } from "./arena/ArenaSystem";
import { ENEMY_SCRIPT } from "./battle/EnemyScript";
import { MatchClock } from "./battle/MatchClock";
import { CARD_CATALOG } from "./cards/cardCatalog";
import { CardDeckSystem } from "./cards/CardDeckSystem";
import { CombatEngine } from "./combat/CombatEngine";
import { DeploymentZone } from "./combat/DeploymentZone";
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
import { frameArenaCamera, measureArenaExtents } from "./camera/arenaFraming";
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
 * - `arena_placed`: na ancoragem da arena (inicio do Beat 4);
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

	const arenaPlacedObserver = arManager.onArenaPlacedObservable.add(() => {
		telemetry.log({ type: "arena_placed" });
		isTrackingMonitorActive = true;
		telemetry.startCameraSampling(measureCameraDistanceMeters);
	});

	// Recusas de ancoragem sao contadas desde o primeiro toque, e nao so depois
	// de ancorar: o que se quer medir aqui e justamente quantas tentativas o
	// jogador gasta ANTES de conseguir.
	const placementRejectedObserver = arManager.onPlacementRejectedObservable.add((rejection) => {
		telemetry.log({ ...rejection, type: "placement_rejected" });
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
		arManager.onArenaPlacedObservable.remove(arenaPlacedObserver);
		arManager.onPlacementRejectedObservable.remove(placementRejectedObserver);
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

	const camera = new ArcRotateCamera(
		"main-camera",
		Math.PI / 2 * -1,
		Math.PI / 3.4,
		30,
		Vector3.Zero(),
		scene
	);
	camera.attachControl(canvas, true);

	const light = new HemisphericLight("main-light", new Vector3(0, 1, 0), scene);
	light.intensity = 0.95;

	const arenaSystem = new ArenaSystem(scene);
	const arena = arenaSystem.buildInitialArena();

	// Medido antes de qualquer escala de RA (o modo RA reduz o root para ~0.02).
	const arenaExtents = measureArenaExtents(arena.root);
	frameArenaCamera(camera, engine, arenaExtents);

	const hudLayer = new HudLayer(scene);

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

	const towerCombatSettings = {
		attackCooldownMs: 900,
		attackDamage: 35,
		// Alcance = diametro da torre (1.6) * este multiplicador. Calibrado para
		// a arena de mesa: as torres ficam a 20 unidades uma da outra, e 6.24 de
		// alcance cobre ~31% do campo — a unidade ainda tem caminho antes de
		// entrar na mira. O 5.5 anterior era da arena antiga, 1.4x mais longa.
		attackRangeMultiplier: 3.9,
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

	// Alcance das torres resolvido AQUI (era derivado dentro do CombatEngine):
	// tanto o CombatEngine quanto a UnitFactory precisam do numero, e a fabrica
	// agora e injetada nos dois lugares que criam criaturas — o combate e a
	// populacao residente do "mundo vivo".
	const towerAttackRange = (arena.towerDefinitions[0]?.diameter ?? 0)
		* towerCombatSettings.attackRangeMultiplier;
	const unitFactory = new UnitFactory(scene, towerCombatSettings.maxHealth, towerAttackRange);

	// Overlay da metade do jogador (Etapa 6): filho do MESMO `arena.root` que a
	// arena, para acompanhar a ancoragem em RA sem calculo extra.
	const deploymentZone = new DeploymentZone({
		arenaLayout: arena.arenaLayout,
		arenaRoot: arena.root,
		scene,
	});

	// Relogio de partida (Etapa 7). Construido ANTES do CombatEngine porque
	// `getRemainingMs` (usado no payload de telemetria `card_deployed`) precisa
	// dele desde a construcao; o GameFlow (que liga start()/stop() as fases)
	// so existe mais abaixo, entao o relogio e injetado nos dois.
	const matchClock = new MatchClock();

	const combatEngine = new CombatEngine({
		arenaLayout: arena.arenaLayout,
		arenaRoot: arena.root,
		cardDeckSystem,
		deploymentZone,
		getRemainingMs: () => matchClock.getRemainingMs(),
		scene,
		towerAttackCooldownMs: towerCombatSettings.attackCooldownMs,
		towerAttackDamage: towerCombatSettings.attackDamage,
		towerAttackRange,
		towerDefinitions: arena.towerDefinitions,
		towerMaxHealth: towerCombatSettings.maxHealth,
		unitFactory,
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
		// nunca a ArcRotateCamera do modo tela.
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
		// Carta que a torre revela ao acordar: a PRIMEIRA carta do script fixo
		// do inimigo (Etapa 7) — a mesma que vai aparecer primeiro na partida.
		revealedEnemyCardId: ENEMY_SCRIPT[0].cardId,
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
		deploymentZone.dispose();
		cardDeckHud.dispose();
		cardDeckSystem.dispose();
		fullscreenToggle?.dispose();
		hudLayer.dispose();
	});

	let framedAspectRatio = engine.getAspectRatio(camera);

	const relayout = (): void => {
		hudLayer.refreshSafeArea();

		// Em RA a camera ativa e a FreeCamera controlada pelo 8th Wall (projecao
		// vem do engine); reenquadrar so faz sentido fora do modo RA.
		if (scene.activeCamera !== camera) {
			return;
		}

		// Reenquadrar reseta o que o jogador ajustou na camera, entao so vale a
		// pena quando a proporcao muda de verdade (girar o aparelho) — e nao a
		// cada resize da barra de endereco do navegador mobile.
		const aspectRatio = engine.getAspectRatio(camera);

		if (Math.abs(aspectRatio - framedAspectRatio) / framedAspectRatio < 0.1) {
			return;
		}

		framedAspectRatio = aspectRatio;
		frameArenaCamera(camera, engine, arenaExtents);
	};

	return { isArSessionActive: () => arManager.isSessionActive(), relayout, scene };
}

async function bootstrap(): Promise<void> {
	const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;

	if (!canvas) {
		throw new Error("Canvas renderCanvas nao encontrado.");
	}

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
