import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, ShieldCheck, LogOut } from 'lucide-react';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import StatusBar from './StatusBar';
import ScheduleSessionDialog from './ScheduleSessionDialog';
import LegalModal from './LegalModal';
import Dialog from './Dialog';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { flushOutbox, refreshPendingCount } from '../db/sync';
import { useToast } from '../lib/toastHook';

const CONTEXT: Record<string, string> = {
  '/app/dashboard': 'Dashboard',
  '/app/matches': 'Matchmaker',
  '/app/explore': 'Global Skill Explorer',
  '/app/resources': 'Resource Library',
  '/app/sessions': 'Schedule & Sessions',
  '/app/profile': 'Profile & Skill Portfolio',
  '/app/admin': 'Admin Panel',
};

const IDLE_LIMIT_MS = 15 * 60_000;
const WARN_AT_MS = 14 * 60_000;

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const setOnline = useAppStore((s) => s.setOnline);
  const setDbConnected = useAppStore((s) => s.setDbConnected);
  const setUser = useAppStore((s) => s.setUser);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<'privacy' | 'terms' | 'cookies' | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [locked, setLocked] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);

  const lastActivity = useRef(Date.now());
  const pendingG = useRef(0);

  /* ---- health ping + online detection ---- */
  useEffect(() => {
    const ping = async () => {
      try {
        await api.get('/api/health');
        setDbConnected(true);
      } catch {
        setDbConnected(false);
      }
    };
    void ping();
    const t = window.setInterval(ping, 30_000);
    return () => window.clearInterval(t);
  }, [setDbConnected]);

  useEffect(() => {
    const on = () => { setOnline(true); void flushOutbox(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    void refreshPendingCount();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [setOnline]);

  /* ---- inactivity: 14 min warning w/ 60s countdown, 15 min re-auth ---- */
  useEffect(() => {
    const onActivity = () => {
      lastActivity.current = Date.now();
      setShowWarning((was) => {
        if (was && !locked) setCountdown(60);
        return was;
      });
    };
    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const tick = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_LIMIT_MS) {
        setLocked(true);
        setShowWarning(false);
      } else if (idle >= WARN_AT_MS) {
        setShowWarning(true);
        setCountdown(Math.max(0, Math.ceil((IDLE_LIMIT_MS - idle) / 1000)));
      }
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(tick);
    };
  }, [locked]);

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        navigate('/app/explore', { state: { focusSearch: true } });
        return;
      }
      if (inField) return;
      if (key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !locked) {
        e.preventDefault();
        setScheduleOpen(true);
        return;
      }
      if (key === 'g') { pendingG.current = Date.now(); return; }
      if (pendingG.current && Date.now() - pendingG.current < 900) {
        if (key === 'd') { e.preventDefault(); navigate('/app/dashboard'); }
        if (key === 'm') { e.preventDefault(); navigate('/app/matches'); }
        if (key === 's') { e.preventDefault(); navigate('/app/sessions'); }
        pendingG.current = 0;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, locked]);

  const reauth = async () => {
    setReauthBusy(true);
    setReauthError(null);
    try {
      await api.post('/api/auth/reauth', { password: reauthPassword });
      lastActivity.current = Date.now();
      setLocked(false);
      setShowWarning(false);
      setCountdown(60);
      setReauthPassword('');
      toast.success('Session extended');
    } catch (err) {
      setReauthError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setReauthBusy(false);
    }
  };

  const signOut = async () => {
    try { await api.post('/api/auth/logout'); } catch { /* best effort */ }
    setUser(null);
    navigate('/login', { replace: true });
  };

  const stayActive = () => {
    lastActivity.current = Date.now();
    setShowWarning(false);
    setCountdown(60);
  };

  const context = CONTEXT[location.pathname] ?? 'SkillSwap';

  return (
    <div className="h-full flex flex-col bg-canvas text-ink overflow-hidden">
      <TitleBar context={context} />
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar context={context} />
          <main className="flex-1 min-h-0">
            <Outlet />
          </main>
          <StatusBar onOpenLegal={setLegalTab} />
        </div>
      </div>

      {scheduleOpen && <ScheduleSessionDialog onClose={() => setScheduleOpen(false)} />}
      {legalTab && <LegalModal tab={legalTab} onClose={() => setLegalTab(null)} />}

      {/* inactivity warning */}
      {showWarning && !locked && (
        <div className="fixed bottom-10 right-4 z-40 w-[330px] bg-panel border border-amber-500/40 rounded-card shadow-pop p-4 dialog-in" role="alertdialog" aria-label="Inactivity warning">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} strokeWidth={1.75} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Still there?</p>
              <p className="text-xs text-muted mt-0.5">You have been inactive. For your security you will be asked to re-authenticate in <span className="num text-amber-300">{countdown}s</span>.</p>
              <div className="flex items-center gap-2 mt-2.5">
                <button className="btn btn-primary !py-1.5 text-xs" onClick={stayActive}>Stay signed in</button>
                <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => void signOut()}>Sign out</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* re-authentication lock */}
      {locked && (
        <Dialog title="Session paused" subtitle="15 minutes of inactivity. Re-enter your password to continue." onClose={() => { /* cannot dismiss without auth */ }} width={400} hideClose>
          <form onSubmit={(e) => { e.preventDefault(); void reauth(); }} className="flex flex-col gap-3">
            <div>
              <label className="label" htmlFor="reauth-password">Password</label>
              <input
                id="reauth-password"
                type="password"
                autoFocus
                className={`field ${reauthError ? 'field-error' : ''}`}
                value={reauthPassword}
                onChange={(e) => setReauthPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Your password"
              />
              {reauthError && <p className="text-2xs text-red-300 mt-1.5" role="alert">{reauthError}</p>}
            </div>
            <button type="submit" className="btn btn-primary justify-center" disabled={reauthBusy || !reauthPassword}>
              <ShieldCheck size={15} strokeWidth={1.75} /> {reauthBusy ? 'Verifying…' : 'Re-authenticate'}
            </button>
            <button type="button" className="btn btn-ghost justify-center text-xs text-muted" onClick={() => void signOut()}>
              <LogOut size={13} /> Sign out instead
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
