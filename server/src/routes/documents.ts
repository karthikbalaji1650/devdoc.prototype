import { Router } from 'express';
import type { Db } from '../db.js';
import { canDeleteDocument, canEditDocument, isVisible, type AuthUser } from '../permissions.js';
import { requireAuth } from '../middleware.js';

interface DocumentMetadata {
  id: string;
  title: string;
  subtitle?: string;
  docNumber: string;
  author: string;
  department?: string;
  date: string;
  version: string;
  classification: string;
  status: string;
  templateType: string;
  logoUrl?: string;
  logoPosition?: string;
  tags?: string[];
}

interface DocumentModel {
  metadata: DocumentMetadata;
  sections: unknown[];
}

interface DocRow {
  id: string;
  author: string | null;
  status: string;
  document_json: DocumentModel;
  updated_at: string;
}

const VALID_STATUSES = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED'];

function toAuthUser(user: NonNullable<Parameters<typeof canEditDocument>[0]>): AuthUser {
  return { id: user.id, name: user.name, role: user.role };
}

export function documentsRouter(db: Db): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const user = toAuthUser(req.user!);
    const { rows } = await db.query<DocRow>(
      'SELECT id, author, status, document_json, updated_at FROM documents WHERE deleted_at IS NULL ORDER BY updated_at DESC',
    );
    // updatedAt lets the client tell a document it already has apart from
    // one that changed on the server since - without it, the frontend can
    // only add documents it's missing, never pull an update to one it
    // already has (see syncFromBackend on the frontend).
    const visible = rows.filter((r) => isVisible(user, r)).map((r) => ({ ...r.document_json, updatedAt: r.updated_at }));
    res.json({ documents: visible });
  });

  router.get('/:id', async (req, res) => {
    const user = toAuthUser(req.user!);
    const { rows } = await db.query<DocRow>(
      'SELECT id, author, status, document_json, updated_at FROM documents WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id],
    );
    const row = rows[0];
    if (!row || !isVisible(user, row)) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    res.json({ document: { ...row.document_json, updatedAt: row.updated_at } });
  });

  router.put('/:id', async (req, res) => {
    const user = toAuthUser(req.user!);
    const body = req.body as Partial<DocumentModel> | undefined;
    const metadata = body?.metadata;
    if (!metadata || typeof metadata !== 'object' || !Array.isArray(body?.sections)) {
      res.status(400).json({ error: 'Body must be a document with metadata and sections.' });
      return;
    }
    if (metadata.status && !VALID_STATUSES.includes(metadata.status)) {
      res.status(400).json({ error: `status must be one of ${VALID_STATUSES.join(', ')}.` });
      return;
    }

    const { rows } = await db.query<DocRow>(
      'SELECT id, author, status, document_json, updated_at FROM documents WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id],
    );
    const existing = rows[0];
    if (existing && !canEditDocument(user, existing)) {
      res.status(403).json({ error: 'You can only edit documents you authored.' });
      return;
    }

    // A non-admin cannot author on someone else's behalf, and cannot use an
    // edit to hand a document to a different author and lock themselves out.
    const author = user.role === 'admin' ? metadata.author || user.name : user.name;
    const doc: DocumentModel = {
      metadata: { ...metadata, id: req.params.id, author },
      sections: body!.sections!,
    };

    await db.query(
      `INSERT INTO documents (id, doc_number, title, subtitle, author, department, doc_date, version, classification, status, template_type, document_json, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (id) DO UPDATE SET
         doc_number = EXCLUDED.doc_number, title = EXCLUDED.title, subtitle = EXCLUDED.subtitle,
         author = EXCLUDED.author, department = EXCLUDED.department, doc_date = EXCLUDED.doc_date,
         version = EXCLUDED.version, classification = EXCLUDED.classification, status = EXCLUDED.status,
         template_type = EXCLUDED.template_type, document_json = EXCLUDED.document_json, updated_at = now(),
         deleted_at = NULL`,
      [
        doc.metadata.id, doc.metadata.docNumber, doc.metadata.title, doc.metadata.subtitle ?? null,
        doc.metadata.author, doc.metadata.department ?? null, doc.metadata.date || null, doc.metadata.version,
        doc.metadata.classification, doc.metadata.status, doc.metadata.templateType, JSON.stringify(doc),
      ],
    );
    res.json({ document: doc });
  });

  router.delete('/:id', async (req, res) => {
    const user = toAuthUser(req.user!);
    const { rows } = await db.query<DocRow>(
      'SELECT id, author, status, document_json, updated_at FROM documents WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id],
    );
    const existing = rows[0];
    if (!existing) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    if (!canDeleteDocument(user, existing)) {
      res.status(403).json({ error: 'You can only delete documents you authored.' });
      return;
    }
    // Soft delete, mirroring the app's Doc Bin convention: nothing is
    // destroyed by this endpoint.
    await db.query('UPDATE documents SET deleted_at = now() WHERE id = $1', [req.params.id]);
    res.status(204).end();
  });

  // Permanently removes a document, including one already soft-deleted -
  // this is what the frontend's Doc Bin "permanently delete" calls, since
  // the plain DELETE above only hides it. Same author-or-admin rule as a
  // normal delete: purging isn't a separate, more locked-down permission.
  router.delete('/:id/purge', async (req, res) => {
    const user = toAuthUser(req.user!);
    const { rows } = await db.query<DocRow>(
      'SELECT id, author, status, document_json, updated_at FROM documents WHERE id = $1',
      [req.params.id],
    );
    const existing = rows[0];
    if (!existing) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    if (!canDeleteDocument(user, existing)) {
      res.status(403).json({ error: 'You can only delete documents you authored.' });
      return;
    }
    await db.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.status(204).end();
  });

  return router;
}
