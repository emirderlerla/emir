import { Router } from 'express';
import { ACTIVE_FOCUS_STATUSES, PRIORITY_LEVELS, PROJECT_STATUSES, type ProjectStatus } from '../../src/types/index.ts';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { mapProjectRow } from '../control.ts';
import { db, ensureUserSettings, logActivity, newId, nowIso, parseTags, touchProjectActivity } from '../db.ts';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const archived = req.query.archived === '1' ? 1 : 0;
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const priority = typeof req.query.priority === 'string' ? req.query.priority : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'updated_desc';

  const rows = db
    .prepare(`SELECT * FROM projects WHERE user_id = ? AND is_archived = ?`)
    .all(userId, archived) as Record<string, unknown>[];

  const today = new Date().toISOString().slice(0, 10);
  const taskStats = db
    .prepare(
      `SELECT project_id,
              COUNT(*) as total,
              SUM(CASE WHEN status = 'Tamamlandı' THEN 1 ELSE 0 END) as completed,
              SUM(CASE WHEN status != 'Tamamlandı' AND due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) as overdue
       FROM tasks WHERE user_id = ? AND is_archived = 0 AND project_id IS NOT NULL
       GROUP BY project_id`
    )
    .all(today, userId) as { project_id: string; total: number; completed: number; overdue: number }[];

  const milestoneCounts = db
    .prepare(`SELECT project_id, COUNT(*) as total FROM milestones WHERE user_id = ? GROUP BY project_id`)
    .all(userId) as { project_id: string; total: number }[];

  const nextActions = db
    .prepare(
      `SELECT project_id, title FROM tasks
       WHERE user_id = ? AND is_archived = 0 AND status != 'Tamamlandı' AND project_id IS NOT NULL
       ORDER BY CASE priority WHEN 'Kritik' THEN 0 WHEN 'Yüksek' THEN 1 WHEN 'Orta' THEN 2 ELSE 3 END, due_date ASC`
    )
    .all(userId) as { project_id: string; title: string }[];

  const statsMap = new Map(taskStats.map((s) => [s.project_id, s]));
  const milestoneMap = new Map(milestoneCounts.map((m) => [m.project_id, m.total]));
  const nextActionMap = new Map<string, string>();
  for (const na of nextActions) {
    if (!nextActionMap.has(na.project_id)) {
      nextActionMap.set(na.project_id, na.title);
    }
  }

  let projects = rows.map((row) => {
    const id = String(row.id);
    const s = statsMap.get(id);
    return mapProjectRow(row, {
      task_count: s?.total ?? 0,
      completed_task_count: s?.completed ?? 0,
      overdue_task_count: s?.overdue ?? 0,
      milestone_count: milestoneMap.get(id) ?? 0,
      next_action: nextActionMap.get(id) ?? null,
    });
  });

  if (status) projects = projects.filter((p) => p.status === status);
  if (priority) projects = projects.filter((p) => p.priority === priority);
  if (search) {
    projects = projects.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.description.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search) ||
        p.tags.some((t) => t.toLowerCase().includes(search))
    );
  }

  const pRank: Record<string, number> = { Kritik: 0, Yüksek: 1, Orta: 2, Düşük: 3 };
  projects.sort((a, b) => {
    switch (sort) {
      case 'deadline_asc':
        return (a.deadline || '9999-12-31').localeCompare(b.deadline || '9999-12-31');
      case 'priority_desc':
        return (pRank[a.priority] ?? 9) - (pRank[b.priority] ?? 9);
      case 'progress_desc':
        return b.progress - a.progress;
      case 'name_asc':
        return a.name.localeCompare(b.name, 'tr-TR');
      default:
        return b.updated_at.localeCompare(a.updated_at);
    }
  });

  res.json({ projects });
});

