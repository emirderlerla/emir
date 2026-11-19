import { Router } from 'express';
import { PRIORITY_LEVELS, TASK_STATUSES } from '../../src/types/index.ts';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import {
  db,
  logActivity,
  newId,
  nowIso,
  parseTags,
  recalculateProjectProgress,
  touchProjectActivity,
} from '../db.ts';

const router = Router();
router.use(requireAuth);

function mapTask(row: Record<string, unknown>, subtasks: Record<string, unknown>[] = []) {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    project_id: row.project_id ? String(row.project_id) : null,
    project_name: row.project_name ? String(row.project_name) : null,
    title: String(row.title),
    description: String(row.description || ''),
    priority: row.priority,
    status: row.status,
    start_date: row.start_date ? String(row.start_date) : null,
    due_date: row.due_date ? String(row.due_date) : null,
    estimated_minutes: Number(row.estimated_minutes || 0),
    actual_minutes: Number(row.actual_minutes || 0),
    tags: parseTags(row.tags as string),
    notes: String(row.notes || ''),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    is_archived: Boolean(row.is_archived),
    archived_at: row.archived_at ? String(row.archived_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    subtasks: subtasks.map((s) => ({
      id: String(s.id),
      user_id: String(s.user_id),
      task_id: String(s.task_id),
      title: String(s.title),
      is_completed: Boolean(s.is_completed),
      sort_order: Number(s.sort_order || 0),
      created_at: String(s.created_at),
      updated_at: String(s.updated_at),
    })),
  };
}

router.get('/', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const archived = req.query.archived === '1' ? 1 : 0;
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const priority = typeof req.query.priority === 'string' ? req.query.priority : '';
  const overdueOnly = req.query.overdue === '1';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'priority_due';

  const rows = db
    .prepare(
      `SELECT t.*, p.name as project_name
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.user_id = ? AND t.is_archived = ?`
    )
    .all(userId, archived) as Record<string, unknown>[];

  const allSubtasks = db
    .prepare(`SELECT * FROM subtasks WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC`)
    .all(userId) as Record<string, unknown>[];
  const subMap = new Map<string, Record<string, unknown>[]>();
  for (const s of allSubtasks) {
    const tid = String(s.task_id);
    if (!subMap.has(tid)) subMap.set(tid, []);
    subMap.get(tid)!.push(s);
  }

  let tasks = rows.map((r) => mapTask(r, subMap.get(String(r.id)) || []));
  const today = new Date().toISOString().slice(0, 10);

  if (projectId) tasks = tasks.filter((t) => t.project_id === projectId);
  if (status) tasks = tasks.filter((t) => t.status === status);
  if (priority) tasks = tasks.filter((t) => t.priority === priority);
  if (overdueOnly) {
    tasks = tasks.filter((t) => t.status !== 'Tamamlandı' && t.due_date && t.due_date < today);
  }
  if (search) {
    tasks = tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(search) ||
        t.description.toLowerCase().includes(search) ||
        (t.project_name || '').toLowerCase().includes(search) ||
        t.tags.some((tag) => tag.toLowerCase().includes(search))
    );
  }

  const pRank: Record<string, number> = { Kritik: 0, Yüksek: 1, Orta: 2, Düşük: 3 };
  tasks.sort((a, b) => {
    if (sort === 'due_asc') {
      return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
    }
    if (sort === 'created_desc') {
      return b.created_at.localeCompare(a.created_at);
    }
    // Default: open first, then priority, then due date
    if (a.status === 'Tamamlandı' && b.status !== 'Tamamlandı') return 1;
    if (a.status !== 'Tamamlandı' && b.status === 'Tamamlandı') return -1;
    const pDiff = (pRank[String(a.priority)] ?? 9) - (pRank[String(b.priority)] ?? 9);
    if (pDiff !== 0) return pDiff;
    return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
  });

  res.json({ tasks });
});

