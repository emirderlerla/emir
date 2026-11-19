import { useCallback, useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { DonutDistributionChart, DualBarTrendChart } from '../components/ui/Charts';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../lib/api';
import type { Project } from '../types';
import { formatMinutesTr, formatNumberTr, statusTextClass } from '../utils/format';

interface AnalyticsResponse {
  range: string;
  summary: {
    overallProductivity: number;
    projectCompletionRate: number;
    taskCompletionRate: number;
    overdueCount: number;
    overdueRate: number;
    totalEstimatedMinutes: number;
    totalActualMinutes: number;
    totalActivitiesInRange: number;
  };
  projectStatusDistribution: Array<{ label: string; count: number }>;
  trendSeries: Array<{ label: string; completed: number; activities: number }>;
  projectComparison: Array<
    Project & {
      totalTasks: number;
      completedTasks: number;
      overdueTasks: number;
      estimatedMinutes: number;
      actualMinutes: number;
    }
  >;
}

export function AnalyticsPage({
  refreshSignal,
  onOpenProjectDetail,
}: {
  refreshSignal: number;
  onOpenProjectDetail: (projectId: string) => void;
}) {
  const { showToast } = useToast();
  const { lang, isEn, l, tProjectStatus } = useI18n();
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<AnalyticsResponse>(`/api/analytics?range=${range}`);
      setData(res);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Analitik verileri alınamadı.', 'Failed to load analytics data.'),
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [range, showToast, l]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics, refreshSignal]);

  if (loading || !data) return <DashboardSkeleton />;

  const pct = (n: number) => (isEn ? `${n}%` : `%${n}`);

  const metrics = [
    {
      label: l('Genel Verimlilik Skoru', 'Overall Productivity Score'),
      value: pct(data.summary.overallProductivity),
      accent: 'text-[#38BDF8]',
    },
    {
      label: l('Proje Tamamlama Oranı', 'Project Completion Rate'),
      value: pct(data.summary.projectCompletionRate),
      accent: 'text-emerald-400',
    },
    {
      label: l('Görev Tamamlama Oranı', 'Task Completion Rate'),
      value: pct(data.summary.taskCompletionRate),
      accent: 'text-[#38BDF8]',
    },
    {
      label: l('Geciken Görev Sayısı / Oranı', 'Overdue Tasks / Rate'),
      value: `${formatNumberTr(data.summary.overdueCount, lang)} (${pct(data.summary.overdueRate)})`,
      accent: data.summary.overdueCount > 0 ? 'text-rose-400' : 'text-emerald-400',
    },
    {
      label: l('Toplam Tahmini Süre', 'Total Estimated Time'),
      value: formatMinutesTr(data.summary.totalEstimatedMinutes, lang),
    },
    {
      label: l('Toplam Gerçekleşen Süre', 'Total Actual Time'),
      value: formatMinutesTr(data.summary.totalActualMinutes, lang),
    },
    {
      label: l('Dönem Aktivite Sayısı', 'Activities in Period'),
      value: formatNumberTr(data.summary.totalActivitiesInRange, lang),
    },
    {
      label: l('Karşılaştırılan Proje', 'Compared Projects'),
      value: formatNumberTr(data.projectComparison.length, lang),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BarChart3 className="w-4 h-4 text-[#38BDF8]" />
          <span>{l('Performans ve Verimlilik Analitiği', 'Performance & Productivity Analytics')}</span>
        </div>
        <div className="flex p-1 rounded-lg bg-slate-100 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800">
          {(
            [
              ['7d', l('Son 7 Gün', 'Last 7 Days')],
              ['30d', l('Son 30 Gün', 'Last 30 Days')],
              ['90d', l('Son 90 Gün', 'Last 90 Days')],
              ['all', l('Tüm Zamanlar', 'All Time')],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                range === id ? 'bg-white dark:bg-[#101827] text-[#38BDF8]' : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">{m.label}</div>
            <div className={`text-xl font-display font-bold tabular-nums mt-1.5 ${m.accent || ''}`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5">
          <h3 className="text-sm font-semibold mb-4">
            {l('Verimlilik ve Aktivite Eğilimi', 'Productivity & Activity Trend')}
          </h3>
          <DualBarTrendChart
            data={data.trendSeries.map((t) => ({
              label: t.label,
              primary: t.completed,
              secondary: t.activities,
            }))}
            primaryLabel={l('Tamamlanan Görev', 'Completed Tasks')}
            secondaryLabel={l('Toplam Aktivite', 'Total Activities')}
          />
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5">
          <h3 className="text-sm font-semibold mb-4">
            {l('Proje Durum Dağılımı', 'Project Status Distribution')}
          </h3>
          <DonutDistributionChart
            data={data.projectStatusDistribution}
            emptyLabel={l('Analiz edilecek proje bulunmuyor.', 'No projects to analyze.')}
          />
        </div>
      </div>

      {/* Project Comparison Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-sm font-semibold">
            {l('Proje Karşılaştırma ve Süre Takibi Tablosu', 'Project Comparison & Time Tracking')}
          </h3>
        </div>
        {data.projectComparison.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {l('Karşılaştırılacak proje verisi yok.', 'No project data to compare.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-[#070B14] text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">{l('Proje', 'Project')}</th>
                  <th className="py-3 px-4 font-medium">{l('Durum', 'Status')}</th>
                  <th className="py-3 px-4 font-medium text-right">{l('İlerleme', 'Progress')}</th>
                  <th className="py-3 px-4 font-medium text-right">{l('Görevler', 'Tasks')}</th>
                  <th className="py-3 px-4 font-medium text-right">{l('Geciken', 'Overdue')}</th>
                  <th className="py-3 px-4 font-medium text-right">{l('Tahmini Süre', 'Estimated Time')}</th>
                  <th className="py-3 px-4 font-medium text-right">{l('Gerçekleşen', 'Actual')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                {data.projectComparison.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="py-3 px-4 font-medium">
                      <button
                        type="button"
                        onClick={() => onOpenProjectDetail(p.id)}
                        className="hover:text-[#38BDF8] text-left"
                      >
                        {p.name}
                      </button>
                    </td>
                    <td className={`py-3 px-4 ${statusTextClass(p.status)}`}>{tProjectStatus(p.status)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{pct(p.progress)}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {p.completedTasks}/{p.totalTasks}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums ${
                        p.overdueTasks > 0 ? 'text-rose-400 font-semibold' : ''
                      }`}
                    >
                      {p.overdueTasks}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatMinutesTr(p.estimatedMinutes, lang)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatMinutesTr(p.actualMinutes, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
