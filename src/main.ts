import { Engine } from "@babylonjs/core/Engines/engine";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

import { ArenaSystem } from "./arena/ArenaSystem";
import { XRManager } from "./xr/XRManager";

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

	const xrManager = new XRManager(scene, [arena.ground]);
	await xrManager.initialize();

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

void bootstrap();
