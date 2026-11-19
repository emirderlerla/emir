import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  Edit3,
  FolderKanban,
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
import { PRIORITY_LEVELS, PROJECT_STATUSES, type Project } from '../types';
import { formatDateTr, isOverdue, priorityTextClass, statusTextClass } from '../utils/format';

interface ProjectsPageProps {
  onOpenNewProject: () => void;
  onEditProject: (project: Project) => void;
  onOpenProjectDetail: (projectId: string) => void;
  refreshSignal: number;
  onDataChanged: () => void;
}

export function ProjectsPage({
  onOpenNewProject,
  onEditProject,
  onOpenProjectDetail,
  refreshSignal,
  onDataChanged,
}: ProjectsPageProps) {
  const { showToast } = useToast();
  const { lang, isEn, l, tProjectStatus, tPriority } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sort, setSort] = useState('updated_desc');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ archived: '0', sort });
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiRequest<{ projects: Project[] }>(`/api/projects?${params.toString()}`);
      setProjects(res.projects);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Projeler yüklenemedi.', 'Failed to load projects.'),
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, priorityFilter, sort, showToast, l]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects, refreshSignal]);

  const handleArchive = async (project: Project) => {
    try {
      await apiRequest(`/api/projects/${project.id}/archive`, { method: 'POST' });
      showToast(l(`"${project.name}" arşivlendi.`, `"${project.name}" archived.`));
      onDataChanged();
      loadProjects();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Proje arşivlenemedi.', 'Failed to archive project.'),
        'error'
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/projects/${deleteTarget.id}`, { method: 'DELETE' });
      showToast(
        l(`"${deleteTarget.name}" kalıcı olarak silindi.`, `"${deleteTarget.name}" permanently deleted.`)
      );
      setDeleteTarget(null);
      onDataChanged();
      loadProjects();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Proje silinemedi.', 'Failed to delete project.'),
        'error'
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={l('Proje, kategori veya etiket ara...', 'Search project, category, or tag...')}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
          >
            <option value="">{l('Tüm Durumlar', 'All Statuses')}</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tProjectStatus(s)}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
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
            className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
          >
            <option value="updated_desc">{l('Son Güncelleme', 'Last Updated')}</option>
            <option value="deadline_asc">{l('Teslim Tarihine Göre', 'By Deadline')}</option>
            <option value="priority_desc">{l('Önceliğe Göre', 'By Priority')}</option>
            <option value="progress_desc">{l('İlerlemeye Göre', 'By Progress')}</option>
            <option value="name_asc">{l('Ada Göre (A-Z)', 'By Name (A-Z)')}</option>
          </select>
        </div>

        <button
          type="button"
          onClick={onOpenNewProject}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#2563EB] hover:bg-blue-500 text-white transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          {l('Yeni Proje', 'New Project')}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <TableSkeleton rows={5} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={l('Kriterlere uygun proje bulunamadı', 'No matching projects found')}
          description={l(
            'Henüz bir proje oluşturmadınız veya seçili filtrelerle eşleşen proje yok. İlk projenizi oluşturarak ilerlemeyi, görevleri ve kilometre taşlarını takip etmeye başlayın.',
            'You have not created a project yet or none match the selected filters. Create your first project to start tracking progress, tasks, and milestones.'
          )}
          actionLabel={l('İlk Projeyi Oluştur', 'Create First Project')}
          onAction={onOpenNewProject}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => {
            const overdue = isOverdue(project.deadline, project.status);
            return (
              <div
                key={project.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5 flex flex-col justify-between hover:border-[#38BDF8]/40 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenProjectDetail(project.id)}
                      className="text-left group min-w-0"
                    >
                      <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white group-hover:text-[#38BDF8] transition-colors truncate">
                        {project.name}
                      </h3>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEditProject(project)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
                        title={l('Düzenle', 'Edit')}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchive(project)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                        title={l('Arşivle', 'Archive')}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(project)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title={l('Sil', 'Delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Unboxed metadata row */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span className={statusTextClass(project.status)}>{tProjectStatus(project.status)}</span>
                    <span>·</span>
                    <span className={priorityTextClass(project.priority)}>{tPriority(project.priority)}</span>
                    <span>·</span>
                    <span>{project.category}</span>
                  </div>

                  {project.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 line-clamp-2 leading-relaxed">
                      {project.description}
                    </p>
                  )}

                  {project.tags.length > 0 && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-500 mt-2.5 truncate">
                      {l('Etiketler', 'Tags')}: {project.tags.join(' · ')}
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-500 dark:text-slate-400">
                        {l('İlerleme', 'Progress')} ({project.completed_task_count ?? 0}/{project.task_count ?? 0}{' '}
                        {l('görev', 'tasks')})
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                        {isEn ? `${project.progress}%` : `%${project.progress}`}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#38BDF8]"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className={overdue ? 'text-rose-400 font-medium' : 'text-slate-500 dark:text-slate-400'}>
                      {l('Teslim', 'Deadline')}:{' '}
                      {project.deadline ? formatDateTr(project.deadline, lang) : l('Belirlenmedi', 'Not set')}
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenProjectDetail(project.id)}
                      className="font-medium text-[#38BDF8] hover:underline"
                    >
                      {l('Detaylar', 'Details')}
                    </button>
                  </div>
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
        loading={deleting}
        title={l('Projeyi Kalıcı Olarak Sil', 'Permanently Delete Project')}
        description={l(
          `"${deleteTarget?.name}" projesini kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
          `Are you sure you want to permanently delete "${deleteTarget?.name}"? This action cannot be undone.`
        )}
        confirmLabel={l('Kalıcı Olarak Sil', 'Delete Permanently')}
      />
    </div>
  );
}
