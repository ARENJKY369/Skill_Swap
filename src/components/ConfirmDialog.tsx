import Dialog from './Dialog';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose, busy }: ConfirmDialogProps) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      width={420}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm text-ink/90 leading-relaxed">{message}</p>
    </Dialog>
  );
}
