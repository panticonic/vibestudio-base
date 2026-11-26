import type {LaunchSnapshot,LaunchPreflight,LaunchEffect} from "./workspace/types.js";
export * from "./workspace/types.js";
export type LaunchObservations={opening:LaunchSnapshot;current:LaunchSnapshot;companions:LaunchSnapshot[]};
export type LaunchVerification={readback:LaunchSnapshot;companions:LaunchSnapshot[]};
export type LaunchApplication={preflight:LaunchPreflight|null;effect:LaunchEffect|null};

/** Identity and intent can be selected before inspecting native state; a patch cannot. */
export type LaunchSelection={panelId:string;direction:"read"|"write"|"test";retain:boolean};
