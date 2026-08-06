import { Engine } from "@babylonjs/core/Engines/engine";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

import { ArenaSystem } from "./arena/ArenaSystem";
import { CardDeckSystem } from "./cards/CardDeckSystem";
import { CombatEngine } from "./combat/CombatEngine";
import { CardDeckHud } from "./ui/CardDeckHud";
import { HudLayer } from "./ui/HudLayer";
import { EighthWallARManager } from "./ar/EighthWallARManager";
import { frameArenaCamera, measureArenaExtents } from "./camera/arenaFraming";
import { FullscreenToggle } from "./ui/FullscreenToggle";
import {
  installImmersiveModeOnGesture,
  onOrientationChange,
} from "./ui/screenOrientation";

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

interface GameRuntime {
	arManager: EighthWallARManager;
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

	const fullscreenToggle = new FullscreenToggle();
	hudLayer.fillSlot("fullscreen", fullscreenToggle.root);
	hudLayer.setSlotVisible("fullscreen", fullscreenToggle.isAvailable());

	const arManager = new EighthWallARManager(scene, arena.root, hudLayer);
	arManager.initialize();

	const towerCombatSettings = {
		attackCooldownMs: 900,
		attackDamage: 35,
		attackRangeMultiplier: 5.5,
		maxHealth: 1000,
	};

	const cardDeckSystem = new CardDeckSystem({
		cards: [
			{
				id: "dona-barata",
				name: "Dona Barata",
				summary: "Invoca 3 baratas frageis que lancam havaianas de pau no alcance da torre.",
				cost: 4,
				accentColor: "#f472b6",
			},
			{
				id: "javali-raivoso",
				name: "Javali Raivoso",
				summary: "Vida 200. O dano cresce com a distancia percorrida.",
				cost: 2,
				accentColor: "#f97316",
			},
			{
				id: "cururu-bombado",
				name: "Cururu Bombado",
				summary: "Tanque azul com 60% da vida da torre e super linguada crescente.",
				cost: 5,
				accentColor: "#38bdf8",
			},
		],
		initialMushrooms: 4,
		maxMushrooms: 10,
		regenerationIntervalMs: 1800,
	});
	cardDeckSystem.startRegeneration();

	const cardDeckHud = new CardDeckHud(scene, cardDeckSystem, hudLayer);
	const combatEngine = new CombatEngine({
		arenaLayout: arena.arenaLayout,
		arenaRoot: arena.root,
		cardDeckSystem,
		scene,
		towerAttackCooldownMs: towerCombatSettings.attackCooldownMs,
		towerAttackDamage: towerCombatSettings.attackDamage,
		towerAttackRangeMultiplier: towerCombatSettings.attackRangeMultiplier,
		towerDefinitions: arena.towerDefinitions,
		towerMaxHealth: towerCombatSettings.maxHealth,
	});

	scene.onDisposeObservable.add(() => {
		combatEngine.dispose();
		cardDeckHud.dispose();
		cardDeckSystem.dispose();
		fullscreenToggle.dispose();
		hudLayer.dispose();
	});

	let framedAspectRatio = engine.getAspectRatio(camera);

	const relayout = (): void => {
		hudLayer.refreshSafeArea();
		cardDeckHud.applyColumnMargin();

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

	return { arManager, relayout, scene };
}

async function bootstrap(): Promise<void> {
	const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;

	if (!canvas) {
		throw new Error("Canvas renderCanvas nao encontrado.");
	}

	const engine = new Engine(canvas, true);
	const { arManager, relayout, scene } = await createScene(engine, canvas);

	engine.runRenderLoop(() => {
		scene.render();
	});

	// O jogo e desenhado para paisagem: tela cheia + trava de orientacao sao
	// tentadas nos primeiros gestos (Android/Chrome). Onde a API nao existe
	// (Safari do iPhone), o overlay de rotacao de index.html assume e a tela
	// cheia depende de adicionar o site a tela de inicio.
	// Durante a RA quem cuida disso e o proprio `enterAR`, antes de subir a
	// sessao — mexer na orientacao com a sessao no ar desalinha o tracking.
	installImmersiveModeOnGesture(canvas, () => arManager.isSessionActive());

	onOrientationChange(() => {
		engine.resize();
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
