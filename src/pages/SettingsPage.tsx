import React, { useEffect, useState } from 'react';
import { Download, Save, Shield, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';
import { apiRequest, downloadProtectedFile } from '../lib/api';
import type { UserProfile, UserSettings } from '../types';

export function SettingsPage({ onDataChanged }: { onDataChanged: () => void }) {
  const { user, settings, updateUserLocal, updateSettingsLocal, logout } = useAuth();
  const { showToast } = useToast();
  const { lang, setLanguage, l } = useI18n();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [roleTitle, setRoleTitle] = useState(user?.role_title || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [maxActive, setMaxActive] = useState(settings?.max_active_projects ?? 3);
  const [allowOverride, setAllowOverride] = useState(settings?.allow_limit_override ?? true);
  const [inactiveDays, setInactiveDays] = useState(settings?.inactive_days_threshold ?? 7);
  const [theme, setTheme] = useState<'dark' | 'slate' | 'light'>(settings?.theme ?? 'dark');
  const [languagePref, setLanguagePref] = useState<'tr-TR' | 'en-US'>(
    (settings?.language || lang) === 'en-US' || lang === 'en' ? 'en-US' : 'tr-TR'
  );
  const [aiPersona, setAiPersona] = useState(settings?.ai_persona ?? 'stratejik');
  const [aiAutoDaily, setAiAutoDaily] = useState(settings?.ai_auto_daily_summary ?? true);
  const [notifyOverdue, setNotifyOverdue] = useState(settings?.notify_overdue ?? true);
  const [notifyUpcomingDays, setNotifyUpcomingDays] = useState(settings?.notify_upcoming_days ?? 3);
  const [notifyInactive, setNotifyInactive] = useState(settings?.notify_inactive_projects ?? true);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setLanguagePref(lang === 'en' ? 'en-US' : 'tr-TR');
  }, [lang]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: fullName,
          role_title: roleTitle,
          email,
          current_password: currentPassword || undefined,
          new_password: newPassword || undefined,
        }),
      });
      updateUserLocal(res.user);
      setCurrentPassword('');
      setNewPassword('');
      showToast(l('Profil bilgileri güncellendi.', 'Profile information updated.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Profil güncellenemedi.', 'Could not update profile.'), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await apiRequest<{ settings: UserSettings }>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          max_active_projects: maxActive,
          allow_limit_override: allowOverride,
          inactive_days_threshold: inactiveDays,
          theme,
          language: languagePref,
          ai_persona: aiPersona,
          ai_auto_daily_summary: aiAutoDaily,
          notify_overdue: notifyOverdue,
          notify_upcoming_days: notifyUpcomingDays,
          notify_inactive_projects: notifyInactive,
        }),
      });
      updateSettingsLocal(res.settings);
      await setLanguage(languagePref === 'en-US' ? 'en' : 'tr', false);
      onDataChanged();
      showToast(
        languagePref === 'en-US' ? 'Application preferences saved.' : 'Uygulama tercihleri kaydedildi.'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Ayarlar kaydedilemedi.', 'Could not save settings.'), 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv', entity: 'all' | 'projects' | 'tasks' | 'ideas') => {
    try {
      const filename =
        format === 'json'
          ? `noah-${lang === 'en' ? 'backup' : 'yedek'}-${new Date().toISOString().slice(0, 10)}.json`
          : `noah-${entity}-${new Date().toISOString().slice(0, 10)}.csv`;
      await downloadProtectedFile(`/api/export?format=${format}&entity=${entity}`, filename);
      showToast(l('Dışa aktarım dosyası indirildi.', 'Export file downloaded.'));
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Dışa aktarım başarısız.', 'Export failed.'), 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Profile & Account */}
      <form
        onSubmit={handleSaveProfile}
        className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-6 space-y-4"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <User className="w-4 h-4 text-[#38BDF8]" />
          <span>{l('Kullanıcı Profili ve Hesap Güvenliği', 'User Profile & Account Security')}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Ad Soyad', 'Full Name')}</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Ünvan / Rol', 'Title / Role')}</label>
            <input
              type="text"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('E-posta', 'Email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {l('Mevcut Şifre (değiştirmek için)', 'Current Password (to change)')}
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Yeni Şifre', 'New Password')}</label>
            <input
              type="password"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={logout}
            className="text-xs font-medium text-rose-400 hover:underline"
          >
            {l('Oturumu Kapat', 'Sign Out')}
          </button>
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#2563EB] text-white"
          >
            <Save className="w-3.5 h-3.5" />
            {savingProfile
              ? l('Kaydediliyor...', 'Saving...')
              : l('Profili Güncelle', 'Update Profile')}
          </button>
        </div>
      </form>

      {/* Workspace, Control, Theme, Notifications & AI Settings */}
      <form
        onSubmit={handleSaveSettings}
        className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-6 space-y-5"
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="w-4 h-4 text-[#38BDF8]" />
          <span>
            {l(
              'Proje Kontrol, Tema, Dil, Bildirim ve Yapay Zeka Tercihleri',
              'Project Control, Theme, Language, Notification & AI Preferences'
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {l('Maks. Aktif Odak Proje Limiti', 'Max Active Focus Project Limit')}
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxActive}
              onChange={(e) => setMaxActive(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {l('Pasif Proje Eşiği (Gün)', 'Inactive Project Threshold (Days)')}
            </label>
            <input
              type="number"
              min={1}
              max={90}
              value={inactiveDays}
              onChange={(e) => setInactiveDays(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {l('Yaklaşan Tarih Uyarısı (Gün)', 'Upcoming Deadline Alert (Days)')}
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={notifyUpcomingDays}
              onChange={(e) => setNotifyUpcomingDays(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Tema Görünümü', 'Theme Appearance')}</label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'dark' | 'slate' | 'light')}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            >
              <option value="dark">{l('Derin Komuta Koyu (#070B14)', 'Deep Command Dark (#070B14)')}</option>
              <option value="slate">{l('Gece Arduvaz (#0B1120)', 'Midnight Slate (#0B1120)')}</option>
              <option value="light">{l('Açık Tema', 'Light Theme')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {l('Uygulama Dili ve Yerel Ayar', 'Application Language & Locale')}
            </label>
            <select
              value={languagePref}
              onChange={(e) => {
                const val = e.target.value === 'en-US' ? 'en-US' : 'tr-TR';
                setLanguagePref(val);
              }}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            >
              <option value="tr-TR">Türkçe (tr-TR)</option>
              <option value="en-US">English (en-US)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('AI Asistan Üslubu', 'AI Assistant Persona')}</label>
            <select
              value={aiPersona}
              onChange={(e) => setAiPersona(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            >
              <option value="stratejik">{l('Stratejik Ürün Mimarı', 'Strategic Product Architect')}</option>
              <option value="direkt">{l('Kısa ve Net Yönetici', 'Concise Executive Assistant')}</option>
              <option value="koc">{l('Odak ve Verimlilik Koçu', 'Focus & Productivity Coach')}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={allowOverride}
              onChange={(e) => setAllowOverride(e.target.checked)}
              className="accent-[#38BDF8]"
            />
            <span>
              {l(
                'Odak proje limitinin manuel geçersiz kılınmasına izin ver',
                'Allow manual override of the active focus project limit'
              )}
            </span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyOverdue}
              onChange={(e) => setNotifyOverdue(e.target.checked)}
              className="accent-[#38BDF8]"
            />
            <span>
              {l(
                'Geciken görevler için uygulama içi bildirim üret',
                'Generate in-app notifications for overdue tasks'
              )}
            </span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyInactive}
              onChange={(e) => setNotifyInactive(e.target.checked)}
              className="accent-[#38BDF8]"
            />
            <span>
              {l('Pasif kalan projeler için uyarı oluştur', 'Generate alerts for inactive projects')}
            </span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={aiAutoDaily}
              onChange={(e) => setAiAutoDaily(e.target.checked)}
              className="accent-[#38BDF8]"
            />
            <span>
              {l('AI günlük özet önerilerini etkinleştir', 'Enable AI daily overview recommendations')}
            </span>
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={savingSettings}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#2563EB] text-white"
          >
            <Save className="w-3.5 h-3.5" />
            {savingSettings
              ? l('Kaydediliyor...', 'Saving...')
              : l('Tercihleri Kaydet', 'Save Preferences')}
          </button>
        </div>
      </form>

      {/* Data Export & Backup */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Download className="w-4 h-4 text-[#38BDF8]" />
          <span>{l('Veri Dışa Aktarım ve Yedekleme', 'Data Export & Backup')}</span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {l(
            'Tüm projelerinizi, görevlerinizi, alt görevlerinizi, fikirlerinizi, kilometre taşlarınızı, notlarınızı ve hatırlatıcılarınızı ilişkisel JSON yedeği veya CSV tabloları olarak indirebilirsiniz. Otomatik zamanlanmış bulut yedeklemeleri yalnızca harici veritabanı politikası yapılandırıldığında devreye girer.',
            'Download all your projects, tasks, subtasks, ideas, milestones, notes, and reminders as a relational JSON backup or CSV spreadsheets. Automated scheduled cloud backups only run when an external database policy is configured.'
          )}
        </p>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => handleExport('json', 'all')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#2563EB] hover:bg-blue-500 text-white"
          >
            <Download className="w-3.5 h-3.5" />
            {l('Tam İlişkisel Yedek İndir (JSON)', 'Download Full Relational Backup (JSON)')}
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv', 'projects')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#38BDF8]"
          >
            {l('Projeler (CSV)', 'Projects (CSV)')}
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv', 'tasks')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#38BDF8]"
          >
            {l('Görevler (CSV)', 'Tasks (CSV)')}
          </button>
          <button
            type="button"
            onClick={() => handleExport('csv', 'ideas')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#38BDF8]"
          >
            {l('Fikirler (CSV)', 'Ideas (CSV)')}
          </button>
        </div>
      </div>
    </div>
  );
}
