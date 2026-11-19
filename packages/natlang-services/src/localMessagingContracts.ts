import {z} from "zod";
const row=z.object({ref:z.string(),kind:z.string(),note:z.string()}).strict();
const resolution=z.union([z.object({kind:z.literal("ref"),ref:z.string(),note:z.string()}).strict(),z.object({kind:z.literal("ambiguous"),reason:z.enum(["none","several"]),candidates:z.array(row)}).strict()]);
const receipt=z.object({messageId:z.string(),channelId:z.string(),to:z.string(),alert:z.literal("none")}).strict();
export const localMessagingReadMethods={
 inspect:{description:"Read the actual owned synthetic roster and exact canonical recipient resolution.",args:z.tuple([z.string()]),returns:z.object({fixtureId:z.string(),channelId:z.string(),revision:z.string(),rows:z.array(row),resolution}).strict()},
 inspectDelivery:{description:"Read original committed local message evidence without sending.",args:z.tuple([receipt.nullable()]),returns:z.object({channelId:z.string(),messageId:z.string().nullable(),committed:z.boolean(),recipientRefs:z.array(z.string()),content:z.string().nullable(),evidence:z.array(z.string())}).strict()},
} as const;
export const localMessagingSendMethods={send:{description:"Send the exact requested note through original notify to one owned local synthetic agent, with stable operation identity.",args:z.tuple([z.string(),z.string(),z.string(),z.string()]),returns:receipt}} as const;
