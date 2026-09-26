import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';

const { Pool } = pg;

declare module 'fastify' {
  interface FastifyInstance {
    db: pg.Pool;
  }
}

async function dbPlugin(fastify: FastifyInstance) {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Verify connection on startup
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    fastify.log.info('Supabase PostgreSQL connection verified');
  } finally {
    client.release();
  }

  fastify.decorate('db', pool);

  fastify.addHook('onClose', async () => {
    await pool.end();
    fastify.log.info('PostgreSQL pool closed');
  });
}

export default fp(dbPlugin, { name: 'db' });
