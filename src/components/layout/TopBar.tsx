import { Bell, Bot, Globe, Menu, Plus } from 'lucide-react';
import { useI18n } from '../../i18n';
import { NAV_ITEMS, type NavRoute } from './Sidebar';

interface TopBarProps {
  activeRoute: NavRoute;
  unreadCount: number;
  onOpenMobileMenu: () => void;
  onNavigate: (route: NavRoute) => void;
  onQuickCreateTask: () => void;
}

export function TopBar({
  activeRoute,
  unreadCount,
  onOpenMobileMenu,
  onNavigate,
  onQuickCreateTask,
}: TopBarProps) {
  const { lang, setLanguage, l, tNavLabel } = useI18n();
  const currentItem = NAV_ITEMS.find((i) => i.id === activeRoute);
  const currentLabel = currentItem
    ? tNavLabel(currentItem.id, currentItem.label)
    : l('Ana Panel', 'Dashboard');

  return (
    <header className="h-16 sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800/80 bg-white/85 dark:bg-[#070B14]/85 backdrop-blur-md">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60"
          aria-label={l('Navigasyonu aç', 'Open navigation')}
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
            Noah Command Center
          </span>
          <span className="text-slate-400 dark:text-slate-600 hidden sm:inline">/</span>
          <h1 className="font-display font-semibold text-slate-900 dark:text-white truncate">
            {currentLabel}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div
          className="inline-flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#101827]"
          role="group"
          aria-label={l('Dil seçimi', 'Language selector')}
        >
          <Globe className="w-3.5 h-3.5 text-slate-400 mx-1.5 hidden sm:block" />
          <button
            type="button"
            onClick={() => setLanguage('tr')}
            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
              lang === 'tr'
                ? 'bg-[#2563EB] text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            TR
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
              lang === 'en'
                ? 'bg-[#2563EB] text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            EN
          </button>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('ai')}
          className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-[#38BDF8]/50 hover:text-[#38BDF8] transition-colors whitespace-nowrap shrink-0"
        >
          <Bot className="w-3.5 h-3.5" />
          {l('AI Asistanı', 'AI Assistant')}
        </button>

        <button
          type="button"
          onClick={() => onNavigate('notifications')}
          className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-[#38BDF8]/50 hover:text-[#38BDF8] transition-colors"
          title={l('Bildirimler', 'Notifications')}
          aria-label={l('Bildirimler', 'Notifications')}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#2563EB] text-white text-[10px] font-mono tabular-nums flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onQuickCreateTask}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#2563EB] hover:bg-blue-500 text-white transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{l('Yeni Görev', 'New Task')}</span>
        </button>
      </div>
    </header>
  );
}
