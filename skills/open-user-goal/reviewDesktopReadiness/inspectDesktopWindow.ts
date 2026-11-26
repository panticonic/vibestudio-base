import {desktopReadiness} from "natlang:services";
import type {DesktopDesk,DesktopWindowObservation} from "./types.js";
/** Return the actual scoped native observation without a sampled copy of it. */
export default function inspectDesktopWindow(desk:DesktopDesk):Promise<DesktopWindowObservation>{return desktopReadiness.readWindow(desk.id);}
