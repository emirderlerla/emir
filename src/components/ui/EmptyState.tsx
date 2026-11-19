import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/50 dark:bg-[#101827]/50">
      <div className="w-12 h-12 rounded-xl bg-[#38BDF8]/10 text-[#38BDF8] flex items-center justify-center mb-4">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-1.5 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 px-4 py-2 text-sm font-medium rounded-lg bg-[#2563EB] hover:bg-blue-500 text-white transition-colors whitespace-nowrap shrink-0"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
