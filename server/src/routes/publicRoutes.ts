import type { FastifyInstance } from 'fastify';
import { get, all, run, now } from '../db/index.ts';
import { sha256 } from '../core/hash.ts';
import { findDocumentAnchorByContentHash } from '../ledger/index.ts';
import { verifyProof, type InclusionProof } from '../core/merkle.ts';
import { record as audit } from '../services/audit.ts';
import { otp as makeOtp } from '../core/ids.ts';
import { badRequest } from './helpers.ts';

/**
 * Unauthenticated surface. Everything here reveals whether something is TRUE
 * without revealing what it SAYS.
 */
export default async function publicRoutes(app: FastifyInstance) {
  /**
   * Public verifier.
   *
   * Anyone — defence counsel, a journalist, a judge's clerk — drops a file and
   * learns whether its fingerprint matches an anchored record and when that
   * record was anchored. It reveals nothing about content. That is what converts
   * integrity from a claim into something the other side can check themselves,
   * which is precisely what makes it persuasive.
   */
  app.post('/verify', async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send(badRequest('upload a file to verify'));
    const content = await file.toBuffer();
    const digest = sha256(content);
    return verdictFor(digest, file.filename, content.length, request.ip);
  });

  /** Same check, when the caller already has the digest. */
  app.get('/verify/:hash', async (request) => {
    const { hash } = request.params as { hash: string };
    return verdictFor(hash.toLowerCase().replace(/^0x/, ''), null, null, request.ip);
  });

  function verdictFor(digest: string, filename: string | null, size: number | null, ip: string) {
    const anchorRow = findDocumentAnchorByContentHash(digest) as Record<string, unknown> | undefined;

    audit({
      actorId: null, actorLabel: 'public-verifier', action: 'public.verify',
      outcome: anchorRow ? 'allow' : 'deny', ip,
      detail: { hash: digest, filename, matched: Boolean(anchorRow) },
    });

    if (!anchorRow) {
      return {
        verdict: 'NOT_FOUND' as const,
        algorithm: 'SHA-256',
        hash: digest,
        filename,
        sizeBytes: size,
        message:
          'No anchored record has this fingerprint. Either this file was never sealed by PRAMANA, or it has been altered since it was sealed — a single changed bit produces a completely different fingerprint.',
      };
    }

    // Deliberately minimal: existence and time, never content, never the case.
    return {
      verdict: 'VERIFIED' as const,
      algorithm: 'SHA-256',
      hash: digest,
      filename,
      sizeBytes: size,
      anchoredAt: anchorRow.created_at,
      chainId: anchorRow.chain_id,
      contract: anchorRow.contract,
      transactionRef: anchorRow.tx_ref,
      blockNumber: anchorRow.block_number,
      message:
        'This exact file was sealed and its fingerprint anchored on the consortium ledger at the time shown. It has not been altered since.',
      disclosure:
        'This check reveals only that a record with this fingerprint exists and when it was anchored. No case, party or content is disclosed.',
    };
  }

  /** Verify a Merkle inclusion proof standalone — no server trust required. */
  app.post('/verify/audit-proof', async (request, reply) => {
    const proof = request.body as InclusionProof;
    if (!proof?.leaf || !proof.root || !Array.isArray(proof.path)) {
      return reply.code(400).send(badRequest('a full inclusion proof {leaf, root, path, leafIndex, treeSize} is required'));
    }
    const valid = verifyProof(proof);
    const anchorRow = get(
      "SELECT * FROM anchors WHERE kind = 'audit_batch' AND json_extract(payload, '$.merkleRoot') = ?", proof.root,
    );
    return {
      valid,
      rootAnchored: Boolean(anchorRow),
      anchor: anchorRow ?? null,
      message: valid
        ? 'The proof is arithmetically sound: this event is a member of the anchored batch and cannot have been inserted or back-dated afterwards.'
        : 'The proof does not reconstruct the stated root. It is invalid.',
    };
  });

  app.get('/ledger/summary', async () => {
    const head = get<{ number: number; block_hash: string; timestamp: string }>(
      'SELECT number, block_hash, timestamp FROM ledger_blocks ORDER BY number DESC LIMIT 1',
    );
    return {
      height: (head?.number ?? -1) + 1,
      headHash: head?.block_hash ?? null,
      lastBlockAt: head?.timestamp ?? null,
      anchors: get<{ n: number }>('SELECT COUNT(*) AS n FROM anchors')?.n ?? 0,
      note: 'Public summary. No case, document or party information is exposed here.',
    };
  });

  // ------------------------------------------------------- citizen portal --

  /**
   * Case status portal: the complainant checks progress with a reference number
   * and an OTP, without visiting the station.
   */
  app.post('/citizen/request-otp', async (request, reply) => {
    const { referenceNo } = (request.body ?? {}) as { referenceNo?: string };
    if (!referenceNo) return reply.code(400).send(badRequest('referenceNo is required'));
    const token = get<{ reference_no: string; phone: string }>(
      'SELECT reference_no, phone FROM citizen_tokens WHERE reference_no = ?', referenceNo,
    );
    if (!token) return reply.code(404).send({ error: 'not_found', message: 'No case matches that reference number.' });

    const code = makeOtp();
    run(
      'UPDATE citizen_tokens SET otp = ?, otp_expires = ? WHERE reference_no = ?',
      code, new Date(Date.now() + 10 * 60_000).toISOString(), referenceNo,
    );
    return {
      sentTo: token.phone.replace(/\d(?=\d{4})/g, '×'),
      // Demo affordance: a real deployment sends this over SMS and never returns it.
      demoOtp: code,
      message: 'An OTP has been sent to the registered mobile number.',
    };
  });

  app.post('/citizen/status', async (request, reply) => {
    const { referenceNo, otp } = (request.body ?? {}) as { referenceNo?: string; otp?: string };
    const token = get<{ case_id: string; otp: string | null; otp_expires: string | null }>(
      'SELECT case_id, otp, otp_expires FROM citizen_tokens WHERE reference_no = ?', referenceNo ?? '',
    );
    if (!token || !token.otp || token.otp !== otp) {
      return reply.code(401).send({ error: 'invalid_otp', message: 'Reference number or OTP is incorrect.' });
    }
    if (token.otp_expires && new Date(token.otp_expires) < new Date()) {
      return reply.code(401).send({ error: 'otp_expired', message: 'That OTP has expired. Request a new one.' });
    }

    const caseRow = get<{ id: string; case_number: string; status: string; registered_at: string; station: string; district: string; victim_pseudonym: string | null }>(
      'SELECT id, case_number, status, registered_at, station, district, victim_pseudonym FROM cases WHERE id = ?',
      token.case_id,
    );
    if (!caseRow) return reply.code(404).send({ error: 'not_found' });

    audit({
      actorId: null, actorLabel: `citizen:${referenceNo}`, action: 'citizen.status_check',
      outcome: 'allow', resourceType: 'case', resourceId: caseRow.id, caseId: caseRow.id, ip: request.ip,
    });

    const deadline = get<{ due_at: string; status: string }>(
      "SELECT due_at, status FROM deadlines WHERE case_id = ? AND kind = 'progress_intimation'", caseRow.id,
    );

    return {
      caseNumber: caseRow.case_number,
      status: caseRow.status,
      registeredAt: caseRow.registered_at,
      station: `${caseRow.station}, ${caseRow.district}`,
      // The citizen sees stage transitions, never investigative content.
      progress: all<{ sent_at: string; template: string; body: string; channel: string }>(
        'SELECT sent_at, template, body, channel FROM notifications WHERE case_id = ? ORDER BY sent_at DESC',
        caseRow.id,
      ),
      statutoryUpdate: deadline
        ? { dueAt: deadline.due_at, status: deadline.status, basis: 'BNSS s.193(3)(ii) — 90-day progress intimation [VERIFY]' }
        : null,
      note: 'This portal shows the stage of the investigation and statutory communications only. Investigative material is never exposed here.',
    };
  });

  app.get('/health', async () => ({ status: 'ok', time: now() }));
}
