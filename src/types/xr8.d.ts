import type { Behavior } from "@babylonjs/core/Behaviors/behavior";
import type { Camera } from "@babylonjs/core/Cameras/camera";

declare global {
  interface XR8CameraPipelineModule {
    name: string;
    onCameraStatusChange?: (event: { status: "requesting" | "hasStream" | "hasVideo" | "failed" }) => void;
    onException?: (error: unknown) => void;
    onStart?: () => void;
  }

  interface XR8CameraBehaviorConfig {
    allowedDevices?: unknown;
    cameraConfig?: { direction?: unknown };
    webgl2?: boolean;
  }

  interface XR8Api {
    Babylonjs: {
      xrCameraBehavior: (config?: XR8CameraBehaviorConfig, xrConfig?: Record<string, unknown>) => Behavior<Camera>;
    };
    XrConfig: {
      camera: () => { BACK: unknown; FRONT: unknown };
      device: () => { ANY: unknown; MOBILE: unknown; MOBILE_AND_HEADSETS: unknown };
    };
    XrController: {
      configure: (config: {
        enableLighting?: boolean;
        scale?: "responsive" | "absolute";
      }) => void;
      recenter: () => void;
    };
    XrDevice: {
      isDeviceBrowserCompatible: (config?: Record<string, unknown>) => boolean;
    };
    addCameraPipelineModule: (module: XR8CameraPipelineModule) => void;
    removeCameraPipelineModule: (moduleName: string) => void;
    stop: () => void;
  }

  interface Window {
    XR8?: XR8Api;
  }

  interface WindowEventMap {
    xrloaded: Event;
  }
}

export {};
