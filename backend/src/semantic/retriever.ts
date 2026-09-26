import type { Pool, PoolClient } from 'pg';
import pgvector from 'pgvector/pg';
import { embedTexts } from './embedder.js';

export interface RetrievedColumn {
  columnName: string;
  embeddingText: string;
  /** Cosine distance (pgvector `<=>`); lower is closer. */
  distance: number;
}

/**
 * Embed the question and rank `schema_embeddings` by cosine distance (§5.3 retrieval for Agent 1).
 */
export async function retrieveRelevantColumns(
  pool: Pool,
  params: { datasetId: string; question: string; topK?: number },
): Promise<RetrievedColumn[]> {
  const { datasetId, question, topK = 12 } = params;
  const [qVec] = await embedTexts([question]);
  if (!qVec || qVec.length === 0) {
    throw new Error('Question embedding failed');
  }

  const client: PoolClient = await pool.connect();
  try {
    await pgvector.registerTypes(client);

    const sql = `
      SELECT column_name, embedding_text, embedding <=> $1::vector AS distance
      FROM schema_embeddings
      WHERE dataset_id = $2::uuid
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `;

    const { rows } = await client.query<{
      column_name: string;
      embedding_text: string;
      distance: string;
    }>(sql, [pgvector.toSql(qVec), datasetId, topK]);

    return rows.map((r) => ({
      columnName: r.column_name,
      embeddingText: r.embedding_text,
      distance: Number(r.distance),
    }));
  } finally {
    client.release();
  }
}
