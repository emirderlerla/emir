import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  ArrowUpRight,
  Edit3,
  Lightbulb,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { TableSkeleton } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../i18n';
import { ApiError, apiRequest } from '../lib/api';
import {
  DIFFICULTY_LEVELS,
  PRIORITY_LEVELS,
  PROJECT_STATUSES,
  type DifficultyLevel,
  type Idea,
  type PriorityLevel,
  type ProjectStatus,
} from '../types';
import { formatDateTr, priorityTextClass } from '../utils/format';

interface IdeasPageProps {
  refreshSignal: number;
  onDataChanged: () => void;
  onOpenProjectDetail: (projectId: string) => void;
}

export function IdeasPage({ refreshSignal, onDataChanged, onOpenProjectDetail }: IdeasPageProps) {
  const { showToast } = useToast();
  const { lang, l, tDifficulty, tPriority, tProjectStatus } = useI18n();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Create / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Ürün');
  const [potential, setPotential] = useState(4);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Orta');
  const [priority, setPriority] = useState<PriorityLevel>('Orta');
  const [tagsText, setTagsText] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Convert Modal
  const [convertTarget, setConvertTarget] = useState<Idea | null>(null);
  const [targetStatus, setTargetStatus] = useState<ProjectStatus>('Planlama');
  const [targetDeadline, setTargetDeadline] = useState('');
  const [convertWarning, setConvertWarning] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Idea | null>(null);

  const loadIdeas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ archived: '0' });
      if (categoryFilter) params.set('category', categoryFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiRequest<{ ideas: Idea[] }>(`/api/ideas?${params.toString()}`);
      setIdeas(res.ideas);
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Fikirler yüklenemedi.', 'Failed to load ideas.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, search, showToast, l]);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas, refreshSignal]);

  const openNew = () => {
    setEditingIdea(null);
    setTitle('');
    setDescription('');
    setCategory(l('Ürün', 'Product'));
    setPotential(4);
    setDifficulty('Orta');
    setPriority('Orta');
    setTagsText('');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (idea: Idea) => {
    setEditingIdea(idea);
    setTitle(idea.title);
    setDescription(idea.description);
    setCategory(idea.category);
    setPotential(idea.potential);
    setDifficulty(idea.estimated_difficulty);
    setPriority(idea.priority);
    setTagsText(idea.tags.join(', '));
    setNotes(idea.notes);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || l('Ürün', 'Product'),
        potential,
        estimated_difficulty: difficulty,
        priority,
        tags: tagsText
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        notes: notes.trim(),
      };
      if (editingIdea) {
        await apiRequest(`/api/ideas/${editingIdea.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        showToast(l('Fikir güncellendi.', 'Idea updated.'));
      } else {
        await apiRequest('/api/ideas', { method: 'POST', body: JSON.stringify(payload) });
        showToast(l('Fikir havuzuna eklendi.', 'Added to idea pool.'));
      }
      setModalOpen(false);
      onDataChanged();
      loadIdeas();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Fikir kaydedilemedi.', 'Failed to save idea.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async (overrideLimit = false) => {
    if (!convertTarget) return;
    setConverting(true);
    setConvertWarning(null);
    try {
      const res = await apiRequest<{ projectId: string }>(`/api/ideas/${convertTarget.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({
          status: targetStatus,
          deadline: targetDeadline || null,
          overrideLimit,
        }),
      });
      showToast(
        l(
          `"${convertTarget.title}" projeye dönüştürüldü.`,
          `"${convertTarget.title}" converted into a project.`
        )
      );
      setConvertTarget(null);
      onDataChanged();
      loadIdeas();
      onOpenProjectDetail(res.projectId);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'FOCUS_LIMIT_REACHED') {
        setConvertWarning(err.message);
      } else {
        showToast(err instanceof Error ? err.message : l('Dönüştürme başarısız.', 'Conversion failed.'), 'error');
      }
    } finally {
      setConverting(false);
    }
  };

  const handleArchive = async (idea: Idea) => {
    try {
      await apiRequest(`/api/ideas/${idea.id}/archive`, { method: 'POST' });
      showToast(l('Fikir arşivlendi.', 'Idea archived.'));
      onDataChanged();
      loadIdeas();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Arşivlenemedi.', 'Failed to archive.'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/api/ideas/${deleteTarget.id}`, { method: 'DELETE' });
      showToast(l('Fikir silindi.', 'Idea deleted.'));
      setDeleteTarget(null);
      loadIdeas();
    } catch (err) {
      showToast(err instanceof Error ? err.message : l('Silinemedi.', 'Failed to delete.'), 'error');
    }
  };

  const categories = Array.from(new Set(ideas.map((i) => i.category))).filter(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827]">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={l('Fikir veya etiket ara...', 'Search ideas or tags...')}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
          >
            <option value="">{l('Tüm Kategoriler', 'All Categories')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#2563EB] hover:bg-blue-500 text-white whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          {l('Yeni Fikir Ekle', 'Add New Idea')}
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : ideas.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title={l('Fikir havuzu henüz boş', 'Idea pool is empty')}
          description={l(
            'Yeni fikirlerinizi aktif proje limitini doldurmadan burada değerlendirin. Hazır olduğunuzda tek tıkla projeye dönüştürebilirsiniz.',
            'Evaluate new ideas here without consuming active project limits. Convert any idea into a project in one click when ready.'
          )}
          actionLabel={l('İlk Fikri Kaydet', 'Save First Idea')}
          onAction={openNew}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#101827] p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                    {idea.title}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(idea)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                      title={l('Düzenle', 'Edit')}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchive(idea)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400"
                      title={l('Arşivle', 'Archive')}
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(idea)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400"
                      title={l('Sil', 'Delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <span>{idea.category}</span>
                  <span>·</span>
                  <span>
                    {l('Zorluk', 'Difficulty')}: {tDifficulty(idea.estimated_difficulty)}
                  </span>
                  <span>·</span>
                  <span className={priorityTextClass(idea.priority)}>{tPriority(idea.priority)}</span>
                </div>

                <div
                  className="flex items-center gap-1 mt-2.5 text-amber-400"
                  title={`${l('Potansiyel', 'Potential')}: ${idea.potential}/5`}
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-3.5 h-3.5 ${i < idea.potential ? 'fill-amber-400' : 'text-slate-700'}`}
                    />
                  ))}
                  <span className="text-[11px] text-slate-500 ml-1 font-mono tabular-nums">
                    ({idea.potential}/5)
                  </span>
                </div>

                {idea.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 line-clamp-3 leading-relaxed">
                    {idea.description}
                  </p>
                )}
              </div>

              <div className="mt-5 pt-3.5 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                  {formatDateTr(idea.created_at, lang)}
                </span>
                {idea.converted_project_id ? (
                  <button
                    type="button"
                    onClick={() => onOpenProjectDetail(idea.converted_project_id!)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:underline"
                  >
                    <span>{l('Projeye Dönüştürüldü', 'Converted to Project')}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConvertTarget(idea);
                      setTargetStatus('Planlama');
                      setTargetDeadline('');
                      setConvertWarning(null);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#38BDF8]/12 text-[#38BDF8] hover:bg-[#38BDF8]/20 transition-colors"
                  >
                    <span>{l('Projeye Dönüştür', 'Convert to Project')}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Idea Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingIdea ? l('Fikri Düzenle', 'Edit Idea') : l('Yeni Fikir Ekle', 'Add New Idea')}
        subtitle={l(
          'Fikirler aktif projelerden ayrı tutulur; hazır olduğunda projeye dönüştürülebilir.',
          'Ideas stay separate from active projects and can be converted into a project when ready.'
        )}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Fikir Başlığı *', 'Idea Title *')}</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={l('Örn. Yapay Zeka Destekli Bütçe Analiz Aracı', 'e.g. AI-Powered Budget Analytics Tool')}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Açıklama', 'Description')}</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-[#38BDF8]"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5">{l('Kategori', 'Category')}</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5">{l('Potansiyel (1-5)', 'Potential (1-5)')}</label>
              <select
                value={potential}
                onChange={(e) => setPotential(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5">{l('Tahmini Zorluk', 'Est. Difficulty')}</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
              >
                {DIFFICULTY_LEVELS.map((d) => (
                  <option key={d} value={d}>
                    {tDifficulty(d)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5">{l('Öncelik', 'Priority')}</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
              >
                {PRIORITY_LEVELS.map((p) => (
                  <option key={p} value={p}>
                    {tPriority(p)}
                  </option>
                ))}
              </select>
            </div>
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
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Değerlendirme Notları', 'Evaluation Notes')}</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700"
            >
              {l('İptal', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#2563EB] text-white"
            >
              {saving ? l('Kaydediliyor...', 'Saving...') : l('Kaydet', 'Save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Convert Idea Modal */}
      <Modal
        open={Boolean(convertTarget)}
        onClose={() => setConvertTarget(null)}
        title={l('Fikri Projeye Dönüştür', 'Convert Idea to Project')}
        subtitle={convertTarget?.title}
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          {convertWarning && (
            <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-200 space-y-2">
              <p>{convertWarning}</p>
              <button
                type="button"
                onClick={() => handleConvert(true)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-medium"
              >
                {l('Limiti Geçersiz Kıl ve Oluştur', 'Override Limit & Create')}
              </button>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1.5">
              {l('Başlangıç Proje Durumu', 'Initial Project Status')}
            </label>
            <select
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value as ProjectStatus)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tProjectStatus(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">{l('Hedef Teslim Tarihi', 'Target Deadline')}</label>
            <input
              type="date"
              value={targetDeadline}
              onChange={(e) => setTargetDeadline(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl bg-slate-50 dark:bg-[#070B14] border border-slate-300 dark:border-slate-800"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setConvertTarget(null)}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700"
            >
              {l('Vazgeç', 'Cancel')}
            </button>
            <button
              type="button"
              disabled={converting}
              onClick={() => handleConvert(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#2563EB] text-white"
            >
              {converting ? l('Dönüştürülüyor...', 'Converting...') : l('Projeyi Başlat', 'Launch Project')}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={l('Fikri Sil', 'Delete Idea')}
        description={l(
          `"${deleteTarget?.title}" fikrini kalıcı olarak silmek istediğinize emin misiniz?`,
          `Are you sure you want to permanently delete "${deleteTarget?.title}"?`
        )}
        confirmLabel={l('Sil', 'Delete')}
      />
    </div>
  );
}
