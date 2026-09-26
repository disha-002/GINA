import nodeSqlParser from 'node-sql-parser';

const { Parser } = nodeSqlParser;
const parser = new Parser();

export type SqlValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

const PG_OPT = { database: 'postgresql' as const };

/**
 * Normalise a table name for comparison (strip quotes, lower-case).
 */
function normTable(name: string): string {
  return name.replace(/^"+|"+$/g, '').toLowerCase();
}

function tablesFromTableList(tableList: string[]): Set<string> {
  const out = new Set<string>();
  for (const entry of tableList) {
    const parts = entry.split('::');
    if (parts.length >= 3) {
      out.add(normTable(parts.slice(2).join('::')));
    }
  }
  return out;
}

/**
 * §6.3 — Parse with `node-sql-parser`, require a single SELECT, whitelist table refs.
 */
export function validateSql(sql: string, allowedTableNames: string[]): SqlValidationResult {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Empty SQL' };
  }

  const statements = trimmed
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  if (statements.length > 1) {
    return { valid: false, reason: 'Multiple statements are not allowed' };
  }

  let parsed: ReturnType<typeof parser.parse>;
  try {
    parsed = parser.parse(trimmed, PG_OPT);
  } catch (e) {
    return {
      valid: false,
      reason: `Parse failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const astRoot = Array.isArray(parsed.ast) ? parsed.ast[0] : parsed.ast;
  if (!astRoot || (astRoot as { type?: string }).type !== 'select') {
    return { valid: false, reason: 'Not a SELECT statement' };
  }

  const allowed = new Set(allowedTableNames.map(normTable));
  const referenced = tablesFromTableList(parsed.tableList ?? []);

  if (referenced.size === 0) {
    return { valid: false, reason: 'No table reference found in query' };
  }

  for (const t of referenced) {
    if (!allowed.has(t)) {
      return { valid: false, reason: 'Table not in whitelist' };
    }
  }

  return { valid: true };
}
