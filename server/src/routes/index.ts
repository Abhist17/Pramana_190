import type { FastifyInstance } from 'fastify';
import authRoutes from './auth.ts';
import caseRoutes from './cases.ts';
import documentRoutes from './documents.ts';
import securityRoutes from './security.ts';
import wsdRoutes from './wsd.ts';
import searchRoutes from './search.ts';
import publicRoutes from './publicRoutes.ts';
import demoRoutes from './demo.ts';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(publicRoutes, { prefix: '/api/public' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(caseRoutes, { prefix: '/api/cases' });
  await app.register(documentRoutes, { prefix: '/api/documents' });
  await app.register(searchRoutes, { prefix: '/api/search' });
  await app.register(securityRoutes, { prefix: '/api/security' });
  await app.register(wsdRoutes, { prefix: '/api/wsd' });
  await app.register(demoRoutes, { prefix: '/api/demo' });
}
