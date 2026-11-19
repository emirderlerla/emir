import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { apiRequest } from './lib/api';
import type { UserSettings } from './types';

export type Language = 'tr' | 'en';

const STORAGE_KEY = 'noah_language';

function normalizeLanguage(val: string | null | undefined): Language {
  if (!val) return 'tr';
  return val.toLowerCase().startsWith('en') ? 'en' : 'tr';
}

function readStoredLanguage(): Language {
  try {
    return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'tr';
  }
}

function writeStoredLanguage(lang: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Ignore storage errors
  }
}

const PROJECT_STATUS_EN: Record<string, string> = {
  Fikir: 'Idea',
  Araştırma: 'Research',
  Planlama: 'Planning',
  Geliştirme: 'Development',
  Test: 'Testing',
  Yayınlandı: 'Shipped',
  Beklemede: 'On Hold',
  Donduruldu: 'Frozen',
  'İptal Edildi': 'Cancelled',
};

const TASK_STATUS_EN: Record<string, string> = {
  Yapılacak: 'To Do',
  'Devam Ediyor': 'In Progress',
  İncelemede: 'In Review',
  Tamamlandı: 'Completed',
};

const PRIORITY_EN: Record<string, string> = {
  Düşük: 'Low',
  Orta: 'Medium',
  Yüksek: 'High',
  Kritik: 'Critical',
};

const DIFFICULTY_EN: Record<string, string> = {
  Kolay: 'Easy',
  Orta: 'Medium',
  Zor: 'Hard',
  'Çok Zor': 'Very Hard',
};

const ENTITY_TYPE_EN: Record<string, string> = {
  project: 'Project',
  task: 'Task',
  idea: 'Idea',
  milestone: 'Milestone',
  note: 'Note',
  attachment: 'File',
  reminder: 'Reminder',
  settings: 'Settings',
  profile: 'Profile',
};

const NAV_LABEL_EN: Record<string, string> = {
  dashboard: 'Dashboard',
  control: 'Project Control',
  ai: 'AI Assistant',
  projects: 'Projects',
  tasks: 'Tasks',
  ideas: 'Idea Pool',
  calendar: 'Calendar',
  notes: 'Notes & Files',
  analytics: 'Analytics',
  activity: 'Activity Log',
  notifications: 'Notifications',
  archive: 'Archive',
  settings: 'Settings',
};

const NAV_SECTION_EN: Record<string, string> = {
  Komuta: 'Command',
  'Çalışma Alanı': 'Workspace',
  'İzleme ve Sistem': 'Monitoring & System',
};

interface LanguageContextValue {
  lang: Language;
  isEn: boolean;
  locale: string;
  setLanguage: (next: Language, persistServer?: boolean) => Promise<void>;
  toggleLanguage: () => Promise<void>;
  l: (tr: string, en: string) => string;
  tProjectStatus: (status: string) => string;
  tTaskStatus: (status: string) => string;
  tPriority: (priority: string) => string;
  tDifficulty: (difficulty: string) => string;
  tEntityType: (type: string) => string;
  tNavLabel: (routeId: string, trLabel: string) => string;
  tNavSection: (trSection: string) => string;
  tAnyStatus: (status: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  children,
  onLanguageChanged,
}: {
  children: React.ReactNode;
  onLanguageChanged?: () => void;
}) {
  const { user, settings, updateSettingsLocal } = useAuth();
  const [lang, setLangState] = useState<Language>(() => readStoredLanguage());

  useEffect(() => {
    if (settings?.language) {
      const serverLang = normalizeLanguage(settings.language);
      setLangState(serverLang);
      writeStoredLanguage(serverLang);
    }
  }, [settings?.language]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLanguage = useCallback(
    async (next: Language, persistServer = true) => {
      setLangState(next);
      writeStoredLanguage(next);
      if (persistServer && user) {
        try {
          const res = await apiRequest<{ settings: UserSettings }>('/api/settings', {
            method: 'PATCH',
            body: JSON.stringify({ language: next === 'en' ? 'en-US' : 'tr-TR' }),
          });
          updateSettingsLocal(res.settings);
          onLanguageChanged?.();
        } catch {
          // Local preference remains applied even if network fails
        }
      }
    },
    [user, updateSettingsLocal, onLanguageChanged]
  );

  const toggleLanguage = useCallback(async () => {
    await setLanguage(lang === 'tr' ? 'en' : 'tr', true);
  }, [lang, setLanguage]);

  const isEn = lang === 'en';
  const locale = isEn ? 'en-US' : 'tr-TR';

  const l = useCallback((tr: string, en: string) => (isEn ? en : tr), [isEn]);

  const tProjectStatus = useCallback(
    (status: string) => (isEn ? PROJECT_STATUS_EN[status] || status : status),
    [isEn]
  );

  const tTaskStatus = useCallback(
    (status: string) => (isEn ? TASK_STATUS_EN[status] || status : status),
    [isEn]
  );

  const tPriority = useCallback(
    (priority: string) => (isEn ? PRIORITY_EN[priority] || priority : priority),
    [isEn]
  );

  const tDifficulty = useCallback(
    (difficulty: string) => (isEn ? DIFFICULTY_EN[difficulty] || difficulty : difficulty),
    [isEn]
  );

  const tEntityType = useCallback(
    (type: string) => (isEn ? ENTITY_TYPE_EN[type] || type : type),
    [isEn]
  );

  const tNavLabel = useCallback(
    (routeId: string, trLabel: string) => (isEn ? NAV_LABEL_EN[routeId] || trLabel : trLabel),
    [isEn]
  );

  const tNavSection = useCallback(
    (trSection: string) => (isEn ? NAV_SECTION_EN[trSection] || trSection : trSection),
    [isEn]
  );

  const tAnyStatus = useCallback(
    (status: string) =>
      isEn ? PROJECT_STATUS_EN[status] || TASK_STATUS_EN[status] || status : status,
    [isEn]
  );

  return (
    <LanguageContext.Provider
      value={{
        lang,
        isEn,
        locale,
        setLanguage,
        toggleLanguage,
        l,
        tProjectStatus,
        tTaskStatus,
        tPriority,
        tDifficulty,
        tEntityType,
        tNavLabel,
        tNavSection,
        tAnyStatus,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useI18n must be used inside LanguageProvider');
  return ctx;
}
