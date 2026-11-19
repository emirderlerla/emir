import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const defaultNoahsDbPath = path.resolve(process.cwd(), 'data', 'noah.db');
const legacyEmirDbPath = path.resolve(process.cwd(), 'data', 'emir7.db');
if (!process.env.SQLITE_PATH && !fs.existsSync(defaultNoahsDbPath) && fs.existsSync(legacyEmirDbPath)) {
  fs.mkdirSync(path.dirname(defaultNoahsDbPath), { recursive: true });
  fs.copyFileSync(legacyEmirDbPath, defaultNoahsDbPath);
}

const dbPath = process.env.SQLITE_PATH || defaultNoahsDbPath;
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL DEFAULT 'Noah',
      role_title TEXT NOT NULL DEFAULT 'Kurucu & Sistem Mimarı',
      avatar_url TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      max_active_projects INTEGER NOT NULL DEFAULT 3,
      allow_limit_override INTEGER NOT NULL DEFAULT 1,
      inactive_days_threshold INTEGER NOT NULL DEFAULT 7,
      theme TEXT NOT NULL DEFAULT 'dark',
      language TEXT NOT NULL DEFAULT 'tr-TR',
      ai_persona TEXT NOT NULL DEFAULT 'stratejik',
      ai_auto_daily_summary INTEGER NOT NULL DEFAULT 1,
      notify_overdue INTEGER NOT NULL DEFAULT 1,
      notify_upcoming_days INTEGER NOT NULL DEFAULT 3,
      notify_inactive_projects INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Genel',
      priority TEXT NOT NULL DEFAULT 'Orta',
      status TEXT NOT NULL DEFAULT 'Planlama',
      start_date TEXT,
      deadline TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      is_archived INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects(user_id, status, is_archived);
    CREATE INDEX IF NOT EXISTS idx_projects_deadline ON projects(user_id, deadline);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'Orta',
      status TEXT NOT NULL DEFAULT 'Yapılacak',
      start_date TEXT,
      due_date TEXT,
      estimated_minutes INTEGER NOT NULL DEFAULT 0,
      actual_minutes INTEGER NOT NULL DEFAULT 0,
      tags TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_user_project ON tasks(user_id, project_id, is_archived);
    CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(user_id, status, due_date);

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id, sort_order);

    CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Ürün',
      potential INTEGER NOT NULL DEFAULT 3,
      estimated_difficulty TEXT NOT NULL DEFAULT 'Orta',
      priority TEXT NOT NULL DEFAULT 'Orta',
      tags TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      converted_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      is_archived INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ideas_user ON ideas(user_id, is_archived);

    CREATE TABLE IF NOT EXISTS milestones (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id, due_date);

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notes_user_links ON notes(user_id, project_id, task_id);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_links ON attachments(user_id, project_id, task_id, note_id);

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_title TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Yeni Sohbet',
      model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      pending_action TEXT,
      action_status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages(conversation_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      remind_at TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id, remind_at, is_completed);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
  `);

  db.prepare(`UPDATE profiles SET full_name = 'Noah' WHERE full_name = 'Emir'`).run();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function logActivity(
  userId: string,
  entityType: string,
  entityId: string,
  entityTitle: string,
  action: string,
  details = ''
): void {
  db.prepare(
    `INSERT INTO activity_logs (id, user_id, entity_type, entity_id, entity_title, action, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(newId(), userId, entityType, entityId, entityTitle, action, details, nowIso());
}

export function touchProjectActivity(userId: string, projectId: string | null | undefined): void {
  if (!projectId) return;
  const now = nowIso();
  db.prepare(`UPDATE projects SET last_activity_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(
    now,
    now,
    projectId,
    userId
  );
}

export function recalculateProjectProgress(userId: string, projectId: string | null | undefined): void {
  if (!projectId) return;
  const row = db
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'Tamamlandı' THEN 1 ELSE 0 END) as completed
       FROM tasks
       WHERE user_id = ? AND project_id = ? AND is_archived = 0`
    )
    .get(userId, projectId) as { total: number; completed: number | null };

  if (row && row.total > 0) {
    const progress = Math.round(((row.completed ?? 0) / row.total) * 100);
    db.prepare(`UPDATE projects SET progress = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(
      progress,
      nowIso(),
      projectId,
      userId
    );
  }
}

export function createNotificationIfNotExists(
  userId: string,
  type: string,
  title: string,
  message: string,
  entityType: string | null,
  entityId: string | null
): void {
  const existing = db
    .prepare(
      `SELECT id FROM notifications
       WHERE user_id = ? AND type = ? AND COALESCE(entity_id, '') = COALESCE(?, '') AND is_read = 0
       LIMIT 1`
    )
    .get(userId, type, entityId);
  if (!existing) {
    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, message, entity_type, entity_id, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(newId(), userId, type, title, message, entityType, entityId, nowIso());
  }
}

export function ensureUserSettings(userId: string) {
  let settings = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(userId) as
    | Record<string, unknown>
    | undefined;
  if (!settings) {
    const id = newId();
    db.prepare(
      `INSERT INTO user_settings (id, user_id, max_active_projects, allow_limit_override, inactive_days_threshold, theme, language, ai_persona, ai_auto_daily_summary, notify_overdue, notify_upcoming_days, notify_inactive_projects, updated_at)
       VALUES (?, ?, 3, 1, 7, 'dark', 'tr-TR', 'stratejik', 1, 1, 3, 1, ?)`
    ).run(id, userId, nowIso());
    settings = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(userId) as Record<
      string,
      unknown
    >;
  }
  return {
    id: String(settings.id),
    user_id: String(settings.user_id),
    max_active_projects: Number(settings.max_active_projects),
    allow_limit_override: Boolean(settings.allow_limit_override),
    inactive_days_threshold: Number(settings.inactive_days_threshold),
    theme: (settings.theme as 'dark' | 'slate' | 'light') || 'dark',
    language: String(settings.language || 'tr-TR'),
    ai_persona: String(settings.ai_persona || 'stratejik'),
    ai_auto_daily_summary: Boolean(settings.ai_auto_daily_summary),
    notify_overdue: Boolean(settings.notify_overdue),
    notify_upcoming_days: Number(settings.notify_upcoming_days),
    notify_inactive_projects: Boolean(settings.notify_inactive_projects),
    updated_at: String(settings.updated_at),
  };
}
