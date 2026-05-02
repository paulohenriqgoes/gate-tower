import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager";
import { WebXRState } from "@babylonjs/core/XR/webXRTypes";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import { AdvancedDynamicTexture, Button, Control, Ellipse, Rectangle, StackPanel, TextBlock } from "@babylonjs/gui";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
if (!canvas) {
	throw new Error("renderCanvas not found");
}
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, adaptToDeviceRatio: true });
const scene = new Scene(engine);
scene.clearColor = Color3.FromHexString("#0a121b").toColor4(1);

const state = {
	mode: "desktop",
	hasStarted: false,
	lives: 10,
	xp: 0,
	nextCardXp: 100,
	kills: 0,
	wave: 1,
	maxWaves: 10,
	enemiesSpawnedInWave: 0,
	enemiesResolvedInWave: 0,
	isPaused: false,
	isGameOver: false,
	firePressed: false,
	fireCooldown: 0,
	spawnCooldown: 2,
	xrReady: false,
	xrPlaced: false,
	weaponStats: {
		damage: 10,
		fireRate: 7,
		projectileSpeed: 14,
		spread: 0.01,
		pierce: 0,
		multishot: 1,
		name: "Pulse Shot",
	},
};

const worldRoot = new TransformNode("worldRoot", scene);
worldRoot.position = new Vector3(0, 0, 5);

const runtime = {
	camera: null,
	weaponRoot: null,
	weaponMesh: null,
	enemyTemplate: null,
	projectileTemplate: null,
	enemies: [],
	projectiles: [],
	ui: null,
	xr: null,
	xrHitTest: null,
	reticle: null,
	audioContext: null as AudioContext | null,
	audioMasterGain: null as GainNode | null,
	bgmIntervalId: null as number | null,
};

const ui = createUI();
runtime.ui = ui;

bootstrapScene();
createGameplayTemplates();
initDesktopMode();
updateHud();

window.addEventListener("pointerdown", () => {
	state.firePressed = true;
});

window.addEventListener("pointerup", () => {
	state.firePressed = false;
});

window.addEventListener("blur", () => {
	state.firePressed = false;
});

scene.onBeforeRenderObservable.add(() => {
	const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);

	if (!state.hasStarted || state.isGameOver) {
		return;
	}

	state.fireCooldown -= dt;
	state.spawnCooldown -= dt;

	if (state.spawnCooldown <= 0) {
		spawnWaveBatch();
	}

	if (state.firePressed && state.fireCooldown <= 0) {
		fireShot();
		state.fireCooldown = 1 / state.weaponStats.fireRate;
	}

	updateProjectiles(dt);
	updateEnemies(dt);
});

engine.runRenderLoop(() => {
	scene.render();
});

window.addEventListener("resize", () => {
	engine.resize();
});

function bootstrapScene() {
	const light = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
	light.intensity = 1;

	const arenaGround = MeshBuilder.CreateGround("arenaGround", { width: 10, height: 18 }, scene);
	arenaGround.parent = worldRoot;
	arenaGround.position = new Vector3(0, 0, 4);

	const groundMat = new StandardMaterial("groundMat", scene);
	groundMat.diffuseColor = Color3.FromHexString("#1d2f3d");
	groundMat.specularColor = Color3.Black();
	arenaGround.material = groundMat;

	const laneLine = MeshBuilder.CreateGround("laneLine", { width: 0.2, height: 18 }, scene);
	laneLine.parent = worldRoot;
	laneLine.position = new Vector3(0, 0.01, 4);

	const laneMat = new StandardMaterial("laneMat", scene);
	laneMat.diffuseColor = Color3.FromHexString("#68d9c5");
	laneMat.specularColor = Color3.Black();
	laneLine.material = laneMat;

	runtime.reticle = MeshBuilder.CreateTorus("reticle", { diameter: 0.2, thickness: 0.015 }, scene);
	runtime.reticle.isVisible = false;

	const reticleMat = new StandardMaterial("reticleMat", scene);
	reticleMat.diffuseColor = Color3.FromHexString("#b4ff6b");
	reticleMat.emissiveColor = Color3.FromHexString("#b4ff6b");
	runtime.reticle.material = reticleMat;
}

