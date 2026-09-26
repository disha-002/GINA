import { env } from './config/env.js';
import { buildCorsAllowedOrigins } from './config/corsOrigins.js';
import Fastify from 'fastify';
import type { FastifyPluginAsync } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifySse from '@fastify/sse';
import dbPlugin from './plugins/db.js';
import s3Plugin from './plugins/s3.js';
import authPlugin from './plugins/auth.js';
import usersRoutes from './routes/users.js';
import datasetsRoutes from './routes/datasets.js';
import conversationsRoutes from './routes/conversations.js';
import messagesRoutes from './routes/messages.js';
import queryRoutes from './routes/query.js';
import snapshotRoutes from './routes/snapshot.js';
import { loadDemoSnapshots } from './snapshots/snapshotStore.js';
import { MAX_CSV_UPLOAD_BYTES } from './routes/datasets.js';

const ssePlugin = fastifySse as unknown as FastifyPluginAsync;

async function main() {
  const app = Fastify({ logger: true });

  await loadDemoSnapshots(app.log);

  const corsAllowed = buildCorsAllowedOrigins(env.CORS_ORIGINS);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (corsAllowed.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    // Default is only GET,HEAD,POST — browsers will not send PATCH cross-origin without this.
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(multipart, {
    limits: {
      fileSize: MAX_CSV_UPLOAD_BYTES,
      /** Large JSON payload for per-sheet redacted CSV text */
      fieldSize: MAX_CSV_UPLOAD_BYTES,
    },
  });
  await app.register(dbPlugin);
  await app.register(s3Plugin);

  app.get('/health', async () => ({ status: 'ok' }));

  // All /api/* routes are protected by the auth plugin via Fastify's scoped plugin system.
  // @fastify/sse must be registered in this same scope — nested /api plugins do not inherit
  // root-level decorations, so `reply.sse` was undefined on POST /api/query otherwise.
  await app.register(
    async (api) => {
      await api.register(ssePlugin);
      await api.register(authPlugin);
      await api.register(usersRoutes);
      await api.register(datasetsRoutes);
      await api.register(conversationsRoutes);
      await api.register(messagesRoutes);
      await api.register(queryRoutes);
      await api.register(snapshotRoutes);
    },
    { prefix: '/api' },
  );

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
