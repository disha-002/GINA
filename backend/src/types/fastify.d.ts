import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by auth plugin on `/api/*` after successful JWT verification (`sub`). */
    userId?: string;
    /** From JWT when present. */
    userEmail?: string | undefined;
  }
}
