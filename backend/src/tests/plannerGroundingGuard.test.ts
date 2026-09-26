import assert from 'node:assert';
import { test } from 'node:test';
import {
  applyPlannerGroundingGuard,
  buildGroundingFallbackReply,
  resolvePlannerColumnHint,
} from '../pipeline/plannerGroundingGuard.js';
import type { PlannerOutput } from '../pipeline/planner.js';
import type { ColumnProfile } from '../semantic/profiler.js';

const basePlan = (overrides: Partial<PlannerOutput>): PlannerOutput => ({
  intent: 'simple_query',
  relevantColumns: ['amount'],
  relevantTables: ['dataset_t1'],
  answerFromCache: false,
  cacheAnswer: null,
  conversationalReply: null,
  ...overrides,
});

const allowed = new Set(['amount', 'date', 'category']);

const minimalProfile = (columnName: string, businessLabel: string): ColumnProfile => ({
  columnName,
  postgresType: 'NUMERIC',
  businessLabel,
  semanticType: 'amount',
  currency: null,
  description: '',
  sampleValues: [],
  nullPct: 0,
  uniqueCount: 1,
  valueRange: null,
});

test('valid SQL intent and columns — unchanged', () => {
  const plan = basePlan({ relevantColumns: ['amount', 'date'], relevantTables: ['dataset_t1'] });
  const { plan: out, coerced } = applyPlannerGroundingGuard(plan, {
    tableName: 'dataset_t1',
    allowedColumnNames: allowed,
    columnProfiles: [],
  });
  assert.strictEqual(coerced, false);
  assert.strictEqual(out.intent, 'simple_query');
});

test('unknown column — coerces to conversational', () => {
  const plan = basePlan({ relevantColumns: ['revenue'] });
  const { plan: out, coerced } = applyPlannerGroundingGuard(plan, {
    tableName: 'dataset_t1',
    allowedColumnNames: allowed,
    columnProfiles: [
      minimalProfile('amount', 'Amount'),
      minimalProfile('date', 'Date'),
      minimalProfile('category', 'Category'),
    ],
  });
  assert.strictEqual(coerced, true);
  assert.strictEqual(out.intent, 'conversational');
  assert.deepStrictEqual(out.relevantColumns, []);
  assert.ok(out.conversationalReply?.includes("wasn't able to match"));
});

test('empty relevantColumns with SQL intent — pass through (SQL gen has full schema)', () => {
  const plan = basePlan({ relevantColumns: [] });
  const { plan: out, coerced } = applyPlannerGroundingGuard(plan, {
    tableName: 'dataset_t1',
    allowedColumnNames: allowed,
  });
  assert.strictEqual(coerced, false);
  assert.strictEqual(out.intent, 'simple_query');
});

test('wrong table in relevantTables — repair to physical table, do not coerce', () => {
  const plan = basePlan({
    relevantColumns: ['amount'],
    relevantTables: ['other_table'],
  });
  const { plan: out, coerced } = applyPlannerGroundingGuard(plan, {
    tableName: 'dataset_t1',
    allowedColumnNames: allowed,
  });
  assert.strictEqual(coerced, false);
  assert.strictEqual(out.intent, 'simple_query');
  assert.deepStrictEqual(out.relevantTables, ['dataset_t1']);
});

test('case-insensitive column hint — resolves to canonical columnName', () => {
  const plan = basePlan({ relevantColumns: ['AMOUNT', 'Date'] });
  const { plan: out, coerced } = applyPlannerGroundingGuard(plan, {
    tableName: 'dataset_t1',
    allowedColumnNames: allowed,
    columnProfiles: [],
  });
  assert.strictEqual(coerced, false);
  assert.deepStrictEqual(out.relevantColumns, ['amount', 'date']);
});

test('businessLabel hint maps to columnName', () => {
  const plan = basePlan({
    relevantColumns: ['Total Amount'],
  });
  const { plan: out, coerced } = applyPlannerGroundingGuard(plan, {
    tableName: 'dataset_t1',
    allowedColumnNames: new Set(['amount', 'date']),
    columnProfiles: [minimalProfile('amount', 'Total Amount'), minimalProfile('date', 'Day')],
  });
  assert.strictEqual(coerced, false);
  assert.deepStrictEqual(out.relevantColumns, ['amount']);
});

test('resolvePlannerColumnHint — substring on businessLabel', () => {
  const profiles: ColumnProfile[] = [
    minimalProfile('Math score', 'Math score'),
    minimalProfile('Student ID', 'Student ID'),
  ];
  const allowedNames = new Set(profiles.map((p) => p.columnName));
  assert.strictEqual(
    resolvePlannerColumnHint('math', allowedNames, profiles),
    'Math score',
  );
});

test('conversational intent — pass through', () => {
  const plan = basePlan({
    intent: 'conversational',
    relevantColumns: [],
    relevantTables: [],
    conversationalReply: 'Hello',
  });
  const { plan: out, coerced } = applyPlannerGroundingGuard(plan, {
    tableName: 'dataset_t1',
    allowedColumnNames: allowed,
  });
  assert.strictEqual(coerced, false);
  assert.strictEqual(out.intent, 'conversational');
});

test('buildGroundingFallbackReply leads with understanding card when short', () => {
  const s = buildGroundingFallbackReply('Sales by region.');
  assert.ok(s.startsWith('Sales by region.'));
  assert.ok(s.includes('lock that question'));
});

test('planner conversationalReply preserved when coerced if set', () => {
  const plan = basePlan({
    relevantColumns: ['nope'],
    conversationalReply: 'Custom off-topic reply.',
  });
  const { plan: out, coerced } = applyPlannerGroundingGuard(plan, {
    tableName: 'dataset_t1',
    allowedColumnNames: allowed,
    columnProfiles: [],
  });
  assert.strictEqual(coerced, true);
  assert.strictEqual(out.conversationalReply, 'Custom off-topic reply.');
});
