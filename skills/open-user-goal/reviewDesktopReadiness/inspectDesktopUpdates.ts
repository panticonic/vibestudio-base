import {desktopReadiness} from "natlang:services";
import type {DesktopDesk,DesktopUpdateObservation} from "./types.js";
/** Return the actual scoped native observation without a sampled copy of it. */
export default function inspectDesktopUpdates(desk:DesktopDesk):Promise<DesktopUpdateObservation>{return desktopReadiness.readUpdates(desk.id);}