router.get('/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const projectRow = db
    .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as Record<string, unknown> | undefined;

  if (!projectRow) {
    res.status(404).json({ error: 'Proje bulunamadı.' });
    return;
  }

  const tasks = db
    .prepare(`SELECT * FROM tasks WHERE user_id = ? AND project_id = ? AND is_archived = 0 ORDER BY created_at DESC`)
    .all(userId, projectRow.id) as Record<string, unknown>[];

  const milestones = db
    .prepare(`SELECT * FROM milestones WHERE user_id = ? AND project_id = ? ORDER BY due_date ASC, created_at ASC`)
    .all(userId, projectRow.id) as Record<string, unknown>[];

  const notes = db
    .prepare(`SELECT * FROM notes WHERE user_id = ? AND project_id = ? ORDER BY updated_at DESC`)
    .all(userId, projectRow.id) as Record<string, unknown>[];

  const attachments = db
    .prepare(`SELECT * FROM attachments WHERE user_id = ? AND project_id = ? ORDER BY created_at DESC`)
    .all(userId, projectRow.id);

  const activities = db
    .prepare(`SELECT * FROM activity_logs WHERE user_id = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 25`)
    .all(userId, projectRow.id);

  res.json({
    project: mapProjectRow(projectRow),
    tasks: tasks.map((t) => ({
      ...t,
      tags: parseTags(t.tags as string),
      is_archived: Boolean(t.is_archived),
    })),
    milestones: milestones.map((m) => ({
      ...m,
      is_completed: Boolean(m.is_completed),
    })),
    notes: notes.map((n) => ({
      ...n,
      tags: parseTags(n.tags as string),
    })),
    attachments,
    activities,
  });
});

