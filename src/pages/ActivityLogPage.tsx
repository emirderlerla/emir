import { useCallback, useEffect, useState } from 'react';
import { Activity, Search } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../lib/api';
import type { ActivityLog } from '../types';
import { formatDateTimeTr } from '../utils/format';

const ENTITY_TYPES = ['project', 'task', 'idea', 'milestone', 'note', 'attachment', 'reminder', 'settings', 'profile'];

export function ActivityLogPage({ refreshSignal }: { refreshSignal: number }) {
  const { showToast } = useToast();
  const { lang, l, tEntityType } = useI18n();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('');
  const [search, setSearch] = useState('');

  const loadActivities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entityFilter) params.set('entity_type', entityFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiRequest<{ activities: ActivityLog[] }>(`/api/activity?${params.toString()}`);
      setActivities(res.activities);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Aktivite günlüğü yüklenemedi.', 'Failed to load activity log.'),
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [entityFilter, search, showToast, l]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities, refreshSignal]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={l('Eylem veya başlık ara...', 'Search action or title...')}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            />
          </div>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
          >
            <option value="">{l('Tüm Kayıt Türleri', 'All Record Types')}</option>
            {ENTITY_TYPES.map((k) => (
              <option key={k} value={k}>
                {tEntityType(k)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : activities.length === 0 ? (
        <EmptyState
          icon={Activity}
          title={l('Aktivite kaydı bulunmuyor', 'No activity logs')}
          description={l(
            'Proje oluşturma, görev tamamlama, fikir dönüştürme ve diğer tüm çalışma alanı işlemleri kronolojik olarak burada listelenir.',
            'Project creation, task completion, idea conversion, and all workspace actions appear here chronologically.'
          )}
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] divide-y divide-slate-200 dark:divide-slate-800">
          {activities.map((act) => (
            <div key={act.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-[#38BDF8]">{act.action}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-500">{tEntityType(act.entity_type)}</span>
                </div>
                <div className="text-sm font-medium">{act.entity_title}</div>
                {act.details && <div className="text-xs text-slate-500">{act.details}</div>}
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 shrink-0">
                {formatDateTimeTr(act.created_at, lang)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
