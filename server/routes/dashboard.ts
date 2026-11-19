import { Router } from 'express';
import { ACTIVE_FOCUS_STATUSES, PROJECT_STATUSES, TASK_STATUSES, type ProjectStatus } from '../../src/types/index.ts';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { computeControlSummary, mapProjectRow, syncWorkspaceNotifications } from '../control.ts';
import { db, ensureUserSettings, parseTags } from '../db.ts';

const router = Router();
router.use(requireAuth);

router.get('/dashboard', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  syncWorkspaceNotifications(userId);

  const today = new Date().toISOString().slice(0, 10);
  const next7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const projectRows = db
    .prepare(`SELECT * FROM projects WHERE user_id = ? AND is_archived = 0`)
    .all(userId) as Record<string, unknown>[];
  const taskRows = db
    .prepare(
      `SELECT t.*, p.name as project_name
       FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.user_id = ? AND t.is_archived = 0`
    )
    .all(userId) as Record<string, unknown>[];

  const totalProjects = projectRows.length;
  const activeProjects = projectRows.filter((p) =>
    ACTIVE_FOCUS_STATUSES.includes(String(p.status) as ProjectStatus)
  ).length;
  const completedProjects = projectRows.filter((p) => p.status === 'Yayınlandı').length;

  const pendingTasks = taskRows.filter((t) => t.status !== 'Tamamlandı').length;
  const completedTasks = taskRows.filter((t) => t.status === 'Tamamlandı').length;
  const overdueTasks = taskRows.filter(
    (t) => t.status !== 'Tamamlandı' && t.due_date && String(t.due_date).slice(0, 10) < today
  ).length;

  // Weekly productivity (last 7 days)
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const completedLast7 = taskRows.filter(
    (t) => t.status === 'Tamamlandı' && t.completed_at && String(t.completed_at) >= sevenDaysAgoIso
  ).length;
  const dueOrActiveThisWeek = taskRows.filter(
    (t) =>
      (t.due_date && String(t.due_date).slice(0, 10) >= today && String(t.due_date).slice(0, 10) <= next7Days) ||
      (t.completed_at && String(t.completed_at) >= sevenDaysAgoIso)
  ).length;
  const weeklyProductivityRate =
    dueOrActiveThisWeek > 0
      ? Math.min(100, Math.round((completedLast7 / dueOrActiveThisWeek) * 100))
      : taskRows.length > 0
        ? Math.round((completedTasks / taskRows.length) * 100)
        : 0;

  const projectStatusDistribution = PROJECT_STATUSES.map((status) => ({
    label: status,
    count: projectRows.filter((p) => p.status === status).length,
  })).filter((d) => d.count > 0);

  const taskStatusDistribution = TASK_STATUSES.map((status) => ({
    label: status,
    count: taskRows.filter((t) => t.status === status).length,
  }));

  // Last 7 days daily completed vs created
  const isEn = String(ensureUserSettings(userId).language || '').toLowerCase().startsWith('en');
  const weeklyProductivitySeries: Array<{ label: string; completed: number; created: number }> = [];
  const dayNames = isEn
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000);
    const dateKey = d.toISOString().slice(0, 10);
    const dayLabel = `${d.getDate()} ${dayNames[d.getDay()]}`;
    const completedCount = taskRows.filter(
      (t) => t.completed_at && String(t.completed_at).slice(0, 10) === dateKey
    ).length;
    const createdCount = taskRows.filter((t) => String(t.created_at).slice(0, 10) === dateKey).length;
    weeklyProductivitySeries.push({ label: dayLabel, completed: completedCount, created: createdCount });
  }

  const projectProgressComparison = projectRows
    .filter((p) => p.status !== 'İptal Edildi')
    .sort((a, b) => Number(b.progress) - Number(a.progress))
    .slice(0, 8)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name),
      progress: Number(p.progress || 0),
      status: String(p.status),
    }));

  const upcomingMilestones = db
    .prepare(
      `SELECT m.*, p.name as project_name
       FROM milestones m JOIN projects p ON p.id = m.project_id
       WHERE m.user_id = ? AND m.is_completed = 0 AND p.is_archived = 0
       ORDER BY CASE WHEN m.due_date IS NULL THEN 1 ELSE 0 END, m.due_date ASC
       LIMIT 6`
    )
    .all(userId) as Record<string, unknown>[];

  const pRank: Record<string, number> = { Kritik: 0, Yüksek: 1, Orta: 2, Düşük: 3 };
  const priorityTasks = taskRows
    .filter((t) => t.status !== 'Tamamlandı')
    .sort((a, b) => {
      const diff = (pRank[String(a.priority)] ?? 9) - (pRank[String(b.priority)] ?? 9);
      if (diff !== 0) return diff;
      return String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31'));
    })
    .slice(0, 6)
    .map((t) => ({
      ...t,
      tags: parseTags(t.tags as string),
      is_archived: Boolean(t.is_archived),
    }));

  const upcomingDeadlines = [
    ...projectRows
      .filter((p) => p.deadline && p.status !== 'Yayınlandı' && p.status !== 'İptal Edildi')
      .map((p) => ({
        id: String(p.id),
        type: 'project' as const,
        title: String(p.name),
        due_date: String(p.deadline).slice(0, 10),
        priority: p.priority,
        project_name: null,
      })),
    ...taskRows
      .filter((t) => t.due_date && t.status !== 'Tamamlandı')
      .map((t) => ({
        id: String(t.id),
        type: 'task' as const,
        title: String(t.title),
        due_date: String(t.due_date).slice(0, 10),
        priority: t.priority,
        project_name: t.project_name ? String(t.project_name) : null,
      })),
    ...upcomingMilestones
      .filter((m) => m.due_date)
      .map((m) => ({
        id: String(m.id),
        type: 'milestone' as const,
        title: String(m.title),
        due_date: String(m.due_date).slice(0, 10),
        priority: 'Yüksek',
        project_name: String(m.project_name),
      })),
  ]
    .filter((d) => d.due_date >= today && d.due_date <= next7Days)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 8);

  const recentActivity = db
    .prepare(`SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`)
    .all(userId);

  const control = computeControlSummary(userId);

  res.json({
    kpis: {
      totalProjects,
      activeProjects,
      completedProjects,
      pendingTasks,
      completedTasks,
      overdueTasks,
      upcomingDeadlinesCount: upcomingDeadlines.length,
      weeklyProductivityRate,
    },
    projectStatusDistribution,
    taskStatusDistribution,
    weeklyProductivitySeries,
    projectProgressComparison,
    upcomingMilestones: upcomingMilestones.map((m) => ({
      ...m,
      is_completed: Boolean(m.is_completed),
    })),
    priorityTasks,
    upcomingDeadlines,
    recentActivity,
    control,
  });
});

