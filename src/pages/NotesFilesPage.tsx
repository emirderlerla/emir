import React, { useCallback, useEffect, useState } from 'react';
import {
  Download,
  Edit3,
  FileText,
  Paperclip,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';
import { apiRequest, downloadProtectedFile } from '../lib/api';
import type { Attachment, Note, Project, Task } from '../types';
import { formatDateTimeTr, formatFileSizeTr } from '../utils/format';

interface NotesFilesPageProps {
  projects: Project[];
  tasks: Task[];
  refreshSignal: number;
  onDataChanged: () => void;
}

export function NotesFilesPage({
  projects,
  tasks,
  refreshSignal,
  onDataChanged,
}: NotesFilesPageProps) {
  const { showToast } = useToast();
  const { lang, l } = useI18n();
  const [tab, setTab] = useState<'notes' | 'files'>('notes');
  const [notes, setNotes] = useState<Note[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Note Modal
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [saving, setSaving] = useState(false);

  // Upload
  const [uploadProjectId, setUploadProjectId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<Note | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [nRes, aRes] = await Promise.all([
        apiRequest<{ notes: Note[] }>(
          `/api/notes${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`
        ),
        apiRequest<{ attachments: Attachment[] }>('/api/attachments'),
      ]);
      setNotes(nRes.notes);
      setAttachments(aRes.attachments);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : l('Notlar ve dosyalar yüklenemedi.', 'Failed to load notes and files.'),
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [search, showToast, l]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal]);

  const openNewNote = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setProjectId('');
    setTaskId('');
    setTagsText('');
    setNoteModalOpen(true);
  };

  const openEditNote = (n: Note) => {
    setEditingNote(n);
    setTitle(n.title);
    setContent(n.content);
    setProjectId(n.project_id || '');
    setTaskId(n.task_id || '');
    setTagsText(n.tags.join(', '));
    setNoteModalOpen(true);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        content,
        project_id: projectId || null,
        task_id: taskId || null,
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };
      if (editingNote) {
        await apiRequest(`/api/notes/${editingNote.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        showToast(l('Not güncellendi.', 'Note updated.'));
      } else {
        await apiRequest('/api/notes', { method: 'POST', body: JSON.stringify(payload) });
        showToast(l('Not oluşturuldu.', 'Note created.'));
      }
      setNoteModalOpen(false);
      onDataChanged();
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Not kaydedilemedi.', 'Failed to save note.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!deleteNoteTarget) return;
    try {
      await apiRequest(`/api/notes/${deleteNoteTarget.id}`, { method: 'DELETE' });
      showToast(l('Not silindi.', 'Note deleted.'));
      setDeleteNoteTarget(null);
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Not silinemedi.', 'Failed to delete note.'), 'error');
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (uploadProjectId) fd.append('project_id', uploadProjectId);
      await apiRequest('/api/attachments', { method: 'POST', body: fd });
      showToast(l('Dosya yüklendi.', 'File uploaded.'));
      onDataChanged();
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Dosya yüklenemedi.', 'Failed to upload file.'), 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteFile = async (attId: string) => {
    try {
      await apiRequest(`/api/attachments/${attId}`, { method: 'DELETE' });
      showToast(l('Dosya silindi.', 'File deleted.'));
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Dosya silinemedi.', 'Failed to delete file.'), 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="flex p-1 rounded-lg bg-slate-100 dark:bg-[#070B14] border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setTab('notes')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                tab === 'notes' ? 'bg-white dark:bg-[#101827] text-[#38BDF8]' : 'text-slate-500'
              }`}
            >
              Notlar ({notes.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('files')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                tab === 'files' ? 'bg-white dark:bg-[#101827] text-[#38BDF8]' : 'text-slate-500'
              }`}
            >
              {l(`Dosya Ekleri (${attachments.length})`, `Attachments (${attachments.length})`)}
            </button>
          </div>

          {tab === 'notes' && (
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={l('Notlarda ara...', 'Search notes...')}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
              />
            </div>
          )}
        </div>

        {tab === 'notes' ? (
          <button
            type="button"
            onClick={openNewNote}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#2563EB] hover:bg-blue-500 text-white whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {l('Yeni Not', 'New Note')}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={uploadProjectId}
              onChange={(e) => setUploadProjectId(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            >
              <option value="">{l('Genel Dosya (Projesiz)', 'General File (No Project)')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#2563EB] hover:bg-blue-500 text-white cursor-pointer whitespace-nowrap shrink-0">
              <Upload className="w-4 h-4" />
              <span>{uploading ? l('Yükleniyor...', 'Uploading...') : l('Dosya Yükle', 'Upload File')}</span>
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : tab === 'notes' ? (
        notes.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={l('Henüz not bulunmuyor', 'No notes yet')}
            description={l(
              'Projelerinize veya görevlerinize bağlı teknik notlar, toplantı özetleri ve referanslar oluşturun.',
              'Create technical notes, meeting summaries, and references linked to your projects or tasks.'
            )}
            actionLabel={l('İlk Notu Oluştur', 'Create First Note')}
            onAction={openNewNote}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {notes.map((n) => (
              <div
                key={n.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold">{n.title}</h3>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditNote(n)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteNoteTarget(n)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {(n.project_name || n.task_title) && (
                    <div className="text-[11px] text-[#38BDF8] mt-1">
                      {[n.project_name, n.task_title].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 whitespace-pre-line line-clamp-5">
                    {n.content || l('İçerik boş.', 'Empty content.')}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 font-mono tabular-nums">
                  {formatDateTimeTr(n.updated_at, lang)}
                </div>
              </div>
            ))}
          </div>
        )
      ) : attachments.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title={l('Yüklenmiş dosya bulunmuyor', 'No uploaded files')}
          description={l(
            'Görseller, PDF belgeleri, CSV, JSON veya arşiv dosyalarını projelerinizle ilişkilendirerek güvenle saklayın.',
            'Securely store images, PDFs, CSV, JSON, or archive files linked to your projects.'
          )}
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] divide-y divide-slate-200 dark:divide-slate-800">
          {attachments.map((att) => (
            <div key={att.id} className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Paperclip className="w-4 h-4 text-[#38BDF8] shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{att.file_name}</div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {formatFileSizeTr(att.file_size)} · {att.project_name || l('Genel', 'General')} ·{' '}
                    {formatDateTimeTr(att.created_at, lang)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => downloadProtectedFile(`/api/attachments/${att.id}/download`, att.file_name)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-800 hover:border-[#38BDF8]"
                >
                  <Download className="w-3.5 h-3.5" />
                  {l('İndir', 'Download')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteFile(att.id)}
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

      <Modal
        open={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        title={editingNote ? l('Notu Düzenle', 'Edit Note') : l('Yeni Not Oluştur', 'Create New Note')}
      >
        <form onSubmit={handleSaveNote} className="space-y-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5">{l('İlişkili Proje', 'Linked Project')}</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
              >
                <option value="">{l('Seçilmedi', 'None')}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5">{l('İlişkili Görev', 'Linked Task')}</label>
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
              >
                <option value="">{l('Seçilmedi', 'None')}</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('İçerik', 'Content')}</label>
            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {l('Etiketler (virgülle)', 'Tags (comma-separated)')}
            </label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNoteModalOpen(false)}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700"
            >
              {l('İptal', 'Cancel')}
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium rounded-lg bg-[#2563EB] text-white">
              {saving ? l('Kaydediliyor...', 'Saving...') : l('Kaydet', 'Save')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteNoteTarget)}
        onClose={() => setDeleteNoteTarget(null)}
        onConfirm={handleDeleteNote}
        title={l('Notu Sil', 'Delete Note')}
        description={l(
          `"${deleteNoteTarget?.title}" notunu silmek istediğinize emin misiniz?`,
          `Are you sure you want to delete "${deleteNoteTarget?.title}"?`
        )}
        confirmLabel={l('Sil', 'Delete')}
      />
    </div>
  );
}
