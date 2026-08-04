import type { Behavior } from "@babylonjs/core/Behaviors/behavior";
import type { Camera } from "@babylonjs/core/Cameras/camera";

declare global {
  type XR8HitTestType = "FEATURE_POINT" | "ESTIMATED_SURFACE" | "DETECTED_SURFACE";

  type XR8TrackingStatus =
    | "INITIALIZING"
    | "LIMITED"
    | "RELOCALIZING"
    | "NORMAL"
    | "NOT_AVAILABLE";

  interface XR8HitTestResult {
    type: XR8HitTestType;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    distance: number;
  }

  interface XR8CameraPipelineModule {
    name: string;
    onCameraStatusChange?: (event: { status: "requesting" | "hasStream" | "hasVideo" | "failed" }) => void;
    onException?: (error: unknown) => void;
    onStart?: () => void;
    onUpdate?: (event: {
      processCpuResult?: {
        reality?: {
          trackingStatus?: XR8TrackingStatus;
          trackingReason?: string;
        };
      };
    }) => void;
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
      hitTest: (x: number, y: number, includedTypes: XR8HitTestType[]) => XR8HitTestResult[];
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
