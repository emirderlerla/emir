import { useState } from 'react';
import { useI18n } from '../../i18n';
import { formatNumberTr } from '../../utils/format';

const PALETTE = [
  '#38BDF8',
  '#2563EB',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#64748B',
  '#F43F5E',
  '#14B8A6',
];

export function DonutDistributionChart({
  data,
  emptyLabel,
}: {
  data: Array<{ label: string; count: number }>;
  emptyLabel?: string;
}) {
  const { lang, l, tAnyStatus } = useI18n();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = data.reduce((sum, item) => sum + item.count, 0);

  if (total === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        {emptyLabel || l('Henüz veri bulunmuyor.', 'No data available yet.')}
      </div>
    );
  }

  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
      <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-slate-200 dark:text-slate-800"
            strokeWidth="18"
          />
          {data.map((item, idx) => {
            const fraction = item.count / total;
            const dash = fraction * circumference;
            const offset = -accumulated * circumference;
            accumulated += fraction;
            const color = PALETTE[idx % PALETTE.length];
            const isHovered = hoveredIdx === idx;
            return (
              <circle
                key={item.label}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={isHovered ? 22 : 18}
                strokeDasharray={`${Math.max(0, dash - 2)} ${circumference}`}
                strokeDashoffset={offset}
                className="transition-all duration-150 cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {hoveredIdx !== null ? formatNumberTr(data[hoveredIdx].count, lang) : formatNumberTr(total, lang)}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 max-w-[90px] truncate">
            {hoveredIdx !== null ? tAnyStatus(data[hoveredIdx].label) : l('Toplam', 'Total')}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2">
        {data.map((item, idx) => {
          const pct = Math.round((item.count / total) * 100);
          const color = PALETTE[idx % PALETTE.length];
          return (
            <div
              key={item.label}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg transition-colors cursor-default ${
                hoveredIdx === idx ? 'bg-slate-100 dark:bg-slate-800/70' : ''
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <span className="text-slate-700 dark:text-slate-300 truncate">{tAnyStatus(item.label)}</span>
              </div>
              <div className="flex items-center gap-2 tabular-nums shrink-0">
                <span className="font-semibold text-slate-900 dark:text-white">{formatNumberTr(item.count, lang)}</span>
                <span className="text-slate-500 dark:text-slate-400 w-9 text-right">
                  {lang === 'en' ? `${pct}%` : `%${pct}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DualBarTrendChart({
  data,
  primaryLabel,
  secondaryLabel,
}: {
  data: Array<{ label: string; primary: number; secondary: number }>;
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  const { l } = useI18n();
  const [hovered, setHovered] = useState<number | null>(null);
  const maxVal = Math.max(1, ...data.flatMap((d) => [d.primary, d.secondary]));
  const pLabel = primaryLabel || l('Tamamlanan', 'Completed');
  const sLabel = secondaryLabel || l('Oluşturulan', 'Created');

  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        {l('Veri bulunmuyor.', 'No data available.')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#38BDF8]" />
            {pLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#2563EB]/60" />
            {sLabel}
          </span>
        </div>
        {hovered !== null && (
          <span className="tabular-nums text-slate-700 dark:text-slate-200 font-medium">
            {data[hovered].label}: {data[hovered].primary} / {data[hovered].secondary}
          </span>
        )}
      </div>

      <div className="h-48 flex items-end gap-2 pt-4">
        {data.map((d, idx) => {
          const h1 = Math.max(4, Math.round((d.primary / maxVal) * 100));
          const h2 = Math.max(4, Math.round((d.secondary / maxVal) * 100));
          return (
            <div
              key={d.label}
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered(null)}
              className="flex-1 h-full flex flex-col items-center justify-end gap-1.5 group"
            >
              <div className="w-full flex-1 flex items-end justify-center gap-1 px-0.5">
                <div
                  className="w-2.5 sm:w-3 rounded-t bg-[#38BDF8] group-hover:bg-sky-300 transition-all"
                  style={{ height: `${d.primary === 0 ? 3 : h1}%` }}
                  title={`${d.label} · ${pLabel}: ${d.primary}`}
                />
                <div
                  className="w-2.5 sm:w-3 rounded-t bg-[#2563EB]/55 group-hover:bg-[#2563EB] transition-all"
                  style={{ height: `${d.secondary === 0 ? 3 : h2}%` }}
                  title={`${d.label} · ${sLabel}: ${d.secondary}`}
                />
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums truncate max-w-full">
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HorizontalProgressChart({
  items,
  onSelect,
}: {
  items: Array<{ id: string; name: string; progress: number; status: string }>;
  onSelect?: (id: string) => void;
}) {
  const { lang, l, tAnyStatus } = useI18n();
  if (items.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        {l('Karşılaştırılacak aktif proje bulunmuyor.', 'No active projects to compare.')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect?.(item.id)}
          className="w-full text-left group block"
        >
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-[#38BDF8] transition-colors truncate pr-3">
              {item.name}
            </span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
              {tAnyStatus(item.status)} ·{' '}
              <strong className="text-slate-900 dark:text-white">
                {lang === 'en' ? `${item.progress}%` : `%${item.progress}`}
              </strong>
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800/90 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#38BDF8] transition-all duration-300"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}