router.post('/', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const { name, description, category, priority, status, start_date, deadline, progress, tags, overrideLimit } =
    req.body as {
      name?: string;
      description?: string;
      category?: string;
      priority?: string;
      status?: string;
      start_date?: string | null;
      deadline?: string | null;
      progress?: number;
      tags?: string[];
      overrideLimit?: boolean;
    };

  const cleanName = (name || '').trim();
  if (!cleanName) {
    res.status(400).json({ error: 'Proje adı zorunludur.' });
    return;
  }

  const nextStatus: ProjectStatus = PROJECT_STATUSES.includes(status as ProjectStatus)
    ? (status as ProjectStatus)
    : 'Planlama';
  const nextPriority = PRIORITY_LEVELS.includes(priority as (typeof PRIORITY_LEVELS)[number])
    ? priority!
    : 'Orta';

  // Enforce Project Control System active focus limit
  const settings = ensureUserSettings(userId);
  if (ACTIVE_FOCUS_STATUSES.includes(nextStatus)) {
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
        error: `Aktif odak proje limitine (${settings.max_active_projects}) ulaştınız. Yeni projeyi "Fikir" / "Beklemede" olarak açabilir veya limiti manuel olarak aşabilirsiniz.`,
      });
      return;
    }
  }

  const id = newId();
  const now = nowIso();
  const safeProgress = Math.min(100, Math.max(0, Number(progress || 0)));
  const cleanTags = Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [];

  db.prepare(
    `INSERT INTO projects (id, user_id, name, description, category, priority, status, start_date, deadline, progress, tags, is_archived, last_activity_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    id,
    userId,
    cleanName,
    (description || '').trim(),
    (category || 'Genel').trim() || 'Genel',
    nextPriority,
    nextStatus,
    start_date || now.slice(0, 10),
    deadline || null,
    safeProgress,
    JSON.stringify(cleanTags),
    now,
    now,
    now
  );

  logActivity(
    userId,
    'project',
    id,
    cleanName,
    'Proje oluşturuldu',
    overrideLimit ? `Durum: ${nextStatus} (Odak limiti manuel geçersiz kılındı)` : `Durum: ${nextStatus}`
  );

  const created = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as Record<string, unknown>;
  res.status(201).json({ project: mapProjectRow(created) });
});

router.patch('/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const existing = db
    .prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as Record<string, unknown> | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Proje bulunamadı.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const nextName = body.name !== undefined ? String(body.name).trim() : String(existing.name);
  if (!nextName) {
    res.status(400).json({ error: 'Proje adı boş bırakılamaz.' });
    return;
  }

  const nextStatus =
    body.status && PROJECT_STATUSES.includes(body.status as ProjectStatus)
      ? (body.status as ProjectStatus)
      : (existing.status as ProjectStatus);

  const wasFocus = ACTIVE_FOCUS_STATUSES.includes(existing.status as ProjectStatus);
  const willBeFocus = ACTIVE_FOCUS_STATUSES.includes(nextStatus);

  if (!wasFocus && willBeFocus) {
    const settings = ensureUserSettings(userId);
    const activeCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM projects WHERE user_id = ? AND is_archived = 0 AND id != ? AND status IN (${ACTIVE_FOCUS_STATUSES.map(() => '?').join(',')})`
        )
        .get(userId, existing.id, ...ACTIVE_FOCUS_STATUSES) as { c: number }
    ).c;

    if (activeCount >= settings.max_active_projects && !body.overrideLimit) {
      res.status(409).json({
        code: 'FOCUS_LIMIT_REACHED',
        allowOverride: settings.allow_limit_override,
        error: `Aktif odak proje limitine (${settings.max_active_projects}) ulaştınız. Geçişi onaylamak için limit aşımını kabul edin.`,
      });
      return;
    }
  }

  const nextDesc = body.description !== undefined ? String(body.description) : String(existing.description);
  const nextCategory = body.category !== undefined ? String(body.category).trim() || 'Genel' : String(existing.category);
  const nextPriority =
    body.priority && PRIORITY_LEVELS.includes(body.priority as (typeof PRIORITY_LEVELS)[number])
      ? String(body.priority)
      : String(existing.priority);
  const nextStart = body.start_date !== undefined ? (body.start_date ? String(body.start_date) : null) : existing.start_date;
  const nextDeadline = body.deadline !== undefined ? (body.deadline ? String(body.deadline) : null) : existing.deadline;
  const nextProgress =
    body.progress !== undefined
      ? Math.min(100, Math.max(0, Number(body.progress)))
      : Number(existing.progress);
  const nextTags = Array.isArray(body.tags)
    ? JSON.stringify(body.tags.map((t) => String(t).trim()).filter(Boolean))
    : String(existing.tags);

  const now = nowIso();
  db.prepare(
    `UPDATE projects
     SET name = ?, description = ?, category = ?, priority = ?, status = ?, start_date = ?, deadline = ?, progress = ?, tags = ?, last_activity_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    nextName,
    nextDesc,
    nextCategory,
    nextPriority,
    nextStatus,
    nextStart,
    nextDeadline,
    nextProgress,
    nextTags,
    now,
    now,
    existing.id,
    userId
  );

  if (nextDeadline !== existing.deadline) {
    logActivity(
      userId,
      'project',
      String(existing.id),
      nextName,
      'Son tarih değiştirildi',
      `Yeni teslim tarihi: ${nextDeadline || 'Kaldırıldı'}`
    );
  } else {
    logActivity(userId, 'project', String(existing.id), nextName, 'Proje güncellendi', `Durum: ${nextStatus}`);
  }

  const updated = db.prepare(`SELECT * FROM projects WHERE id = ?`).get(existing.id) as Record<string, unknown>;
  res.json({ project: mapProjectRow(updated) });
});

router.post('/:id/archive', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const project = db
    .prepare(`SELECT id, name FROM projects WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as { id: string; name: string } | undefined;
  if (!project) {
    res.status(404).json({ error: 'Proje bulunamadı.' });
    return;
  }
  const now = nowIso();
  db.prepare(`UPDATE projects SET is_archived = 1, archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(
    now,
    now,
    project.id,
    userId
  );
  logActivity(userId, 'project', project.id, project.name, 'Proje arşivlendi', '');
  res.json({ ok: true });
});

router.post('/:id/restore', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const project = db
    .prepare(`SELECT id, name FROM projects WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as { id: string; name: string } | undefined;
  if (!project) {
    res.status(404).json({ error: 'Proje bulunamadı.' });
    return;
  }
  const now = nowIso();
  db.prepare(
    `UPDATE projects SET is_archived = 0, archived_at = NULL, last_activity_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`
  ).run(now, now, project.id, userId);
  logActivity(userId, 'project', project.id, project.name, 'Proje arşivden geri yüklendi', '');
  res.json({ ok: true });
});

