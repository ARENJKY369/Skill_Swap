import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore, type ToastKind } from '../store/toast';

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};
const COLORS: Record<ToastKind, string> = {
  success: '#22C55E',
  error: '#EF4444',
  info: '#06B6D4',
  warning: '#F59E0B',
};

export default function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div aria-live="polite" className="fixed bottom-10 right-4 z-50 flex flex-col gap-2 w-[320px]">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className="toast-in flex items-start gap-2.5 rounded-input border border-line bg-panel shadow-pop px-3 py-2.5"
            style={{ borderLeft: `3px solid ${COLORS[t.kind]}` }}
          >
            <Icon size={16} strokeWidth={1.75} style={{ color: COLORS[t.kind], marginTop: 1 }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink leading-snug">{t.title}</p>
              {t.detail && <p className="text-2xs text-muted mt-0.5 leading-snug">{t.detail}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="p-1 rounded text-muted hover:text-ink hover:bg-panel-raised" aria-label="Dismiss notification">
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
