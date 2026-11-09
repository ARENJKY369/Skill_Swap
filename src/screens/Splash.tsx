import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, CircleDashed, AlertTriangle, RefreshCw } from 'lucide-react';
import Logo from '../components/Logo';
import { api, ApiError } from '../api/client';
import { db as localDb } from '../db/dexie';
import { useAppStore, type PublicUser } from '../store/appStore';

type StepState = 'pending' | 'active' | 'done' | 'error';

const STEP_LABELS = [
  'Initializing IndexedDB database…',
  'Checking backend /api/health & SQLite…',
  'Verifying session & CSRF security tokens…',
];

export default function Splash() {
  const navigate = useNavigate();
  const setDbConnected = useAppStore((s) => s.setDbConnected);
  const setUser = useAppStore((s) => s.setUser);
  const setAuthLoaded = useAppStore((s) => s.setAuthLoaded);
  const [steps, setSteps] = useState<StepState[]>(['active', 'pending', 'pending']);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ran = useRef(false);

  const runStartupChecks = useCallback(async () => {
    setRetrying(true);
    setBackendError(null);
    setSteps(['active', 'pending', 'pending']);

    const advance = (index: number, state: StepState) =>
      setSteps((prev) => prev.map((s, i) => (i === index ? state : s)));

    // Step 1 — real IndexedDB open + schema touch
    try {
      await localDb.open();
      await localDb.preferences.get('__probe__');
      advance(0, 'done');
    } catch {
      advance(0, 'error');
    }

    // Step 2 — mandatory backend /api/health probe (halt on Splash if unreachable)
    advance(1, 'active');
    try {
      const t0 = performance.now();
      const health = await api.get<{ status?: string; dbConnected: boolean; dbLatencyMs: number }>('/api/health');
      setLatencyMs(Math.max(1, Math.round(performance.now() - t0)));
      setDbConnected(health.dbConnected);
      if (!health.dbConnected || (health.status && health.status !== 'ok')) {
        advance(1, 'error');
        setBackendError('Backend database reported a degraded state on /api/health.');
        setRetrying(false);
        return;
      }
      advance(1, 'done');
    } catch (err) {
      advance(1, 'error');
      setDbConnected(false);
      setBackendError(err instanceof ApiError ? err.message : 'Server unreachable');
      setRetrying(false);
      return;
    }

    // Step 3 — CSRF bootstrap + session cookie check
    advance(2, 'active');
    let destination = '/login';
    try {
      await api.get('/api/auth/csrf');
      await localDb.session.get('me').catch(() => undefined);
    } catch {
      // Non-fatal if CSRF endpoint hasn't issued yet
    }
    try {
      const me = await api.get<{ user: PublicUser }>('/api/auth/me');
      if (me?.user) {
        setUser(me.user);
        destination = me.user.mustChangePassword ? '/login?mode=change-password' : '/app';
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
    advance(2, 'done');
    setAuthLoaded(true);
    setRetrying(false);

    window.setTimeout(() => setLeaving(true), 250);
    window.setTimeout(() => navigate(destination, { replace: true }), 250 + 250);
  }, [navigate, setAuthLoaded, setDbConnected, setUser]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void runStartupChecks();
  }, [runStartupChecks]);

  return (
    <div
      className={`h-full flex flex-col items-center justify-center bg-canvas relative transition-opacity duration-300 ${leaving ? 'opacity-0' : 'opacity-100'}`}
      role="status"
      aria-label="SkillSwap is loading"
    >
      <div className="flex flex-col items-center gap-7 px-4 max-w-md w-full">
        <div
          className="rounded-full p-6"
          style={{ boxShadow: '0 0 80px 8px rgba(6,182,212,0.28), 0 0 24px rgba(6,182,212,0.35)' }}
        >
          <Logo size="lg" />
        </div>

        {!backendError && <div className="w-9 h-9 spinner" aria-hidden="true" />}

        <ul className="flex flex-col gap-1.5 min-w-[320px]">
          {STEP_LABELS.map((label, i) => {
            const state = steps[i];
            return (
              <li key={label} className="flex items-center gap-2.5 text-xs h-5">
                {state === 'done' && (
                  <span className="w-4 flex justify-center"><Check size={13} strokeWidth={2.5} className="text-emerald-400" /></span>
                )}
                {state === 'active' && (
                  <span className="w-4 flex justify-center"><Loader2 size={13} className="animate-spin text-cyan-400" /></span>
                )}
                {state === 'pending' && (
                  <span className="w-4 flex justify-center"><CircleDashed size={13} className="text-slate-600" /></span>
                )}
                {state === 'error' && (
                  <span className="w-4 flex justify-center"><AlertTriangle size={13} className="text-red-400" /></span>
                )}
                <span className={state === 'pending' ? 'text-slate-600' : state === 'done' ? 'text-slate-300' : state === 'error' ? 'text-red-300' : 'text-cyan-200'}>
                  {label}
                </span>
              </li>
            );
          })}
        </ul>

        {latencyMs !== null && !backendError && (
          <p className="text-2xs text-muted num">API reachable · {latencyMs} ms round-trip</p>
        )}

        {backendError && (
          <div
            role="alert"
            className="w-full bg-panel border border-red-500/40 rounded-card p-4 shadow-pop flex flex-col gap-2.5"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={17} className="text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-red-200">{backendError}</p>
                <p className="text-2xs text-muted mt-1 leading-relaxed">
                  Could not reach the SkillSwap Spring Boot backend at <span className="num text-ink">/api/health</span> (port <span className="num text-ink">8787</span>). Start both frontend and backend together from the repository root:
                </p>
              </div>
            </div>
            <div className="bg-inset border border-line rounded-input px-3 py-1.5 text-2xs num text-cyan-300">
              npm run dev
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                className="btn btn-primary flex-1 justify-center !py-1.5 text-xs"
                disabled={retrying}
                onClick={() => void runStartupChecks()}
              >
                <RefreshCw size={13} className={retrying ? 'animate-spin' : ''} /> Retry connection
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-4 left-5 text-2xs text-muted num">v2.4.9</div>
      <div className="absolute bottom-4 right-5 text-2xs text-slate-600">SkillSwap for Campus</div>
    </div>
  );
}
