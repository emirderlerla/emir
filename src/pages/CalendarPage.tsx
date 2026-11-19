import React, { useCallback, useEffect, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';
import { apiRequest } from '../lib/api';
import { formatDateTr } from '../utils/format';

interface CalendarEvent {
  id: string;
  entityId: string;
  type: 'project_deadline' | 'task_deadline' | 'milestone' | 'reminder';
  title: string;
  date: string;
  time: string | null;
  status: string;
  priority: string;
  subtitle: string;
}

interface CalendarPageProps {
  refreshSignal: number;
  onDataChanged: () => void;
  onOpenNewTaskForDate: (date: string) => void;
}

const WEEKDAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CalendarPage({
  refreshSignal,
  onDataChanged,
  onOpenNewTaskForDate,
}: CalendarPageProps) {
  const { showToast } = useToast();
  const { lang, isEn, locale, l, tAnyStatus } = useI18n();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [remTitle, setRemTitle] = useState('');
  const [remTime, setRemTime] = useState('09:00');
  const [remDesc, setRemDesc] = useState('');

  const loadEvents = useCallback(async () => {
    try {
      const res = await apiRequest<{ events: CalendarEvent[] }>('/api/calendar');
      setEvents(res.events);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Takvim verileri yüklenemedi.', 'Failed to load calendar data.'),
        'error'
      );
    }
  }, [showToast, l]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, refreshSignal]);

  const navigatePeriod = (dir: -1 | 1) => {
    const next = new Date(cursorDate);
    if (view === 'month') next.setMonth(next.getMonth() + dir);
    else if (view === 'week') next.setDate(next.getDate() + dir * 7);
    else next.setDate(next.getDate() + dir);
    setCursorDate(next);
    if (view === 'day') setSelectedDate(toDateKey(next));
  };

  const goToday = () => {
    const now = new Date();
    setCursorDate(now);
    setSelectedDate(toDateKey(now));
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remTitle.trim()) return;
    try {
      await apiRequest('/api/reminders', {
        method: 'POST',
        body: JSON.stringify({
          title: remTitle.trim(),
          description: remDesc.trim(),
          remind_at: `${selectedDate}T${remTime}:00`,
        }),
      });
      setRemTitle('');
      setRemDesc('');
      setReminderModalOpen(false);
      showToast(l('Hatırlatıcı takvime eklendi.', 'Reminder added to calendar.'));
      onDataChanged();
      loadEvents();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Hatırlatıcı eklenemedi.', 'Failed to add reminder.'),
        'error'
      );
    }
  };

  // Compute days for current view
  const getMonthDays = () => {
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday=0
    const start = new Date(year, month, 1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const getWeekDays = () => {
    const offset = (cursorDate.getDay() + 6) % 7;
    const monday = new Date(cursorDate);
    monday.setDate(cursorDate.getDate() - offset);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  const todayKey = toDateKey(new Date());
  const selectedDayEvents = events.filter((e) => e.date === selectedDate);
  const upcomingEvents = events
    .filter((e) => e.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8);

  const periodTitle =
    view === 'month'
      ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(cursorDate)
      : view === 'week'
        ? `${formatDateTr(toDateKey(getWeekDays()[0]), lang)} — ${formatDateTr(toDateKey(getWeekDays()[6]), lang)}`
        : formatDateTr(selectedDate, lang);

  const weekdays = isEn ? WEEKDAYS_EN : WEEKDAYS_TR;

  const translateSubtitle = (sub: string) => {
    if (!isEn) return sub;
    if (sub === 'Proje Teslimi') return 'Project Deadline';
    if (sub === 'Görev Son Tarihi') return 'Task Due Date';
    if (sub === 'Kilometre Taşı') return 'Milestone';
    if (sub === 'Hatırlatıcı') return 'Reminder';
    return sub;
  };

  const eventColor = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'project_deadline':
        return 'bg-[#2563EB]/20 text-[#38BDF8] border-[#38BDF8]/30';
      case 'milestone':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'reminder':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      default:
        return 'bg-slate-800 text-slate-200 border-slate-700';
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigatePeriod(-1)}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-800 hover:border-[#38BDF8]"
            aria-label={l('Önceki', 'Previous')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-800 hover:border-[#38BDF8]"
          >
            {l('Bugün', 'Today')}
          </button>
          <button
            type="button"
            onClick={() => navigatePeriod(1)}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-800 hover:border-[#38BDF8]"
            aria-label={l('Sonraki', 'Next')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <h2 className="text-base font-display font-semibold ml-2 capitalize">{periodTitle}</h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded-lg bg-slate-100 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800">
            {(
              [
                ['month', l('Aylık', 'Month')],
                ['week', l('Haftalık', 'Week')],
                ['day', l('Günlük', 'Day')],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs font-medium rounded-md ${
                  view === v ? 'bg-white dark:bg-[#101827] text-[#38BDF8]' : 'text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReminderModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#2563EB] hover:bg-blue-500 text-white whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            {l('Hatırlatıcı', 'Reminder')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Main Calendar Canvas */}
        <div className="xl:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-4">
          {view === 'month' && (
            <div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {weekdays.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-slate-500 py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {getMonthDays().map((day) => {
                  const key = toDateKey(day);
                  const inMonth = day.getMonth() === cursorDate.getMonth();
                  const dayEvents = events.filter((e) => e.date === key);
                  const isSelected = key === selectedDate;
                  const isToday = key === todayKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedDate(key)}
                      className={`min-h-[86px] p-1.5 rounded-xl border text-left flex flex-col transition-colors ${
                        isSelected
                          ? 'border-[#38BDF8] bg-[#38BDF8]/8'
                          : 'border-slate-200 dark:border-slate-800/70 hover:border-slate-400 dark:hover:border-slate-700'
                      } ${!inMonth ? 'opacity-40' : ''}`}
                    >
                      <span
                        className={`text-xs font-mono tabular-nums font-semibold ${
                          isToday ? 'text-[#38BDF8]' : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      <div className="mt-1 space-y-1 w-full overflow-hidden">
                        {dayEvents.slice(0, 2).map((ev) => (
                          <div
                            key={ev.id}
                            className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${eventColor(ev.type)}`}
                          >
                            {ev.title}
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <div className="text-[10px] text-slate-500 pl-1">
                            +{dayEvents.length - 2} {l('daha', 'more')}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {view === 'week' && (
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
              {getWeekDays().map((day) => {
                const key = toDateKey(day);
                const dayEvents = events.filter((e) => e.date === key);
                const isSelected = key === selectedDate;
                return (
                  <div
                    key={key}
                    onClick={() => setSelectedDate(key)}
                    className={`min-h-[260px] p-2.5 rounded-xl border cursor-pointer ${
                      isSelected
                        ? 'border-[#38BDF8] bg-[#38BDF8]/5'
                        : 'border-slate-200 dark:border-slate-800/80'
                    }`}
                  >
                    <div className="text-xs font-semibold pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
                      {new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }).format(day)}
                    </div>
                    <div className="space-y-1.5">
                      {dayEvents.length === 0 ? (
                        <span className="text-[11px] text-slate-500">{l('Kayıt yok', 'No events')}</span>
                      ) : (
                        dayEvents.map((ev) => (
                          <div
                            key={ev.id}
                            className={`p-1.5 rounded-lg border text-[11px] ${eventColor(ev.type)}`}
                          >
                            <div className="font-medium truncate">{ev.title}</div>
                            <div className="text-[10px] opacity-80 truncate">{translateSubtitle(ev.subtitle)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {view === 'day' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold">
                  {isEn
                    ? `Events for ${formatDateTr(selectedDate, lang)}`
                    : `${formatDateTr(selectedDate, lang)} Günü Etkinlikleri`}
                </h3>
                <button
                  type="button"
                  onClick={() => onOpenNewTaskForDate(selectedDate)}
                  className="text-xs font-medium text-[#38BDF8] hover:underline"
                >
                  {l('+ Bu Güne Görev Ekle', '+ Add Task to This Day')}
                </button>
              </div>
              {selectedDayEvents.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  {l(
                    'Seçili gün için planlanmış son tarih, kilometre taşı veya hatırlatıcı bulunmuyor.',
                    'No deadlines, milestones, or reminders scheduled for this day.'
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {selectedDayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${eventColor(ev.type)}`}
                    >
                      <div>
                        <div className="text-sm font-semibold">{ev.title}</div>
                        <div className="text-xs opacity-80 mt-0.5">
                          {translateSubtitle(ev.subtitle)} · {tAnyStatus(ev.status)}
                        </div>
                      </div>
                      {ev.time && <span className="text-xs font-mono tabular-nums">{ev.time}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Side Day Inspector & Upcoming */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-[#38BDF8]" />
                <span>{formatDateTr(selectedDate, lang)}</span>
              </h3>
              <button
                type="button"
                onClick={() => onOpenNewTaskForDate(selectedDate)}
                className="text-xs text-[#38BDF8] hover:underline"
              >
                {l('+ Görev', '+ Task')}
              </button>
            </div>
            {selectedDayEvents.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                {l('Bu tarihte kayıtlı etkinlik yok.', 'No events scheduled on this date.')}
              </p>
            ) : (
              <div className="space-y-2">
                {selectedDayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800"
                  >
                    <div className="text-xs font-semibold">{ev.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {translateSubtitle(ev.subtitle)}
                      {ev.time ? ` · ${ev.time}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-4 space-y-3">
            <h3 className="text-sm font-semibold">{l('Yaklaşan Etkinlikler', 'Upcoming Events')}</h3>
            {upcomingEvents.length === 0 ? (
              <p className="text-xs text-slate-500">
                {l('Yaklaşan etkinlik bulunmuyor.', 'No upcoming events.')}
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {upcomingEvents.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setSelectedDate(ev.date)}
                    className="w-full py-2 text-left flex items-center justify-between gap-2 hover:text-[#38BDF8]"
                  >
                    <span className="text-xs truncate">{ev.title}</span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                      {formatDateTr(ev.date, lang)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={reminderModalOpen}
        onClose={() => setReminderModalOpen(false)}
        title={l('Takvime Hatırlatıcı Ekle', 'Add Calendar Reminder')}
        subtitle={`${l('Seçili Tarih', 'Selected Date')}: ${formatDateTr(selectedDate, lang)}`}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleCreateReminder} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {l('Hatırlatıcı Başlığı *', 'Reminder Title *')}
            </label>
            <input
              type="text"
              required
              value={remTitle}
              onChange={(e) => setRemTitle(e.target.value)}
              placeholder={l('Örn. Haftalık proje incelemesi', 'e.g. Weekly project review')}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Saat', 'Time')}</label>
            <input
              type="time"
              value={remTime}
              onChange={(e) => setRemTime(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Not', 'Note')}</label>
            <textarea
              rows={2}
              value={remDesc}
              onChange={(e) => setRemDesc(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReminderModalOpen(false)}
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
