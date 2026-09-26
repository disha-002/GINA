import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

/** POST /api/users/sync — empty JSON object (extra keys rejected). */
const syncBodySchema = z.object({}).strict();

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/users/sync', async (request, reply) => {
    const parsed = syncBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid body',
        details: parsed.error.flatten(),
      });
    }

    const userId = request.userId;
    const email = request.userEmail;
    if (!userId) {
      return reply.status(500).send({ error: 'Auth context missing' });
    }
    if (!email) {
      return reply.status(400).send({ error: 'Email claim missing from token' });
    }

    await fastify.db.query(
      `INSERT INTO users (id, email)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
      [userId, email],
    );

    return reply.send({
      ok: true,
      user: { id: userId, email },
    });
  });
};

export default usersRoutes;
