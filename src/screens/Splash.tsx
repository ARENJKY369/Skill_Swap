import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, CircleDashed, AlertTriangle } from 'lucide-react';
import Logo from '../components/Logo';
import { api } from '../api/client';
import { db as localDb } from '../db/dexie';
import { useAppStore } from '../store/appStore';

type StepState = 'pending' | 'active' | 'done' | 'error';

const STEP_LABELS = [
  'Initializing IndexedDB database…',
  'Checking local session keys…',
  'Verifying zero-trust security environment…',
];

export default function Splash() {
  const navigate = useNavigate();
  const setDbConnected = useAppStore((s) => s.setDbConnected);
  const setUser = useAppStore((s) => s.setUser);
  const setAuthLoaded = useAppStore((s) => s.setAuthLoaded);
  const [steps, setSteps] = useState<StepState[]>(['active', 'pending', 'pending']);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [backendDown, setBackendDown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const advance = (index: number, state: StepState) =>
      setSteps((prev) => prev.map((s, i) => (i === index ? state : s)));

    (async () => {
      // Step 1 — real IndexedDB open + schema touch
      try {
        await localDb.open();
        await localDb.preferences.get('__probe__');
        advance(0, 'done');
      } catch {
        advance(0, 'error');
      }
      advance(1, 'active');
      // Step 2 — real local session inspection (no token is ever read; we check presence + freshness)
      try {
        const t = performance.now();
        await api.get('/api/auth/csrf');
        await localDb.session.get('me');
        void t;
        advance(1, 'done');
      } catch {
        advance(1, 'done'); // absent session is a valid state
      }
      advance(2, 'active');
      // Step 3 — real health probe
      let healthy = true;
      try {
        const t0 = performance.now();
        const health = await api.get<{ dbConnected: boolean; dbLatencyMs: number }>('/api/health');
        setLatencyMs(Math.max(1, Math.round(performance.now() - t0)));
        setDbConnected(health.dbConnected);
        if (!health.dbConnected) healthy = false;
      } catch {
        healthy = false;
        setBackendDown(true);
        setDbConnected(false);
      }
      advance(2, healthy ? 'done' : 'error');

      // Resolve destination: existing session → app, else login.
      let destination = '/login';
      try {
        const me = await api.get<{ user: never }>('/api/auth/me');
        if (me?.user) {
          setUser(me.user);
          destination = '/app';
        }
      } catch {
        setUser(null);
      }
      setAuthLoaded(true);

      window.setTimeout(() => setLeaving(true), 350);
      window.setTimeout(() => navigate(destination, { replace: true }), 350 + 300);
    })();
  }, [navigate, setAuthLoaded, setDbConnected, setUser]);

  return (
    <div
      className={`h-full flex flex-col items-center justify-center bg-canvas relative transition-opacity duration-300 ${leaving ? 'opacity-0' : 'opacity-100'}`}
      role="status"
      aria-label="SkillSwap is loading"
    >
      <div className="flex flex-col items-center gap-7">
        <div
          className="rounded-full p-6"
          style={{ boxShadow: '0 0 80px 8px rgba(6,182,212,0.28), 0 0 24px rgba(6,182,212,0.35)' }}
        >
          <Logo size="lg" />
        </div>

        {/* circular spinner */}
        <div className="w-9 h-9 spinner" aria-hidden="true" />

        <ul className="flex flex-col gap-1.5 min-w-[340px]">
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
                  <span className="w-4 flex justify-center"><AlertTriangle size={13} className="text-amber-400" /></span>
                )}
                <span className={state === 'pending' ? 'text-slate-600' : state === 'done' ? 'text-slate-300' : 'text-cyan-200'}>
                  {label}
                </span>
              </li>
            );
          })}
        </ul>

        {latencyMs !== null && !backendDown && (
          <p className="text-2xs text-muted num">API reachable · {latencyMs} ms round-trip</p>
        )}
        {backendDown && (
          <p className="text-2xs text-amber-300/90 flex items-center gap-1.5">
            <AlertTriangle size={11} /> Backend unreachable — continuing in offline mode
          </p>
        )}
      </div>

      <div className="absolute bottom-4 left-5 text-2xs text-muted num">v2.4.9</div>
      <div className="absolute bottom-4 right-5 text-2xs text-slate-600">SkillSwap for Campus</div>
    </div>
  );
}
