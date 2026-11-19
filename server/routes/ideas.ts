import { Router } from 'express';
import {
  ACTIVE_FOCUS_STATUSES,
  DIFFICULTY_LEVELS,
  PRIORITY_LEVELS,
  PROJECT_STATUSES,
  type ProjectStatus,
} from '../../src/types/index.ts';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { db, ensureUserSettings, logActivity, newId, nowIso, parseTags } from '../db.ts';

const router = Router();
router.use(requireAuth);

function mapIdea(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    title: String(row.title),
    description: String(row.description || ''),
    category: String(row.category || 'Ürün'),
    potential: Number(row.potential || 3),
    estimated_difficulty: row.estimated_difficulty,
    priority: row.priority,
    tags: parseTags(row.tags as string),
    notes: String(row.notes || ''),
    converted_project_id: row.converted_project_id ? String(row.converted_project_id) : null,
    is_archived: Boolean(row.is_archived),
    archived_at: row.archived_at ? String(row.archived_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

router.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const archived = req.query.archived === '1' ? 1 : 0;
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  const rows = db
    .prepare(`SELECT * FROM ideas WHERE user_id = ? AND is_archived = ? ORDER BY potential DESC, created_at DESC`)
    .all(userId, archived) as Record<string, unknown>[];

  let ideas = rows.map(mapIdea);
  if (category) ideas = ideas.filter((i) => i.category === category);
  if (search) {
    ideas = ideas.filter(
      (i) =>
        i.title.toLowerCase().includes(search) ||
        i.description.toLowerCase().includes(search) ||
        i.category.toLowerCase().includes(search) ||
        i.tags.some((t) => t.toLowerCase().includes(search))
    );
  }
  res.json({ ideas });
});

router.post('/', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const body = req.body as Record<string, unknown>;
  const title = String(body.title || '').trim();
  if (!title) {
    res.status(400).json({ error: 'Fikir başlığı zorunludur.' });
    return;
  }

  const potential = Math.min(5, Math.max(1, Number(body.potential || 3)));
  const difficulty = DIFFICULTY_LEVELS.includes(body.estimated_difficulty as (typeof DIFFICULTY_LEVELS)[number])
    ? String(body.estimated_difficulty)
    : 'Orta';
  const priority = PRIORITY_LEVELS.includes(body.priority as (typeof PRIORITY_LEVELS)[number])
    ? String(body.priority)
    : 'Orta';
  const tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  const id = newId();
  const now = nowIso();

  db.prepare(
    `INSERT INTO ideas (id, user_id, title, description, category, potential, estimated_difficulty, priority, tags, notes, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    userId,
    title,
    String(body.description || '').trim(),
    String(body.category || 'Ürün').trim() || 'Ürün',
    potential,
    difficulty,
    priority,
    JSON.stringify(tags),
    String(body.notes || ''),
    now,
    now
  );

  logActivity(userId, 'idea', id, title, 'Fikir oluşturuldu', `Potansiyel: ${potential}/5`);
  const created = db.prepare(`SELECT * FROM ideas WHERE id = ?`).get(id) as Record<string, unknown>;
  res.status(201).json({ idea: mapIdea(created) });
});

router.patch('/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const existing = db.prepare(`SELECT * FROM ideas WHERE id = ? AND user_id = ?`).get(req.params.id, userId) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Fikir bulunamadı.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const title = body.title !== undefined ? String(body.title).trim() : String(existing.title);
  if (!title) {
    res.status(400).json({ error: 'Fikir başlığı boş olamaz.' });
    return;
  }

  const potential = body.potential !== undefined ? Math.min(5, Math.max(1, Number(body.potential))) : Number(existing.potential);
  const difficulty =
    body.estimated_difficulty && DIFFICULTY_LEVELS.includes(body.estimated_difficulty as (typeof DIFFICULTY_LEVELS)[number])
      ? String(body.estimated_difficulty)
      : String(existing.estimated_difficulty);
  const priority =
    body.priority && PRIORITY_LEVELS.includes(body.priority as (typeof PRIORITY_LEVELS)[number])
      ? String(body.priority)
      : String(existing.priority);
  const tags = Array.isArray(body.tags)
    ? JSON.stringify(body.tags.map((t) => String(t).trim()).filter(Boolean))
    : String(existing.tags);

  db.prepare(
    `UPDATE ideas
     SET title = ?, description = ?, category = ?, potential = ?, estimated_difficulty = ?, priority = ?, tags = ?, notes = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    title,
    body.description !== undefined ? String(body.description) : String(existing.description),
    body.category !== undefined ? String(body.category).trim() || 'Ürün' : String(existing.category),
    potential,
    difficulty,
    priority,
    tags,
    body.notes !== undefined ? String(body.notes) : String(existing.notes),
    nowIso(),
    existing.id,
    userId
  );

  const updated = db.prepare(`SELECT * FROM ideas WHERE id = ?`).get(existing.id) as Record<string, unknown>;
  res.json({ idea: mapIdea(updated) });
});

