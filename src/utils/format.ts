export function formatDateTr(value: string | null | undefined, lang: 'tr' | 'en' = 'tr'): string {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatDateTimeTr(value: string | null | undefined, lang: 'tr' | 'en' = 'tr'): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatNumberTr(num: number, lang: 'tr' | 'en' = 'tr'): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'tr-TR').format(num);
}

export function formatMinutesTr(minutes: number, lang: 'tr' | 'en' = 'tr'): string {
  const minUnit = lang === 'en' ? 'm' : 'dk';
  const hrUnit = lang === 'en' ? 'h' : 'sa';
  if (!minutes || minutes <= 0) return `0 ${minUnit}`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins} ${minUnit}`;
  if (mins === 0) return `${hrs} ${hrUnit}`;
  return `${hrs} ${hrUnit} ${mins} ${minUnit}`;
}

export function formatFileSizeTr(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isOverdue(dateStr: string | null | undefined, status?: string): boolean {
  if (!dateStr || status === 'Tamamlandı' || status === 'Yayınlandı') return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr.slice(0, 10) < today;
}

export function priorityTextClass(priority: string): string {
  switch (priority) {
    case 'Kritik':
      return 'text-rose-400 dark:text-rose-400';
    case 'Yüksek':
      return 'text-amber-400 dark:text-amber-400';
    case 'Orta':
      return 'text-sky-400 dark:text-sky-400';
    default:
      return 'text-slate-400 dark:text-slate-400';
  }
}

export function statusTextClass(status: string): string {
  switch (status) {
    case 'Yayınlandı':
    case 'Tamamlandı':
      return 'text-emerald-400';
    case 'Geliştirme':
    case 'Devam Ediyor':
      return 'text-[#38BDF8]';
    case 'Test':
    case 'İncelemede':
      return 'text-indigo-400';
    case 'Beklemede':
    case 'Donduruldu':
      return 'text-amber-400';
    case 'İptal Edildi':
      return 'text-rose-400';
    default:
      return 'text-slate-300';
  }
}
