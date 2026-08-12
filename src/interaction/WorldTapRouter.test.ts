import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { PointerEventTypes, type PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorldTapRouter } from "./WorldTapRouter";

// NullEngine roda o Babylon.js sem WebGL: o suficiente para a Scene existir e
// para o `onPointerObservable` despachar. O roteamento por fase e logica pura,
// nao precisa de render nem de picking real — o `pickInfo` e injetado.
let engine: NullEngine;
let scene: Scene;
let router: WorldTapRouter;

const fakeMesh = { name: "mesh-falsa" } as unknown as AbstractMesh;

function emitPointer(
  type: number,
  pickedPoint: Vector3 | null = null,
  pickedMesh: AbstractMesh | null = null
): void {
  scene.onPointerObservable.notifyObservers({
    type,
    pickInfo: { pickedPoint, pickedMesh },
  } as unknown as PointerInfo);
}

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  router = new WorldTapRouter(scene);
});

afterEach(() => {
  router.dispose();
  scene.dispose();
  engine.dispose();
});

describe("WorldTapRouter", () => {
  it("comeca em `menu` e ignora o toque quando a fase nao tem handler", () => {
    const handler = vi.fn();
    router.setHandler("playing", handler);

    expect(router.getPhase()).toBe("menu");

    emitPointer(PointerEventTypes.POINTERDOWN, new Vector3(1, 0, 2));

    expect(handler).not.toHaveBeenCalled();
  });

  it("entrega o toque apenas ao handler da fase atual", () => {
    const arSetup = vi.fn();
    const worldAlive = vi.fn();
    const playing = vi.fn();

    router.setHandler("ar-setup", arSetup);
    router.setHandler("world-alive", worldAlive);
    router.setHandler("playing", playing);

    router.setPhase("ar-setup");
    emitPointer(PointerEventTypes.POINTERDOWN);
    expect(arSetup).toHaveBeenCalledTimes(1);
    expect(worldAlive).not.toHaveBeenCalled();
    expect(playing).not.toHaveBeenCalled();

    router.setPhase("world-alive");
    emitPointer(PointerEventTypes.POINTERDOWN);
    expect(worldAlive).toHaveBeenCalledTimes(1);
    expect(arSetup).toHaveBeenCalledTimes(1);
    expect(playing).not.toHaveBeenCalled();

    router.setPhase("playing");
    emitPointer(PointerEventTypes.POINTERDOWN);
    expect(playing).toHaveBeenCalledTimes(1);
    expect(worldAlive).toHaveBeenCalledTimes(1);
  });

  it("repassa ponto e mesh do picking para o handler", () => {
    const handler = vi.fn();
    const point = new Vector3(3, 0, -4);

    router.setHandler("world-alive", handler);
    router.setPhase("world-alive");

    emitPointer(PointerEventTypes.POINTERDOWN, point, fakeMesh);

    expect(handler).toHaveBeenCalledWith(point, fakeMesh);
  });

  it("repassa null quando o toque nao acertou nada", () => {
    const handler = vi.fn();

    router.setHandler("world-alive", handler);
    router.setPhase("world-alive");

    emitPointer(PointerEventTypes.POINTERDOWN);

    expect(handler).toHaveBeenCalledWith(null, null);
  });

  it("so reage a POINTERDOWN", () => {
    const handler = vi.fn();

    router.setHandler("playing", handler);
    router.setPhase("playing");

    emitPointer(PointerEventTypes.POINTERUP);
    emitPointer(PointerEventTypes.POINTERMOVE);
    emitPointer(PointerEventTypes.POINTERTAP);

    expect(handler).not.toHaveBeenCalled();

    emitPointer(PointerEventTypes.POINTERDOWN);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("remove o handler de uma fase quando recebe null", () => {
    const handler = vi.fn();

    router.setHandler("playing", handler);
    router.setPhase("playing");
    emitPointer(PointerEventTypes.POINTERDOWN);
    expect(handler).toHaveBeenCalledTimes(1);

    router.setHandler("playing", null);
    emitPointer(PointerEventTypes.POINTERDOWN);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("para de rotear depois do dispose", () => {
    const handler = vi.fn();

    router.setHandler("playing", handler);
    router.setPhase("playing");
    router.dispose();

    emitPointer(PointerEventTypes.POINTERDOWN);

    expect(handler).not.toHaveBeenCalled();
  });
});
