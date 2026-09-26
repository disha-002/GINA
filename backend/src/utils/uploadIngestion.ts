import { z } from 'zod';

export const ingestionPayloadSchema = z.object({
  version: z.literal(1),
  sheets: z.array(
    z.object({
      sheetName: z.string(),
      csv: z.string().min(1),
    }),
  ),
  piiSummary: z
    .object({
      redactedColumns: z.array(z.string()),
      totalRedactions: z.number(),
    })
    .optional(),
});

export type IngestionPayload = z.infer<typeof ingestionPayloadSchema>;

export function parseIngestionPayloadJson(raw: string): IngestionPayload {
  const data = JSON.parse(raw) as unknown;
  return ingestionPayloadSchema.parse(data);
}
