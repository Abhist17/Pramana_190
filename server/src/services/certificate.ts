import PDFDocument from 'pdfkit';
import { mkdirSync, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { get, all, run, now, json } from '../db/index.ts';
import { hashObject } from '../core/hash.ts';
import { id } from '../core/ids.ts';
import { signMessage, verifySignature, keyFingerprint, CREDENTIAL_TYPE } from '../core/signing.ts';
import { anchor } from '../ledger/index.ts';
import { record as audit } from './audit.ts';
import { config } from '../config.ts';
import { custodyChain } from './custody.ts';
import { verifyDocument } from './documents.ts';

/**
 * Certificate for electronic evidence.
 *
 * This is the single highest-value feature in PRAMANA, and it is not something we
 * invented: the Bharatiya Sakshya Adhiniyam's prescribed certificate for
 * electronic records asks for the HASH VALUE of the record and the ALGORITHM
 * used. The law now asks for a hash. Nobody has automated producing it.
 *
 * PRAMANA generates the certificate at the moment of production, pre-filled from
 * data captured at seal time - not reconstructed from memory three years later by
 * an officer who no longer works there - and routes it for the dual signature the
 * statute requires (the person in charge of the device, and an expert).
 *
 * [VERIFY: the exact prescribed format and its schedule reference against
 *  indiacode.nic.in before this goes in front of a court or a judge. The field
 *  set below follows the widely-discussed successor to the old s.65B certificate.]
 */

export type CertificatePayload = {
  certificateId: string;
  generatedAt: string;
  statute: string;
  document: {
    id: string; title: string; docType: string; mimeType: string; sizeBytes: number;
    hashAlgorithm: string; hashValue: string; version: number; sealedAt: string;
  };
  case: { id: string; caseNumber: string; station: string; district: string; sections: string[] };
  device: Record<string, unknown>;
  production: { producedBy: string; designation: string; purpose: string };
  custody: { at: string; action: string; from: string | null; to: string | null; itemHash: string }[];
  anchor: { chainId: string; txRef: string; blockNumber: number | null; anchoredAt: string; contract: string } | null;
  verification: { status: string; checkedAt: string; recomputedHash: string | null };
  signatories: { role: string; label: string }[];
};

export type SignatureBlock = {
  role: 'device_custodian' | 'expert';
  userId: string;
  name: string;
  designation: string;
  credentialType: string;
  keyFingerprint: string;
  signature: string;
  signedAt: string;
};

export async function generateCertificate(documentId: string, generatedBy: string, purpose: string) {
  const document = get<Record<string, unknown>>('SELECT * FROM documents WHERE id = ?', documentId);
  if (!document) throw new Error('document not found');
  const caseRow = get<Record<string, unknown>>('SELECT * FROM cases WHERE id = ?', String(document.case_id));
  if (!caseRow) throw new Error('case not found');
  const producer = get<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', generatedBy);
  if (!producer) throw new Error('producing officer not found');

  const anchorRow = document.anchor_id
    ? get<Record<string, unknown>>('SELECT * FROM anchors WHERE id = ?', String(document.anchor_id))
    : undefined;
  const verification = verifyDocument(documentId);
  const chain = custodyChain('document', documentId) as Record<string, unknown>[];
  const certificateId = id('CRT');

  const payload: CertificatePayload = {
    certificateId,
    generatedAt: now(),
    statute: 'Bharatiya Sakshya Adhiniyam, 2023 - certificate for electronic records [VERIFY section & schedule]',
    document: {
      id: String(document.id), title: String(document.title), docType: String(document.doc_type),
      mimeType: String(document.mime_type), sizeBytes: Number(document.size_bytes),
      hashAlgorithm: String(document.hash_algorithm), hashValue: String(document.hash_value),
      version: Number(document.version), sealedAt: String(document.created_at),
    },
    case: {
      id: String(caseRow.id), caseNumber: String(caseRow.case_number), station: String(caseRow.station),
      district: String(caseRow.district), sections: json<string[]>(caseRow.sections, []),
    },
    device: json<Record<string, unknown>>(document.capture_meta, {}),
    production: {
      producedBy: String(producer.full_name), designation: String(producer.designation), purpose,
    },
    custody: chain.map((event) => ({
      at: String(event.created_at), action: String(event.action),
      from: event.from_name ? String(event.from_name) : null,
      to: event.to_name ? String(event.to_name) : null,
      itemHash: String(event.item_hash),
    })),
    anchor: anchorRow
      ? {
          chainId: String(anchorRow.chain_id), txRef: String(anchorRow.tx_ref),
          blockNumber: anchorRow.block_number === null ? null : Number(anchorRow.block_number),
          anchoredAt: String(anchorRow.created_at), contract: String(anchorRow.contract),
        }
      : null,
    verification: {
      status: verification.status, checkedAt: verification.checkedAt, recomputedHash: verification.actualHash,
    },
    signatories: [
      { role: 'device_custodian', label: 'Person in charge of the device / computer resource' },
      { role: 'expert', label: 'Expert (as required by the statute)' },
    ],
  };

  const pdfPath = resolve(config.storageDir, 'certificates', `${certificateId}.pdf`);
  mkdirSync(resolve(config.storageDir, 'certificates'), { recursive: true });
  await renderPdf(payload, [], pdfPath);

  run(
    `INSERT INTO certificates (id, document_id, case_id, payload, pdf_path, generated_by, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    certificateId, documentId, String(document.case_id), JSON.stringify(payload), pdfPath, generatedBy, now(),
  );

  audit({
    actorId: generatedBy, actorLabel: String(producer.full_name), action: 'certificate.generate',
    outcome: 'allow', resourceType: 'document', resourceId: documentId, caseId: String(document.case_id),
    purposeCode: 'COURT_PRODUCTION',
    detail: { certificateId, hash: payload.document.hashValue, verification: verification.status },
  });

  return { certificateId, payload, pdfPath, status: 'awaiting_signatures' as const };
}

/**
 * The statute requires two signatures. We bind each one to the certificate's
 * content hash, so a certificate cannot be signed and then edited.
 */
export async function signCertificate(
  certificateId: string,
  role: 'device_custodian' | 'expert',
  userId: string,
) {
  const certificate = get<{ id: string; document_id: string; case_id: string; payload: string; signatures: string; pdf_path: string }>(
    'SELECT * FROM certificates WHERE id = ?', certificateId,
  );
  if (!certificate) throw new Error('certificate not found');
  const user = get<{ id: string; full_name: string; designation: string; private_key: string; public_key: string }>(
    'SELECT * FROM users WHERE id = ?', userId,
  );
  if (!user) throw new Error('signing officer not found');

  const signatures = json<SignatureBlock[]>(certificate.signatures, []);
  if (signatures.some((s) => s.role === role)) throw new Error(`the ${role} signature is already present`);
  if (signatures.some((s) => s.userId === userId)) {
    throw new Error('the same person cannot provide both statutory signatures');
  }

  const payload = json<CertificatePayload>(certificate.payload, {} as CertificatePayload);
  const contentHash = hashObject(payload);
  const statement = `PRAMANA-CERT-V1|${certificateId}|${role}|${contentHash}`;

  const block: SignatureBlock = {
    role, userId, name: user.full_name, designation: user.designation,
    credentialType: CREDENTIAL_TYPE, keyFingerprint: keyFingerprint(user.public_key),
    signature: signMessage(statement, user.private_key), signedAt: now(),
  };
  signatures.push(block);

  const complete = signatures.length >= 2;
  run(
    'UPDATE certificates SET signatures = ?, status = ? WHERE id = ?',
    JSON.stringify(signatures), complete ? 'signed' : 'awaiting_signatures', certificateId,
  );
  await renderPdf(payload, signatures, certificate.pdf_path);

  if (complete) {
    const receipt = await anchor({
      kind: 'document', contract: 'DocumentRegistry', method: 'anchorCertificate',
      subjectId: certificateId,
      payload: {
        certificateHash: contentHash, documentHash: payload.document.hashValue,
        algorithm: payload.document.hashAlgorithm, signatureCount: signatures.length, signedAt: now(),
      },
      submittedBy: userId,
    });
    run('UPDATE certificates SET anchor_id = ? WHERE id = ?', receipt.anchorId, certificateId);
  }

  audit({
    actorId: userId, actorLabel: user.full_name, action: 'certificate.sign', outcome: 'allow',
    resourceType: 'certificate', resourceId: certificateId, caseId: certificate.case_id,
    purposeCode: 'COURT_PRODUCTION', detail: { role, complete },
  });

  return { certificateId, role, complete, signatures: signatures.length };
}

export function verifyCertificateSignatures(certificateId: string) {
  const certificate = get<{ payload: string; signatures: string }>(
    'SELECT payload, signatures FROM certificates WHERE id = ?', certificateId,
  );
  if (!certificate) throw new Error('certificate not found');
  const payload = json<CertificatePayload>(certificate.payload, {} as CertificatePayload);
  const contentHash = hashObject(payload);
  return json<SignatureBlock[]>(certificate.signatures, []).map((block) => {
    const user = get<{ public_key: string }>('SELECT public_key FROM users WHERE id = ?', block.userId);
    const statement = `PRAMANA-CERT-V1|${certificateId}|${block.role}|${contentHash}`;
    return {
      role: block.role, name: block.name, designation: block.designation, signedAt: block.signedAt,
      credentialType: block.credentialType, keyFingerprint: block.keyFingerprint,
      valid: user ? verifySignature(statement, block.signature, user.public_key) : false,
    };
  });
}

export function listCertificates(caseId?: string) {
  return caseId
    ? all('SELECT id, document_id, case_id, status, created_at FROM certificates WHERE case_id = ? ORDER BY created_at DESC', caseId)
    : all('SELECT id, document_id, case_id, status, created_at FROM certificates ORDER BY created_at DESC LIMIT 50');
}

export function certificatePath(certificateId: string): string | null {
  return get<{ pdf_path: string }>('SELECT pdf_path FROM certificates WHERE id = ?', certificateId)?.pdf_path ?? null;
}

// -------------------------------------------------------------- rendering --

const INK = '#111827';
const MUTED = '#6b7280';
const ACCENT = '#1d4ed8';

function renderPdf(payload: CertificatePayload, signatures: SignatureBlock[], path: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    // Standard PDF fonts carry no Devanagari glyphs, so the certificate itself is
    // rendered in English. Production ships a Unicode font with the bundle.
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Evidence Certificate ${payload.certificateId}` } });
    const stream = createWriteStream(path);
    doc.pipe(stream);
    stream.on('finish', () => resolvePromise());
    stream.on('error', reject);

    const line = (label: string, value: string, options: { mono?: boolean } = {}) => {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(label, { continued: false });
      doc.font(options.mono ? 'Courier-Bold' : 'Helvetica-Bold').fontSize(10).fillColor(INK).text(value);
      doc.moveDown(0.4);
    };
    const heading = (text: string) => {
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text(text.toUpperCase());
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor(ACCENT).lineWidth(0.5).stroke();
      doc.moveDown(0.5);
    };

    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('CERTIFICATE FOR ELECTRONIC EVIDENCE');
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(payload.statute);
    doc.moveDown(0.2);
    doc.font('Courier').fontSize(8).fillColor(MUTED)
      .text(`Certificate ${payload.certificateId}  ·  generated ${payload.generatedAt}  ·  PRAMANA`);
    doc.moveDown(0.8);

    heading('1. The electronic record');
    line('Title', payload.document.title);
    line('Document type / class', `${payload.document.docType} (version ${payload.document.version})`);
    line('Format and size', `${payload.document.mimeType}, ${payload.document.sizeBytes} bytes`);
    line('Sealed at', payload.document.sealedAt);

    heading('2. Hash value and algorithm');
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text('The statute requires the hash value of the electronic record and the algorithm used. Both were computed at the moment of capture, before the record traversed any network.');
    doc.moveDown(0.4);
    line('Algorithm', payload.document.hashAlgorithm, { mono: true });
    line('Hash value', payload.document.hashValue, { mono: true });

    heading('3. Device and capture circumstances');
    const device = payload.device;
    if (Object.keys(device).length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('No device attestation was recorded for this record.');
    } else {
      for (const [key, value] of Object.entries(device)) {
        line(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    }

    heading('4. Case particulars');
    line('Case number', payload.case.caseNumber);
    line('Police station / district', `${payload.case.station}, ${payload.case.district}`);
    line('Sections', payload.case.sections.join(', ') || '-');

    heading('5. Chain of custody');
    if (payload.custody.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('No custody events recorded.');
    } else {
      for (const event of payload.custody) {
        doc.font('Courier').fontSize(8).fillColor(INK)
          .text(`${event.at}  ${event.action.toUpperCase().padEnd(9)} ${event.from ?? '-'} -> ${event.to ?? '-'}`);
        doc.font('Courier').fontSize(7).fillColor(MUTED).text(`   item hash ${event.itemHash}`);
      }
    }

    heading('6. Independent ledger anchor');
    if (payload.anchor) {
      line('Consortium chain', payload.anchor.chainId);
      line('Contract', payload.anchor.contract);
      line('Transaction reference', payload.anchor.txRef, { mono: true });
      line('Block', payload.anchor.blockNumber === null ? 'pending' : String(payload.anchor.blockNumber));
      line('Anchored at', payload.anchor.anchoredAt);
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('This record has not been anchored.');
    }

    heading('7. Verification at the time of production');
    const passed = payload.verification.status === 'verified';
    doc.font('Helvetica-Bold').fontSize(11).fillColor(passed ? '#047857' : '#b91c1c')
      .text(passed
        ? 'VERIFIED - the record produces the identical hash and has not been altered.'
        : `INTEGRITY STATUS: ${payload.verification.status.toUpperCase()}`);
    doc.font('Courier').fontSize(8).fillColor(MUTED)
      .text(`recomputed ${payload.verification.recomputedHash ?? '-'} at ${payload.verification.checkedAt}`);

    heading('8. Signatures');
    for (const signatory of payload.signatories) {
      const present = signatures.find((s) => s.role === signatory.role);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(signatory.label);
      if (present) {
        doc.font('Helvetica').fontSize(9).fillColor(INK)
          .text(`${present.name}, ${present.designation} - signed ${present.signedAt}`);
        doc.font('Courier').fontSize(7).fillColor(MUTED)
          .text(`${present.credentialType} · key ${present.keyFingerprint}`);
        doc.font('Courier').fontSize(6).fillColor(MUTED).text(present.signature.slice(0, 96) + '…');
      } else {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#b45309').text('Awaiting signature.');
      }
      doc.moveDown(0.5);
    }

    doc.moveDown(1);
    doc.font('Helvetica-Oblique').fontSize(7).fillColor(MUTED)
      .text(
        'Signatures in this demonstration are Ed25519 keys standing in for CCA-licensed Class 3 Digital Signature Certificates ' +
        '(marked SIMULATED-DSC). A production deployment signs with the officer’s existing DSC token or Aadhaar eSign. ' +
        'Generated by PRAMANA - verify this record independently at the public verifier.',
        { align: 'left' },
      );

    doc.end();
  });
}
