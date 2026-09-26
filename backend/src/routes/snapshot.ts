import type { FastifyInstance } from 'fastify';
import { toggleSnapshotMode } from '../snapshots/snapshotMode.js';

export default async function snapshotRoutes(fastify: FastifyInstance) {
  fastify.post('/snapshot/toggle', async (_request, reply) => {
    const snapshotMode = toggleSnapshotMode();
    return reply.send({ snapshotMode });
  });
}