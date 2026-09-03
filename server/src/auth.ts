import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { get } from './db/index.ts';
import { config } from './config.ts';
import { loadSubjectAssignments, type Subject } from './policy/engine.ts';

export type UserRow = {
  id: string; username: string; password_hash: string; password_salt: string; full_name: string;
  designation: string; rank_level: number; unit: string; district: string; station: string | null;
  is_woman_officer: number; clearance_level: number; role: string; public_key: string;
  private_key: string; key_fingerprint: string; active: number;
};

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  return { hash: scryptSync(password, salt, 64).toString('hex'), salt };
}

export function checkPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export type TokenClaims = { sub: string; username: string; role: string; rank: number };

export function issueToken(user: UserRow): string {
  const claims: TokenClaims = {
    sub: user.id, username: user.username, role: user.role, rank: user.rank_level,
  };
  // Short-lived by design; production adds mutual TLS and device binding on top.
  return jwt.sign(claims, config.jwtSecret, { expiresIn: config.tokenTtlSeconds });
}

export function verifyToken(token: string): TokenClaims | null {
  try {
    return jwt.verify(token, config.jwtSecret) as TokenClaims;
  } catch {
    return null;
  }
}

export function loadUser(userId: string): UserRow | undefined {
  return get<UserRow>('SELECT * FROM users WHERE id = ? AND active = 1', userId);
}

export function loadUserByUsername(username: string): UserRow | undefined {
  return get<UserRow>('SELECT * FROM users WHERE username = ? AND active = 1', username);
}

export function toSubject(user: UserRow): Subject {
  return {
    id: user.id,
    role: user.role,
    rankLevel: user.rank_level,
    unit: user.unit,
    district: user.district,
    station: user.station,
    clearanceLevel: user.clearance_level,
    isWomanOfficer: user.is_woman_officer === 1,
    assignments: loadSubjectAssignments(user.id),
  };
}

/** What the client is allowed to know about a user. Never the private key. */
export function publicUser(user: UserRow) {
  return {
    id: user.id, username: user.username, fullName: user.full_name, designation: user.designation,
    rankLevel: user.rank_level, unit: user.unit, district: user.district, station: user.station,
    isWomanOfficer: user.is_woman_officer === 1, clearanceLevel: user.clearance_level,
    role: user.role, keyFingerprint: user.key_fingerprint,
  };
}