function createGameplayTemplates() {
	runtime.enemyTemplate = MeshBuilder.CreateCapsule(
		"enemyTemplate",
		{ height: 1.1, radius: 0.33, tessellation: 8 },
		scene,
	);
	runtime.enemyTemplate.isVisible = false;

	const enemyMat = new StandardMaterial("enemyMat", scene);
	enemyMat.diffuseColor = Color3.FromHexString("#99d14f");
	runtime.enemyTemplate.material = enemyMat;

	runtime.projectileTemplate = MeshBuilder.CreateSphere("projectileTemplate", { diameter: 0.16 }, scene);
	runtime.projectileTemplate.isVisible = false;

	const projectileMat = new StandardMaterial("projectileMat", scene);
	projectileMat.emissiveColor = Color3.FromHexString("#5cd8ff");
	projectileMat.diffuseColor = Color3.FromHexString("#5cd8ff");
	runtime.projectileTemplate.material = projectileMat;
}

function initDesktopMode() {
	state.mode = "desktop";
	const camera = new FreeCamera("desktopCamera", new Vector3(0, 1.65, -6), scene);
	camera.setTarget(new Vector3(0, 1.2, 4));
	camera.attachControl(canvas, true);
	camera.speed = 0;
	camera.keysUp = [];
	camera.keysDown = [];
	camera.keysLeft = [];
	camera.keysRight = [];
	scene.activeCamera = camera;
	runtime.camera = camera;

	attachWeaponToCamera(camera);
	ui.modeText.text = "Mode: Desktop";
}

async function initARMode() {
	if (!navigator.xr) {
		ui.statusText.text = "WebXR não suportado neste dispositivo.";
		return;
	}

	if (!runtime.xr) {
		try {
			runtime.xr = await WebXRDefaultExperience.CreateAsync(scene, {
				disableDefaultUI: true,
			});
			const fm = runtime.xr.baseExperience.featuresManager;
			runtime.xrHitTest = fm.enableFeature(WebXRFeatureName.HIT_TEST, "latest");

			runtime.xrHitTest.onHitTestResultObservable.add((results) => {
				if (!results.length) {
					runtime.reticle.isVisible = false;
					return;
				}
				const hit = results[0];
				const hitPos = hit.transformationMatrix.getTranslation();
				runtime.reticle.isVisible = true;
				runtime.reticle.position.copyFrom(hitPos);
				runtime.reticle.rotationQuaternion = Quaternion.Identity();
			});

			state.xrReady = true;
			ui.statusText.text = "AR pronto. Toque em ENTER AR.";
		} catch (error) {
			state.xrReady = false;
			ui.statusText.text = "Falha ao inicializar AR.";
			console.error(error);
			return;
		}
	}

	try {
		const base = runtime.xr.baseExperience;
		await base.enterXRAsync("immersive-ar", "local-floor", runtime.xr.renderTarget);
		state.mode = "ar";
		state.xrPlaced = false;
		ui.modeText.text = "Mode: AR";
		ui.statusText.text = "AR ativo. Mire no chão e toque em PLACE ARENA.";
		ui.placeButton.isVisible = true;
		runtime.reticle.isVisible = false;

		base.onStateChangedObservable.add((xrState) => {
			const exited = xrState === WebXRState.NOT_IN_XR;
			if (!exited) {
				return;
			}

			state.mode = "desktop";
			state.xrPlaced = false;
			ui.modeText.text = "Mode: Desktop";
			ui.statusText.text = "Saiu do AR. Continue no desktop.";
			ui.placeButton.isVisible = false;
			runtime.reticle.isVisible = false;
			if (runtime.camera) {
				attachWeaponToCamera(runtime.camera);
			}
		});

		const xrCamera = runtime.xr.baseExperience.camera;
		attachWeaponToCamera(xrCamera);
	} catch (error) {
		ui.statusText.text = "Não foi possível entrar em AR.";
		console.error(error);
	}
}

function placeArenaFromReticle() {
	if (!runtime.reticle.isVisible || !scene.activeCamera) {
		ui.statusText.text = "Aponte para uma superfície válida.";
		return;
	}

	worldRoot.position.copyFrom(runtime.reticle.position);

	const cameraForward = scene.activeCamera.getForwardRay().direction;
	const flatForward = new Vector3(cameraForward.x, 0, cameraForward.z).normalize();
	const angle = Math.atan2(flatForward.x, flatForward.z);
	worldRoot.rotation = new Vector3(0, angle, 0);

	state.xrPlaced = true;
	runtime.reticle.isVisible = false;
	ui.placeButton.isVisible = false;
	ui.statusText.text = "Arena posicionada. Atire para defender.";
}

