export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-200 dark:bg-[#101827] border border-slate-200 dark:border-slate-800" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-72 rounded-xl bg-slate-200 dark:bg-[#101827] border border-slate-200 dark:border-slate-800" />
        <div className="h-72 rounded-xl bg-slate-200 dark:bg-[#101827] border border-slate-200 dark:border-slate-800" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-12 rounded-xl bg-slate-200 dark:bg-[#101827] border border-slate-200 dark:border-slate-800"
        />
      ))}
    </div>
  );
}