router.post('/:id/convert', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const idea = db.prepare(`SELECT * FROM ideas WHERE id = ? AND user_id = ?`).get(req.params.id, userId) as
    | Record<string, unknown>
    | undefined;
  if (!idea) {
    res.status(404).json({ error: 'Fikir bulunamadı.' });
    return;
  }

  const { status, deadline, overrideLimit } = req.body as {
    status?: string;
    deadline?: string | null;
    overrideLimit?: boolean;
  };
  const targetStatus: ProjectStatus = PROJECT_STATUSES.includes(status as ProjectStatus)
    ? (status as ProjectStatus)
    : 'Planlama';

  if (ACTIVE_FOCUS_STATUSES.includes(targetStatus)) {
    const settings = ensureUserSettings(userId);
    const activeCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM projects WHERE user_id = ? AND is_archived = 0 AND status IN (${ACTIVE_FOCUS_STATUSES.map(() => '?').join(',')})`
        )
        .get(userId, ...ACTIVE_FOCUS_STATUSES) as { c: number }
    ).c;

    if (activeCount >= settings.max_active_projects && !overrideLimit) {
      res.status(409).json({
        code: 'FOCUS_LIMIT_REACHED',
        allowOverride: settings.allow_limit_override,
        error: `Aktif odak proje limitine (${settings.max_active_projects}) ulaştınız. Projeyi "Beklemede" olarak dönüştürebilir veya limiti manuel geçersiz kılabilirsiniz.`,
      });
      return;
    }
  }

  const projectId = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO projects (id, user_id, name, description, category, priority, status, start_date, deadline, progress, tags, is_archived, last_activity_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?)`
  ).run(
    projectId,
    userId,
    String(idea.title),
    String(idea.description || ''),
    String(idea.category || 'Ürün'),
    String(idea.priority || 'Orta'),
    targetStatus,
    now.slice(0, 10),
    deadline || null,
    String(idea.tags || '[]'),
    now,
    now,
    now
  );

  db.prepare(`UPDATE ideas SET converted_project_id = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(
    projectId,
    now,
    idea.id,
    userId
  );

  logActivity(
    userId,
    'idea',
    String(idea.id),
    String(idea.title),
    'Fikir projeye dönüştürüldü',
    `Yeni proje durumu: ${targetStatus}`
  );

  res.status(201).json({ projectId });
});

router.post('/:id/archive', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const now = nowIso();
  const info = db
    .prepare(`UPDATE ideas SET is_archived = 1, archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(now, now, req.params.id, userId);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Fikir bulunamadı.' });
    return;
  }
  res.json({ ok: true });
});

router.post('/:id/restore', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const info = db
    .prepare(`UPDATE ideas SET is_archived = 0, archived_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(nowIso(), req.params.id, userId);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Fikir bulunamadı.' });
    return;
  }
  res.json({ ok: true });
});

router.delete('/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const info = db.prepare(`DELETE FROM ideas WHERE id = ? AND user_id = ?`).run(req.params.id, userId);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Fikir bulunamadı.' });
    return;
  }
  res.json({ ok: true });
});

export default router;