function attachWeaponToCamera(camera) {
	if (runtime.weaponRoot) {
		runtime.weaponRoot.dispose();
	}

	runtime.weaponRoot = new TransformNode("weaponRoot", scene);
	runtime.weaponRoot.parent = camera;
	runtime.weaponRoot.position = new Vector3(0.22, -0.2, 0.8);

	const barrel = MeshBuilder.CreateBox("weaponBarrel", { width: 0.08, height: 0.08, depth: 0.48 }, scene);
	barrel.parent = runtime.weaponRoot;
	barrel.position = new Vector3(0, 0, 0.2);

	const weaponMat = new StandardMaterial("weaponMat", scene);
	weaponMat.diffuseColor = Color3.FromHexString("#f49f5a");
	weaponMat.emissiveColor = Color3.FromHexString("#f49f5a").scale(0.15);
	barrel.material = weaponMat;

	runtime.weaponMesh = barrel;
}

function fireShot() {
	if (!scene.activeCamera) {
		return;
	}

	if (state.mode === "ar" && !state.xrPlaced) {
		return;
	}

	playShotSound();

	const baseRay = scene.activeCamera.getForwardRay(2);
	const muzzlePos = baseRay.origin.add(baseRay.direction.scale(0.8));
	for (let i = 0; i < state.weaponStats.multishot; i += 1) {
		const spreadX = (Math.random() - 0.5) * state.weaponStats.spread;
		const spreadY = (Math.random() - 0.5) * state.weaponStats.spread;
		const dir = new Vector3(baseRay.direction.x + spreadX, baseRay.direction.y + spreadY, baseRay.direction.z).normalize();

		const mesh = runtime.projectileTemplate.clone(`projectile_${performance.now()}_${i}`);
		mesh.isVisible = true;
		mesh.position.copyFrom(muzzlePos);

		runtime.projectiles.push({
			mesh,
			velocity: dir.scale(state.weaponStats.projectileSpeed),
			life: 2.2,
			damage: state.weaponStats.damage,
			pierceLeft: state.weaponStats.pierce,
			hitEnemyIds: new Set(),
		});
	}
}

function spawnEnemy() {
	if (state.wave > state.maxWaves) {
		return;
	}

	if (state.mode === "ar" && !state.xrPlaced) {
		return;
	}

	const waveConfig = getWaveConfig(state.wave);
	if (state.enemiesSpawnedInWave >= waveConfig.totalEnemies) {
		return;
	}

	const { spawn, side } = getArenaVectors();
	const laneOffset = (Math.random() - 0.5) * 4;
	const spawnPos = spawn.add(side.scale(laneOffset));
	const enemyMesh = runtime.enemyTemplate.clone(`enemy_${performance.now()}`);
	enemyMesh.isVisible = true;
	enemyMesh.position.copyFrom(spawnPos);

	const hp = waveConfig.enemyHp;
	const speed = waveConfig.enemySpeed;

	runtime.enemies.push({
		id: enemyMesh.name,
		mesh: enemyMesh,
		hp,
		speed,
		xpReward: waveConfig.xpPerEnemy,
	});

	state.enemiesSpawnedInWave += 1;
	updateHud();
}

function spawnWaveBatch() {
	if (state.wave > state.maxWaves) {
		return;
	}

	const waveConfig = getWaveConfig(state.wave);
	const remaining = waveConfig.totalEnemies - state.enemiesSpawnedInWave;
	if (remaining <= 0) {
		state.spawnCooldown = 0.5;
		return;
	}

	const count = Math.min(waveConfig.spawnPerBatch, remaining);
	for (let i = 0; i < count; i += 1) {
		spawnEnemy();
	}

	state.spawnCooldown = waveConfig.spawnInterval;
}

function updateEnemies(dt) {
	const { goal } = getArenaVectors();
	const nextEnemies = [];

	for (const enemy of runtime.enemies) {
		const toGoal = goal.subtract(enemy.mesh.position);
		const dist = toGoal.length();

		if (dist < 0.45) {
			enemy.mesh.dispose();
			state.lives -= 1;
			state.enemiesResolvedInWave += 1;
			updateHud();
			if (state.lives <= 0) {
				state.isGameOver = true;
				ui.statusText.text = "Game Over. Toque em RESTART.";
				showRestartMenu();
			}
			advanceWaveIfReady();
			continue;
		}

		const step = toGoal.normalize().scale(enemy.speed * dt);
		enemy.mesh.position.addInPlace(step);
		nextEnemies.push(enemy);
	}

	runtime.enemies = nextEnemies;
}

