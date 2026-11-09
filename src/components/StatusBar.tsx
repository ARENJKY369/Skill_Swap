import { CheckCircle2, Clock3, WifiOff, ShieldCheck, FileText, Cookie } from 'lucide-react';
import { useAppStore } from '../store/appStore';

export default function StatusBar({ onOpenLegal }: { onOpenLegal: (tab: 'privacy' | 'terms' | 'cookies') => void }) {
  const online = useAppStore((s) => s.online);
  const dbConnected = useAppStore((s) => s.dbConnected);
  const syncState = useAppStore((s) => s.syncState);
  const pending = useAppStore((s) => s.pendingOutbox);

  return (
    <footer className="h-7 flex items-center justify-between px-3 border-t border-line bg-panel text-2xs text-muted select-none shrink-0">
      <div className="flex items-center gap-4 min-w-0">
        <span className="flex items-center gap-1.5" title={online ? 'Network reachable' : 'No network connection'}>
          <span className="w-2 h-2 rounded-full" style={{ background: online ? 'var(--success)' : 'var(--danger)' }} />
          <span className={online ? 'text-ink' : 'text-red-300'}>{online ? 'Online' : 'Offline'}</span>
        </span>
        <span className="hidden sm:flex items-center gap-1.5" title="SQLite connectivity">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: dbConnected === null ? '#64748B' : dbConnected ? 'var(--success)' : 'var(--danger)' }}
          />
          {dbConnected === null ? 'DB checking…' : dbConnected ? 'DB connected' : 'DB unreachable'}
        </span>
        <span className="hidden md:flex items-center gap-1.5" title="IndexedDB outbox sync state">
          {syncState === 'synced' && (<><CheckCircle2 size={11} className="text-teal-300" /> Synced</>)}
          {syncState === 'pending' && (<><Clock3 size={11} className="text-amber-300" /> <span className="num">{pending} pending</span></>)}
          {syncState === 'offline' && (<><WifiOff size={11} className="text-amber-300" /> Offline — changes queued</>)}
          {syncState === 'error' && (<><WifiOff size={11} className="text-red-300" /> Sync error — will retry</>)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden lg:flex items-center gap-1.5">
          <kbd>Ctrl</kbd>+<kbd>K</kbd> search <span aria-hidden="true">·</span> <kbd>G</kbd>+<kbd>D</kbd>/<kbd>M</kbd>/<kbd>S</kbd> nav <span aria-hidden="true">·</span> <kbd>N</kbd> new invite
        </span>
        <button className="hover:text-ink transition-colors flex items-center gap-1" onClick={() => onOpenLegal('privacy')}>
          <ShieldCheck size={11} /> Privacy
        </button>
        <button className="hover:text-ink transition-colors flex items-center gap-1" onClick={() => onOpenLegal('terms')}>
          <FileText size={11} /> Terms
        </button>
        <button className="hover:text-ink transition-colors flex items-center gap-1" onClick={() => onOpenLegal('cookies')}>
          <Cookie size={11} /> Cookies
        </button>
        <span className="num text-ink">v2.4.9</span>
      </div>
    </footer>
  );
}
