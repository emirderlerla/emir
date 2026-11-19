import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  Bot,
  Calendar,
  CheckSquare,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Settings,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';

export type NavRoute =
  | 'dashboard'
  | 'control'
  | 'ai'
  | 'projects'
  | 'tasks'
  | 'ideas'
  | 'calendar'
  | 'analytics'
  | 'notes'
  | 'archive'
  | 'activity'
  | 'notifications'
  | 'settings';

export interface NavItem {
  id: NavRoute;
  label: string;
  icon: LucideIcon;
  section: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Ana Panel', icon: LayoutDashboard, section: 'Komuta' },
  { id: 'control', label: 'Proje Kontrolü', icon: ShieldAlert, section: 'Komuta' },
  { id: 'ai', label: 'Yapay Zeka Asistanı', icon: Bot, section: 'Komuta' },
  { id: 'projects', label: 'Projeler', icon: FolderKanban, section: 'Çalışma Alanı' },
  { id: 'tasks', label: 'Görevler', icon: CheckSquare, section: 'Çalışma Alanı' },
  { id: 'ideas', label: 'Fikir Havuzu', icon: Lightbulb, section: 'Çalışma Alanı' },
  { id: 'calendar', label: 'Takvim', icon: Calendar, section: 'Çalışma Alanı' },
  { id: 'notes', label: 'Notlar ve Dosyalar', icon: FileText, section: 'Çalışma Alanı' },
  { id: 'analytics', label: 'Analitik', icon: BarChart3, section: 'İzleme ve Sistem' },
  { id: 'activity', label: 'Aktivite Günlüğü', icon: Activity, section: 'İzleme ve Sistem' },
  { id: 'notifications', label: 'Bildirimler', icon: Bell, section: 'İzleme ve Sistem' },
  { id: 'archive', label: 'Arşiv', icon: Archive, section: 'İzleme ve Sistem' },
  { id: 'settings', label: 'Ayarlar', icon: Settings, section: 'İzleme ve Sistem' },
];

interface SidebarProps {
  activeRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  unreadCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeRoute,
  onNavigate,
  unreadCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const { l, tNavLabel, tNavSection } = useI18n();
  const sections = ['Komuta', 'Çalışma Alanı', 'İzleme ve Sistem'];

  const content = (
    <aside className="w-[260px] h-full flex flex-col bg-white dark:bg-[#0B101B] border-r border-slate-200 dark:border-slate-800/80 select-none">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 shrink-0">
        <button
          type="button"
          onClick={() => {
            onNavigate('dashboard');
            onCloseMobile();
          }}
          className="flex items-center gap-3 text-left min-w-0"
        >
          <img
            src="/src/assets/images/emir7_command_emblem_1795089628387.jpg"
            alt={l('Noah Amblemi', 'Noah Emblem')}
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-lg object-cover border border-[#38BDF8]/30 shrink-0"
          />
          <span className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-white whitespace-nowrap truncate">
            NOAH COMMAND
          </span>
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
          aria-label={l('Menüyü kapat', 'Close menu')}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {sections.map((section) => (
          <div key={section}>
            <div className="px-3 mb-2 text-[11px] font-medium text-slate-400 dark:text-slate-500">
              {tNavSection(section)}
            </div>
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((i) => i.section === section).map((item) => {
                const Icon = item.icon;
                const active = activeRoute === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#38BDF8]/12 text-[#2563EB] dark:text-[#38BDF8]'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{tNavLabel(item.id, item.label)}</span>
                    </span>
                    {item.id === 'notifications' && unreadCount > 0 && (
                      <span className="text-xs font-mono tabular-nums text-[#2563EB] dark:text-[#38BDF8] font-semibold">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 shrink-0">
        <div className="flex items-center justify-between gap-2 px-2 py-2 rounded-xl bg-slate-50 dark:bg-[#101827]">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
              {user?.full_name || 'Noah'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {user?.role_title || l('Komuta Merkezi', 'Command Center')}
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            title={l('Çıkış Yap', 'Sign Out')}
            aria-label={l('Çıkış Yap', 'Sign Out')}
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block h-screen sticky top-0 shrink-0">{content}</div>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onCloseMobile();
          }}
        >
          <div className="h-full">{content}</div>
        </div>
      )}
    </>
  );
}