function updateProjectiles(dt) {
	const nextProjectiles = [];

	for (const projectile of runtime.projectiles) {
		projectile.life -= dt;
		if (projectile.life <= 0) {
			projectile.mesh.dispose();
			continue;
		}

		projectile.mesh.position.addInPlace(projectile.velocity.scale(dt));

		let removed = false;
		for (const enemy of runtime.enemies) {
			if (projectile.hitEnemyIds.has(enemy.id)) {
				continue;
			}
			if (Vector3.Distance(projectile.mesh.position, enemy.mesh.position) > 0.45) {
				continue;
			}

			projectile.hitEnemyIds.add(enemy.id);
			enemy.hp -= projectile.damage;

			if (enemy.hp <= 0) {
				killEnemy(enemy.id);
			}

			if (projectile.pierceLeft <= 0) {
				projectile.mesh.dispose();
				removed = true;
				break;
			}

			projectile.pierceLeft -= 1;
		}

		if (!removed) {
			nextProjectiles.push(projectile);
		}
	}

	runtime.projectiles = nextProjectiles;
}

function killEnemy(enemyId) {
	const alive = [];

	for (const enemy of runtime.enemies) {
		if (enemy.id === enemyId) {
			enemy.mesh.dispose();
			state.kills += 1;
			state.xp += enemy.xpReward;
			state.enemiesResolvedInWave += 1;
			continue;
		}
		alive.push(enemy);
	}

	runtime.enemies = alive;
	updateHud();
	advanceWaveIfReady();
	maybeOpenCardSelection();
}

function advanceWaveIfReady() {
	const waveConfig = getWaveConfig(state.wave);
	const waveFinished =
		state.enemiesSpawnedInWave >= waveConfig.totalEnemies &&
		state.enemiesResolvedInWave >= waveConfig.totalEnemies &&
		runtime.enemies.length === 0;

	if (!waveFinished) {
		return;
	}

	if (state.wave >= state.maxWaves) {
		state.isGameOver = true;
		ui.statusText.text = "Voce venceu as 10 hordas!";
		showRestartMenu();
		updateHud();
		return;
	}

	state.wave += 1;
	state.enemiesSpawnedInWave = 0;
	state.enemiesResolvedInWave = 0;
	state.spawnCooldown = 2;
	ui.statusText.text = `Horda ${state.wave} iniciando...`;
	updateHud();
}

function maybeOpenCardSelection() {
	if (state.xp < state.nextCardXp || ui.cardModal.isVisible) {
		return;
	}

	state.nextCardXp += 30;
	const options = pickCards(3);
	ui.cardModal.isVisible = true;
	ui.statusText.text = "Escolha 1 upgrade (jogo continua).";

	for (let i = 0; i < ui.cardButtons.length; i += 1) {
		const option = options[i];
		const button = ui.cardButtons[i];
		button.textBlock.text = `${option.title}\n${option.description}`;
		button.onPointerClickObservable.clear();
		button.onPointerClickObservable.add(() => {
			option.apply();
			ui.cardModal.isVisible = false;
			ui.statusText.text = `Upgrade ativo: ${state.weaponStats.name}`;
			updateHud();
		});
	}
}

