import { z } from "zod";

const pages = z.array(z.number().int());
const document = z.string().min(1);
export const pdfIntakeProbeMethods = {
  probe: {
    args: z.tuple([document]),
    returns: z
      .object({
        digest: z.string().min(1),
        pageCount: z.number().int().nonnegative(),
        selectedPages: pages,
        encrypted: z.boolean(),
        embedded: z.boolean(),
        localOcr: z.boolean(),
      })
      .strict(),
  },
} as const;

export const pdfIntakeReadMethods = {
  read: {
    args: z.tuple([
      document,
      pages,
      z.enum(["embedded", "local-fallback", "local-ocr"]),
    ]),
    returns: z
      .object({
        digest: z.string().min(1),
        pages: z.array(
          z
            .object({
              number: z.number().int(),
              lines: z.array(
                z
                  .object({
                    text: z.string(),
                    bounds: z.array(z.number()).length(4),
                    source: z.enum(["embedded-text", "ocr"]),
                    confidence: z.number().nullable(),
                  })
                  .strict(),
              ),
            })
            .strict(),
        ),
      })
      .strict(),
  },
} as const;
