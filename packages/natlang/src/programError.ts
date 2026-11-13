/** The eval failure code of a cell that `natlang.load` or `natlang.describe` refused a program in. */
export const NATLANG_PROGRAM_REFUSED_CODE = "natlang_program_refused";

/**
 * `natlang.load` refused a program: it does not type-check (`does-not-compile`), cannot get its services
 * (`services-unavailable`), or was not named correctly (`invalid-path`). The message says why, with workspace paths and
 * positions; `errorData` carries the same as data, so the eval shows the reason once and no provider stack.
 */
export class NatlangProgramError extends Error {
  override readonly name = "NatlangProgramError";
  readonly errorData: {
    code: typeof NATLANG_PROGRAM_REFUSED_CODE;
    program: string;
    reason: "does-not-compile" | "services-unavailable" | "invalid-path";
  };

  constructor(message: string, program: string, reason: NatlangProgramError["errorData"]["reason"]) {
    super(message);
    this.errorData = { code: NATLANG_PROGRAM_REFUSED_CODE, program, reason };
  }
}