function pickCards(amount) {
	const allCards = [
		{
			title: "Rapid Barrel",
			description: "+40% fire rate",
			apply: () => {
				state.weaponStats.fireRate = Math.min(state.weaponStats.fireRate + 1.2, 12);
				state.weaponStats.name = "Rapid Pulse";
			},
		},
		{
			title: "Heavy Slug",
			description: "+10 damage, -0.5 fire rate",
			apply: () => {
				state.weaponStats.damage += 10;
				state.weaponStats.fireRate = Math.max(1.2, state.weaponStats.fireRate - 0.5);
				state.weaponStats.name = "Heavy Slug";
			},
		},
		{
			title: "Pierce Core",
			description: "Projectile pierces +1 enemy",
			apply: () => {
				state.weaponStats.pierce += 1;
				state.weaponStats.name = "Pierce Core";
			},
		},
		{
			title: "Scatter Burst",
			description: "+1 projectile, +spread",
			apply: () => {
				state.weaponStats.multishot = Math.min(state.weaponStats.multishot + 1, 5);
				state.weaponStats.spread = Math.min(state.weaponStats.spread + 0.01, 0.08);
				state.weaponStats.name = "Scatter Burst";
			},
		},
		{
			title: "Turbo Plasma",
			description: "+8 projectile speed",
			apply: () => {
				state.weaponStats.projectileSpeed += 8;
				state.weaponStats.name = "Turbo Plasma";
			},
		},
	];

	const picks = [];
	const pool = [...allCards];

	while (picks.length < amount && pool.length > 0) {
		const index = Math.floor(Math.random() * pool.length);
		picks.push(pool[index]);
		pool.splice(index, 1);
	}

	return picks;
}

function getWaveConfig(wave: number) {
	const level = Math.min(Math.max(wave, 1), 10);
	const totalEnemies = 16 + (level - 1) * 6;
	const spawnPerBatch = 4 + Math.floor((level - 1) / 3);
	const spawnInterval = Math.max(4, 10 - (level - 1) * 0.6);
	const enemyHp = 100 + (level - 1) * 30;
	const enemySpeed = 1.5 + (level - 1) * 0.18;
	const totalWaveXp = 100 + (level - 1) * 40;
	const xpPerEnemy = totalWaveXp / totalEnemies;

	return {
		totalEnemies,
		spawnPerBatch,
		spawnInterval,
		enemyHp,
		enemySpeed,
		xpPerEnemy,
	};
}

function getArenaVectors() {
	const forward = worldRoot.getDirection(Axis.Z).normalize();
	const side = Vector3.Cross(Vector3.Up(), forward).normalize();
	const spawn = worldRoot.position.add(forward.scale(13));
	const goal = worldRoot.position.add(forward.scale(-2));

	return { forward, side, spawn, goal };
}

