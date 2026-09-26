import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseCSV } from '../utils/csvParser.js';
import type { ParsedCSV } from '../utils/csvParser.js';
import { parseUploadToSheets } from '../ingestion/parseUploadFile.js';
import { runPiiForSheet } from '../pii/runPiiShield.js';
import { redactedSheetsToXlsxBuffer } from '../pii/rebuildWorkbook.js';
import {
  ensureUniqueDatasetDisplayName,
  displayNameForSheet,
  sanitizeFilenameForDisplay,
} from '../utils/datasetNaming.js';
import { deleteFromS3, uploadToS3 } from '../utils/s3.js';
import { profileColumns, coerceValue } from '../semantic/profiler.js';
import type { ColumnProfile } from '../semantic/profiler.js';
import { enrichProfilerColumns, generateUnderstandingCard } from '../semantic/enricher.js';
import {
  buildColumnEmbeddingText,
  embedTextsBatched,
  insertSchemaEmbeddings,
} from '../semantic/embedder.js';
import { mergeAllProfilerColumns, profilerToEnricherInput } from '../semantic/mergeProfile.js';
import { generateStarterQuestions } from '../pipeline/starterQuestions.js';
import {
  scheduleDatasetOverviewJob,
  setOverviewPending,
} from '../pipeline/datasetOverview/runDatasetOverviewJob.js';

/** Maximum accepted CSV file size: 50 MB (Phase 7 boundary test). */
export const MAX_CSV_UPLOAD_BYTES = 50 * 1024 * 1024;

const patchDatasetNameSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(200)
    .transform((s) => s.trim()),
});

/** Cached GET /starter-questions payload; must match semantic `updated_at` to be valid */
const cachedStartersSchema = z.array(
  z.object({
    title: z.string(),
    question: z.string(),
  }),
);

const semanticPatchBodySchema = z.object({
  corrections: z
    .array(
      z.object({
        columnName: z.string(),
        newSemanticType: z.enum([
          'amount',
          'date',
          'category',
          'identifier',
          'flag',
          'text',
        ]),
        newBusinessLabel: z.string(),
        newDescription: z.string(),
      }),
    )
    .min(1),
});

type StoredSchemaJson = {
  tableName: string;
  columns: ColumnProfile[];
  understandingCard?: string;
};

/** Allowed MIME types for CSV uploads */
const CSV_MIMETYPES = new Set([
  'text/csv',
  'application/csv',
  'text/plain',
  'application/octet-stream',
]);

const EXCEL_MIMETYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

function isExcelFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}

function isCsvFilename(name: string): boolean {
  return name.toLowerCase().endsWith('.csv');
}

function guessS3ContentType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.xls')) {
    return 'application/vnd.ms-excel';
  }
  return 'text/csv';
}

function acceptsUploadedFile(filename: string, mimetype: string): boolean {
  const mt = mimetype.toLowerCase();
  if (isCsvFilename(filename) || CSV_MIMETYPES.has(mt)) return true;
  if (isExcelFilename(filename) || EXCEL_MIMETYPES.has(mt)) return true;
  return false;
}

/**
 * Sanitize a column name so it is safe to use as a double-quoted PostgreSQL identifier.
 * Double-quotes inside the name are stripped by the profiler; this just adds the wrapping.
 */
function quotedIdent(name: string): string {
  return `"${name}"`;
}

/** Dynamic dataset tables are created as `dataset_*` identifiers we control (upload + seed). */
function isSafeDatasetTableName(name: string): boolean {
  return /^dataset_[a-zA-Z0-9_]+$/.test(name);
}

function formatPreviewCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Insert rows into a dynamic dataset table in batches to avoid huge parameter arrays.
 */
async function bulkInsertRows(
  client: { query(sql: string, params?: unknown[]): Promise<unknown> },
  tableName: string,
  profiles: ColumnProfile[],
  rows: Record<string, string>[],
): Promise<void> {
  if (rows.length === 0) return;

  const BATCH = 500;
  const colCount = profiles.length;
  const quotedCols = profiles.map((p) => quotedIdent(p.columnName)).join(', ');

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const placeholders = batch
      .map((_, bIdx) => {
        const offset = bIdx * colCount;
        const placeholderList = profiles
          .map((_, cIdx) => `$${offset + cIdx + 1}`)
          .join(', ');
        return `(${placeholderList})`;
      })
      .join(', ');

    const values = batch.flatMap((row) =>
      profiles.map((p) => coerceValue(row[p.columnName] ?? '', p.postgresType)),
    );

    await client.query(
      `INSERT INTO "${tableName}" (${quotedCols}) VALUES ${placeholders}`,
      values,
    );
  }
}

