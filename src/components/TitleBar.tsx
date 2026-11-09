import { Minus, Square, X } from 'lucide-react';
import Logo from './Logo';

/** Fake desktop window chrome. Controls are decorative (aria-hidden). */
export default function TitleBar({ context }: { context: string }) {
  return (
    <header
      className="h-9 flex items-center justify-between pl-3 pr-2 border-b border-line bg-panel select-none shrink-0"
      data-testid="titlebar"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Logo size="sm" />
        <span className="h-4 w-px bg-line" aria-hidden="true" />
        <span className="text-2xs text-muted truncate">{context}</span>
      </div>
      <div className="flex items-center gap-1 text-muted" aria-hidden="true">
        <button className="p-1.5 rounded hover:bg-panel-raised hover:text-ink transition-colors" tabIndex={-1} title="Minimize (decorative)">
          <Minus size={13} strokeWidth={1.75} />
        </button>
        <button className="p-1.5 rounded hover:bg-panel-raised hover:text-ink transition-colors" tabIndex={-1} title="Maximize (decorative)">
          <Square size={12} strokeWidth={1.75} />
        </button>
        <button className="p-1.5 rounded hover:bg-red-500/20 hover:text-red-300 transition-colors" tabIndex={-1} title="Close (decorative)">
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}
