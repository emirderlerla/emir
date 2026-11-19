import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Paperclip,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../i18n';
import { apiRequest, downloadProtectedFile } from '../../lib/api';
import type { ActivityLog, Attachment, Milestone, Note, Project, Task } from '../../types';
import {
  formatDateTimeTr,
  formatDateTr,
  formatFileSizeTr,
  priorityTextClass,
  statusTextClass,
} from '../../utils/format';
import { Modal } from '../ui/Modal';

interface ProjectDetailModalProps {
  projectId: string | null;
  onClose: () => void;
  onDataChanged: () => void;
  onEditProject: (project: Project) => void;
}

interface ProjectDetailResponse {
  project: Project;
  tasks: Task[];
  milestones: Milestone[];
  notes: Note[];
  attachments: Attachment[];
  activities: ActivityLog[];
}

export function ProjectDetailModal({
  projectId,
  onClose,
  onDataChanged,
  onEditProject,
}: ProjectDetailModalProps) {
  const { showToast } = useToast();
  const { lang, isEn, l, tProjectStatus, tPriority } = useI18n();
  const [detail, setDetail] = useState<ProjectDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'overview' | 'tasks' | 'milestones' | 'notes' | 'files'>('overview');

  // Inline creation states
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newMsTitle, setNewMsTitle] = useState('');
  const [newMsDate, setNewMsDate] = useState('');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await apiRequest<ProjectDetailResponse>(`/api/projects/${projectId}`);
      setDetail(res);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Proje detayı alınamadı.', 'Failed to load project details.'),
        'error'
      );
      onClose();
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast, onClose, l]);

  useEffect(() => {
    if (projectId) {
      setTab('overview');
      loadDetail();
    } else {
      setDetail(null);
    }
  }, [projectId, loadDetail]);

  const handleAddQuickTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !newTaskTitle.trim()) return;
    try {
      await apiRequest('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          project_id: projectId,
          priority: 'Orta',
          status: 'Yapılacak',
        }),
      });
      setNewTaskTitle('');
      showToast(l('Görev projeye eklendi.', 'Task added to project.'));
      loadDetail();
      onDataChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Görev eklenemedi.', 'Failed to add task.'), 'error');
    }
  };

  const handleToggleTask = async (task: Task) => {
    const nextStatus = task.status === 'Tamamlandı' ? 'Yapılacak' : 'Tamamlandı';
    try {
      await apiRequest(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      loadDetail();
      onDataChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Görev güncellenemedi.', 'Failed to update task.'), 'error');
    }
  };

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !newMsTitle.trim()) return;
    try {
      await apiRequest(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        body: JSON.stringify({
          title: newMsTitle.trim(),
          due_date: newMsDate || null,
        }),
      });
      setNewMsTitle('');
      setNewMsDate('');
      showToast(l('Kilometre taşı eklendi.', 'Milestone added.'));
      loadDetail();
      onDataChanged();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Kilometre taşı eklenemedi.', 'Failed to add milestone.'),
        'error'
      );
    }
  };

  const handleToggleMilestone = async (ms: Milestone) => {
    try {
      await apiRequest(`/api/projects/milestones/${ms.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_completed: !ms.is_completed }),
      });
      loadDetail();
      onDataChanged();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Kilometre taşı güncellenemedi.', 'Failed to update milestone.'),
        'error'
      );
    }
  };

  const handleDeleteMilestone = async (msId: string) => {
    try {
      await apiRequest(`/api/projects/milestones/${msId}`, { method: 'DELETE' });
      loadDetail();
      onDataChanged();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Kilometre taşı silinemedi.', 'Failed to delete milestone.'),
        'error'
      );
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !newNoteTitle.trim()) return;
    try {
      await apiRequest('/api/notes', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          title: newNoteTitle.trim(),
          content: newNoteContent.trim(),
        }),
      });
      setNewNoteTitle('');
      setNewNoteContent('');
      showToast(l('Proje notu kaydedildi.', 'Project note saved.'));
      loadDetail();
      onDataChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Not kaydedilemedi.', 'Failed to save note.'), 'error');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await apiRequest(`/api/notes/${noteId}`, { method: 'DELETE' });
      loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Not silinemedi.', 'Failed to delete note.'), 'error');
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !projectId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('project_id', projectId);
      await apiRequest('/api/attachments', {
        method: 'POST',
        body: formData,
      });
      showToast(l('Dosya yüklendi.', 'File uploaded.'));
      loadDetail();
      onDataChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Dosya yüklenemedi.', 'Failed to upload file.'), 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteAttachment = async (id: string) => {
    try {
      await apiRequest(`/api/attachments/${id}`, { method: 'DELETE' });
      showToast(l('Dosya silindi.', 'File deleted.'));
      loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Dosya silinemedi.', 'Failed to delete file.'), 'error');
    }
  };

  return (
    <Modal
      open={Boolean(projectId)}
      onClose={onClose}
      title={detail?.project.name || l('Proje Detayı', 'Project Details')}
      subtitle={
        detail
          ? isEn
            ? `${tProjectStatus(detail.project.status)} · ${tPriority(detail.project.priority)} Priority · Progress ${detail.project.progress}%`
            : `${detail.project.status} · ${detail.project.priority} Öncelik · İlerleme %${detail.project.progress}`
          : l('Yükleniyor...', 'Loading...')
      }
      maxWidthClass="max-w-4xl"
    >
      {loading || !detail ? (
        <div className="py-12 text-center text-sm text-slate-400">
          {l('Proje bilgileri yükleniyor...', 'Loading project details...')}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#070B14]">
              {(
                [
                  ['overview', l('Genel Bakış', 'Overview')],
                  ['tasks', l(`Görevler (${detail.tasks.length})`, `Tasks (${detail.tasks.length})`)],
                  ['milestones', l(`Kilometre Taşları (${detail.milestones.length})`, `Milestones (${detail.milestones.length})`)],
                  ['notes', l(`Notlar (${detail.notes.length})`, `Notes (${detail.notes.length})`)],
                  ['files', l(`Dosyalar (${detail.attachments.length})`, `Files (${detail.attachments.length})`)],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    tab === id
                      ? 'bg-white dark:bg-[#101827] text-[#2563EB] dark:text-[#38BDF8]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditProject(detail.project);
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:border-[#38BDF8] text-slate-700 dark:text-slate-200"
            >
              {l('Projeyi Düzenle', 'Edit Project')}
            </button>
          </div>

          {tab === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">{l('Durum', 'Status')}</div>
                  <div className={`text-sm font-semibold mt-0.5 ${statusTextClass(detail.project.status)}`}>
                    {tProjectStatus(detail.project.status)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">{l('Öncelik', 'Priority')}</div>
                  <div className={`text-sm font-semibold mt-0.5 ${priorityTextClass(detail.project.priority)}`}>
                    {tPriority(detail.project.priority)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">{l('Başlangıç', 'Start Date')}</div>
                  <div className="text-sm font-mono tabular-nums mt-0.5">
                    {formatDateTr(detail.project.start_date, lang)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">{l('Teslim Tarihi', 'Deadline')}</div>
                  <div className="text-sm font-mono tabular-nums mt-0.5">
                    {formatDateTr(detail.project.deadline, lang)}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  {l('Açıklama', 'Description')}
                </h4>
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                  {detail.project.description || l('Bu proje için henüz açıklama girilmedi.', 'No description provided for this project yet.')}
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                  {l('Proje Aktivite Geçmişi', 'Project Activity History')}
                </h4>
                {detail.activities.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {l('Henüz proje aktivitesi kaydedilmedi.', 'No project activity recorded yet.')}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {detail.activities.slice(0, 8).map((act) => (
                      <div key={act.id} className="py-2 flex items-center justify-between text-xs">
                        <span>
                          <strong className="text-[#38BDF8]">{act.action}</strong>
                          {act.details ? ` · ${act.details}` : ''}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {formatDateTimeTr(act.created_at, lang)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="space-y-4">
              <form onSubmit={handleAddQuickTask} className="flex gap-2">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder={l('Projeye hızlı görev ekle...', 'Quick add task to project...')}
                  className="flex-1 px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white"
                >
                  <Plus className="w-4 h-4" />
                  {l('Ekle', 'Add')}
                </button>
              </form>

              {detail.tasks.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  {l('Bu projeye bağlı görev bulunmuyor.', 'No tasks linked to this project.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {detail.tasks.map((task) => (
                    <div key={task.id} className="py-2.5 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleTask(task)}
                        className="flex items-center gap-2.5 text-left min-w-0"
                      >
                        {task.status === 'Tamamlandı' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span
                          className={`text-sm truncate ${
                            task.status === 'Tamamlandı' ? 'line-through text-slate-500' : ''
                          }`}
                        >
                          {task.title}
                        </span>
                      </button>
                      <div className="flex items-center gap-2 text-xs shrink-0">
                        <span className={priorityTextClass(task.priority)}>{tPriority(task.priority)}</span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {formatDateTr(task.due_date, lang)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'milestones' && (
            <div className="space-y-4">
              <form onSubmit={handleAddMilestone} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newMsTitle}
                  onChange={(e) => setNewMsTitle(e.target.value)}
                  placeholder={l('Yeni kilometre taşı başlığı...', 'New milestone title...')}
                  className="flex-1 px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
                />
                <input
                  type="date"
                  value={newMsDate}
                  onChange={(e) => setNewMsDate(e.target.value)}
                  className="px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white"
                >
                  <Plus className="w-4 h-4" />
                  {l('Ekle', 'Add')}
                </button>
              </form>

              {detail.milestones.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  {l('Henüz kilometre taşı eklenmedi.', 'No milestones added yet.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {detail.milestones.map((ms) => (
                    <div key={ms.id} className="py-2.5 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleMilestone(ms)}
                        className="flex items-center gap-2.5 text-left min-w-0"
                      >
                        {ms.is_completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className={`text-sm ${ms.is_completed ? 'line-through text-slate-500' : ''}`}>
                          {ms.title}
                        </span>
                      </button>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono tabular-nums text-slate-500">
                          {formatDateTr(ms.due_date, lang)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteMilestone(ms.id)}
                          className="text-slate-400 hover:text-rose-400"
                          title={l('Sil', 'Delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'notes' && (
            <div className="space-y-4">
              <form onSubmit={handleAddNote} className="space-y-2">
                <input
                  type="text"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  placeholder={l('Not başlığı...', 'Note title...')}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
                />
                <textarea
                  rows={2}
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  placeholder={l('Proje notu içeriği...', 'Project note content...')}
                  className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {l('Not Ekle', 'Add Note')}
                  </button>
                </div>
              </form>

              {detail.notes.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  {l('Bu projeye ait not bulunmuyor.', 'No notes for this project.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {detail.notes.map((n) => (
                    <div key={n.id} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <h5 className="text-sm font-semibold">{n.title}</h5>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(n.id)}
                          className="text-slate-400 hover:text-rose-400"
                          title={l('Notu sil', 'Delete note')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-line">
                        {n.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'files' && (
            <div className="space-y-4">
              <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#38BDF8] cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors">
                <Upload className="w-4 h-4 text-[#38BDF8]" />
                <span>
                  {uploading
                    ? l('Yükleniyor...', 'Uploading...')
                    : l(
                        'Dosya Yükle (Görsel, PDF, Metin, CSV, ZIP — Maks. 10 MB)',
                        'Upload File (Image, PDF, Text, CSV, ZIP — Max 10 MB)'
                      )}
                </span>
                <input type="file" className="hidden" onChange={handleUploadFile} disabled={uploading} />
              </label>

              {detail.attachments.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  {l('Bu projeye eklenmiş dosya yok.', 'No files attached to this project.')}
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {detail.attachments.map((att) => (
                    <div key={att.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Paperclip className="w-4 h-4 text-[#38BDF8] shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm truncate">{att.file_name}</div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                            {formatFileSizeTr(att.file_size)} · {formatDateTimeTr(att.created_at, lang)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => downloadProtectedFile(`/api/attachments/${att.id}/download`, att.file_name)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#38BDF8]"
                          title={l('İndir', 'Download')}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400"
                          title={l('Sil', 'Delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
