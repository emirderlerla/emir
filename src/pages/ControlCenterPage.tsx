import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../lib/api';
import type { ControlSummary } from '../types';
import { priorityTextClass, statusTextClass } from '../utils/format';

export function ControlCenterPage({
  refreshSignal,
  onOpenProjectDetail,
}: {
  refreshSignal: number;
  onOpenProjectDetail: (projectId: string) => void;
}) {
  const { showToast } = useToast();
  const { l, tProjectStatus, tPriority } = useI18n();
  const [control, setControl] = useState<ControlSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [weeklyReview, setWeeklyReview] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const loadControl = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ control: ControlSummary }>('/api/control');
      setControl(res.control);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Kontrol verileri alınamadı.', 'Could not load control data.'),
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [showToast, l]);

  useEffect(() => {
    loadControl();
  }, [loadControl, refreshSignal]);

  const handleGenerateReview = async () => {
    setReviewLoading(true);
    try {
      const res = await apiRequest<{ review: string }>('/api/ai/weekly-review', { method: 'POST' });
      setWeeklyReview(res.review);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Haftalık inceleme oluşturulamadı.', 'Could not generate weekly review.'),
        'error'
      );
    } finally {
      setReviewLoading(false);
    }
  };

  if (loading || !control) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      {/* Focus Limit Banner */}
      <div
        className={`rounded-2xl border p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          control.isOverLimit
            ? 'border-amber-500/40 bg-amber-500/10'
            : 'border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`p-2.5 rounded-xl shrink-0 ${
              control.isOverLimit ? 'bg-amber-500/20 text-amber-400' : 'bg-[#38BDF8]/12 text-[#38BDF8]'
            }`}
          >
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-display font-semibold">
              {l('Aktif Odak Proje Kontrolü:', 'Active Focus Project Control:')}{' '}
              <span className="font-mono tabular-nums">
                {control.activeFocusCount} / {control.maxActiveProjects}
              </span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              {control.isOverLimit
                ? l(
                    `Uyarı: Aktif odak proje sayınız (${control.activeFocusCount}), belirlenen ${control.maxActiveProjects} proje limitini aşıyor. Bazı projeleri Beklemede durumuna almanız önerilir.`,
                    `Warning: Your active focus projects (${control.activeFocusCount}) exceed the configured limit of ${control.maxActiveProjects}. Consider moving some projects to On Hold.`
                  )
                : l(
                    'Aktif odak proje sayınız belirlenen sınır içinde. Yeni fikirleri Fikir Havuzu üzerinden değerlendirmeye devam edin.',
                    'Your active focus projects are within the configured limit. Continue evaluating new ideas in the Idea Pool.'
                  )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerateReview}
          disabled={reviewLoading}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white whitespace-nowrap shrink-0 disabled:opacity-60"
        >
          <Bot className="w-4 h-4" />
          <span>
            {reviewLoading
              ? l('Değerlendiriliyor...', 'Evaluating...')
              : l('Haftalık AI İncelemesi Oluştur', 'Generate Weekly AI Review')}
          </span>
        </button>
      </div>

      {/* Control Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
          <div className="text-xs text-slate-500">{l('Riskli Proje Sayısı', 'At-Risk Projects')}</div>
          <div
            className={`text-2xl font-display font-bold tabular-nums mt-1 ${
              control.atRiskProjects.length > 0 ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {control.atRiskProjects.length}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
          <div className="text-xs text-slate-500">{l('Geciken Görevler', 'Overdue Tasks')}</div>
          <div
            className={`text-2xl font-display font-bold tabular-nums mt-1 ${
              control.totalOverdueTasks > 0 ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {control.totalOverdueTasks}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
          <div className="text-xs text-slate-500">{l('Sonraki Adımı Eksik', 'Missing Next Action')}</div>
          <div className="text-2xl font-display font-bold tabular-nums mt-1">
            {control.projectsWithoutNextAction}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
          <div className="text-xs text-slate-500">
            {l(
              `Pasif Projeler (${control.inactiveThresholdDays}+ gün)`,
              `Inactive Projects (${control.inactiveThresholdDays}+ days)`
            )}
          </div>
          <div className="text-2xl font-display font-bold tabular-nums mt-1">
            {control.inactiveProjectsCount}
          </div>
        </div>
      </div>

      {/* Recommended Priority Focus */}
      {control.recommendedAttentionProject && (
        <div className="rounded-2xl border border-[#38BDF8]/30 bg-[#38BDF8]/6 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#38BDF8]">
              {l('Önce İlgilenilmesi Önerilen Proje', 'Recommended Priority Focus')}
            </div>
            <h3 className="text-lg font-display font-bold mt-1">
              {control.recommendedAttentionProject.project.name}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              {control.recommendedAttentionProject.riskReasons.length > 0
                ? control.recommendedAttentionProject.riskReasons.join(' · ')
                : l('En yüksek öncelikli aktif odak projesi', 'Highest priority active focus project')}
            </p>
            {control.recommendedAttentionProject.nextActionTitle && (
              <p className="text-xs text-[#38BDF8] mt-1.5">
                {l('Tanımlı Sonraki Adım:', 'Defined Next Action:')}{' '}
                {control.recommendedAttentionProject.nextActionTitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenProjectDetail(control.recommendedAttentionProject!.project.id)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-[#2563EB] text-white whitespace-nowrap shrink-0"
          >
            <span>{l('Projeyi Aç', 'Open Project')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Weekly AI Review Output */}
      {weeklyReview && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#38BDF8]">
            <Bot className="w-4 h-4" />
            <span>{l('Haftalık Yapay Zeka Proje Değerlendirmesi', 'Weekly AI Project Review')}</span>
          </div>
          <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-line leading-relaxed">
            {weeklyReview}
          </div>
        </div>
      )}

      {/* At-Risk Projects List */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5 space-y-4">
        <h3 className="text-sm font-semibold">{l('Risk ve Dikkat Analizi', 'Risk & Attention Analysis')}</h3>
        {control.atRiskProjects.length === 0 ? (
          <div className="py-8 flex items-center justify-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {l(
                'Şu anda risk sinyali veren veya sonraki adımı eksik proje bulunmuyor.',
                'No projects currently flagging risk signals or missing a next action.'
              )}
            </span>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {control.atRiskProjects.map((item) => (
              <div
                key={item.project.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <button
                      type="button"
                      onClick={() => onOpenProjectDetail(item.project.id)}
                      className="text-sm font-semibold hover:text-[#38BDF8] text-left"
                    >
                      {item.project.name}
                    </button>
                    <span className={`text-xs ${statusTextClass(item.project.status)}`}>
                      · {tProjectStatus(item.project.status)}
                    </span>
                    <span className={`text-xs ${priorityTextClass(item.project.priority)}`}>
                      · {tPriority(item.project.priority)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 pl-6">
                    {item.riskReasons.join(' · ')}
                  </div>
                  <div className="text-xs pl-6">
                    {l('Sonraki Adım:', 'Next Action:')}{' '}
                    <span className={item.hasNextAction ? 'text-[#38BDF8]' : 'text-rose-400'}>
                      {item.nextActionTitle || l('Tanımlanmamış', 'Undefined')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenProjectDetail(item.project.id)}
                  className="text-xs font-medium text-[#38BDF8] hover:underline shrink-0 pl-6 sm:pl-0"
                >
                  {l('İncele ve Düzenle', 'Inspect & Edit')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