router.post('/', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const body = req.body as Record<string, unknown>;
  const title = String(body.title || '').trim();
  if (!title) {
    res.status(400).json({ error: 'Görev başlığı zorunludur.' });
    return;
  }

  let projectId: string | null = body.project_id ? String(body.project_id) : null;
  if (projectId) {
    const p = db.prepare(`SELECT id FROM projects WHERE id = ? AND user_id = ?`).get(projectId, userId);
    if (!p) projectId = null;
  }

  const priority = PRIORITY_LEVELS.includes(body.priority as (typeof PRIORITY_LEVELS)[number])
    ? String(body.priority)
    : 'Orta';
  const status = TASK_STATUSES.includes(body.status as (typeof TASK_STATUSES)[number])
    ? String(body.status)
    : 'Yapılacak';
  const tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  const now = nowIso();
  const id = newId();
  const completedAt = status === 'Tamamlandı' ? now : null;

  db.prepare(
    `INSERT INTO tasks (id, user_id, project_id, title, description, priority, status, start_date, due_date, estimated_minutes, actual_minutes, tags, notes, completed_at, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(
    id,
    userId,
    projectId,
    title,
    String(body.description || '').trim(),
    priority,
    status,
    body.start_date ? String(body.start_date) : now.slice(0, 10),
    body.due_date ? String(body.due_date) : null,
    Math.max(0, Number(body.estimated_minutes || 0)),
    Math.max(0, Number(body.actual_minutes || 0)),
    JSON.stringify(tags),
    String(body.notes || ''),
    completedAt,
    now,
    now
  );

  // Optional initial subtasks
  if (Array.isArray(body.subtasks)) {
    body.subtasks.forEach((st, idx) => {
      const sTitle = typeof st === 'string' ? st.trim() : String((st as { title?: string }).title || '').trim();
      if (sTitle) {
        db.prepare(
          `INSERT INTO subtasks (id, user_id, task_id, title, is_completed, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
        ).run(newId(), userId, id, sTitle, idx, now, now);
      }
    });
  }

  touchProjectActivity(userId, projectId);
  recalculateProjectProgress(userId, projectId);
  logActivity(userId, 'task', id, title, 'Görev oluşturuldu', `Öncelik: ${priority}`);

  const created = db
    .prepare(`SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE t.id = ?`)
    .get(id) as Record<string, unknown>;
  const subs = db.prepare(`SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order ASC`).all(id) as Record<
    string,
    unknown
  >[];

  res.status(201).json({ task: mapTask(created, subs) });
});