function createUI() {
	const adt = AdvancedDynamicTexture.CreateFullscreenUI("hud", true, scene);

	const root = new Rectangle("root");
	root.thickness = 0;
	root.width = 1;
	root.height = 1;
	adt.addControl(root);

	const topBar = new StackPanel("topBar");
	topBar.width = "320px";
	topBar.height = "130px";
	topBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
	topBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
	topBar.paddingLeft = "16px";
	topBar.paddingTop = "16px";
	root.addControl(topBar);

	const modeText = makeLabel("Mode: Desktop", "22px");
	const statsText = makeLabel("Lives: 10  XP: 0  Kills: 0", "20px");
	const weaponText = makeLabel("Weapon: Pulse Shot", "18px");
	const statusText = makeLabel("Desktop pronto. Use mouse para mirar.", "16px");
	statusText.textWrapping = true;
	topBar.addControl(modeText);
	topBar.addControl(statsText);
	topBar.addControl(weaponText);
	topBar.addControl(statusText);

	const crosshair = new Ellipse("crosshair");
	crosshair.width = "16px";
	crosshair.height = "16px";
	crosshair.thickness = 2;
	crosshair.color = "#6ef7f0";
	crosshair.background = "#6ef7f044";
	crosshair.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
	crosshair.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
	root.addControl(crosshair);

	const actionBar = new StackPanel("actionBar");
	actionBar.width = "230px";
	actionBar.height = "200px";
	actionBar.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
	actionBar.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
	actionBar.paddingRight = "18px";
	actionBar.paddingBottom = "20px";
	actionBar.isVertical = true;
	root.addControl(actionBar);

	const arButton = Button.CreateSimpleButton("arButton", "ENTER AR");
	styleButton(arButton, "#69dd9e");
	arButton.onPointerClickObservable.add(() => {
		initARMode();
	});
	actionBar.addControl(arButton);

	const placeButton = Button.CreateSimpleButton("placeButton", "PLACE ARENA");
	styleButton(placeButton, "#5cd8ff");
	placeButton.isVisible = false;
	placeButton.onPointerClickObservable.add(() => {
		placeArenaFromReticle();
	});
	actionBar.addControl(placeButton);

	const fireButton = Button.CreateSimpleButton("fireButton", "FIRE");
	styleButton(fireButton, "#f49f5a");
	fireButton.width = "180px";
	fireButton.height = "84px";
	fireButton.fontSize = "34px";
	fireButton.onPointerDownObservable.add(() => {
		state.firePressed = true;
	});
	fireButton.onPointerUpObservable.add(() => {
		state.firePressed = false;
	});
	fireButton.onPointerOutObservable.add(() => {
		state.firePressed = false;
	});
	actionBar.addControl(fireButton);

	const cardModal = new Rectangle("cardModal");
	cardModal.width = 1;
	cardModal.height = "170px";
	cardModal.background = "#00000000";
	cardModal.thickness = 0;
	cardModal.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
	cardModal.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
	cardModal.isVisible = false;
	root.addControl(cardModal);

	const cardStack = new StackPanel("cardStack");
	cardStack.width = "96%";
	cardStack.height = "140px";
	cardStack.isVertical = false;
	cardStack.spacing = 10;
	cardStack.paddingBottom = "14px";
	cardStack.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
	cardStack.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
	cardModal.addControl(cardStack);

	const cardButtons = [];
	for (let i = 0; i < 3; i += 1) {
		const cardButton = Button.CreateSimpleButton(`card_${i}`, "");
		cardButton.width = "31%";
		cardButton.height = "112px";
		cardButton.cornerRadius = 12;
		cardButton.thickness = 1;
		cardButton.fontSize = "18px";
		cardButton.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
		cardButton.textBlock.paddingLeft = "10px";
		cardButton.textBlock.paddingRight = "10px";
		cardButton.textBlock.textWrapping = true;
		cardButton.background = "#132131d9";
		cardButton.color = "#d7ecff";
		cardStack.addControl(cardButton);
		cardButtons.push(cardButton);
	}

	const startPanel = new Rectangle("startPanel");
	startPanel.width = "320px";
	startPanel.height = "220px";
	startPanel.thickness = 1;
	startPanel.cornerRadius = 14;
	startPanel.color = "#6ef7f0";
	startPanel.background = "#0b1522dd";
	startPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
	startPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
	root.addControl(startPanel);

	const startStack = new StackPanel("startStack");
	startStack.width = "90%";
	startStack.height = "90%";
	startStack.spacing = 12;
	startPanel.addControl(startStack);

	const startTitle = makeLabel("AR Tower Defense", "30px");
	startTitle.height = "52px";
	startTitle.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
	startTitle.color = "#d7ecff";
	startStack.addControl(startTitle);

	const startButton = Button.CreateSimpleButton("startButton", "START");
	styleButton(startButton, "#69dd9e");
	startButton.width = "170px";
	startButton.height = "58px";
	startButton.onPointerClickObservable.add(() => {
		startGame();
	});
	startStack.addControl(startButton);

	const restartButton = Button.CreateSimpleButton("restartButton", "RESTART");
	styleButton(restartButton, "#f49f5a");
	restartButton.width = "170px";
	restartButton.height = "58px";
	restartButton.isVisible = false;
	restartButton.onPointerClickObservable.add(() => {
		restartGame();
	});
	startStack.addControl(restartButton);

	return {
		adt,
		modeText,
		statsText,
		weaponText,
		statusText,
		placeButton,
		cardModal,
		cardButtons,
		startPanel,
		startButton,
		restartButton,
	};
}

function startGame() {
	if (state.hasStarted) {
		return;
	}

	state.hasStarted = true;
	state.spawnCooldown = 1;
	ui.startPanel.isVisible = false;
	ui.restartButton.isVisible = false;
	ui.statusText.text = "Horda 1 iniciando...";
	ensureAudioReady();
	startBackgroundMusic();
	updateHud();
}

function restartGame() {
	resetRuntimeEntities();
	resetStateValues();
	ui.cardModal.isVisible = false;
	ui.startPanel.isVisible = false;
	ui.restartButton.isVisible = false;
	ui.statusText.text = "Horda 1 iniciando...";
	ensureAudioReady();
	startBackgroundMusic();
	updateHud();
}

function showRestartMenu() {
	ui.startPanel.isVisible = true;
	ui.startButton.isVisible = false;
	ui.restartButton.isVisible = true;
}

function resetRuntimeEntities() {
	for (const enemy of runtime.enemies) {
		enemy.mesh.dispose();
	}
	for (const projectile of runtime.projectiles) {
		projectile.mesh.dispose();
	}
	runtime.enemies = [];
	runtime.projectiles = [];
}

