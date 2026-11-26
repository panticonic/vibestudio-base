import {googleRunbook} from "natlang:services";
import type {RunbookBasis} from "./contract.js";
export default async function readRunbookBasis():Promise<RunbookBasis>{return googleRunbook.read();}
