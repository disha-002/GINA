import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runQueryOrchestration } from '../pipeline/orchestrator.js';

const queryBodySchema = z.object({
  conversationId: z.string().uuid(),
  datasetId: z.string().uuid(),
  question: z.string().min(1).max(50_000),
  sessionContext: z
    .object({
      recentExchanges: z.array(
        z.object({
          question: z.string(),
          answer: z.string(),
        }),
      ),
      lastResultSet: z.unknown().nullable().optional(),
    })
    .optional(),
});

export default async function queryRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/query',
    { sse: true },
    async (request, reply) => {
      const parsed = queryBodySchema.safeParse(request.body);
      if (!parsed.success) {
        // SSE-wrapped routes: `reply.send(object)` throws FST_ERR_REP_INVALID_PAYLOAD_TYPE
        // until the stream sends; use a JSON string for early errors.
        return reply
          .code(400)
          .type('application/json; charset=utf-8')
          .send(JSON.stringify({ error: 'Invalid body', details: parsed.error.flatten() }));
      }

      const { conversationId, datasetId, question } = parsed.data;
      const sessionContext = parsed.data.sessionContext ?? { recentExchanges: [] };

      const conv = await fastify.db.query<{
        id: string;
        dataset_id: string;
      }>(
        `SELECT id, dataset_id FROM conversations
         WHERE id = $1::uuid AND user_id = $2::uuid AND dataset_id = $3::uuid`,
        [conversationId, request.userId, datasetId],
      );

      if (conv.rowCount === 0) {
        return reply
          .code(404)
          .type('application/json; charset=utf-8')
          .send(JSON.stringify({ error: 'Conversation not found for this dataset' }));
      }

      await runQueryOrchestration({
        fastify,
        reply,
        userId: request.userId!,
        conversationId,
        datasetId,
        question,
        sessionContext: {
          recentExchanges: sessionContext.recentExchanges ?? [],
          lastResultSet: sessionContext.lastResultSet ?? null,
        },
      });
    },
  );
}