router.get('/analytics', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const range = typeof req.query.range === 'string' ? req.query.range : '30d';
  const daysBack = range === '7d' ? 7 : range === '90d' ? 90 : range === 'all' ? 3650 : 30;
  const sinceIso = new Date(Date.now() - daysBack * 86400000).toISOString();
  const today = new Date().toISOString().slice(0, 10);

  const projects = db
    .prepare(`SELECT * FROM projects WHERE user_id = ? AND is_archived = 0`)
    .all(userId) as Record<string, unknown>[];
  const tasks = db
    .prepare(`SELECT * FROM tasks WHERE user_id = ? AND is_archived = 0`)
    .all(userId) as Record<string, unknown>[];
  const activities = db
    .prepare(`SELECT * FROM activity_logs WHERE user_id = ? AND created_at >= ?`)
    .all(userId, sinceIso) as Record<string, unknown>[];

  const scopedTasks = range === 'all' ? tasks : tasks.filter((t) => String(t.created_at) >= sinceIso);
  const completedTasksCount = scopedTasks.filter((t) => t.status === 'Tamamlandı').length;
  const taskCompletionRate =
    scopedTasks.length > 0 ? Math.round((completedTasksCount / scopedTasks.length) * 100) : 0;

  const completedProjectsCount = projects.filter((p) => p.status === 'Yayınlandı').length;
  const projectCompletionRate =
    projects.length > 0 ? Math.round((completedProjectsCount / projects.length) * 100) : 0;

  const overdueCount = tasks.filter(
    (t) => t.status !== 'Tamamlandı' && t.due_date && String(t.due_date).slice(0, 10) < today
  ).length;
  const openTasksCount = tasks.filter((t) => t.status !== 'Tamamlandı').length;
  const overdueRate = openTasksCount > 0 ? Math.round((overdueCount / openTasksCount) * 100) : 0;

  const totalEstimatedMinutes = scopedTasks.reduce((sum, t) => sum + Number(t.estimated_minutes || 0), 0);
  const totalActualMinutes = scopedTasks.reduce((sum, t) => sum + Number(t.actual_minutes || 0), 0);

  const overallProductivity = Math.round(
    taskCompletionRate * 0.55 + projectCompletionRate * 0.25 + (100 - overdueRate) * 0.2
  );

  // Activity trend over buckets (last 14 days or 6 months)
  const buckets: Array<{ label: string; completed: number; activities: number }> = [];
  const bucketCount = range === '7d' ? 7 : 14;
  for (let i = bucketCount - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const label = `${d.getDate()}/${d.getMonth() + 1}`;
    buckets.push({
      label,
      completed: tasks.filter((t) => t.completed_at && String(t.completed_at).slice(0, 10) === key).length,
      activities: activities.filter((a) => String(a.created_at).slice(0, 10) === key).length,
    });
  }

  const projectStatusDistribution = PROJECT_STATUSES.map((status) => ({
    label: status,
    count: projects.filter((p) => p.status === status).length,
  })).filter((d) => d.count > 0);

  const projectComparison = projects.map((p) => {
    const pTasks = tasks.filter((t) => t.project_id === p.id);
    const pDone = pTasks.filter((t) => t.status === 'Tamamlandı').length;
    const pOverdue = pTasks.filter(
      (t) => t.status !== 'Tamamlandı' && t.due_date && String(t.due_date).slice(0, 10) < today
    ).length;
    const est = pTasks.reduce((s, t) => s + Number(t.estimated_minutes || 0), 0);
    const act = pTasks.reduce((s, t) => s + Number(t.actual_minutes || 0), 0);
    return {
      ...mapProjectRow(p),
      totalTasks: pTasks.length,
      completedTasks: pDone,
      overdueTasks: pOverdue,
      estimatedMinutes: est,
      actualMinutes: act,
    };
  });

  res.json({
    range,
    summary: {
      overallProductivity: projects.length === 0 && tasks.length === 0 ? 0 : overallProductivity,
      projectCompletionRate,
      taskCompletionRate,
      overdueCount,
      overdueRate,
      totalEstimatedMinutes,
      totalActualMinutes,
      totalActivitiesInRange: activities.length,
    },
    projectStatusDistribution,
    trendSeries: buckets,
    projectComparison,
  });
});

