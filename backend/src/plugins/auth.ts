import { createClient } from '@supabase/supabase-js';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';

function parseBearer(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m?.[1];
}

async function authPluginImpl(fastify: FastifyInstance) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  fastify.addHook('preHandler', async (request, reply) => {
    // CORS preflight (PATCH/DELETE + JSON) has no Authorization header; must not 401 or the
    // browser blocks the real request with a misleading "Failed to fetch".
    if (request.method === 'OPTIONS') {
      return;
    }

    const token = parseBearer(request.headers.authorization);
    if (!token) {
      return reply.status(401).send({ error: 'Missing token' });
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    request.userId = user.id;
    request.userEmail = user.email ?? undefined;
  });
}

export default fp(authPluginImpl, { name: 'auth' });
