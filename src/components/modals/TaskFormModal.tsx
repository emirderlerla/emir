import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../i18n';
import {
  PRIORITY_LEVELS,
  TASK_STATUSES,
  type PriorityLevel,
  type Project,
  type Task,
  type TaskStatus,
} from '../../types';
import { Modal } from '../ui/Modal';

interface TaskFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (task: Task) => void;
  projects: Project[];
  initialTask?: Task | null;
  defaultProjectId?: string | null;
  defaultDueDate?: string | null;
}

export function TaskFormModal({
  open,
  onClose,
  onSaved,
  projects,
  initialTask,
  defaultProjectId,
  defaultDueDate,
}: TaskFormModalProps) {
  const { showToast } = useToast();
  const { l, tPriority, tTaskStatus } = useI18n();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('Orta');
  const [status, setStatus] = useState<TaskStatus>('Yapılacak');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [actualMinutes, setActualMinutes] = useState(0);
  const [tagsText, setTagsText] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initialTask) {
      setTitle(initialTask.title);
      setDescription(initialTask.description);
      setProjectId(initialTask.project_id || '');
      setPriority(initialTask.priority);
      setStatus(initialTask.status);
      setStartDate(initialTask.start_date ? initialTask.start_date.slice(0, 10) : '');
      setDueDate(initialTask.due_date ? initialTask.due_date.slice(0, 10) : '');
      setEstimatedMinutes(initialTask.estimated_minutes);
      setActualMinutes(initialTask.actual_minutes);
      setTagsText(initialTask.tags.join(', '));
      setNotes(initialTask.notes);
    } else {
      setTitle('');
      setDescription('');
      setProjectId(defaultProjectId || '');
      setPriority('Orta');
      setStatus('Yapılacak');
      setStartDate(new Date().toISOString().slice(0, 10));
      setDueDate(defaultDueDate || '');
      setEstimatedMinutes(60);
      setActualMinutes(0);
      setTagsText('');
      setNotes('');
    }
  }, [open, initialTask, defaultProjectId, defaultDueDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast(l('Görev başlığı zorunludur.', 'Task title is required.'), 'error');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        project_id: projectId || null,
        priority,
        status,
        start_date: startDate || null,
        due_date: dueDate || null,
        estimated_minutes: Math.max(0, Number(estimatedMinutes || 0)),
        actual_minutes: Math.max(0, Number(actualMinutes || 0)),
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        notes: notes.trim(),
      };

      const res = initialTask
        ? await apiRequest<{ task: Task }>(`/api/tasks/${initialTask.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ task: Task }>('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      showToast(initialTask ? l('Görev güncellendi.', 'Task updated.') : l('Görev oluşturuldu.', 'Task created.'));
      onSaved(res.task);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Görev kaydedilemedi.', 'Failed to save task.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialTask ? l('Görevi Düzenle', 'Edit Task') : l('Yeni Görev Oluştur', 'Create New Task')}
      subtitle={l(
        'Görev ayrıntılarını, bağlı projeyi ve süre tahminlerini girin.',
        'Enter task details, linked project, and time estimates.'
      )}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            {l('Görev Başlığı *', 'Task Title *')}
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={l('Örn. API doğrulama şemalarını tamamla', 'e.g. Complete API validation schemas')}
            className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            {l('Açıklama', 'Description')}
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={l('Görev kapsamı ve kabul ölçütleri...', 'Task scope and acceptance criteria...')}
            className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {l('İlgili Proje', 'Linked Project')}
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            >
              <option value="">{l('Bağımsız Görev', 'Standalone Task')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {l('Öncelik', 'Priority')}
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as PriorityLevel)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            >
              {PRIORITY_LEVELS.map((p) => (
                <option key={p} value={p}>
                  {tPriority(p)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {l('Durum', 'Status')}
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tTaskStatus(s)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {l('Başlangıç', 'Start Date')}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {l('Son Tarih', 'Due Date')}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {l('Tahmini (dk)', 'Estimated (min)')}
            </label>
            <input
              type="number"
              min={0}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {l('Gerçekleşen (dk)', 'Actual (min)')}
            </label>
            <input
              type="number"
              min={0}
              value={actualMinutes}
              onChange={(e) => setActualMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            {l('Etiketler (virgülle ayırın)', 'Tags (comma-separated)')}
          </label>
          <input
            type="text"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder={l('backend, kritik, sprint-1', 'backend, critical, sprint-1')}
            className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            {l('Görev Notları', 'Task Notes')}
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={l('Ek teknik notlar veya bağlantılar...', 'Additional technical notes or links...')}
            className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {l('İptal', 'Cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[#2563EB] hover:bg-blue-500 text-white disabled:opacity-60"
          >
            {submitting
              ? l('Kaydediliyor...', 'Saving...')
              : initialTask
                ? l('Güncelle', 'Update')
                : l('Görevi Ekle', 'Add Task')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
