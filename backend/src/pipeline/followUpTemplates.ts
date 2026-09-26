import type { ColumnProfile } from '../semantic/profiler.js';
import type { PlannerIntent } from './planner.js';

/** Schema-only heuristics — used when LLM follow-ups fail or to pad short lists. */
export function buildFollowUpSuggestions(
  columns: ColumnProfile[],
  intent: PlannerIntent | undefined,
): string[] {
  const suggestions: string[] = [];
  const hasDate = columns.some((c) => c.semanticType === 'date');
  const hasCategory = columns.some((c) => c.semanticType === 'category');
  const hasAmount = columns.some((c) => c.semanticType === 'amount');
  const catCol = columns.find((c) => c.semanticType === 'category');
  const amtCol = columns.find((c) => c.semanticType === 'amount');

  if (hasDate && hasAmount) {
    suggestions.push(`How has ${amtCol?.businessLabel ?? 'spending'} changed month over month?`);
  }
  if (hasCategory && hasAmount) {
    suggestions.push(
      `Which ${catCol?.businessLabel ?? 'category'} has the highest ${amtCol?.businessLabel ?? 'total'}?`,
    );
  }
  if (hasCategory && hasAmount && hasDate) {
    suggestions.push(
      `Compare ${amtCol?.businessLabel ?? 'spending'} across ${catCol?.businessLabel ?? 'categories'} this year.`,
    );
  }
  if (suggestions.length < 3 && hasAmount) {
    suggestions.push(`What is the average ${amtCol?.businessLabel ?? 'amount'}?`);
  }
  if (suggestions.length < 3 && hasCategory) {
    suggestions.push(`How many unique ${catCol?.businessLabel ?? 'categories'} are there in total?`);
  }
  if (suggestions.length < 3) {
    suggestions.push('Show me the top 5 rows by value.');
  }
  if (suggestions.length < 3) {
    suggestions.push('What is the total count of records?');
  }
  void intent;
  return suggestions.slice(0, 3);
}