router.get('/control', (req: AuthenticatedRequest, res) => {
  res.json({ control: computeControlSummary(req.userId!) });
});

function toCsv(headers: string[], rows: unknown[][]): string {
  const escape = (val: unknown) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return '\uFEFF' + [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

router.get('/export', (req: AuthenticatedRequest, res) => {
  const userId = req.userId!;
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const entity = typeof req.query.entity === 'string' ? req.query.entity : 'all';

  const projects = db.prepare(`SELECT * FROM projects WHERE user_id = ?`).all(userId) as Record<string, unknown>[];
  const tasks = db.prepare(`SELECT * FROM tasks WHERE user_id = ?`).all(userId) as Record<string, unknown>[];
  const subtasks = db.prepare(`SELECT * FROM subtasks WHERE user_id = ?`).all(userId) as Record<string, unknown>[];
  const ideas = db.prepare(`SELECT * FROM ideas WHERE user_id = ?`).all(userId) as Record<string, unknown>[];
  const milestones = db.prepare(`SELECT * FROM milestones WHERE user_id = ?`).all(userId) as Record<string, unknown>[];
  const notes = db.prepare(`SELECT * FROM notes WHERE user_id = ?`).all(userId) as Record<string, unknown>[];
  const reminders = db.prepare(`SELECT * FROM reminders WHERE user_id = ?`).all(userId) as Record<string, unknown>[];

  if (format === 'csv') {
    const isEn = String(ensureUserSettings(userId).language || '').toLowerCase().startsWith('en');
    const yes = isEn ? 'Yes' : 'Evet';
    const no = isEn ? 'No' : 'Hayır';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    if (entity === 'tasks') {
      res.setHeader('Content-Disposition', `attachment; filename="${isEn ? 'noah-tasks.csv' : 'noah-gorevler.csv'}"`);
      res.send(
        toCsv(
          isEn
            ? ['ID', 'Title', 'Status', 'Priority', 'Due Date', 'Estimated Min', 'Actual Min', 'Archived']
            : ['ID', 'Başlık', 'Durum', 'Öncelik', 'Son Tarih', 'Tahmini Dk', 'Gerçek Dk', 'Arşivli'],
          tasks.map((t) => [
            t.id,
            t.title,
            t.status,
            t.priority,
            t.due_date || '',
            t.estimated_minutes,
            t.actual_minutes,
            t.is_archived ? yes : no,
          ])
        )
      );
      return;
    }
    if (entity === 'ideas') {
      res.setHeader('Content-Disposition', `attachment; filename="${isEn ? 'noah-ideas.csv' : 'noah-fikirler.csv'}"`);
      res.send(
        toCsv(
          isEn
            ? ['ID', 'Title', 'Category', 'Potential', 'Difficulty', 'Priority', 'Converted']
            : ['ID', 'Başlık', 'Kategori', 'Potansiyel', 'Zorluk', 'Öncelik', 'Dönüştürüldü'],
          ideas.map((i) => [
            i.id,
            i.title,
            i.category,
            i.potential,
            i.estimated_difficulty,
            i.priority,
            i.converted_project_id ? yes : no,
          ])
        )
      );
      return;
    }
    res.setHeader('Content-Disposition', `attachment; filename="${isEn ? 'noah-projects.csv' : 'noah-projeler.csv'}"`);
    res.send(
      toCsv(
        isEn
          ? ['ID', 'Project Name', 'Category', 'Status', 'Priority', 'Progress (%)', 'Deadline', 'Archived']
          : ['ID', 'Proje Adı', 'Kategori', 'Durum', 'Öncelik', 'İlerleme (%)', 'Teslim Tarihi', 'Arşivli'],
        projects.map((p) => [
          p.id,
          p.name,
          p.category,
          p.status,
          p.priority,
          p.progress,
          p.deadline || '',
          p.is_archived ? yes : no,
        ])
      )
    );
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="noah-yedek.json"');
  res.send(
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        application: 'Noah Command Center',
        projects,
        tasks,
        subtasks,
        ideas,
        milestones,
        notes,
        reminders,
      },
      null,
      2
    )
  );
});

export default router;
