import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { syncWorkspaceNotifications } from '../control.ts';
import { db, logActivity, newId, nowIso } from '../db.ts';

const router = Router();
router.use(requireAuth);

router.get('/calendar', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;

  const projects = db
    .prepare(
      `SELECT id, name, deadline, status, priority
       FROM projects WHERE user_id = ? AND is_archived = 0 AND deadline IS NOT NULL`
    )
    .all(userId) as { id: string; name: string; deadline: string; status: string; priority: string }[];

  const tasks = db
    .prepare(
      `SELECT t.id, t.title, t.due_date, t.status, t.priority, p.name as project_name
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.user_id = ? AND t.is_archived = 0 AND t.due_date IS NOT NULL`
    )
    .all(userId) as {
    id: string;
    title: string;
    due_date: string;
    status: string;
    priority: string;
    project_name: string | null;
  }[];

  const milestones = db
    .prepare(
      `SELECT m.id, m.title, m.due_date, m.is_completed, p.name as project_name
       FROM milestones m JOIN projects p ON p.id = m.project_id
       WHERE m.user_id = ? AND p.is_archived = 0 AND m.due_date IS NOT NULL`
    )
    .all(userId) as {
    id: string;
    title: string;
    due_date: string;
    is_completed: number;
    project_name: string;
  }[];

  const reminders = db
    .prepare(
      `SELECT r.*, p.name as project_name, t.title as task_title
       FROM reminders r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN tasks t ON t.id = r.task_id
       WHERE r.user_id = ?
       ORDER BY r.remind_at ASC`
    )
    .all(userId) as Record<string, unknown>[];

  const events = [
    ...projects.map((p) => ({
      id: `proj-${p.id}`,
      entityId: p.id,
      type: 'project_deadline' as const,
      title: p.name,
      date: p.deadline.slice(0, 10),
      time: null,
      status: p.status,
      priority: p.priority,
      subtitle: 'Proje Teslim Tarihi',
    })),
    ...tasks.map((t) => ({
      id: `task-${t.id}`,
      entityId: t.id,
      type: 'task_deadline' as const,
      title: t.title,
      date: t.due_date.slice(0, 10),
      time: null,
      status: t.status,
      priority: t.priority,
      subtitle: t.project_name ? `Görev · ${t.project_name}` : 'Görev Son Tarihi',
    })),
    ...milestones.map((m) => ({
      id: `ms-${m.id}`,
      entityId: m.id,
      type: 'milestone' as const,
      title: m.title,
      date: m.due_date.slice(0, 10),
      time: null,
      status: m.is_completed ? 'Tamamlandı' : 'Bekliyor',
      priority: 'Yüksek',
      subtitle: `Kilometre Taşı · ${m.project_name}`,
    })),
    ...reminders.map((r) => {
      const remindAt = String(r.remind_at);
      return {
        id: `rem-${String(r.id)}`,
        entityId: String(r.id),
        type: 'reminder' as const,
        title: String(r.title),
        date: remindAt.slice(0, 10),
        time: remindAt.length >= 16 ? remindAt.slice(11, 16) : null,
        status: r.is_completed ? 'Tamamlandı' : 'Aktif',
        priority: 'Orta',
        subtitle: String(r.description || 'Hatırlatıcı'),
      };
    }),
  ];

  res.json({
    events,
    reminders: reminders.map((r) => ({ ...r, is_completed: Boolean(r.is_completed) })),
  });
});

// REMINDERS
router.get('/reminders', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const rows = db
    .prepare(
      `SELECT r.*, p.name as project_name, t.title as task_title
       FROM reminders r
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN tasks t ON t.id = r.task_id
       WHERE r.user_id = ?
       ORDER BY r.is_completed ASC, r.remind_at ASC`
    )
    .all(userId) as Record<string, unknown>[];

  res.json({ reminders: rows.map((r) => ({ ...r, is_completed: Boolean(r.is_completed) })) });
});

router.post('/reminders', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const body = req.body as Record<string, unknown>;
  const title = String(body.title || '').trim();
  const remindAt = String(body.remind_at || '').trim();
  if (!title || !remindAt) {
    res.status(400).json({ error: 'Hatırlatıcı başlığı ve tarih-saat zorunludur.' });
    return;
  }

  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO reminders (id, user_id, project_id, task_id, title, description, remind_at, is_completed, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    userId,
    body.project_id ? String(body.project_id) : null,
    body.task_id ? String(body.task_id) : null,
    title,
    String(body.description || ''),
    remindAt,
    now,
    now
  );

  logActivity(userId, 'reminder', id, title, 'Hatırlatıcı oluşturuldu', remindAt);
  const created = db.prepare(`SELECT * FROM reminders WHERE id = ?`).get(id) as Record<string, unknown>;
  res.status(201).json({ reminder: { ...created, is_completed: Boolean(created.is_completed) } });
});

router.patch('/reminders/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const existing = db
    .prepare(`SELECT * FROM reminders WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Hatırlatıcı bulunamadı.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const title = body.title !== undefined ? String(body.title).trim() : String(existing.title);
  if (!title) {
    res.status(400).json({ error: 'Başlık boş olamaz.' });
    return;
  }

  const nextCompleted = body.is_completed !== undefined ? Boolean(body.is_completed) : Boolean(existing.is_completed);
  db.prepare(
    `UPDATE reminders SET title = ?, description = ?, remind_at = ?, project_id = ?, task_id = ?, is_completed = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    title,
    body.description !== undefined ? String(body.description) : String(existing.description),
    body.remind_at !== undefined ? String(body.remind_at) : String(existing.remind_at),
    body.project_id !== undefined ? (body.project_id ? String(body.project_id) : null) : existing.project_id,
    body.task_id !== undefined ? (body.task_id ? String(body.task_id) : null) : existing.task_id,
    nextCompleted ? 1 : 0,
    nowIso(),
    existing.id,
    userId
  );

  const updated = db.prepare(`SELECT * FROM reminders WHERE id = ?`).get(existing.id) as Record<string, unknown>;
  res.json({ reminder: { ...updated, is_completed: Boolean(updated.is_completed) } });
});

router.delete('/reminders/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const info = db.prepare(`DELETE FROM reminders WHERE id = ? AND user_id = ?`).run(req.params.id, userId);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Hatırlatıcı bulunamadı.' });
    return;
  }
  res.json({ ok: true });
});

// NOTIFICATIONS
router.get('/notifications', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  syncWorkspaceNotifications(userId);
  const rows = db
    .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY is_read ASC, created_at DESC LIMIT 80`)
    .all(userId) as Record<string, unknown>[];
  res.json({
    notifications: rows.map((n) => ({ ...n, is_read: Boolean(n.is_read) })),
    unreadCount: rows.filter((n) => !n.is_read).length,
  });
});

router.patch('/notifications/:id/read', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(req.params.id, userId);
  res.json({ ok: true });
});

router.post('/notifications/read-all', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(userId);
  res.json({ ok: true });
});

// ACTIVITY LOGS
router.get('/activity', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const entityType = typeof req.query.entity_type === 'string' ? req.query.entity_type : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  let rows = db
    .prepare(`SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`)
    .all(userId) as Record<string, unknown>[];

  if (entityType) rows = rows.filter((r) => r.entity_type === entityType);
  if (search) {
    rows = rows.filter(
      (r) =>
        String(r.entity_title).toLowerCase().includes(search) ||
        String(r.action).toLowerCase().includes(search) ||
        String(r.details).toLowerCase().includes(search)
    );
  }
  res.json({ activities: rows });
});

export default router;
