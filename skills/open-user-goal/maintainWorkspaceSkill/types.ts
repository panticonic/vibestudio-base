import type {SkillMaintenanceCard,SkillMaintenanceObservation,SkillMaintenanceReceipt,SkillMaintenanceCheck} from "../types.js";
import type {AuthoringReport} from "./investigateSkill/authoring/types.js";
export type {AuthoringReport} from "./investigateSkill/authoring/types.js";
export type SkillMaintenanceInquiry={card:SkillMaintenanceCard;observation:SkillMaintenanceObservation;authoring:AuthoringReport|null};

export type SkillMaintenanceFindings = { explanation:string; patch:SkillMaintenanceReceipt|null; check:SkillMaintenanceCheck|null };
