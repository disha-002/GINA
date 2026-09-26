import type { FastifyInstance } from 'fastify';

export default async function messagesRoutes(fastify: FastifyInstance) {
  // GET /api/conversations/:conversationId/messages — get message history
  fastify.get<{ Params: { conversationId: string } }>(
    '/conversations/:conversationId/messages',
    async (request, reply) => {
      const { conversationId } = request.params;

      // Verify the conversation belongs to this user
      const ownerCheck = await fastify.db.query(
        'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, request.userId],
      );
      if (ownerCheck.rowCount === 0) {
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      const { rows } = await fastify.db.query<{
        id: string;
        conversation_id: string;
        role: string;
        content: string;
        output_payload: unknown;
        created_at: string;
      }>(
        `SELECT id, conversation_id, role, content, output_payload, created_at
         FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [conversationId],
      );

      return {
        messages: rows.map((r) => ({
          id: r.id,
          conversationId: r.conversation_id,
          role: r.role,
          content: r.content,
          outputPayload: r.output_payload,
          createdAt: r.created_at,
        })),
      };
    },
  );
}
