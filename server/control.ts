import { ACTIVE_FOCUS_STATUSES, type ControlProjectRisk, type ControlSummary, type Project } from '../src/types/index.ts';
import { createNotificationIfNotExists, db, ensureUserSettings, parseTags } from './db.ts';

function toDateOnly(isoOrDate: string | null | undefined): string | null {
  if (!isoOrDate) return null;
  return isoOrDate.slice(0, 10);
}

export function mapProjectRow(row: Record<string, unknown>, extra?: Partial<Project>): Project {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    description: String(row.description || ''),
    category: String(row.category || 'Genel'),
    priority: row.priority as Project['priority'],
    status: row.status as Project['status'],
    start_date: row.start_date ? String(row.start_date) : null,
    deadline: row.deadline ? String(row.deadline) : null,
    progress: Number(row.progress || 0),
    tags: parseTags(row.tags as string),
    is_archived: Boolean(row.is_archived),
    archived_at: row.archived_at ? String(row.archived_at) : null,
    last_activity_at: String(row.last_activity_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    ...extra,
  };
}

export function computeControlSummary(userId: string): ControlSummary {
  const settings = ensureUserSettings(userId);
  const isEn = String(settings.language || '').toLowerCase().startsWith('en');
  const today = new Date().toISOString().slice(0, 10);
  const nowMs = Date.now();

  const projectRows = db
    .prepare(`SELECT * FROM projects WHERE user_id = ? AND is_archived = 0 ORDER BY updated_at DESC`)
    .all(userId) as Record<string, unknown>[];

  const taskRows = db
    .prepare(`SELECT * FROM tasks WHERE user_id = ? AND is_archived = 0`)
    .all(userId) as Record<string, unknown>[];

  const activeFocusProjects = projectRows.filter((p) =>
    ACTIVE_FOCUS_STATUSES.includes(String(p.status) as Project['status'])
  );

  let totalOverdueTasks = 0;
  for (const t of taskRows) {
    const due = toDateOnly(t.due_date as string | null);
    if (due && due < today && t.status !== 'Tamamlandı') {
      totalOverdueTasks += 1;
    }
  }

  const atRiskProjects: ControlProjectRisk[] = [];
  let projectsWithoutNextAction = 0;
  let inactiveProjectsCount = 0;

  for (const pRow of projectRows) {
    const status = String(pRow.status) as Project['status'];
    if (status === 'Yayınlandı' || status === 'İptal Edildi' || status === 'Donduruldu') {
      continue;
    }

    const projectId = String(pRow.id);
    const relatedTasks = taskRows.filter((t) => String(t.project_id || '') === projectId);
    const openTasks = relatedTasks.filter((t) => t.status !== 'Tamamlandı');
    const overdueTasks = openTasks.filter((t) => {
      const due = toDateOnly(t.due_date as string | null);
      return Boolean(due && due < today);
    }).length;

    const nextTask = openTasks.sort((a, b) => {
      const pOrder: Record<string, number> = { Kritik: 0, Yüksek: 1, Orta: 2, Düşük: 3 };
      const diff = (pOrder[String(a.priority)] ?? 9) - (pOrder[String(b.priority)] ?? 9);
      if (diff !== 0) return diff;
      return String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31'));
    })[0];

    const hasNextAction = Boolean(nextTask);
    const nextActionTitle = nextTask ? String(nextTask.title) : null;

    const lastActivityMs = new Date(String(pRow.last_activity_at || pRow.updated_at)).getTime();
    const daysSinceActivity = Math.max(0, Math.floor((nowMs - lastActivityMs) / (1000 * 60 * 60 * 24)));

    const riskReasons: string[] = [];
    let riskScore = 0;

    if (ACTIVE_FOCUS_STATUSES.includes(status) && !hasNextAction) {
      projectsWithoutNextAction += 1;
      riskReasons.push(
        isEn ? 'No defined next action (open task)' : 'Tanımlı sonraki adım (açık görev) bulunmuyor'
      );
      riskScore += 30;
    }

    if (overdueTasks > 0) {
      riskReasons.push(
        isEn
          ? `${overdueTasks} overdue task${overdueTasks > 1 ? 's' : ''}`
          : `${overdueTasks} gecikmiş görev var`
      );
      riskScore += overdueTasks * 25;
    }

    if (daysSinceActivity >= settings.inactive_days_threshold) {
      inactiveProjectsCount += 1;
      riskReasons.push(
        isEn ? `No activity for ${daysSinceActivity} days` : `${daysSinceActivity} gündür aktivite yok`
      );
      riskScore += 25;
    }

    const deadline = toDateOnly(pRow.deadline as string | null);
    if (deadline) {
      const diffDays = Math.ceil((new Date(deadline).getTime() - nowMs) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        riskReasons.push(isEn ? 'Project deadline has passed' : 'Proje teslim tarihi geçmiş');
        riskScore += 45;
      } else if (diffDays <= settings.notify_upcoming_days && Number(pRow.progress) < 85) {
        riskReasons.push(
          isEn
            ? `${diffDays} day(s) until deadline (progress ${Number(pRow.progress)}%)`
            : `Teslime ${diffDays} gün kaldı (ilerleme %${Number(pRow.progress)})`
        );
        riskScore += 25;
      }
    }

    if (pRow.priority === 'Kritik') riskScore += 15;
    else if (pRow.priority === 'Yüksek') riskScore += 8;

    const project = mapProjectRow(pRow, {
      task_count: relatedTasks.length,
      completed_task_count: relatedTasks.filter((t) => t.status === 'Tamamlandı').length,
      overdue_task_count: overdueTasks,
      next_action: nextActionTitle,
    });

    if (riskReasons.length > 0 || ACTIVE_FOCUS_STATUSES.includes(status)) {
      atRiskProjects.push({
        project,
        riskReasons,
        riskScore,
        daysSinceActivity,
        overdueTasks,
        hasNextAction,
        nextActionTitle,
      });
    }
  }

  atRiskProjects.sort((a, b) => b.riskScore - a.riskScore);
  const flaggedAtRisk = atRiskProjects.filter((item) => item.riskReasons.length > 0);
  const recommendedAttentionProject = flaggedAtRisk[0] ?? atRiskProjects[0] ?? null;

  return {
    activeFocusCount: activeFocusProjects.length,
    maxActiveProjects: settings.max_active_projects,
    allowLimitOverride: settings.allow_limit_override,
    isOverLimit: activeFocusProjects.length > settings.max_active_projects,
    inactiveThresholdDays: settings.inactive_days_threshold,
    atRiskProjects: flaggedAtRisk,
    recommendedAttentionProject,
    totalOverdueTasks,
    projectsWithoutNextAction,
    inactiveProjectsCount,
  };
}

