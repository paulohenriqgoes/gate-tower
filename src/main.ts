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
import { XRManager } from "./xr/XRManager";

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

async function createScene(engine: Engine, canvas: HTMLCanvasElement): Promise<Scene> {
	const scene = new Scene(engine);
	scene.clearColor = new Color4(0.7, 0.8, 0.95, 1);

	const camera = new ArcRotateCamera(
		"main-camera",
		Math.PI / 2,
		Math.PI / 3,
		42,
		new Vector3(0, 0, 0),
		scene
	);
	camera.lowerRadiusLimit = 24;
	camera.upperRadiusLimit = 55;
	camera.attachControl(canvas, true);

	const light = new HemisphericLight("main-light", new Vector3(0, 1, 0), scene);
	light.intensity = 0.95;

	const arenaSystem = new ArenaSystem(scene);
	const arena = arenaSystem.buildInitialArena();

	const xrManager = new XRManager(scene, [arena.ground], arena.root);
	await xrManager.initialize();

	const towerCombatSettings = {
		attackCooldownMs: 1000,
		attackDamage: 20,
		attackRangeMultiplier: 5,
		maxHealth: 1000,
	};

	const cardDeckSystem = new CardDeckSystem({
		cards: [
			{
				id: "javali-raivoso",
				name: "Javali Raivoso",
				summary: "Vida 200. O dano cresce com a distancia percorrida.",
				cost: 4,
				accentColor: "#f97316",
			},
		],
		initialMushrooms: 4,
		maxMushrooms: 10,
		regenerationIntervalMs: 1800,
	});
	cardDeckSystem.startRegeneration();

	const cardDeckHud = new CardDeckHud(scene, cardDeckSystem);
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
	});

	return scene;
}

async function bootstrap(): Promise<void> {
	const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;

	if (!canvas) {
		throw new Error("Canvas renderCanvas nao encontrado.");
	}

	const engine = new Engine(canvas, true);
	const scene = await createScene(engine, canvas);

	engine.runRenderLoop(() => {
		scene.render();
	});

	window.addEventListener("resize", () => {
		engine.resize();
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
