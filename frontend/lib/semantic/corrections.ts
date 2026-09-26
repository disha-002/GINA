import type { ColumnProfile, SemanticCorrection } from '@/types';

/**
 * Build PATCH body items for `POST /api/datasets/:id/semantic` from edited columns.
 * Only includes rows that differ from `initial` (minimum one correction required by backend).
 */
export function buildSemanticCorrections(
  initial: ColumnProfile[],
  updated: ColumnProfile[]
): SemanticCorrection[] {
  const initialByName = new Map(initial.map((c) => [c.columnName, c]));
  const corrections: SemanticCorrection[] = [];

  for (const col of updated) {
    const orig = initialByName.get(col.columnName);
    if (!orig) continue;

    const nextDesc = col.description ?? '';
    const prevDesc = orig.description ?? '';

    if (
      orig.semanticType !== col.semanticType ||
      orig.businessLabel !== col.businessLabel ||
      prevDesc !== nextDesc
    ) {
      corrections.push({
        columnName: col.columnName,
        newSemanticType: col.semanticType,
        newBusinessLabel: col.businessLabel,
        newDescription: nextDesc,
      });
    }
  }

  return corrections;
}
