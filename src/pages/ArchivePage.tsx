import { useCallback, useEffect, useState } from 'react';
import { Archive, RotateCcw, Search, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../lib/api';
import type { Idea, Project, Task } from '../types';
import { formatDateTimeTr } from '../utils/format';

export function ArchivePage({
  refreshSignal,
  onDataChanged,
}: {
  refreshSignal: number;
  onDataChanged: () => void;
}) {
  const { showToast } = useToast();
  const { lang, l, tProjectStatus, tTaskStatus, tPriority } = useI18n();
  const [tab, setTab] = useState<'projects' | 'tasks' | 'ideas'>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'projects' | 'tasks' | 'ideas';
    id: string;
    title: string;
  } | null>(null);

  const loadArchive = useCallback(async () => {
    setLoading(true);
    try {
      const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';
      const [pRes, tRes, iRes] = await Promise.all([
        apiRequest<{ projects: Project[] }>(`/api/projects?archived=1${q}`),
        apiRequest<{ tasks: Task[] }>(`/api/tasks?archived=1${q}`),
        apiRequest<{ ideas: Idea[] }>(`/api/ideas?archived=1${q}`),
      ]);
      setProjects(pRes.projects);
      setTasks(tRes.tasks);
      setIdeas(iRes.ideas);
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Arşiv yüklenemedi.', 'Failed to load archive.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, showToast, l]);

  useEffect(() => {
    loadArchive();
  }, [loadArchive, refreshSignal]);

  const handleRestore = async (type: 'projects' | 'tasks' | 'ideas', id: string) => {
    try {
      await apiRequest(`/api/${type}/${id}/restore`, { method: 'POST' });
      showToast(l('Öğe arşivden geri yüklendi.', 'Item restored from archive.'));
      onDataChanged();
      loadArchive();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Geri yüklenemedi.', 'Failed to restore.'), 'error');
    }
  };

  const handleDeletePermanent = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/${deleteTarget.type}/${deleteTarget.id}`, { method: 'DELETE' });
      showToast(l('Öğe kalıcı olarak silindi.', 'Item permanently deleted.'));
      setDeleteTarget(null);
      onDataChanged();
      loadArchive();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Silinemedi.', 'Failed to delete.'), 'error');
    }
  };

  const activeList =
    tab === 'projects'
      ? projects.map((p) => ({
          id: p.id,
          title: p.name,
          meta: `${tProjectStatus(p.status)} · ${p.category}`,
          archivedAt: p.archived_at,
        }))
      : tab === 'tasks'
        ? tasks.map((t) => ({
            id: t.id,
            title: t.title,
            meta: `${tTaskStatus(t.status)} · ${tPriority(t.priority)}`,
            archivedAt: t.archived_at,
          }))
        : ideas.map((i) => ({
            id: i.id,
            title: i.title,
            meta: `${i.category} · ${l('Potansiyel', 'Potential')} ${i.potential}/5`,
            archivedAt: i.archived_at,
          }));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
        <div className="flex p-1 rounded-lg bg-slate-100 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab('projects')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${
              tab === 'projects' ? 'bg-white dark:bg-[#101827] text-[#38BDF8]' : 'text-slate-500'
            }`}
          >
            {l(`Projeler (${projects.length})`, `Projects (${projects.length})`)}
          </button>
          <button
            type="button"
            onClick={() => setTab('tasks')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${
              tab === 'tasks' ? 'bg-white dark:bg-[#101827] text-[#38BDF8]' : 'text-slate-500'
            }`}
          >
            {l(`Görevler (${tasks.length})`, `Tasks (${tasks.length})`)}
          </button>
          <button
            type="button"
            onClick={() => setTab('ideas')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${
              tab === 'ideas' ? 'bg-white dark:bg-[#101827] text-[#38BDF8]' : 'text-slate-500'
            }`}
          >
            {l(`Fikirler (${ideas.length})`, `Ideas (${ideas.length})`)}
          </button>
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={l('Arşivde ara...', 'Search archive...')}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={4} />
      ) : activeList.length === 0 ? (
        <EmptyState
          icon={Archive}
          title={l('Arşivlenmiş öğe bulunmuyor', 'No archived items')}
          description={l(
            'Arşivlediğiniz projeler, görevler ve fikirler ilişkili verileri korunarak burada saklanır.',
            'Projects, tasks, and ideas you archive are kept here with all linked data preserved.'
          )}
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] divide-y divide-slate-200 dark:divide-slate-800">
          {activeList.map((item) => (
            <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{item.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {item.meta} · {l('Arşivlenme', 'Archived')}: {formatDateTimeTr(item.archivedAt, lang)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleRestore(tab, item.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#38BDF8] text-[#38BDF8]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {l('Geri Yükle', 'Restore')}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ type: tab, id: item.id, title: item.title })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {l('Kalıcı Sil', 'Delete Permanently')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeletePermanent}
        title={l('Kalıcı Olarak Sil', 'Permanently Delete')}
        description={l(
          `"${deleteTarget?.title}" öğesini kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
          `Are you sure you want to permanently delete "${deleteTarget?.title}"? This action cannot be undone.`
        )}
        confirmLabel={l('Kalıcı Sil', 'Delete Permanently')}
      />
    </div>
  );
}
