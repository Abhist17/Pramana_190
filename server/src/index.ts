import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, REPO_ROOT } from './config.ts';
import { db } from './db/index.ts';
import { registerRoutes } from './routes/index.ts';
import { startBatchScheduler } from './services/audit.ts';
import { activePolicy } from './policy/engine.ts';
import { ledger, OnChainDataError } from './ledger/index.ts';
import { sweep } from './services/deadlines.ts';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  },
  // Body-cam and CCTV video are real inputs; 5 GB is the documented ceiling.
  bodyLimit: 64 * 1024 * 1024,
});

await app.register(cors, { origin: config.corsOrigin, credentials: true });
await app.register(multipart, { limits: { fileSize: 512 * 1024 * 1024 } });

app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
  if (error instanceof OnChainDataError) {
    // This is the guard that stops personal data reaching an immutable ledger.
    // It is a hard failure, never a warning.
    request.log.error({ err: error.message }, 'BLOCKED: attempt to anchor personal data');
    return reply.code(422).send({ error: 'on_chain_data_refused', message: error.message });
  }
  request.log.error({ err: error.message, stack: error.stack }, 'request failed');
  return reply.code(error.statusCode ?? 500).send({
    error: 'internal_error',
    message: error.message,
  });
});

await registerRoutes(app);

app.get('/api/health', async () => {
  const status = await ledger().status();
  const { set, hash } = activePolicy();
  return {
    status: 'ok',
    service: 'PRAMANA',
    ledger: { driver: status.driver, chainId: status.chainId, height: status.height },
    policy: { version: set.version, hash },
    time: new Date().toISOString(),
  };
});

/**
 * Serve the built console when it exists, so a single process (and a single
 * container) is the whole demo. In development Vite serves the app on :5173 and
 * proxies /api here instead, and this block simply does not apply.
 */
const webDist = resolve(REPO_ROOT, 'web', 'dist');
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  // SPA fallback: client-side routes like /verify and /cases/:id must reach index.html,
  // but a missing /api path has to stay a real 404 rather than silently returning HTML.
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not_found', message: `No route for ${request.method} ${request.url}` });
    }
    return reply.sendFile('index.html');
  });
  app.log.info({ webDist }, 'serving the built console');
}

db(); // open and migrate before accepting traffic
startBatchScheduler(app.log);
setInterval(() => { try { sweep(); } catch { /* swept next tick */ } }, 60_000).unref();

try {
  await app.listen({ port: config.port, host: config.host });
  const status = await ledger().status();
  app.log.info(
    { ledger: status.driver, chainId: status.chainId, auditBatchMs: config.auditBatchIntervalMs },
    `PRAMANA API listening on http://${config.host}:${config.port}`,
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