function resetStateValues() {
	state.hasStarted = true;
	state.mode = "desktop";
	state.lives = 10;
	state.xp = 0;
	state.nextCardXp = 100;
	state.kills = 0;
	state.wave = 1;
	state.enemiesSpawnedInWave = 0;
	state.enemiesResolvedInWave = 0;
	state.isPaused = false;
	state.isGameOver = false;
	state.firePressed = false;
	state.fireCooldown = 0;
	state.spawnCooldown = 1;
	state.xrPlaced = false;
	state.weaponStats.damage = 10;
	state.weaponStats.fireRate = 7;
	state.weaponStats.projectileSpeed = 14;
	state.weaponStats.spread = 0.01;
	state.weaponStats.pierce = 0;
	state.weaponStats.multishot = 1;
	state.weaponStats.name = "Pulse Shot";
}

function ensureAudioReady() {
	if (!runtime.audioContext) {
		runtime.audioContext = new AudioContext();
		runtime.audioMasterGain = runtime.audioContext.createGain();
		runtime.audioMasterGain.gain.value = 0.25;
		runtime.audioMasterGain.connect(runtime.audioContext.destination);
	}

	if (runtime.audioContext.state === "suspended") {
		runtime.audioContext.resume();
	}
}

function startBackgroundMusic() {
	if (!runtime.audioContext || !runtime.audioMasterGain || runtime.bgmIntervalId !== null) {
		return;
	}

	const notes = [220, 261.63, 329.63, 392];
	let noteIndex = 0;

	const playNote = () => {
		if (!runtime.audioContext || !runtime.audioMasterGain) {
			return;
		}

		const now = runtime.audioContext.currentTime;
		const osc = runtime.audioContext.createOscillator();
		const gain = runtime.audioContext.createGain();

		osc.type = "triangle";
		osc.frequency.value = notes[noteIndex % notes.length];
		noteIndex += 1;

		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.linearRampToValueAtTime(0.04, now + 0.08);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

		osc.connect(gain);
		gain.connect(runtime.audioMasterGain);
		osc.start(now);
		osc.stop(now + 0.72);
	};

	playNote();
	runtime.bgmIntervalId = window.setInterval(playNote, 750);
}

function playShotSound() {
	if (!runtime.audioContext || !runtime.audioMasterGain) {
		return;
	}

	const now = runtime.audioContext.currentTime;
	const osc = runtime.audioContext.createOscillator();
	const gain = runtime.audioContext.createGain();

	osc.type = "square";
	osc.frequency.setValueAtTime(760, now);
	osc.frequency.exponentialRampToValueAtTime(420, now + 0.08);

	gain.gain.setValueAtTime(0.0001, now);
	gain.gain.linearRampToValueAtTime(0.05, now + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

	osc.connect(gain);
	gain.connect(runtime.audioMasterGain);
	osc.start(now);
	osc.stop(now + 0.1);
}

function styleButton(button, color) {
	button.width = "180px";
	button.height = "54px";
	button.color = "#0b1d2f";
	button.background = color;
	button.cornerRadius = 12;
	button.thickness = 0;
	button.fontSize = "22px";
	button.fontFamily = "Verdana";
	button.paddingBottom = "10px";
}

function makeLabel(text, fontSize) {
	const label = new TextBlock();
	label.text = text;
	label.height = "30px";
	label.color = "#d7ecff";
	label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
	label.fontSize = fontSize;
	label.fontFamily = "Verdana";
	return label;
}

function updateHud() {
	const currentWaveTotal = getWaveConfig(state.wave).totalEnemies;
	const remainingInWave = Math.max(currentWaveTotal - state.enemiesResolvedInWave, 0);
	ui.statsText.text = `Wave: ${state.wave}/${state.maxWaves}  Lives: ${state.lives}  XP: ${state.xp.toFixed(1)}  Kills: ${state.kills}  Left: ${remainingInWave}`;
	ui.weaponText.text = [
		`Weapon: ${state.weaponStats.name}`,
		`DMG ${state.weaponStats.damage} | FR ${state.weaponStats.fireRate.toFixed(1)}`,
		`PRJ ${state.weaponStats.multishot} | Pierce ${state.weaponStats.pierce}`,
	].join("  ");
}
