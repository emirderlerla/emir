import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BellPlus,
  Bot,
  CheckCircle2,
  Circle,
  Clock,
  FolderPlus,
  Lightbulb,
  Plus,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type { NavRoute } from '../components/layout/Sidebar';
import {
  DonutDistributionChart,
  DualBarTrendChart,
  HorizontalProgressChart,
} from '../components/ui/Charts';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../lib/api';
import type { DashboardData } from '../types';
import {
  formatDateTimeTr,
  formatDateTr,
  formatNumberTr,
  isOverdue,
  priorityTextClass,
} from '../utils/format';

interface DashboardPageProps {
  onNavigate: (route: NavRoute) => void;
  onOpenNewProject: () => void;
  onOpenNewTask: () => void;
  onOpenProjectDetail: (projectId: string) => void;
  refreshSignal: number;
}

export function DashboardPage({
  onNavigate,
  onOpenNewProject,
  onOpenNewTask,
  onOpenProjectDetail,
  refreshSignal,
}: DashboardPageProps) {
  const { showToast } = useToast();
  const { lang, l, tPriority } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiOverview, setAiOverview] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setError(null);
      const res = await apiRequest<DashboardData>('/api/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : l('Ana panel verileri yüklenemedi.', 'Could not load dashboard data.'));
    } finally {
      setLoading(false);
    }
  }, [l]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, refreshSignal]);

  const handleGenerateAiOverview = async () => {
    setAiLoading(true);
    try {
      const res = await apiRequest<{ overview: string }>('/api/ai/daily-overview', {
        method: 'POST',
      });
      setAiOverview(res.overview);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Günlük özet oluşturulamadı.', 'Could not generate daily overview.'),
        'error'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const toggleTaskComplete = async (taskId: string) => {
    try {
      await apiRequest(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Tamamlandı' }),
      });
      showToast(l('Görev tamamlandı.', 'Task completed.'));
      loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Görev güncellenemedi.', 'Could not update task.'), 'error');
    }
  };

  if (loading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200 flex items-center justify-between">
        <span>{error || l('Veri alınamadı.', 'Could not retrieve data.')}</span>
        <button
          type="button"
          onClick={loadDashboard}
          className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium"
        >
          {l('Yeniden Dene', 'Try Again')}
        </button>
      </div>
    );
  }

  const kpiCards = [
    {
      label: l('Toplam Proje', 'Total Projects'),
      value: data.kpis.totalProjects,
      sub: l('Arşivlenmemiş tüm projeler', 'All non-archived projects'),
    },
    {
      label: l('Aktif Odak Projesi', 'Active Focus Projects'),
      value: data.kpis.activeProjects,
      sub: l(`Limit: ${data.control.maxActiveProjects} proje`, `Limit: ${data.control.maxActiveProjects} projects`),
      accent: data.control.isOverLimit ? 'text-amber-400' : 'text-[#38BDF8]',
    },
    {
      label: l('Tamamlanan Proje', 'Completed Projects'),
      value: data.kpis.completedProjects,
      sub: l('Yayınlandı durumunda', 'In shipped status'),
      accent: 'text-emerald-400',
    },
    {
      label: l('Bekleyen Görev', 'Pending Tasks'),
      value: data.kpis.pendingTasks,
      sub: l('Tamamlanmamış işler', 'Unfinished items'),
    },
    {
      label: l('Tamamlanan Görev', 'Completed Tasks'),
      value: data.kpis.completedTasks,
      sub: l('Tüm zamanlar', 'All time'),
      accent: 'text-emerald-400',
    },
    {
      label: l('Geciken Görev', 'Overdue Tasks'),
      value: data.kpis.overdueTasks,
      sub: l('Son tarihi geçmiş', 'Past due date'),
      accent: data.kpis.overdueTasks > 0 ? 'text-rose-400' : 'text-slate-900 dark:text-white',
    },
    {
      label: l('Yaklaşan Son Tarih', 'Upcoming Deadlines'),
      value: data.kpis.upcomingDeadlinesCount,
      sub: l('Önümüzdeki 7 gün', 'Next 7 days'),
    },
    {
      label: l('Haftalık Verimlilik', 'Weekly Productivity'),
      value: lang === 'en' ? `${data.kpis.weeklyProductivityRate}%` : `%${data.kpis.weeklyProductivityRate}`,
      sub: l('Son 7 gün tamamlama oranı', 'Last 7-day completion rate'),
      accent: 'text-[#38BDF8]',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Actions & Control Alert Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenNewProject}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#2563EB] hover:bg-blue-500 text-white transition-colors whitespace-nowrap shrink-0"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            {l('Yeni Proje', 'New Project')}
          </button>
          <button
            type="button"
            onClick={onOpenNewTask}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#38BDF8]/50 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {l('Yeni Görev', 'New Task')}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('ideas')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#38BDF8]/50 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            {l('Fikir Ekle', 'Add Idea')}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('notifications')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#38BDF8]/50 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <BellPlus className="w-3.5 h-3.5" />
            {l('Hatırlatıcı Ekle', 'Add Reminder')}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('control')}
          className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition-colors text-left ${
            data.control.isOverLimit || data.control.atRiskProjects.length > 0
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15'
              : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-[#38BDF8]'
          }`}
        >
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
          <span className="tabular-nums">
            {l('Odak', 'Focus')}: <strong>{data.control.activeFocusCount}/{data.control.maxActiveProjects}</strong> ·{' '}
            {data.control.atRiskProjects.length > 0
              ? l(`${data.control.atRiskProjects.length} riskli proje`, `${data.control.atRiskProjects.length} at-risk project(s)`)
              : l('Tüm aktif projeler kontrol altında', 'All active projects under control')}
          </span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <div
            key={kpi.label}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]"
          >
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</div>
            <div
              className={`text-2xl font-display font-bold tabular-nums mt-1.5 ${
                kpi.accent || 'text-slate-900 dark:text-white'
              }`}
            >
              {typeof kpi.value === 'number' ? formatNumberTr(kpi.value, lang) : kpi.value}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-500 mt-1">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* AI Daily Overview */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#38BDF8]/10 text-[#38BDF8]">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {l('Yapay Zeka Günlük Komuta Özeti', 'AI Daily Command Briefing')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {l(
                  'Gerçek zamanlı proje, görev ve gecikme verilerinize göre Gemini analizi',
                  'Real-time Gemini analysis of your projects, tasks, and delays'
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateAiOverview}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#2563EB] hover:bg-blue-500 text-white transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} />
              <span>
                {aiLoading
                  ? l('Analiz Ediliyor...', 'Analyzing...')
                  : aiOverview
                    ? l('Özeti Yenile', 'Refresh Briefing')
                    : l('Günlük Özet Oluştur', 'Generate Daily Briefing')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('ai')}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-[#38BDF8]/50 whitespace-nowrap shrink-0"
            >
              {l('Asistana Git', 'Open Assistant')}
            </button>
          </div>
        </div>
        {aiOverview ? (
          <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed pt-2 border-t border-slate-200 dark:border-slate-800/80">
            {aiOverview}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
            {l(
              'Günün kritik odak noktalarını, riskli projeleri ve öncelikli sonraki adımı görmek için "Günlük Özet Oluştur" düğmesine tıklayın.',
              'Click "Generate Daily Briefing" to view today’s critical focus points, at-risk projects, and priority next action.'
            )}
          </p>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            {l('Proje Durum Dağılımı', 'Project Status Distribution')}
          </h3>
          <DonutDistributionChart
            data={data.projectStatusDistribution}
            emptyLabel={l('Henüz oluşturulmuş proje yok.', 'No projects created yet.')}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            {l('Görev Tamamlama İstatistikleri', 'Task Completion Stats')}
          </h3>
          <DonutDistributionChart
            data={data.taskStatusDistribution.filter((d) => d.count > 0)}
            emptyLabel={l('Henüz oluşturulmuş görev yok.', 'No tasks created yet.')}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            {l('Haftalık Verimlilik (Son 7 Gün)', 'Weekly Productivity (Last 7 Days)')}
          </h3>
          <DualBarTrendChart
            data={data.weeklyProductivitySeries.map((d) => ({
              label: d.label,
              primary: d.completed,
              secondary: d.created,
            }))}
            primaryLabel={l('Tamamlanan Görev', 'Completed Tasks')}
            secondaryLabel={l('Yeni Görev', 'New Tasks')}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            {l('Proje İlerleme Karşılaştırması', 'Project Progress Comparison')}
          </h3>
          <HorizontalProgressChart
            items={data.projectProgressComparison}
            onSelect={onOpenProjectDetail}
          />
        </div>
      </div>

      {/* Operational Lists Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Priority Tasks */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {l('Öncelikli Görevler', 'Priority Tasks')}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="text-xs text-[#38BDF8] hover:underline"
            >
              {l('Tümünü Gör', 'View All')}
            </button>
          </div>
          {data.priorityTasks.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              {l('Bekleyen öncelikli görev bulunmuyor.', 'No pending priority tasks.')}
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800/70">
              {data.priorityTasks.map((task) => {
                const overdue = isOverdue(task.due_date, task.status);
                return (
                  <div key={task.id} className="py-2.5 flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleTaskComplete(task.id)}
                      className="mt-0.5 text-slate-400 hover:text-emerald-400 transition-colors"
                      title={l('Tamamlandı olarak işaretle', 'Mark as completed')}
                    >
                      <Circle className="w-4 h-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {task.title}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className={priorityTextClass(task.priority)}>{tPriority(task.priority)}</span>
                        <span>·</span>
                        <span className={overdue ? 'text-rose-400 font-medium' : ''}>
                          {task.due_date ? formatDateTr(task.due_date, lang) : l('Tarihsiz', 'No date')}
                        </span>
                        {task.project_name && (
                          <>
                            <span>·</span>
                            <span className="truncate">{task.project_name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming Milestones & Deadlines */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {l('Yaklaşan Kilometre Taşları ve Tarihler', 'Upcoming Milestones & Deadlines')}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="text-xs text-[#38BDF8] hover:underline"
            >
              {l('Takvim', 'Calendar')}
            </button>
          </div>
          {data.upcomingMilestones.length === 0 && data.upcomingDeadlines.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              {l('Yaklaşan kilometre taşı veya son tarih bulunmuyor.', 'No upcoming milestones or deadlines.')}
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800/70">
              {data.upcomingMilestones.map((m) => (
                <div key={m.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                      {m.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {l('Kilometre Taşı', 'Milestone')} · {m.project_name}
                    </div>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[#38BDF8] shrink-0">
                    {formatDateTr(m.due_date, lang)}
                  </span>
                </div>
              ))}
              {data.upcomingDeadlines
                .filter((d) => d.type !== 'milestone')
                .slice(0, 4)
                .map((d) => (
                  <div key={`${d.type}-${d.id}`} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {d.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {d.type === 'project'
                          ? l('Proje Teslimi', 'Project Deadline')
                          : l('Görev Son Tarihi', 'Task Due Date')}
                        {d.project_name ? ` · ${d.project_name}` : ''}
                      </div>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-amber-400 shrink-0">
                      {formatDateTr(d.due_date, lang)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {l('Son Aktiviteler', 'Recent Activity')}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('activity')}
              className="text-xs text-[#38BDF8] hover:underline"
            >
              {l('Günlük', 'Log')}
            </button>
          </div>
          {data.recentActivity.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              {l('Henüz kaydedilmiş aktivite yok.', 'No recorded activity yet.')}
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800/70">
              {data.recentActivity.slice(0, 6).map((act) => (
                <div key={act.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#38BDF8]">{act.action}</span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500">
                      {formatDateTimeTr(act.created_at, lang)}
                    </span>
                  </div>
                  <div className="text-sm text-slate-800 dark:text-slate-200 truncate mt-0.5">
                    {act.entity_title}
                  </div>
                  {act.details && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {act.details}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recommended Focus Footer Notice if needed */}
      {data.control.recommendedAttentionProject && (
        <div className="p-4 rounded-xl border border-[#38BDF8]/25 bg-[#38BDF8]/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200">
            {data.control.recommendedAttentionProject.riskReasons.length > 0 ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
            )}
            <div>
              <span className="font-semibold">
                {l('Öncelikli Dikkat Önerisi:', 'Priority Attention Recommendation:')}
              </span>{' '}
              {data.control.recommendedAttentionProject.project.name}
              {data.control.recommendedAttentionProject.nextActionTitle && (
                <span className="text-slate-500 dark:text-slate-400">
                  {' '}
                  · {l('Sonraki Adım:', 'Next Action:')}{' '}
                  {data.control.recommendedAttentionProject.nextActionTitle}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenProjectDetail(data.control.recommendedAttentionProject!.project.id)}
            className="text-xs font-medium text-[#38BDF8] hover:underline whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            <Clock className="w-3.5 h-3.5" />
            {l('Projeyi İncele', 'Inspect Project')}
          </button>
        </div>
      )}
    </div>
  );
}