export function syncWorkspaceNotifications(userId: string): void {
  const settings = ensureUserSettings(userId);
  const isEn = String(settings.language || '').toLowerCase().startsWith('en');
  const today = new Date().toISOString().slice(0, 10);
  const upcomingLimit = new Date(Date.now() + settings.notify_upcoming_days * 86400000)
    .toISOString()
    .slice(0, 10);

  if (settings.notify_overdue) {
    const overdueTasks = db
      .prepare(
        `SELECT id, title, due_date FROM tasks
         WHERE user_id = ? AND is_archived = 0 AND status != 'Tamamlandı' AND due_date IS NOT NULL AND due_date < ?`
      )
      .all(userId, today) as { id: string; title: string; due_date: string }[];

    for (const task of overdueTasks.slice(0, 10)) {
      createNotificationIfNotExists(
        userId,
        'overdue',
        isEn ? 'Overdue Task' : 'Gecikmiş Görev',
        isEn
          ? `Task "${task.title}" passed its due date (${task.due_date}).`
          : `"${task.title}" görevinin son tarihi (${task.due_date}) geçti.`,
        'task',
        task.id
      );
    }
  }

  const upcomingTasks = db
    .prepare(
      `SELECT id, title, due_date FROM tasks
       WHERE user_id = ? AND is_archived = 0 AND status != 'Tamamlandı' AND due_date >= ? AND due_date <= ?`
    )
    .all(userId, today, upcomingLimit) as { id: string; title: string; due_date: string }[];

  for (const task of upcomingTasks.slice(0, 10)) {
    createNotificationIfNotExists(
      userId,
      'deadline',
      isEn ? 'Upcoming Task Deadline' : 'Yaklaşan Görev Tarihi',
      isEn
        ? `Task "${task.title}" is due on ${task.due_date}.`
        : `"${task.title}" görevi ${task.due_date} tarihinde tamamlanmalı.`,
      'task',
      task.id
    );
  }

  const upcomingMilestones = db
    .prepare(
      `SELECT m.id, m.title, m.due_date, p.name as project_name
       FROM milestones m
       JOIN projects p ON p.id = m.project_id
       WHERE m.user_id = ? AND m.is_completed = 0 AND p.is_archived = 0 AND m.due_date >= ? AND m.due_date <= ?`
    )
    .all(userId, today, upcomingLimit) as {
    id: string;
    title: string;
    due_date: string;
    project_name: string;
  }[];

  for (const m of upcomingMilestones.slice(0, 10)) {
    createNotificationIfNotExists(
      userId,
      'milestone',
      isEn ? 'Upcoming Milestone' : 'Yaklaşan Kilometre Taşı',
      isEn
        ? `Milestone "${m.title}" in project "${m.project_name}" is scheduled for ${m.due_date}.`
        : `"${m.project_name}" projesindeki "${m.title}" kilometre taşı ${m.due_date} tarihinde.`,
      'milestone',
      m.id
    );
  }

  if (settings.notify_inactive_projects) {
    const control = computeControlSummary(userId);
    for (const item of control.atRiskProjects) {
      if (item.daysSinceActivity >= settings.inactive_days_threshold) {
        createNotificationIfNotExists(
          userId,
          'inactive',
          isEn ? 'Inactive Project Alert' : 'Pasif Proje Uyarısı',
          isEn
            ? `No activity detected in "${item.project.name}" for ${item.daysSinceActivity} days.`
            : `"${item.project.name}" projesinde ${item.daysSinceActivity} gündür aktivite tespit edilmedi.`,
          'project',
          item.project.id
        );
      }
    }
    if (control.isOverLimit) {
      createNotificationIfNotExists(
        userId,
        'control',
        isEn ? 'Active Focus Limit Exceeded' : 'Aktif Odak Limiti Aşıldı',
        isEn
          ? `You currently have ${control.activeFocusCount} active focus projects (limit: ${control.maxActiveProjects}).`
          : `Şu anda ${control.activeFocusCount} aktif odak projeniz var (limit: ${control.maxActiveProjects}).`,
        'control',
        'focus-limit'
      );
    }
  }
}
