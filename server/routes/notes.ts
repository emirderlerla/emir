import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { db, logActivity, newId, nowIso, parseTags, touchProjectActivity } from '../db.ts';

const router = Router();
router.use(requireAuth);

const ALLOWED_MIME_PREFIXES = ['image/', 'text/', 'application/pdf', 'application/json', 'application/zip'];
const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.pdf',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.zip',
  '.doc',
  '.docx',
]);

const uploadDirRoot = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadDirRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const userReq = req as AuthenticatedRequest;
    const userDir = path.join(uploadDirRoot, userReq.userId || 'shared');
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${newId()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeOk =
      ALLOWED_MIME_PREFIXES.some((p) => file.mimetype.startsWith(p)) ||
      file.mimetype.includes('officedocument') ||
      file.mimetype === 'application/msword';
    if (ALLOWED_EXTENSIONS.has(ext) && mimeOk) {
      cb(null, true);
    } else {
      cb(new Error('İzin verilmeyen dosya türü. Yalnızca görsel, PDF, metin, CSV, JSON, Office veya ZIP dosyaları yüklenebilir.'));
    }
  },
});

// NOTES
router.get('/notes', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  const taskId = typeof req.query.task_id === 'string' ? req.query.task_id : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  const rows = db
    .prepare(
      `SELECT n.*, p.name as project_name, t.title as task_title
       FROM notes n
       LEFT JOIN projects p ON p.id = n.project_id
       LEFT JOIN tasks t ON t.id = n.task_id
       WHERE n.user_id = ?
       ORDER BY n.updated_at DESC`
    )
    .all(userId) as Record<string, unknown>[];

  let notes = rows.map((r) => ({
    ...r,
    tags: parseTags(r.tags as string),
  }));

  if (projectId) notes = notes.filter((n: Record<string, unknown>) => n.project_id === projectId);
  if (taskId) notes = notes.filter((n: Record<string, unknown>) => n.task_id === taskId);
  if (search) {
    notes = notes.filter((n: Record<string, unknown>) => {
      const title = String(n.title || '').toLowerCase();
      const content = String(n.content || '').toLowerCase();
      const tags = (n.tags as string[]) || [];
      return title.includes(search) || content.includes(search) || tags.some((t) => t.toLowerCase().includes(search));
    });
  }

  res.json({ notes });
});

router.post('/notes', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const body = req.body as Record<string, unknown>;
  const title = String(body.title || '').trim();
  if (!title) {
    res.status(400).json({ error: 'Not başlığı zorunludur.' });
    return;
  }
  const projectId = body.project_id ? String(body.project_id) : null;
  const taskId = body.task_id ? String(body.task_id) : null;
  const tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  const id = newId();
  const now = nowIso();

  db.prepare(
    `INSERT INTO notes (id, user_id, project_id, task_id, title, content, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, projectId, taskId, title, String(body.content || ''), JSON.stringify(tags), now, now);

  touchProjectActivity(userId, projectId);
  logActivity(userId, 'note', id, title, 'Not oluşturuldu', '');

  const created = db
    .prepare(
      `SELECT n.*, p.name as project_name, t.title as task_title
       FROM notes n LEFT JOIN projects p ON p.id = n.project_id LEFT JOIN tasks t ON t.id = n.task_id
       WHERE n.id = ?`
    )
    .get(id) as Record<string, unknown>;
  res.status(201).json({ note: { ...created, tags: parseTags(created.tags as string) } });
});

router.patch('/notes/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const existing = db.prepare(`SELECT * FROM notes WHERE id = ? AND user_id = ?`).get(req.params.id, userId) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Not bulunamadı.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const title = body.title !== undefined ? String(body.title).trim() : String(existing.title);
  if (!title) {
    res.status(400).json({ error: 'Not başlığı boş olamaz.' });
    return;
  }
  const tags = Array.isArray(body.tags)
    ? JSON.stringify(body.tags.map((t) => String(t).trim()).filter(Boolean))
    : String(existing.tags);
  const projectId = body.project_id !== undefined ? (body.project_id ? String(body.project_id) : null) : (existing.project_id as string | null);
  const taskId = body.task_id !== undefined ? (body.task_id ? String(body.task_id) : null) : (existing.task_id as string | null);

  db.prepare(
    `UPDATE notes SET title = ?, content = ?, project_id = ?, task_id = ?, tags = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ).run(
    title,
    body.content !== undefined ? String(body.content) : String(existing.content),
    projectId,
    taskId,
    tags,
    nowIso(),
    existing.id,
    userId
  );

  touchProjectActivity(userId, projectId);
  const updated = db
    .prepare(
      `SELECT n.*, p.name as project_name, t.title as task_title
       FROM notes n LEFT JOIN projects p ON p.id = n.project_id LEFT JOIN tasks t ON t.id = n.task_id
       WHERE n.id = ?`
    )
    .get(existing.id) as Record<string, unknown>;
  res.json({ note: { ...updated, tags: parseTags(updated.tags as string) } });
});