router.patch('/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const existing = db.prepare(`SELECT * FROM tasks WHERE id = ? AND user_id = ?`).get(req.params.id, userId) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Görev bulunamadı.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const nextTitle = body.title !== undefined ? String(body.title).trim() : String(existing.title);
  if (!nextTitle) {
    res.status(400).json({ error: 'Görev başlığı boş olamaz.' });
    return;
  }

  const nextStatus =
    body.status && TASK_STATUSES.includes(body.status as (typeof TASK_STATUSES)[number])
      ? String(body.status)
      : String(existing.status);
  const nextPriority =
    body.priority && PRIORITY_LEVELS.includes(body.priority as (typeof PRIORITY_LEVELS)[number])
      ? String(body.priority)
      : String(existing.priority);

  let nextProjectId = body.project_id !== undefined ? (body.project_id ? String(body.project_id) : null) : (existing.project_id as string | null);
  if (nextProjectId) {
    const p = db.prepare(`SELECT id FROM projects WHERE id = ? AND user_id = ?`).get(nextProjectId, userId);
    if (!p) nextProjectId = null;
  }

  const now = nowIso();
  let completedAt = existing.completed_at as string | null;
  if (nextStatus === 'Tamamlandı' && existing.status !== 'Tamamlandı') {
    completedAt = now;
  } else if (nextStatus !== 'Tamamlandı') {
    completedAt = null;
  }

  const nextDue = body.due_date !== undefined ? (body.due_date ? String(body.due_date) : null) : existing.due_date;
  const nextStart = body.start_date !== undefined ? (body.start_date ? String(body.start_date) : null) : existing.start_date;
  const nextTags = Array.isArray(body.tags)
    ? JSON.stringify(body.tags.map((t) => String(t).trim()).filter(Boolean))
    : String(existing.tags);

  db.prepare(
    `UPDATE tasks
     SET project_id = ?, title = ?, description = ?, priority = ?, status = ?, start_date = ?, due_date = ?, estimated_minutes = ?, actual_minutes = ?, tags = ?, notes = ?, completed_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    nextProjectId,
    nextTitle,
    body.description !== undefined ? String(body.description) : String(existing.description),
    nextPriority,
    nextStatus,
    nextStart,
    nextDue,
    body.estimated_minutes !== undefined ? Math.max(0, Number(body.estimated_minutes)) : Number(existing.estimated_minutes),
    body.actual_minutes !== undefined ? Math.max(0, Number(body.actual_minutes)) : Number(existing.actual_minutes),
    nextTags,
    body.notes !== undefined ? String(body.notes) : String(existing.notes),
    completedAt,
    now,
    existing.id,
    userId
  );

  if (existing.project_id && existing.project_id !== nextProjectId) {
    recalculateProjectProgress(userId, String(existing.project_id));
  }
  touchProjectActivity(userId, nextProjectId);
  recalculateProjectProgress(userId, nextProjectId);

  if (nextStatus === 'Tamamlandı' && existing.status !== 'Tamamlandı') {
    logActivity(userId, 'task', String(existing.id), nextTitle, 'Görev tamamlandı', '');
  } else if (existing.status === 'Tamamlandı' && nextStatus !== 'Tamamlandı') {
    logActivity(userId, 'task', String(existing.id), nextTitle, 'Görev yeniden açıldı', `Yeni durum: ${nextStatus}`);
  } else if (nextDue !== existing.due_date) {
    logActivity(userId, 'task', String(existing.id), nextTitle, 'Son tarih değiştirildi', `Tarih: ${nextDue || 'Yok'}`);
  }

  const updated = db
    .prepare(`SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON p.id = t.project_id WHERE t.id = ?`)
    .get(existing.id) as Record<string, unknown>;
  const subs = db
    .prepare(`SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order ASC`)
    .all(existing.id) as Record<string, unknown>[];

  res.json({ task: mapTask(updated, subs) });
});

router.post('/:id/archive', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const task = db
    .prepare(`SELECT id, title, project_id FROM tasks WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as { id: string; title: string; project_id: string | null } | undefined;
  if (!task) {
    res.status(404).json({ error: 'Görev bulunamadı.' });
    return;
  }
  const now = nowIso();
  db.prepare(`UPDATE tasks SET is_archived = 1, archived_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(
    now,
    now,
    task.id,
    userId
  );
  recalculateProjectProgress(userId, task.project_id);
  logActivity(userId, 'task', task.id, task.title, 'Görev arşivlendi', '');
  res.json({ ok: true });
});

router.post('/:id/restore', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const task = db
    .prepare(`SELECT id, title, project_id FROM tasks WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as { id: string; title: string; project_id: string | null } | undefined;
  if (!task) {
    res.status(404).json({ error: 'Görev bulunamadı.' });
    return;
  }
  db.prepare(`UPDATE tasks SET is_archived = 0, archived_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?`).run(
    nowIso(),
    task.id,
    userId
  );
  recalculateProjectProgress(userId, task.project_id);
  logActivity(userId, 'task', task.id, task.title, 'Görev arşivden geri yüklendi', '');
  res.json({ ok: true });
});

router.delete('/:id', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const task = db
    .prepare(`SELECT id, title, project_id FROM tasks WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as { id: string; title: string; project_id: string | null } | undefined;
  if (!task) {
    res.status(404).json({ error: 'Görev bulunamadı.' });
    return;
  }
  db.prepare(`DELETE FROM tasks WHERE id = ? AND user_id = ?`).run(task.id, userId);
  recalculateProjectProgress(userId, task.project_id);
  logActivity(userId, 'task', task.id, task.title, 'Görev silindi', '');
  res.json({ ok: true });
});

// Subtasks
router.post('/:id/subtasks', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const task = db
    .prepare(`SELECT id, project_id FROM tasks WHERE id = ? AND user_id = ?`)
    .get(req.params.id, userId) as { id: string; project_id: string | null } | undefined;
  if (!task) {
    res.status(404).json({ error: 'Ana görev bulunamadı.' });
    return;
  }
  const title = String((req.body as { title?: string }).title || '').trim();
  if (!title) {
    res.status(400).json({ error: 'Alt görev başlığı zorunludur.' });
    return;
  }
  const count = (db.prepare(`SELECT COUNT(*) as c FROM subtasks WHERE task_id = ?`).get(task.id) as { c: number }).c;
  const id = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO subtasks (id, user_id, task_id, title, is_completed, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(id, userId, task.id, title, count, now, now);
  touchProjectActivity(userId, task.project_id);
  const created = db.prepare(`SELECT * FROM subtasks WHERE id = ?`).get(id) as Record<string, unknown>;
  res.status(201).json({ subtask: { ...created, is_completed: Boolean(created.is_completed) } });
});

router.patch('/subtasks/:subtaskId', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const sub = db
    .prepare(`SELECT * FROM subtasks WHERE id = ? AND user_id = ?`)
    .get(req.params.subtaskId, userId) as Record<string, unknown> | undefined;
  if (!sub) {
    res.status(404).json({ error: 'Alt görev bulunamadı.' });
    return;
  }
  const body = req.body as { title?: string; is_completed?: boolean };
  const nextTitle = body.title !== undefined ? body.title.trim() || String(sub.title) : String(sub.title);
  const nextDone = body.is_completed !== undefined ? Boolean(body.is_completed) : Boolean(sub.is_completed);
  db.prepare(`UPDATE subtasks SET title = ?, is_completed = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(
    nextTitle,
    nextDone ? 1 : 0,
    nowIso(),
    sub.id,
    userId
  );
  const updated = db.prepare(`SELECT * FROM subtasks WHERE id = ?`).get(sub.id) as Record<string, unknown>;
  res.json({ subtask: { ...updated, is_completed: Boolean(updated.is_completed) } });
});

router.delete('/subtasks/:subtaskId', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const sub = db.prepare(`SELECT id FROM subtasks WHERE id = ? AND user_id = ?`).get(req.params.subtaskId, userId);
  if (!sub) {
    res.status(404).json({ error: 'Alt görev bulunamadı.' });
    return;
  }
  db.prepare(`DELETE FROM subtasks WHERE id = ? AND user_id = ?`).run(req.params.subtaskId, userId);
  res.json({ ok: true });
});

export default router;
