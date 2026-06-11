import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

export const SIMULATION_TICK_MS = 50;
export const SIMULATION_TICK_SECONDS = SIMULATION_TICK_MS / 1000;

export interface SimulationTickContext {
	currentTick: number;
	elapsedSimulationMs: number;
	tickDurationMs: number;
	tickDurationSeconds: number;
}

type SimulationTickListener = (context: SimulationTickContext) => void;

export function convertMillisecondsToSimulationTicks(
	durationMs: number,
	tickDurationMs = SIMULATION_TICK_MS
): number {
	if (!Number.isFinite(durationMs) || durationMs <= 0) {
		return 1;
	}

	return Math.max(1, Math.ceil(durationMs / tickDurationMs));
}

export class SimulationClock {
	private readonly beforeRenderObserver: Observer<Scene>;
	private readonly listeners = new Set<SimulationTickListener>();

	private accumulatedFrameMs = 0;
	private currentTick = 0;

	public constructor(
		private readonly scene: Scene,
		private readonly tickDurationMs = SIMULATION_TICK_MS
	) {
		this.beforeRenderObserver = this.scene.onBeforeRenderObservable.add(() => {
			this.advanceUsingRenderDelta();
		});
	}

	public getCurrentTick(): number {
		return this.currentTick;
	}

	public subscribe(listener: SimulationTickListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	public dispose(): void {
		this.scene.onBeforeRenderObservable.remove(this.beforeRenderObserver);
		this.listeners.clear();
	}

	private advanceUsingRenderDelta(): void {
		this.accumulatedFrameMs += this.scene.getEngine().getDeltaTime();

		while (this.accumulatedFrameMs >= this.tickDurationMs) {
			this.accumulatedFrameMs -= this.tickDurationMs;
			this.currentTick += 1;

			const context: SimulationTickContext = {
				currentTick: this.currentTick,
				elapsedSimulationMs: this.currentTick * this.tickDurationMs,
				tickDurationMs: this.tickDurationMs,
				tickDurationSeconds: this.tickDurationMs / 1000,
			};

			for (const listener of this.listeners) {
				listener(context);
			}
		}
	}
}
