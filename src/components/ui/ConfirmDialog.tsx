import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger = true,
  loading = false,
}: ConfirmDialogProps) {
  const { l } = useI18n();
  const resolvedConfirm = confirmLabel || l('Onayla', 'Confirm');
  const resolvedCancel = cancelLabel || l('Vazgeç', 'Cancel');

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-md">
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-xl shrink-0 ${
            danger ? 'bg-rose-500/10 text-rose-400' : 'bg-[#38BDF8]/10 text-[#38BDF8]'
          }`}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{description}</p>
      </div>
      <div className="flex items-center justify-end gap-3 mt-6">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          {resolvedCancel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
            danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-[#2563EB] hover:bg-blue-500'
          }`}
        >
          {loading ? l('İşleniyor...', 'Processing...') : resolvedConfirm}
        </button>
      </div>
    </Modal>
  );
}
