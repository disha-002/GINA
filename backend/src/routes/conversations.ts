import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const patchConversationBodySchema = z.object({
  title: z
    .string()
    .min(1)
    .max(120)
    .transform((s) => s.trim()),
});

export default async function conversationsRoutes(fastify: FastifyInstance) {
  // GET /api/datasets/:datasetId/conversations — list conversations for a dataset
  fastify.get<{ Params: { datasetId: string } }>(
    '/datasets/:datasetId/conversations',
    async (request, reply) => {
      const { datasetId } = request.params;

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
        user_id: string;
        title: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `SELECT id, dataset_id, user_id, title, created_at, updated_at
         FROM conversations
         WHERE dataset_id = $1 AND user_id = $2
         ORDER BY updated_at DESC`,
        [datasetId, request.userId],
      );

      return {
        conversations: rows.map((r) => ({
          id: r.id,
          datasetId: r.dataset_id,
          userId: r.user_id,
          title: r.title,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      };
    },
  );

  // POST /api/datasets/:datasetId/conversations — create a new conversation
  fastify.post<{ Params: { datasetId: string } }>(
    '/datasets/:datasetId/conversations',
    async (request, reply) => {
      const { datasetId } = request.params;

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
        user_id: string;
        title: string | null;
        created_at: string;
        updated_at: string;
      }>(
        `INSERT INTO conversations (dataset_id, user_id)
         VALUES ($1, $2)
         RETURNING id, dataset_id, user_id, title, created_at, updated_at`,
        [datasetId, request.userId],
      );

      const c = rows[0];
      return {
        id: c.id,
        datasetId: c.dataset_id,
        userId: c.user_id,
        title: c.title,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    },
  );

  // PATCH /api/conversations/:conversationId — rename (owner only)
  fastify.patch<{
    Params: { conversationId: string };
    Body: unknown;
  }>('/conversations/:conversationId', async (request, reply) => {
    const parsed = patchConversationBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { conversationId } = request.params;
    const title = parsed.data.title;

    const { rows } = await fastify.db.query<{
      id: string;
      dataset_id: string;
      user_id: string;
      title: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `UPDATE conversations
       SET title = $1, updated_at = NOW()
       WHERE id = $2::uuid AND user_id = $3::uuid
       RETURNING id, dataset_id, user_id, title, created_at, updated_at`,
      [title, conversationId, request.userId],
    );

    if (rows.length === 0) {
      return reply.status(404).send({ error: 'Conversation not found' });
    }

    const r = rows[0]!;
    return {
      id: r.id,
      datasetId: r.dataset_id,
      userId: r.user_id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });

  // DELETE /api/conversations/:conversationId — owner only
  fastify.delete<{ Params: { conversationId: string } }>(
    '/conversations/:conversationId',
    async (request, reply) => {
      const { conversationId } = request.params;

      const client = await fastify.db.connect();
      try {
        await client.query('BEGIN');

        const own = await client.query(
          `SELECT 1 FROM conversations WHERE id = $1::uuid AND user_id = $2::uuid`,
          [conversationId, request.userId],
        );
        if (own.rowCount === 0) {
          await client.query('ROLLBACK');
          return reply.status(404).send({ error: 'Conversation not found' });
        }

        // pipeline_runs FKs reference conversations/messages without ON DELETE CASCADE — remove first
        await client.query(
          `DELETE FROM pipeline_runs
           WHERE conversation_id = $1::uuid
              OR message_id IN (SELECT id FROM messages WHERE conversation_id = $1::uuid)`,
          [conversationId],
        );

        const { rowCount } = await client.query(
          `DELETE FROM conversations WHERE id = $1::uuid AND user_id = $2::uuid`,
          [conversationId, request.userId],
        );

        await client.query('COMMIT');

        if (rowCount === 0) {
          return reply.status(404).send({ error: 'Conversation not found' });
        }

        return reply.status(200).send({ ok: true });
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  );
}
