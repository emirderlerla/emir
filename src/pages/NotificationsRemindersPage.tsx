import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Circle,
  Clock,
  Edit3,
  Plus,
  Trash2,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../lib/api';
import type { AppNotification, Project, Reminder } from '../types';
import { formatDateTimeTr } from '../utils/format';

export function NotificationsRemindersPage({
  projects,
  refreshSignal,
  onDataChanged,
  onNotificationsRead,
}: {
  projects: Project[];
  refreshSignal: number;
  onDataChanged: () => void;
  onNotificationsRead: (unread: number) => void;
}) {
  const { showToast } = useToast();
  const { lang, l } = useI18n();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [projectId, setProjectId] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [nRes, rRes] = await Promise.all([
        apiRequest<{ notifications: AppNotification[]; unreadCount: number }>('/api/notifications'),
        apiRequest<{ reminders: Reminder[] }>('/api/reminders'),
      ]);
      setNotifications(nRes.notifications);
      setReminders(rRes.reminders);
      onNotificationsRead(nRes.unreadCount);
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Veriler alınamadı.', 'Failed to fetch data.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [onNotificationsRead, showToast, l]);

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshSignal]);

  const markRead = async (id: string) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
    loadAll();
  };

  const markAllRead = async () => {
    await apiRequest('/api/notifications/read-all', { method: 'POST' });
    showToast(l('Tüm bildirimler okundu olarak işaretlendi.', 'All notifications marked as read.'));
    loadAll();
  };

  const openNewReminder = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setRemindAt(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
    setProjectId('');
    setModalOpen(true);
  };

  const openEditReminder = (r: Reminder) => {
    setEditing(r);
    setTitle(r.title);
    setDescription(r.description);
    setRemindAt(r.remind_at.slice(0, 16));
    setProjectId(r.project_id || '');
    setModalOpen(true);
  };

  const saveReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !remindAt) return;
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        remind_at: remindAt,
        project_id: projectId || null,
      };
      if (editing) {
        await apiRequest(`/api/reminders/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        showToast(l('Hatırlatıcı güncellendi.', 'Reminder updated.'));
      } else {
        await apiRequest('/api/reminders', { method: 'POST', body: JSON.stringify(payload) });
        showToast(l('Hatırlatıcı oluşturuldu.', 'Reminder created.'));
      }
      setModalOpen(false);
      onDataChanged();
      loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Kaydedilemedi.', 'Failed to save.'), 'error');
    }
  };

  const toggleReminder = async (r: Reminder) => {
    await apiRequest(`/api/reminders/${r.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_completed: !r.is_completed }),
    });
    loadAll();
  };

  const deleteReminder = async (id: string) => {
    await apiRequest(`/api/reminders/${id}`, { method: 'DELETE' });
    showToast(l('Hatırlatıcı silindi.', 'Reminder deleted.'));
    onDataChanged();
    loadAll();
  };

  if (loading) return <TableSkeleton rows={6} />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Notifications */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#38BDF8]" />
            <h2 className="text-sm font-semibold">{l('Uygulama İçi Bildirimler', 'In-App Notifications')}</h2>
          </div>
          {notifications.some((n) => !n.is_read) && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-xs text-[#38BDF8] hover:underline"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {l('Tümünü Okundu İşaretle', 'Mark All Read')}
            </button>
          )}
        </div>

        <p className="text-[11px] text-slate-500">
          {l(
            'Not: Bildirimler uygulama içi kontrol motoru tarafından son tarih, gecikme ve proje aktivitesine göre otomatik üretilir.',
            'Note: Notifications are automatically generated by the in-app control engine based on deadlines, delays, and project activity.'
          )}
        </p>

        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={l('Bildirim bulunmuyor', 'No notifications')}
            description={l(
              'Yaklaşan teslim tarihleri, geciken görevler ve kontrol uyarıları burada görünecektir.',
              'Upcoming deadlines, overdue tasks, and control alerts will appear here.'
            )}
          />
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`py-3 flex items-start justify-between gap-3 ${n.is_read ? 'opacity-55' : ''}`}
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-[#38BDF8]">{n.title}</div>
                  <div className="text-sm text-slate-800 dark:text-slate-200">{n.message}</div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500">
                    {formatDateTimeTr(n.created_at, lang)}
                  </div>
                </div>
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className="text-xs text-[#38BDF8] hover:underline shrink-0"
                  >
                    {l('Okundu', 'Read')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reminders */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#38BDF8]" />
            <h2 className="text-sm font-semibold">{l('Hatırlatıcılar', 'Reminders')}</h2>
          </div>
          <button
            type="button"
            onClick={openNewReminder}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2563EB] text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            {l('Yeni Hatırlatıcı', 'New Reminder')}
          </button>
        </div>

        {reminders.length === 0 ? (
          <EmptyState
            icon={Clock}
            title={l('Hatırlatıcı bulunmuyor', 'No reminders')}
            description={l(
              'Önemli toplantılar, kontroller ve hedefler için hatırlatıcı ekleyin.',
              'Add reminders for important meetings, reviews, and targets.'
            )}
            actionLabel={l('Hatırlatıcı Ekle', 'Add Reminder')}
            onAction={openNewReminder}
          />
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {reminders.map((r) => (
              <div key={r.id} className="py-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleReminder(r)}
                    className="mt-0.5 text-slate-400 hover:text-emerald-400 shrink-0"
                  >
                    {r.is_completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Circle className="w-4 h-4" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <div className={`text-sm font-medium ${r.is_completed ? 'line-through text-slate-500' : ''}`}>
                      {r.title}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      {formatDateTimeTr(r.remind_at, lang)}
                      {r.project_name ? ` · ${r.project_name}` : ''}
                    </div>
                    {r.description && <div className="text-xs text-slate-500 mt-0.5">{r.description}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditReminder(r)}
                    className="p-1.5 text-slate-400 hover:text-white"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteReminder(r.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? l('Hatırlatıcıyı Düzenle', 'Edit Reminder') : l('Yeni Hatırlatıcı', 'New Reminder')}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={saveReminder} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Başlık *', 'Title *')}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Tarih ve Saat *', 'Date & Time *')}</label>
            <input
              type="datetime-local"
              required
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('İlişkili Proje', 'Linked Project')}</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            >
              <option value="">{l('Genel Hatırlatıcı', 'General Reminder')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Açıklama', 'Description')}</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700"
            >
              {l('İptal', 'Cancel')}
            </button>
            <button type="submit" className="px-4 py-2 text-sm font-medium rounded-lg bg-[#2563EB] text-white">
              {l('Kaydet', 'Save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
