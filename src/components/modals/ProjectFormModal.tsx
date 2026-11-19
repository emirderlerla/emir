import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ApiError, apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../i18n';
import {
  PRIORITY_LEVELS,
  PROJECT_STATUSES,
  type PriorityLevel,
  type Project,
  type ProjectStatus,
} from '../../types';
import { Modal } from '../ui/Modal';

interface ProjectFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (project: Project) => void;
  initialProject?: Project | null;
}

export function ProjectFormModal({ open, onClose, onSaved, initialProject }: ProjectFormModalProps) {
  const { showToast } = useToast();
  const { isEn, l, tPriority, tProjectStatus } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Yazılım');
  const [priority, setPriority] = useState<PriorityLevel>('Orta');
  const [status, setStatus] = useState<ProjectStatus>('Planlama');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [progress, setProgress] = useState(0);
  const [tagsText, setTagsText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [limitPrompt, setLimitPrompt] = useState<{ message: string; allowOverride: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLimitPrompt(null);
    if (initialProject) {
      setName(initialProject.name);
      setDescription(initialProject.description);
      setCategory(initialProject.category);
      setPriority(initialProject.priority);
      setStatus(initialProject.status);
      setStartDate(initialProject.start_date ? initialProject.start_date.slice(0, 10) : '');
      setDeadline(initialProject.deadline ? initialProject.deadline.slice(0, 10) : '');
      setProgress(initialProject.progress);
      setTagsText(initialProject.tags.join(', '));
    } else {
      setName('');
      setDescription('');
      setCategory(l('Yazılım', 'Software'));
      setPriority('Orta');
      setStatus('Planlama');
      setStartDate(new Date().toISOString().slice(0, 10));
      setDeadline('');
      setProgress(0);
      setTagsText('');
    }
  }, [open, initialProject, l]);

  const submitForm = async (overrideLimit = false) => {
    if (!name.trim()) {
      showToast(l('Lütfen bir proje adı girin.', 'Please enter a project name.'), 'error');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        category: category.trim() || l('Genel', 'General'),
        priority,
        status,
        start_date: startDate || null,
        deadline: deadline || null,
        progress: Number(progress),
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        overrideLimit,
      };

      const res = initialProject
        ? await apiRequest<{ project: Project }>(`/api/projects/${initialProject.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ project: Project }>('/api/projects', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      showToast(initialProject ? l('Proje güncellendi.', 'Project updated.') : l('Proje oluşturuldu.', 'Project created.'));
      onSaved(res.project);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'FOCUS_LIMIT_REACHED') {
        setLimitPrompt({
          message: err.message,
          allowOverride: Boolean(err.data?.allowOverride ?? true),
        });
      } else {
        showToast(err instanceof Error ? err.message : l('Proje kaydedilemedi.', 'Failed to save project.'), 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialProject ? l('Projeyi Düzenle', 'Edit Project') : l('Yeni Proje Oluştur', 'Create New Project')}
      subtitle={l(
        'Proje bilgilerini, durumunu ve teslim hedeflerini belirleyin.',
        'Set project details, status, and delivery targets.'
      )}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitForm(false);
        }}
        className="space-y-4"
      >
        {limitPrompt && (
          <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-200 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{limitPrompt.message}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setStatus('Beklemede');
                  setLimitPrompt(null);
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-700 bg-[#070B14] text-slate-200 hover:border-slate-500"
              >
                {l('Beklemede Olarak Ayarla', 'Set as On Hold')}
              </button>
              {limitPrompt.allowOverride && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => submitForm(true)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950"
                >
                  {l('Limiti Geçersiz Kıl ve Aktifleştir', 'Override Limit & Activate')}
                </button>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            {l('Proje Adı *', 'Project Name *')}
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={l('Örn. Noah Mobil Senkronizasyon', 'e.g. Noah Mobile Sync')}
            className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            {l('Açıklama', 'Description')}
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={l(
              'Projenin kapsamı, hedefi ve temel çıktıları...',
              'Project scope, goal, and key deliverables...'
            )}
            className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {l('Kategori', 'Category')}
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={l('Yazılım, Yapay Zeka...', 'Software, AI...')}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            />
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
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tProjectStatus(s)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              {l('Başlangıç Tarihi', 'Start Date')}
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
              {l('Teslim Tarihi', 'Deadline')}
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <label className="font-medium text-slate-600 dark:text-slate-300">
              {l('İlerleme Yüzdesi', 'Completion Progress')}
            </label>
            <span className="font-mono tabular-nums font-semibold text-[#38BDF8]">
              {isEn ? `${progress}%` : `%${progress}`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="w-full accent-[#38BDF8]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
            {l('Etiketler (virgülle ayırın)', 'Tags (comma-separated)')}
          </label>
          <input
            type="text"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder={l('ör. saas, yapay-zeka, öncelikli', 'e.g. saas, ai, priority')}
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
              : initialProject
                ? l('Değişiklikleri Kaydet', 'Save Changes')
                : l('Projeyi Oluştur', 'Create Project')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