router.delete('/notes/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const info = db.prepare(`DELETE FROM notes WHERE id = ? AND user_id = ?`).run(req.params.id, userId);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Not bulunamadı.' });
    return;
  }
  res.json({ ok: true });
});

// ATTACHMENTS
router.get('/attachments', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  const taskId = typeof req.query.task_id === 'string' ? req.query.task_id : '';

  let rows = db
    .prepare(
      `SELECT a.*, p.name as project_name, t.title as task_title
       FROM attachments a
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN tasks t ON t.id = a.task_id
       WHERE a.user_id = ?
       ORDER BY a.created_at DESC`
    )
    .all(userId) as Record<string, unknown>[];

  if (projectId) rows = rows.filter((a) => a.project_id === projectId);
  if (taskId) rows = rows.filter((a) => a.task_id === taskId);

  res.json({ attachments: rows });
});

router.post('/attachments', upload.single('file'), (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  if (!req.file) {
    res.status(400).json({ error: 'Yüklenecek dosya seçilmedi.' });
    return;
  }

  const projectId = req.body.project_id ? String(req.body.project_id) : null;
  const taskId = req.body.task_id ? String(req.body.task_id) : null;
  const noteId = req.body.note_id ? String(req.body.note_id) : null;
  const id = newId();
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const relativePath = path.relative(uploadDirRoot, req.file.path);

  db.prepare(
    `INSERT INTO attachments (id, user_id, project_id, task_id, note_id, file_name, file_size, mime_type, storage_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, projectId, taskId, noteId, originalName, req.file.size, req.file.mimetype, relativePath, nowIso());

  touchProjectActivity(userId, projectId);
  logActivity(userId, 'attachment', id, originalName, 'Dosya yüklendi', `${Math.round(req.file.size / 1024)} KB`);

  const created = db
    .prepare(
      `SELECT a.*, p.name as project_name, t.title as task_title
       FROM attachments a LEFT JOIN projects p ON p.id = a.project_id LEFT JOIN tasks t ON t.id = a.task_id
       WHERE a.id = ?`
    )
    .get(id);
  res.status(201).json({ attachment: created });
});

router.get('/attachments/:id/download', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const att = db
    .prepare(`SELECT * FROM attachments WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as
    | { file_name: string; mime_type: string; storage_path: string }
    | undefined;

  if (!att) {
    res.status(404).json({ error: 'Dosya bulunamadı.' });
    return;
  }
  const absPath = path.resolve(uploadDirRoot, att.storage_path);
  if (!absPath.startsWith(uploadDirRoot) || !fs.existsSync(absPath)) {
    res.status(404).json({ error: 'Dosya sunucuda mevcut değil.' });
    return;
  }

  const inline = req.query.inline === '1';
  res.setHeader('Content-Type', att.mime_type);
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(att.file_name)}`
  );
  fs.createReadStream(absPath).pipe(res);
});

router.delete('/attachments/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const att = db
    .prepare(`SELECT * FROM attachments WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as { id: string; file_name: string; storage_path: string } | undefined;
  if (!att) {
    res.status(404).json({ error: 'Dosya bulunamadı.' });
    return;
  }
  const absPath = path.resolve(uploadDirRoot, att.storage_path);
  if (absPath.startsWith(uploadDirRoot) && fs.existsSync(absPath)) {
    fs.unlinkSync(absPath);
  }
  db.prepare(`DELETE FROM attachments WHERE id = ? AND user_id = ?`).run(att.id, userId);
  logActivity(userId, 'attachment', att.id, att.file_name, 'Dosya silindi', '');
  res.json({ ok: true });
});

export default router;
