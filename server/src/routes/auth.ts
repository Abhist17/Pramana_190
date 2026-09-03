import type { FastifyInstance } from 'fastify';
import { all } from '../db/index.ts';
import { checkPassword, issueToken, loadUserByUsername, publicUser } from '../auth.ts';
import { authenticate } from '../guard.ts';
import { record as audit } from '../services/audit.ts';
import { PURPOSE_CODES } from '../policy/engine.ts';

export default async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const { username, password } = (request.body ?? {}) as { username?: string; password?: string };
    if (!username || !password) return reply.code(400).send({ error: 'username and password are required' });

    const user = loadUserByUsername(username);
    if (!user || !checkPassword(password, user.password_hash, user.password_salt)) {
      audit({
        actorId: null, actorLabel: username, action: 'auth.login', outcome: 'deny',
        reason: 'invalid credentials', ip: request.ip,
      });
      return reply.code(401).send({ error: 'invalid_credentials', message: 'Username or password is incorrect.' });
    }

    audit({
      actorId: user.id, actorLabel: user.full_name, action: 'auth.login', outcome: 'allow', ip: request.ip,
      detail: { role: user.role, station: user.station },
    });
    return {
      token: issueToken(user),
      user: publicUser(user),
      // Production: Class 3 DSC token, Aadhaar eSign, FIDO2 or the government 2FA stack.
      authenticationNote: 'Demo credential. Production authenticates with a Class 3 DSC token, eSign, or FIDO2.',
    };
  });

  app.get('/me', async (request, reply) => {
    const user = authenticate(request, reply);
    if (!user) return;
    return { user: publicUser(user), assignments: request.subject!.assignments };
  });

  /** Demo convenience: the login screen lists the personas so judges can switch roles fast. */
  app.get('/personas', async () => {
    const rows = all<{ id: string; username: string; full_name: string; designation: string; role: string; district: string; station: string | null; rank_level: number; is_woman_officer: number; clearance_level: number }>(
      'SELECT id, username, full_name, designation, role, district, station, rank_level, is_woman_officer, clearance_level FROM users WHERE active = 1 ORDER BY rank_level DESC, full_name',
    );
    return {
      personas: rows.map((r) => ({
        username: r.username, fullName: r.full_name, designation: r.designation, role: r.role,
        district: r.district, station: r.station, rankLevel: r.rank_level,
        isWomanOfficer: r.is_woman_officer === 1, clearanceLevel: r.clearance_level,
      })),
      sharedPassword: 'pramana',
    };
  });

  app.get('/purpose-codes', async () => ({ purposeCodes: PURPOSE_CODES }));
}
