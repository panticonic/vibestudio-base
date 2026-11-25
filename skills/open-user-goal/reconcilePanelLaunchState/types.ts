import type {LaunchSnapshot,LaunchPreflight,LaunchEffect} from "./workspace/types.js";
export * from "./workspace/types.js";
export type LaunchObservations={opening:LaunchSnapshot;current:LaunchSnapshot;companions:LaunchSnapshot[]};
export type LaunchVerification={readback:LaunchSnapshot;companions:LaunchSnapshot[]};
export type LaunchApplication={preflight:LaunchPreflight|null;effect:LaunchEffect|null};
