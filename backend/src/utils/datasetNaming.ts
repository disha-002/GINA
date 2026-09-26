/**
 * Explorer-style disambiguation when the full display name already exists for the user.
 */
export function ensureUniqueDatasetDisplayName(candidate: string, existing: Set<string>): string {
  if (!existing.has(candidate)) {
    existing.add(candidate);
    return candidate;
  }
  let n = 1;
  let next = `${candidate} (${n})`;
  while (existing.has(next)) {
    n += 1;
    next = `${candidate} (${n})`;
  }
  existing.add(next);
  return next;
}

/** Strip path segments and unsafe characters for display. */
export function sanitizeFilenameForDisplay(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  return base.replace(/[^\p{L}\p{N}\s.\-_—]/gu, '').trim().slice(0, 200) || 'dataset';
}

export function fileBaseWithoutExtension(filename: string): string {
  const s = sanitizeFilenameForDisplay(filename);
  const i = s.lastIndexOf('.');
  if (i > 0 && i < s.length - 1) return s.slice(0, i);
  return s;
}

export function displayNameForSheet(originalFilename: string, sheetName: string | null): string {
  const base = fileBaseWithoutExtension(originalFilename);
  if (sheetName === null || sheetName === '' || sheetName === '_') {
    return sanitizeFilenameForDisplay(originalFilename);
  }
  const sn = sheetName.trim().slice(0, 100) || 'Sheet';
  return `${base} — ${sn}`;
}