router.delete('/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const project = db
    .prepare(`SELECT id, name FROM projects WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as { id: string; name: string } | undefined;
  if (!project) {
    res.status(404).json({ error: 'Proje bulunamadı.' });
    return;
  }
  db.prepare(`DELETE FROM projects WHERE id = ? AND user_id = ?`).run(project.id, userId);
  logActivity(userId, 'project', project.id, project.name, 'Proje silindi', '');
  res.json({ ok: true });
});

// Milestones nested under project
router.post('/:id/milestones', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const project = db
    .prepare(`SELECT id, name FROM projects WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as { id: string; name: string } | undefined;
  if (!project) {
    res.status(404).json({ error: 'Proje bulunamadı.' });
    return;
  }

  const { title, description, due_date } = req.body as {
    title?: string;
    description?: string;
    due_date?: string | null;
  };
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) {
    res.status(400).json({ error: 'Kilometre taşı başlığı zorunludur.' });
    return;
  }

  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO milestones (id, user_id, project_id, title, description, due_date, is_completed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, userId, project.id, cleanTitle, (description || '').trim(), due_date || null, now, now);

  touchProjectActivity(userId, project.id);
  logActivity(userId, 'milestone', id, cleanTitle, 'Kilometre taşı eklendi', `Proje: ${project.name}`);

  const created = db.prepare(`SELECT * FROM milestones WHERE id = ?`).get(id) as Record<string, unknown>;
  res.status(201).json({ milestone: { ...created, is_completed: Boolean(created.is_completed) } });
});

router.patch('/milestones/:milestoneId', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const existing = db
    .prepare(`SELECT * FROM milestones WHERE id = ? AND user_id = ?`)
    .get(req.params.milestoneId, userId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Kilometre taşı bulunamadı.' });
    return;
  }

  const { title, description, due_date, is_completed } = req.body as {
    title?: string;
    description?: string;
    due_date?: string | null;
    is_completed?: boolean;
  };

  const nextCompleted = is_completed !== undefined ? Boolean(is_completed) : Boolean(existing.is_completed);
  const completedAt = nextCompleted ? existing.completed_at || nowIso() : null;
  const nextTitle = title !== undefined ? title.trim() || String(existing.title) : String(existing.title);
  const nextDesc = description !== undefined ? description : String(existing.description);
  const nextDue = due_date !== undefined ? due_date : existing.due_date;

  db.prepare(
    `UPDATE milestones SET title = ?, description = ?, due_date = ?, is_completed = ?, completed_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(nextTitle, nextDesc, nextDue, nextCompleted ? 1 : 0, completedAt, nowIso(), existing.id, userId);

  touchProjectActivity(userId, String(existing.project_id));
  if (nextCompleted && !existing.is_completed) {
    logActivity(userId, 'milestone', String(existing.id), nextTitle, 'Kilometre taşı tamamlandı', '');
  }

  const updated = db.prepare(`SELECT * FROM milestones WHERE id = ?`).get(existing.id) as Record<string, unknown>;
  res.json({ milestone: { ...updated, is_completed: Boolean(updated.is_completed) } });
});

router.delete('/milestones/:milestoneId', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const existing = db
    .prepare(`SELECT id, title, project_id FROM milestones WHERE id = ? AND user_id = ?`)
    .get(req.params.milestoneId, userId) as { id: string; title: string; project_id: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Kilometre taşı bulunamadı.' });
    return;
  }
  db.prepare(`DELETE FROM milestones WHERE id = ? AND user_id = ?`).run(existing.id, userId);
  touchProjectActivity(userId, existing.project_id);
  res.json({ ok: true });
});

export default router;
