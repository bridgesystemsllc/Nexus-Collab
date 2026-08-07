import { PrismaClient } from '@prisma/client'

// ─── The Prisma client ───────────────────────────────────────
// Lives here rather than in index.ts so that getting a database connection
// does not require importing the HTTP server.
//
// It used to be exported from index.ts, which meant any module reaching for
// `prisma` transitively started Express and bound a port. The background
// worker did exactly that — it booted a full web server as a side effect of
// importing a Graph helper, which makes it impossible to run alongside the API
// as its own process. Scripts, workers and one-shot jobs all need a client;
// none of them need a server.
//
// index.ts re-exports this, so the 29 route modules that import
// `{ prisma } from '../index'` keep working unchanged.

export const prisma = new PrismaClient()