export default async function datasetsRoutes(fastify: FastifyInstance) {
  // GET /api/datasets — list all datasets for the authenticated user
  fastify.get('/datasets', async (request) => {
    const { rows } = await fastify.db.query<{
      id: string;
      name: string;
      row_count: number | null;
      column_count: number | null;
      is_demo: boolean;
      demo_slug: string | null;
      created_at: string;
    }>(
      `SELECT id, name, row_count, column_count, is_demo, demo_slug, created_at
       FROM datasets
       WHERE user_id = $1 OR is_demo = true
       ORDER BY is_demo DESC, created_at DESC`,
      [request.userId],
    );

    return {
      datasets: rows.map((r) => ({
        id: r.id,
        name: r.name,
        rowCount: r.row_count,
        columnCount: r.column_count,
        isDemo: r.is_demo,
        demoSlug: r.demo_slug,
        createdAt: r.created_at,
      })),
    };
  });

  // GET /api/datasets/:datasetId — get a single dataset by ID
  fastify.get<{ Params: { datasetId: string } }>(
    '/datasets/:datasetId',
    async (request, reply) => {
      const { datasetId } = request.params;

      const { rows } = await fastify.db.query<{
        id: string;
        name: string;
        row_count: number | null;
        column_count: number | null;
        is_demo: boolean;
        demo_slug: string | null;
        created_at: string;
      }>(
        `SELECT id, name, row_count, column_count, is_demo, demo_slug, created_at
         FROM datasets
         WHERE id = $1 AND (user_id = $2 OR is_demo = true)`,
        [datasetId, request.userId],
      );

      if (rows.length === 0) {
        return reply.status(404).send({ error: 'Dataset not found' });
      }

      const r = rows[0];
      return {
        id: r.id,
        name: r.name,
        rowCount: r.row_count,
        columnCount: r.column_count,
        isDemo: r.is_demo,
        demoSlug: r.demo_slug,
        createdAt: r.created_at,
      };
    },
  );

  // GET /api/datasets/:datasetId/starter-questions — contextual empty-chat prompts (LLM + fallback)
  fastify.get<{ Params: { datasetId: string } }>(
    '/datasets/:datasetId/starter-questions',
    async (request, reply) => {
      const { datasetId } = request.params;

      const { rows } = await fastify.db.query<{
        name: string;
        schema_json: unknown;
        understanding_card: string | null;
        updated_at: string;
        starter_questions_json: unknown;
        starter_questions_for_updated_at: string | null;
      }>(
        `SELECT d.name, ss.schema_json, ss.understanding_card, ss.updated_at,
                ss.starter_questions_json, ss.starter_questions_for_updated_at
         FROM datasets d
         INNER JOIN semantic_states ss ON ss.dataset_id = d.id
         WHERE d.id = $1::uuid AND (d.user_id = $2::uuid OR d.is_demo = true)`,
        [datasetId, request.userId],
      );

      if (rows.length === 0) {
        return reply.status(404).send({ error: 'Dataset not found' });
      }

      const row = rows[0]!;
      const schema = row.schema_json as StoredSchemaJson | null;
      const columns = schema?.columns ?? [];

      const cacheValid =
        row.starter_questions_json != null &&
        row.starter_questions_for_updated_at != null &&
        new Date(row.starter_questions_for_updated_at).getTime() ===
          new Date(row.updated_at).getTime();

      if (cacheValid) {
        const parsed = cachedStartersSchema.safeParse(row.starter_questions_json);
        if (parsed.success) {
          return { starters: parsed.data };
        }
      }

      const starters = await generateStarterQuestions(
        columns,
        row.understanding_card ?? schema?.understandingCard ?? '',
        row.name,
      );

      await fastify.db.query(
        `UPDATE semantic_states
         SET starter_questions_json = $1::jsonb,
             starter_questions_for_updated_at = updated_at
         WHERE dataset_id = $2::uuid`,
        [JSON.stringify(starters), datasetId],
      );

      return { starters };
    },
  );

  // PATCH /api/datasets/:datasetId — rename (owner, non-demo only)
  fastify.patch<{
    Params: { datasetId: string };
    Body: unknown;
  }>('/datasets/:datasetId', async (request, reply) => {
    const parsed = patchDatasetNameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { datasetId } = request.params;
    const newName = parsed.data.name;

    const { rows: existing } = await fastify.db.query<{ id: string; is_demo: boolean }>(
      `SELECT id, is_demo FROM datasets WHERE id = $1::uuid AND user_id = $2::uuid`,
      [datasetId, request.userId],
    );
    if (existing.length === 0) {
      return reply.status(404).send({ error: 'Dataset not found' });
    }
    if (existing[0]!.is_demo) {
      return reply.status(403).send({ error: 'Demo datasets cannot be renamed' });
    }

    const { rows: nameClash } = await fastify.db.query(
      `SELECT 1 FROM datasets
       WHERE user_id = $1::uuid AND name = $2 AND id <> $3::uuid AND is_demo = false
       LIMIT 1`,
      [request.userId, newName, datasetId],
    );
    if (nameClash.length > 0) {
      return reply.status(409).send({ error: 'You already have a dataset with this name' });
    }

    const { rows } = await fastify.db.query<{
      id: string;
      name: string;
      row_count: number | null;
      column_count: number | null;
      is_demo: boolean;
      demo_slug: string | null;
      created_at: string;
    }>(
      `UPDATE datasets SET name = $1 WHERE id = $2::uuid AND user_id = $3::uuid AND is_demo = false
       RETURNING id, name, row_count, column_count, is_demo, demo_slug, created_at`,
      [newName, datasetId, request.userId],
    );

    if (rows.length === 0) {
      return reply.status(404).send({ error: 'Dataset not found' });
    }

    const r = rows[0]!;
    return {
      id: r.id,
      name: r.name,
      rowCount: r.row_count,
      columnCount: r.column_count,
      isDemo: r.is_demo,
      demoSlug: r.demo_slug,
      createdAt: r.created_at,
    };
  });

  // DELETE /api/datasets/:datasetId — owner, non-demo; DROP dynamic table + optional S3
  fastify.delete<{ Params: { datasetId: string } }>(
    '/datasets/:datasetId',
    async (request, reply) => {
      const { datasetId } = request.params;

      const { rows } = await fastify.db.query<{
        id: string;
        data_table_name: string;
        s3_key: string | null;
        is_demo: boolean;
        user_id: string;
      }>(
        `SELECT id, data_table_name, s3_key, is_demo, user_id FROM datasets WHERE id = $1::uuid`,
        [datasetId],
      );

      if (rows.length === 0) {
        return reply.status(404).send({ error: 'Dataset not found' });
      }

      const row = rows[0]!;
      if (row.user_id !== request.userId) {
        return reply.status(404).send({ error: 'Dataset not found' });
      }
      if (row.is_demo) {
        return reply.status(403).send({ error: 'Demo datasets cannot be deleted' });
      }
      if (!isSafeDatasetTableName(row.data_table_name)) {
        fastify.log.error({ data_table_name: row.data_table_name }, 'Invalid data_table_name for delete');
        return reply.status(500).send({ error: 'Invalid dataset storage configuration' });
      }

      const client = await fastify.db.connect();
      try {
        await client.query('BEGIN');
        // pipeline_runs FKs reference conversations/messages without ON DELETE CASCADE — remove first
        await client.query(
          `DELETE FROM pipeline_runs
           WHERE conversation_id IN (SELECT id FROM conversations WHERE dataset_id = $1::uuid)
              OR message_id IN (
                SELECT m.id FROM messages m
                INNER JOIN conversations c ON c.id = m.conversation_id
                WHERE c.dataset_id = $1::uuid
              )`,
          [datasetId],
        );
        await client.query(`DROP TABLE IF EXISTS ${quotedIdent(row.data_table_name)}`);
        await client.query(
          `DELETE FROM datasets WHERE id = $1::uuid AND user_id = $2::uuid AND is_demo = false`,
          [datasetId, request.userId],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }

      if (row.s3_key) {
        const { rows: keyRows } = await fastify.db.query<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM datasets WHERE s3_key = $1`,
          [row.s3_key],
        );
        const remaining = Number.parseInt(keyRows[0]?.n ?? '0', 10);
        if (remaining === 0) {
          try {
            await deleteFromS3(fastify.s3, row.s3_key);
          } catch (s3Err) {
            fastify.log.warn({ err: s3Err, s3_key: row.s3_key }, 'S3 delete failed after dataset row removed');
          }
        }
      }

      return reply.status(200).send({ ok: true });
    },
  );

  // GET /api/datasets/:datasetId/preview — paginated tabular rows for the native sheet viewer
  fastify.get<{
    Params: { datasetId: string };
    Querystring: { limit?: string; offset?: string };
  }>('/datasets/:datasetId/preview', async (request, reply) => {
    const { datasetId } = request.params;
    const limitRaw = request.query.limit;
    const offsetRaw = request.query.offset;
    const limit = Math.min(500, Math.max(1, Number.parseInt(limitRaw ?? '100', 10) || 100));
    const offset = Math.max(0, Number.parseInt(offsetRaw ?? '0', 10) || 0);

    const { rows: dsRows } = await fastify.db.query<{
      data_table_name: string;
      row_count: number | null;
    }>(
      `SELECT data_table_name, row_count
       FROM datasets
       WHERE id = $1::uuid AND (user_id = $2 OR is_demo = true)`,
      [datasetId, request.userId],
    );

    if (dsRows.length === 0) {
      return reply.status(404).send({ error: 'Dataset not found' });
    }

    const tableName = dsRows[0]!.data_table_name;
    const totalRows = dsRows[0]!.row_count ?? 0;

    if (!isSafeDatasetTableName(tableName)) {
      fastify.log.error({ datasetId, tableName }, 'Invalid data_table_name');
      return reply.status(500).send({ error: 'Invalid dataset storage configuration' });
    }

    const { rows: semRows } = await fastify.db.query<{ schema_json: unknown }>(
      `SELECT schema_json FROM semantic_states WHERE dataset_id = $1::uuid`,
      [datasetId],
    );

    if (semRows.length === 0) {
      return reply.status(404).send({ error: 'Semantic state not found' });
    }

    const rawSchema = semRows[0]!.schema_json as StoredSchemaJson | null;
    if (!rawSchema?.columns?.length) {
      return reply.status(500).send({ error: 'Dataset schema unavailable' });
    }

    if (rawSchema.tableName !== tableName) {
      fastify.log.warn(
        { datasetId, data_table_name: tableName, schema_table: rawSchema.tableName },
        'schema_json.tableName mismatch; using datasets.data_table_name',
      );
    }

    const columns = rawSchema.columns.map((c) => ({
      key: c.columnName,
      label: c.businessLabel || c.columnName,
    }));

    const quotedCols = rawSchema.columns.map((c) => quotedIdent(c.columnName)).join(', ');

    const { rows: dataRows } = await fastify.db.query<Record<string, unknown>>(
      `SELECT ${quotedCols} FROM ${quotedIdent(tableName)} ORDER BY ${quotedIdent('_row_id')} ASC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const rows = dataRows.map((row) => {
      const out: Record<string, string> = {};
      for (const c of rawSchema.columns) {
        out[c.columnName] = formatPreviewCell(row[c.columnName]);
      }
      return out;
    });

    return {
      columns,
      rows,
      totalRows,
      limit,
      offset,
    };
  });

  // GET /api/datasets/:datasetId/semantic — get semantic state for a dataset
  fastify.get<{ Params: { datasetId: string } }>(
    '/datasets/:datasetId/semantic',
    async (request, reply) => {
      const { datasetId } = request.params;

      // Owned dataset or shared demo (same rule as GET /datasets list)
      const ownerCheck = await fastify.db.query(
        'SELECT id FROM datasets WHERE id = $1 AND (user_id = $2 OR is_demo = true)',
        [datasetId, request.userId],
      );
      if (ownerCheck.rowCount === 0) {
        return reply.status(404).send({ error: 'Dataset not found' });
      }

      const { rows } = await fastify.db.query<{
        id: string;
        dataset_id: string;
        schema_json: unknown;
        understanding_card: string | null;
        is_user_corrected: boolean;
        updated_at: string;
      }>(
        `SELECT id, dataset_id, schema_json, understanding_card, is_user_corrected, updated_at
         FROM semantic_states
         WHERE dataset_id = $1`,
        [datasetId],
      );

      if (rows.length === 0) {
        return reply.status(404).send({ error: 'Semantic state not found' });
      }

      const s = rows[0];
      return {
        id: s.id,
        datasetId: s.dataset_id,
        schemaJson: s.schema_json,
        understandingCard: s.understanding_card,
        isUserCorrected: s.is_user_corrected,
        updatedAt: s.updated_at,
      };
    },
  );

  // PATCH /api/datasets/:datasetId/semantic — user corrections + re-embed (§4.2)
  fastify.patch<{
    Params: { datasetId: string };
    Body: z.infer<typeof semanticPatchBodySchema>;
  }>('/datasets/:datasetId/semantic', async (request, reply) => {
    const parsedBody = semanticPatchBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.status(400).send({
        error: 'Invalid body',
        details: parsedBody.error.flatten(),
      });
    }

    const { datasetId } = request.params;
    const { corrections } = parsedBody.data;

    const ownerCheck = await fastify.db.query(
      'SELECT id FROM datasets WHERE id = $1 AND user_id = $2',
      [datasetId, request.userId],
    );
    if (ownerCheck.rowCount === 0) {
      return reply.status(404).send({ error: 'Dataset not found' });
    }

    const { rows: semRows } = await fastify.db.query<{
      id: string;
      schema_json: unknown;
      understanding_card: string | null;
      updated_at: string;
    }>(
      `SELECT id, schema_json, understanding_card, updated_at
       FROM semantic_states WHERE dataset_id = $1`,
      [datasetId],
    );

    if (semRows.length === 0) {
      return reply.status(404).send({ error: 'Semantic state not found' });
    }

    const sem = semRows[0];
    const rawSchema = sem.schema_json as Record<string, unknown> | null;
    if (
      !rawSchema ||
      typeof rawSchema.tableName !== 'string' ||
      !Array.isArray(rawSchema.columns)
    ) {
      return reply.status(500).send({ error: 'Stored semantic state is invalid' });
    }

    const schema = {
      tableName: rawSchema.tableName,
      columns: rawSchema.columns as ColumnProfile[],
      understandingCard:
        typeof rawSchema.understandingCard === 'string' ? rawSchema.understandingCard : undefined,
    };
    const columnByName = new Map(schema.columns.map((c) => [c.columnName, c]));

    for (const c of corrections) {
      const col = columnByName.get(c.columnName);
      if (!col) {
        return reply.status(400).send({ error: `Unknown column: ${c.columnName}` });
      }
      col.semanticType = c.newSemanticType;
      col.businessLabel = c.newBusinessLabel;
      col.description = c.newDescription;
    }

    const updatedSchema: StoredSchemaJson = {
      tableName: schema.tableName,
      columns: schema.columns,
      understandingCard: schema.understandingCard ?? sem.understanding_card ?? undefined,
    };

    let embeddingVectors: number[][];
    try {
      const texts = updatedSchema.columns.map((col) => buildColumnEmbeddingText(col));
      embeddingVectors = await embedTextsBatched(texts);
    } catch (err) {
      fastify.log.error({ err }, 'Re-embedding failed after semantic PATCH');
      return reply.status(502).send({
        error: 'Re-embedding failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const embedRows = updatedSchema.columns.map((col, i) => ({
      columnName: col.columnName,
      embeddingText: buildColumnEmbeddingText(col),
      embedding: embeddingVectors[i]!,
    }));

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      await client.query(`DELETE FROM schema_embeddings WHERE dataset_id = $1::uuid`, [datasetId]);

      await insertSchemaEmbeddings(client, datasetId, embedRows);

      const { rows } = await client.query<{
        id: string;
        updated_at: string;
      }>(
        `UPDATE semantic_states
         SET schema_json = $2::jsonb,
             understanding_card = $3,
             is_user_corrected = true,
             updated_at = NOW(),
             starter_questions_json = NULL,
             starter_questions_for_updated_at = NULL
         WHERE dataset_id = $1::uuid
         RETURNING id, updated_at`,
        [
          datasetId,
          JSON.stringify(updatedSchema),
          updatedSchema.understandingCard ?? null,
        ],
      );

      await client.query('COMMIT');

      const row = rows[0]!;
      await setOverviewPending(fastify, datasetId);
      scheduleDatasetOverviewJob(fastify, datasetId);

      return reply.send({
        id: row.id,
        datasetId,
        schemaJson: updatedSchema,
        understandingCard: updatedSchema.understandingCard ?? null,
        isUserCorrected: true,
        updatedAt: row.updated_at,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error({ err }, 'PATCH semantic transaction failed');
      throw err;
    } finally {
      client.release();
    }
  });

  // ── POST /api/datasets/upload ──────────────────────────────────────────────
  // multipart: field `file` = user upload; server parses, redacts PII (agent + heuristic fallback), stores redacted-only bytes in S3
  fastify.post('/datasets/upload', async (request, reply) => {
    type FilePart = {
      file: AsyncIterable<Buffer | Uint8Array>;
      filename?: string;
      mimetype?: string;
    };

    async function readPartToBuffer(part: FilePart): Promise<Buffer> {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      for await (const chunk of part.file) {
        totalBytes += chunk.length;
        if (totalBytes > MAX_CSV_UPLOAD_BYTES) {
          throw new Error('FILE_TOO_LARGE');
        }
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.from(Buffer.concat(chunks));
    }

    let fileBuffer: Buffer | undefined;
    let filename = 'upload.csv';
    let mimetype = 'text/csv';

    try {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'file') continue;
          const buf = await part.toBuffer();
          if (buf.length === 0) continue;
          fileBuffer = buf;
          filename = part.filename ?? 'upload.csv';
          mimetype = part.mimetype ?? 'text/csv';
        }
      }
    } catch (e: unknown) {
      const err = e as { code?: string; statusCode?: number };
      if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.statusCode === 413) {
        return reply.status(413).send({ error: 'File exceeds the 50 MB limit' });
      }
      throw e;
    }

    const multipartReq = request as typeof request & {
      files?: () => AsyncIterable<FilePart>;
      file: () => Promise<FilePart | undefined>;
    };

    if (fileBuffer === undefined || fileBuffer.length === 0) {
      if (typeof multipartReq.files === 'function') {
        for await (const part of multipartReq.files()) {
          const buf = await readPartToBuffer(part).catch((e) => {
            if (e instanceof Error && e.message === 'FILE_TOO_LARGE') return null;
            throw e;
          });
          if (buf === null) {
            return reply.status(413).send({ error: 'File exceeds the 50 MB limit' });
          }
          if (buf.length === 0) continue;
          fileBuffer = buf;
          filename = part.filename ?? 'upload.csv';
          mimetype = part.mimetype ?? 'text/csv';
          break;
        }
      }
    }

    if (fileBuffer === undefined || fileBuffer.length === 0) {
      const data = await multipartReq.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }
      try {
        fileBuffer = await readPartToBuffer(data);
      } catch (e) {
        if (e instanceof Error && e.message === 'FILE_TOO_LARGE') {
          return reply.status(413).send({ error: 'File exceeds the 50 MB limit' });
        }
        throw e;
      }
      filename = data.filename ?? 'upload.csv';
      mimetype = data.mimetype ?? 'text/csv';
    }

    if (fileBuffer === undefined || fileBuffer.length === 0) {
      return reply.status(400).send({
        error: 'File is empty',
        hint:
          'Use multipart field name "file". Ensure the file is not 0 bytes, and on OneDrive/Google Drive use "Available offline" before uploading.',
      });
    }

    if (!acceptsUploadedFile(filename, mimetype)) {
      return reply.status(400).send({
        error: 'Unsupported file type',
        hint: 'Use .csv, .xlsx, or .xls',
      });
    }

    const contentHash = createHash('sha256').update(fileBuffer).digest('hex');

    const dup = await fastify.db.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM datasets
         WHERE user_id = $1::uuid AND content_hash = $2 AND is_demo = false
       ) AS exists`,
      [request.userId, contentHash],
    );
    if (dup.rows[0]?.exists) {
      return reply.status(409).send({
        error: 'This file was already uploaded',
        code: 'DUPLICATE_DATASET',
      });
    }

    type SheetIn = { sheetName: string; csv: string };
    let sheetsIn: SheetIn[] = [];

    let rawSheets: ReturnType<typeof parseUploadToSheets>;
    try {
      rawSheets = parseUploadToSheets(fileBuffer, filename);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'NO_SHEETS') {
        return reply.status(400).send({ error: 'No non-empty sheets found in this workbook' });
      }
      if (msg === 'UNSUPPORTED_FILE_TYPE') {
        return reply.status(400).send({ error: 'Unsupported file type' });
      }
      fastify.log.error({ err: e }, 'parseUploadToSheets');
      return reply.status(400).send({
        error: 'Could not read uploaded file',
        message: msg,
      });
    }

    const redactedForDb: SheetIn[] = [];
    /** Sheets where at least one column was flagged PII (used for clearer 400 if drop leaves no columns). */
    const sheetHadPiiColumnRemoval = new Set<string>();
    let totalPiiRedactions = 0;
    const allRedactedColumnLabels: string[] = [];
    const piiItems: Array<{ columnKey: string; reason: string; label?: string }> = [];
    let anyFallback = false;

    for (const s of rawSheets) {
      const prefix = s.sheetName === '_' ? '_' : s.sheetName;
      const pii = await runPiiForSheet(s.csv, s.sheetName, prefix);
      redactedForDb.push({ sheetName: s.sheetName, csv: pii.redactedCsv });
      if (pii.redactedColumns.length > 0) {
        sheetHadPiiColumnRemoval.add(s.sheetName);
      }
      totalPiiRedactions += pii.totalRedactions;
      for (const c of pii.redactedColumns) {
        allRedactedColumnLabels.push(prefix === '_' ? c : `${prefix}: ${c}`);
      }
      piiItems.push(...pii.items);
      if (pii.method === 'fallback') anyFallback = true;
    }

    sheetsIn = redactedForDb;

    for (const s of sheetsIn) {
      const parsedProbe = parseCSV(s.csv);
      if (parsedProbe.headers.length === 0) {
        if (sheetHadPiiColumnRemoval.has(s.sheetName)) {
          return reply.status(400).send({
            error: `Every column in sheet "${s.sheetName}" was flagged as sensitive and removed; nothing remains to analyse.`,
            hint: 'Upload a CSV that includes at least one non-sensitive column for analysis.',
          });
        }
        return reply.status(400).send({
          error: `Sheet "${s.sheetName}" has no headers`,
          hint:
            'The first row must be comma-separated column names. If you exported from Excel, choose "CSV UTF-8 (Comma delimited)".',
        });
      }
      if (parsedProbe.rows.length === 0) {
        return reply.status(400).send({ error: `Sheet "${s.sheetName}" has no data rows` });
      }
    }

    const piiSummaryOut = {
      redactedColumns: allRedactedColumnLabels,
      totalRedactions: totalPiiRedactions,
      items: piiItems,
      method: anyFallback ? ('fallback' as const) : ('agent' as const),
    };

    const uploadBatchId = randomUUID();
    const safeOriginalName = sanitizeFilenameForDisplay(filename);
    const s3Key = `uploads/${request.userId}/${uploadBatchId}/${safeOriginalName}`;

    const s3Body: Buffer = isCsvFilename(filename)
      ? Buffer.from(sheetsIn[0]!.csv, 'utf8')
      : redactedSheetsToXlsxBuffer(sheetsIn);

    try {
      await uploadToS3(fastify.s3, s3Key, s3Body, guessS3ContentType(filename));
    } catch (err) {
      fastify.log.error({ err }, 'S3 upload failed');
      return reply.status(502).send({ error: 'File storage unavailable' });
    }

    type SheetPlan = {
      displayName: string;
      sheetName: string;
      parsed: ParsedCSV;
      profiles: ColumnProfile[];
      enrichedColumns: ColumnProfile[];
      understandingCard: string;
      embedRows: {
        columnName: string;
        embeddingText: string;
        embedding: number[];
      }[];
    };

    const sheetPlans: SheetPlan[] = [];

    for (const s of sheetsIn) {
      const baseDisplay = displayNameForSheet(filename, s.sheetName === '_' ? null : s.sheetName);
      const parsed = parseCSV(s.csv);
      if (parsed.headers.length === 0) {
        return reply.status(400).send({
          error: `Sheet "${s.sheetName}" has no headers`,
        });
      }
      if (parsed.rows.length === 0) {
        return reply.status(400).send({ error: `Sheet "${s.sheetName}" has no data rows` });
      }
      const profiles = profileColumns(parsed);
      let enrichedColumns: ColumnProfile[];
      let understandingCard: string;
      let embeddingVectors: number[][];
      try {
        const enrichInput = profiles.map(profilerToEnricherInput);
        const enriched = await enrichProfilerColumns(enrichInput);
        enrichedColumns = mergeAllProfilerColumns(profiles, enriched);
        understandingCard = await generateUnderstandingCard(enrichedColumns, baseDisplay);
        const texts = enrichedColumns.map((col) => buildColumnEmbeddingText(col));
        embeddingVectors = await embedTextsBatched(texts);
        if (embeddingVectors.length !== enrichedColumns.length) {
          throw new Error('Embedding batch size mismatch');
        }
      } catch (err) {
        fastify.log.error({ err }, 'Semantic enrichment / embedding failed');
        return reply.status(502).send({
          error: 'Semantic enrichment failed',
          message: err instanceof Error ? err.message : String(err),
        });
      }
      const embedRows = enrichedColumns.map((col, i) => ({
        columnName: col.columnName,
        embeddingText: buildColumnEmbeddingText(col),
        embedding: embeddingVectors[i]!,
      }));
      sheetPlans.push({
        displayName: baseDisplay,
        sheetName: s.sheetName,
        parsed,
        profiles,
        enrichedColumns,
        understandingCard,
        embedRows,
      });
    }

    const { rows: nameRows } = await fastify.db.query<{ name: string }>(
      `SELECT name FROM datasets WHERE user_id = $1::uuid AND is_demo = false`,
      [request.userId],
    );
    const takenNames = new Set(nameRows.map((r) => r.name));
    for (const plan of sheetPlans) {
      plan.displayName = ensureUniqueDatasetDisplayName(plan.displayName, takenNames);
    }

    const client = await fastify.db.connect();
    type ResultRow = {
      dataset: {
        id: string;
        name: string;
        rowCount: number;
        columnCount: number;
        isDemo: boolean;
        createdAt: string;
      };
      semanticState: {
        id: string;
        datasetId: string;
        schemaJson: StoredSchemaJson;
        understandingCard: string;
        isUserCorrected: boolean;
        updatedAt: string;
      };
      understandingCard: string;
    };
    const outResults: ResultRow[] = [];

    try {
      await client.query('BEGIN');

      for (const plan of sheetPlans) {
        const datasetId = randomUUID();
        const tableName = `dataset_${datasetId.replace(/-/g, '')}`;
        const schemaJson: StoredSchemaJson = {
          tableName,
          columns: plan.enrichedColumns,
          understandingCard: plan.understandingCard,
        };

        const columnDDL = plan.profiles
          .map((p) => `${quotedIdent(p.columnName)} ${p.postgresType}`)
          .join(',\n  ');

        await client.query(`
          CREATE TABLE "${tableName}" (
            _row_id SERIAL PRIMARY KEY,
            ${columnDDL}
          )
        `);

        await client.query(`GRANT SELECT ON "${tableName}" TO readonly_agent`);

        await bulkInsertRows(client, tableName, plan.profiles, plan.parsed.rows);

        const datasetResult = await client.query<{
          id: string;
          name: string;
          row_count: number;
          column_count: number;
          is_demo: boolean;
          created_at: string;
        }>(
          `INSERT INTO datasets
             (id, user_id, name, s3_key, row_count, column_count, is_demo, data_table_name, content_hash)
           VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8)
           RETURNING id, name, row_count, column_count, is_demo, created_at`,
          [
            datasetId,
            request.userId,
            plan.displayName,
            s3Key,
            plan.parsed.rows.length,
            plan.enrichedColumns.length,
            tableName,
            contentHash,
          ],
        );

        const semanticResult = await client.query<{
          id: string;
          updated_at: string;
        }>(
          `INSERT INTO semantic_states (dataset_id, schema_json, understanding_card, overview_status)
           VALUES ($1, $2::jsonb, $3, 'pending')
           RETURNING id, updated_at`,
          [datasetId, JSON.stringify(schemaJson), plan.understandingCard],
        );

        await insertSchemaEmbeddings(client, datasetId, plan.embedRows);

        const ds = datasetResult.rows[0]!;
        const ss = semanticResult.rows[0]!;
        outResults.push({
          dataset: {
            id: ds.id,
            name: ds.name,
            rowCount: ds.row_count,
            columnCount: ds.column_count,
            isDemo: ds.is_demo,
            createdAt: ds.created_at,
          },
          semanticState: {
            id: ss.id,
            datasetId,
            schemaJson,
            understandingCard: plan.understandingCard,
            isUserCorrected: false,
            updatedAt: ss.updated_at,
          },
          understandingCard: plan.understandingCard,
        });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      fastify.log.error({ err }, 'Upload DB transaction failed');
      throw err;
    } finally {
      client.release();
    }

    for (const r of outResults) {
      scheduleDatasetOverviewJob(fastify, r.semanticState.datasetId);
    }

    const first = outResults[0]!;
    return reply.send({
      uploadBatchId,
      results: outResults,
      dataset: first.dataset,
      semanticState: first.semanticState,
      understandingCard: first.understandingCard,
      piiSummary: piiSummaryOut,
    });
  });

  // GET /api/datasets/:datasetId/overview — async dataset overview (stats + charts)
  fastify.get<{ Params: { datasetId: string } }>(
    '/datasets/:datasetId/overview',
    async (request, reply) => {
      const { datasetId } = request.params;

      const { rows } = await fastify.db.query<{
        overview_status: string | null;
        overview_json: unknown;
        overview_error: string | null;
        overview_generated_at: string | null;
        overview_model: string | null;
      }>(
        `SELECT ss.overview_status, ss.overview_json, ss.overview_error,
                ss.overview_generated_at, ss.overview_model
         FROM semantic_states ss
         INNER JOIN datasets d ON d.id = ss.dataset_id
         WHERE ss.dataset_id = $1::uuid AND (d.user_id = $2::uuid OR d.is_demo = true)`,
        [datasetId, request.userId],
      );

      if (rows.length === 0) {
        return reply.status(404).send({ error: 'Dataset not found' });
      }

      const row = rows[0]!;
      let status = row.overview_status;

      if (status === null || status === undefined) {
        await fastify.db.query(
          `UPDATE semantic_states
           SET overview_status = 'pending', overview_error = NULL
           WHERE dataset_id = $1::uuid AND overview_status IS NULL`,
          [datasetId],
        );
        scheduleDatasetOverviewJob(fastify, datasetId);
        status = 'pending';
      }

      if (status === 'pending') {
        return {
          status: 'pending' as const,
        };
      }

      if (status === 'failed') {
        return {
          status: 'failed' as const,
          error: row.overview_error ?? 'Overview could not be generated',
        };
      }

      return {
        status: 'ready' as const,
        overview: row.overview_json,
        overviewModel: row.overview_model,
        generatedAt: row.overview_generated_at,
      };
    },
  );
}
