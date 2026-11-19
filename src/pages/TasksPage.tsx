import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  CheckSquare,
  Circle,
  Edit3,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../lib/api';
import { PRIORITY_LEVELS, TASK_STATUSES, type Project, type Subtask, type Task, type TaskStatus } from '../types';
import {
  formatDateTr,
  formatMinutesTr,
  isOverdue,
  priorityTextClass,
  statusTextClass,
} from '../utils/format';

interface TasksPageProps {
  projects: Project[];
  onOpenNewTask: () => void;
  onEditTask: (task: Task) => void;
  refreshSignal: number;
  onDataChanged: () => void;
}

export function TasksPage({
  projects,
  onOpenNewTask,
  onEditTask,
  refreshSignal,
  onDataChanged,
}: TasksPageProps) {
  const { showToast } = useToast();
  const { lang, l, tTaskStatus, tPriority } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState('priority_due');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ archived: '0', sort });
      if (projectFilter) params.set('project_id', projectFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (overdueOnly) params.set('overdue', '1');
      if (search.trim()) params.set('search', search.trim());
      const res = await apiRequest<{ tasks: Task[] }>(`/api/tasks?${params.toString()}`);
      setTasks(res.tasks);
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Görevler yüklenemedi.', 'Failed to load tasks.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [projectFilter, statusFilter, priorityFilter, overdueOnly, search, sort, showToast, l]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks, refreshSignal]);

  const handleStatusChange = async (task: Task, nextStatus: TaskStatus) => {
    try {
      await apiRequest(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      showToast(
        nextStatus === 'Tamamlandı'
          ? l(`"${task.title}" tamamlandı.`, `"${task.title}" completed.`)
          : l(`Durum "${tTaskStatus(nextStatus)}" olarak güncellendi.`, `Status updated to "${tTaskStatus(nextStatus)}".`)
      );
      onDataChanged();
      loadTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Görev güncellenemedi.', 'Failed to update task.'), 'error');
    }
  };

  const handleArchive = async (task: Task) => {
    try {
      await apiRequest(`/api/tasks/${task.id}/archive`, { method: 'POST' });
      showToast(l('Görev arşivlendi.', 'Task archived.'));
      onDataChanged();
      loadTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Görev arşivlenemedi.', 'Failed to archive task.'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/tasks/${deleteTarget.id}`, { method: 'DELETE' });
      showToast(l('Görev silindi.', 'Task deleted.'));
      setDeleteTarget(null);
      onDataChanged();
      loadTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Görev silinemedi.', 'Failed to delete task.'), 'error');
    }
  };

  const handleAddSubtask = async (taskId: string) => {
    if (!newSubtaskTitle.trim()) return;
    try {
      await apiRequest(`/api/tasks/${taskId}/subtasks`, {
        method: 'POST',
        body: JSON.stringify({ title: newSubtaskTitle.trim() }),
      });
      setNewSubtaskTitle('');
      loadTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Alt görev eklenemedi.', 'Failed to add subtask.'), 'error');
    }
  };

  const handleToggleSubtask = async (sub: Subtask) => {
    try {
      await apiRequest(`/api/tasks/subtasks/${sub.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_completed: !sub.is_completed }),
      });
      loadTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Alt görev güncellenemedi.', 'Failed to update subtask.'), 'error');
    }
  };

  const handleDeleteSubtask = async (subId: string) => {
    try {
      await apiRequest(`/api/tasks/subtasks/${subId}`, { method: 'DELETE' });
      loadTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Alt görev silinemedi.', 'Failed to delete subtask.'), 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={l('Görev, proje veya etiket ara...', 'Search task, project, or tag...')}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            />
          </div>

          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
          >
            <option value="">{l('Tüm Projeler', 'All Projects')}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
          >
            <option value="">{l('Tüm Durumlar', 'All Statuses')}</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tTaskStatus(s)}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
          >
            <option value="">{l('Tüm Öncelikler', 'All Priorities')}</option>
            {PRIORITY_LEVELS.map((p) => (
              <option key={p} value={p}>
                {tPriority(p)}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
          >
            <option value="priority_due">{l('Öncelik ve Tarihe Göre', 'By Priority & Due Date')}</option>
            <option value="due_asc">{l('Son Tarihe Göre', 'By Due Date')}</option>
            <option value="created_desc">{l('En Yeni', 'Newest')}</option>
          </select>

          <button
            type="button"
            onClick={() => setOverdueOnly((v) => !v)}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              overdueOnly
                ? 'border-rose-500/50 bg-rose-500/15 text-rose-400'
                : 'border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {l('Yalnızca Gecikenler', 'Overdue Only')}
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 text-xs font-medium rounded-md ${
                viewMode === 'list' ? 'bg-white dark:bg-[#101827] text-[#38BDF8]' : 'text-slate-500'
              }`}
            >
              {l('Liste', 'List')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1 text-xs font-medium rounded-md ${
                viewMode === 'kanban' ? 'bg-white dark:bg-[#101827] text-[#38BDF8]' : 'text-slate-500'
              }`}
            >
              {l('Pano', 'Board')}
            </button>
          </div>
          <button
            type="button"
            onClick={onOpenNewTask}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#2563EB] hover:bg-blue-500 text-white whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {l('Yeni Görev', 'New Task')}
          </button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title={l('Görev bulunamadı', 'No tasks found')}
          description={l(
            'Seçili filtrelere uygun görev yok veya henüz görev oluşturulmadı.',
            'No tasks match the selected filters, or none have been created yet.'
          )}
          actionLabel={l('İlk Görevi Ekle', 'Add First Task')}
          onAction={onOpenNewTask}
        />
      ) : viewMode === 'list' ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] divide-y divide-slate-200 dark:divide-slate-800/80">
          {tasks.map((task) => {
            const overdue = isOverdue(task.due_date, task.status);
            const subs = task.subtasks || [];
            const doneSubs = subs.filter((s) => s.is_completed).length;
            const isExpanded = expandedTaskId === task.id;
            return (
              <div key={task.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() =>
                        handleStatusChange(task, task.status === 'Tamamlandı' ? 'Yapılacak' : 'Tamamlandı')
                      }
                      className="mt-0.5 text-slate-400 hover:text-emerald-400 transition-colors shrink-0"
                      title={
                        task.status === 'Tamamlandı'
                          ? l('Görevi yeniden aç', 'Reopen task')
                          : l('Görevi tamamla', 'Complete task')
                      }
                    >
                      {task.status === 'Tamamlandı' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                          className={`text-sm font-semibold text-left hover:text-[#38BDF8] transition-colors ${
                            task.status === 'Tamamlandı' ? 'line-through text-slate-500' : ''
                          }`}
                        >
                          {task.title}
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <span className={statusTextClass(task.status)}>{tTaskStatus(task.status)}</span>
                        <span>·</span>
                        <span className={priorityTextClass(task.priority)}>{tPriority(task.priority)}</span>
                        {task.project_name && (
                          <>
                            <span>·</span>
                            <span>{task.project_name}</span>
                          </>
                        )}
                        {task.due_date && (
                          <>
                            <span>·</span>
                            <span className={overdue ? 'text-rose-400 font-semibold' : ''}>
                              {overdue ? l('Gecikti: ', 'Overdue: ') : l('Son Tarih: ', 'Due: ')}
                              {formatDateTr(task.due_date, lang)}
                            </span>
                          </>
                        )}
                        {(task.estimated_minutes > 0 || task.actual_minutes > 0) && (
                          <>
                            <span>·</span>
                            <span className="font-mono tabular-nums">
                              {l('Süre', 'Time')}: {formatMinutesTr(task.actual_minutes, lang)} /{' '}
                              {formatMinutesTr(task.estimated_minutes, lang)}
                            </span>
                          </>
                        )}
                        {subs.length > 0 && (
                          <>
                            <span>·</span>
                            <span className="font-mono tabular-nums">
                              {l('Alt Görev', 'Subtasks')}: {doneSubs}/{subs.length}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 pl-8 sm:pl-0">
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
                    >
                      {TASK_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {tTaskStatus(s)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-800 hover:border-[#38BDF8] text-slate-600 dark:text-slate-300"
                    >
                      {l('Alt Görevler', 'Subtasks')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditTask(task)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70"
                      title={l('Düzenle', 'Edit')}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchive(task)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400"
                      title={l('Arşivle', 'Archive')}
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(task)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400"
                      title={l('Sil', 'Delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 ml-8 pl-4 border-l border-slate-300 dark:border-slate-800 space-y-2.5">
                    {task.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400">{task.description}</p>
                    )}
                    <div className="space-y-1.5">
                      {subs.map((sub) => (
                        <div key={sub.id} className="flex items-center justify-between text-xs">
                          <button
                            type="button"
                            onClick={() => handleToggleSubtask(sub)}
                            className="flex items-center gap-2 text-left"
                          >
                            {sub.is_completed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Circle className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span className={sub.is_completed ? 'line-through text-slate-500' : ''}>
                              {sub.title}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubtask(sub.id)}
                            className="text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubtask(task.id);
                          }
                        }}
                        placeholder={l('Yeni alt görev ekle...', 'Add new subtask...')}
                        className="flex-1 max-w-sm px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddSubtask(task.id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2563EB] text-white"
                      >
                        {l('Ekle', 'Add')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {TASK_STATUSES.map((colStatus) => {
            const colTasks = tasks.filter((t) => t.status === colStatus);
            return (
              <div
                key={colStatus}
                className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <span className={`text-sm font-semibold ${statusTextClass(colStatus)}`}>
                    {tTaskStatus(colStatus)}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-500">{colTasks.length}</span>
                </div>
                <div className="space-y-2.5">
                  {colTasks.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">{l('Görev yok', 'No tasks')}</p>
                  ) : (
                    colTasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold leading-snug">{task.title}</span>
                          <button
                            type="button"
                            onClick={() => onEditTask(task)}
                            className="text-slate-400 hover:text-[#38BDF8] shrink-0"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center justify-between">
                          <span className={priorityTextClass(task.priority)}>{tPriority(task.priority)}</span>
                          <span className="font-mono tabular-nums">
                            {task.due_date ? formatDateTr(task.due_date, lang) : l('Tarihsiz', 'No date')}
                          </span>
                        </div>
                        <select
                          value={task.status}
                          onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                          className="w-full px-2 py-1 text-[11px] rounded-lg bg-white dark:bg-[#101827] border border-slate-300 dark:border-slate-800"
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {tTaskStatus(s)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={l('Görevi Sil', 'Delete Task')}
        description={l(
          `"${deleteTarget?.title}" görevini kalıcı olarak silmek istediğinize emin misiniz?`,
          `Are you sure you want to permanently delete "${deleteTarget?.title}"?`
        )}
        confirmLabel={l('Sil', 'Delete')}
      />
    </div>
  );
}
