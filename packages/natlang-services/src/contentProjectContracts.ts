import { z } from "zod";
export const contentProjectRequestSchema=z.object({goal:z.string().min(1),audience:z.string().min(1),facts:z.array(z.object({id:z.string().min(1),text:z.string().min(1)})),documentRoles:z.array(z.string().min(1))}).strict();
export type ContentProjectRequest=z.infer<typeof contentProjectRequestSchema>;
const draft=z.object({path:z.string(),text:z.string()}).strict();
export type ContentProjectDraft=z.infer<typeof draft>;
const snapshot=z.object({contextId:z.string(),repoPath:z.string(),repositoryId:z.string().nullable(),head:z.string(),mainEventId:z.string(),committedEventId:z.string(),clean:z.boolean(),files:z.array(draft)}).strict();
export type ContentProjectSnapshot=z.infer<typeof snapshot>;
export const contentProjectMethods={
  observe:{description:"Read actual assigned repository files and working/committed state in the fixed execution context.",args:z.tuple([]),returns:snapshot},
  prepare:{description:"Prepare the assigned initially absent content project through the ordinary project helper at the exact observed head.",args:z.tuple([z.string()]),returns:snapshot},
  writeDocuments:{description:"Atomically write canonical assigned Markdown paths plus the immutable original source ledger at the exact observed head.",args:z.tuple([z.string(),z.array(draft)]),returns:snapshot},
  commit:{description:"Locally commit this exact observed candidate. This operation never pushes or activates code.",args:z.tuple([z.string(),z.string().min(1)]),returns:z.object({eventId:z.string(),head:z.string()}).strict()},
} as const;
