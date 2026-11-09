import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, FileText, Cookie, Download, Trash2, AlertTriangle, X } from 'lucide-react';
import Dialog from './Dialog';
import { api, ApiError } from '../api/client';
import { useToast } from '../lib/toastHook';
import { clearLocalData } from '../db/sync';
import { db as localDb } from '../db/dexie';
import { useAppStore } from '../store/appStore';

type Tab = 'privacy' | 'terms' | 'cookies';

const TABS: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: 'privacy', label: 'Privacy Policy', icon: ShieldCheck },
  { id: 'terms', label: 'Terms of Service', icon: FileText },
  { id: 'cookies', label: 'Cookie Settings', icon: Cookie },
];

export default function LegalModal({ tab, onClose }: { tab: Tab; onClose: () => void }) {
  const [active, setActive] = useState<Tab>(tab);
  const [analytics, setAnalytics] = useState(false);
  const [functional, setFunctional] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const navigate = useNavigate();
  const setUser = useAppStore((s) => s.setUser);
  const user = useAppStore((s) => s.user);

  useEffect(() => setActive(tab), [tab]);

  useEffect(() => {
    localDb.preferences.get('cookie-analytics').then((p) => setAnalytics(p?.value === '1')).catch(() => undefined);
    localDb.preferences.get('cookie-functional').then((p) => setFunctional(p?.value !== '0')).catch(() => undefined);
  }, []);

  const toggleCookie = async (key: string, on: boolean, setter: (v: boolean) => void) => {
    setter(on);
    await localDb.preferences.put({ key, value: on ? '1' : '0' }).catch(() => undefined);
    toast.info('Cookie preferences saved', 'Stored locally in IndexedDB.');
  };

  const exportData = async () => {
    try {
      const data = await api.get('/api/users/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'skillswap-export.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export ready', 'Your data was downloaded as JSON.');
    } catch {
      toast.error('Export failed', 'You may be offline. Try again when connected.');
    }
  };

  const clearLocal = async () => {
    await clearLocalData();
    toast.success('Local data cleared', 'IndexedDB, cache and preferences were wiped from this device.');
    window.location.assign('/login');
  };

  const deleteAccount = async () => {
    setError(null);
    if (confirmText !== 'DELETE') { setError('Type DELETE to confirm.'); return; }
    setBusy(true);
    try {
      await api.del('/api/auth/account', { password, confirmText });
      await clearLocalData();
      setUser(null);
      toast.success('Account deleted', 'Your account and local data were permanently removed.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Privacy Policy & Terms of Service" subtitle="SkillSwap processes your data under the terms below." onClose={onClose} width={640}>
      {/* tab strip */}
      <div role="tablist" aria-label="Legal sections" className="flex items-center gap-1 border-b border-line -mt-1 mb-4">
        {TABS.map(({ id, label, icon: Icon }) => {
          const activeTab = active === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab}
              onClick={() => setActive(id)}
              className={`relative flex items-center gap-1.5 px-3 pb-2 pt-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                activeTab ? 'border-accent text-cyan-300' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              <Icon size={13} strokeWidth={1.75} /> {label}
            </button>
          );
        })}
      </div>

      <div className="text-xs text-ink/90 leading-relaxed flex flex-col gap-3 max-h-[52vh] overflow-y-auto pr-1">
        {active === 'privacy' && (
          <>
            <section>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">What we collect</h3>
              <p className="mt-1">Account details (name, email, university, major, year), the skills you teach and want to learn, session history, reviews you write or receive, and audit entries for security events. We never see your password — only an Argon2id/bcrypt hash.</p>
            </section>
            <section>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Your GDPR rights</h3>
              <ul className="list-disc ml-4 mt-1 flex flex-col gap-1">
                <li><strong>Access &amp; portability</strong> — download everything we hold as JSON.</li>
                <li><strong>Rectification</strong> — edit name, bio, university and skills any time from Profile; edits sync to the server.</li>
                <li><strong>Erasure</strong> — delete your account below; server rows and local IndexedDB are purged immediately.</li>
                <li><strong>Objection &amp; restriction</strong> — essential operation aside, you may restrict processing by closing your account.</li>
              </ul>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {user && (
                  <button className="btn btn-subtle !py-1.5 text-2xs" onClick={() => void exportData()}>
                    <Download size={12} /> Export my data (JSON)
                  </button>
                )}
                <button className="btn btn-subtle !py-1.5 text-2xs" onClick={() => void clearLocal()}>
                  <Trash2 size={12} /> Clear local data (IndexedDB)
                </button>
              </div>
            </section>
            <section>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">What stays on this device</h3>
              <p className="mt-1">IndexedDB stores encrypted drafts (session invites, bio edits), your last-synced profile, cookie preferences and a retry queue. Sensitive payloads are sealed with AES-GCM using a non-extractable WebCrypto key generated on this device. Raw tokens and passwords are never stored.</p>
            </section>
            <section>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Retention</h3>
              <p className="mt-1">Account data lives until you delete it. Session and review records are anonymized on account deletion within 30 days. Audit logs (security events) are retained for 12 months. Local IndexedDB clears when you use the button above or delete your account.</p>
            </section>
            <section>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">No selling, ever</h3>
              <p className="mt-1">SkillSwap does not sell, rent or share your personal data with advertisers or data brokers. Aggregate, de-identified statistics may be shown to administrators.</p>
            </section>
            {user && (
              <section className="border border-red-500/25 bg-red-500/5 rounded-card p-3">
                <h3 className="text-xs font-bold text-red-300 uppercase tracking-wider flex items-center gap-1.5"><AlertTriangle size={12} /> Danger zone</h3>
                {!deleteOpen ? (
                  <button className="btn btn-danger !py-1.5 text-2xs mt-2" onClick={() => setDeleteOpen(true)}>
                    <Trash2 size={12} /> Delete my account
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 mt-2">
                    <p className="text-2xs text-red-200/80">This is permanent. Your profile, sessions, reviews and local data are erased.</p>
                    <input type="password" className="field" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" aria-label="Password" />
                    <input className="field num" placeholder='Type DELETE to confirm' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Type DELETE" />
                    {error && <p className="text-2xs text-red-300" role="alert">{error}</p>}
                    <div className="flex items-center gap-2">
                      <button className="btn btn-danger !py-1.5 text-2xs" disabled={busy} onClick={() => void deleteAccount()}>
                        {busy ? 'Deleting…' : 'Permanently delete account'}
                      </button>
                      <button className="btn btn-ghost !py-1.5 text-2xs" onClick={() => { setDeleteOpen(false); setError(null); }}>
                        <X size={12} /> Keep my account
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {active === 'terms' && (
          <>
            <section>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">The deal</h3>
              <p className="mt-1">SkillSwap connects students to trade skills peer-to-peer. It is a learning exchange, not a marketplace: no payments, no grades, no credit. Be kind, be present, honor your sessions.</p>
            </section>
            <section>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Your responsibilities</h3>
              <ul className="list-disc ml-4 mt-1 flex flex-col gap-1">
                <li>One real identity per account. Impersonation gets you restricted.</li>
                <li>Show up, or cancel with at least 2 hours notice.</li>
                <li>No harassment, spam, or off-platform solicitation. Admins moderate; violations are audit-logged.</li>
                <li>Reviews require a completed session — no vote manipulation.</li>
              </ul>
            </section>
            <section>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Availability &amp; liability</h3>
              <p className="mt-1">SkillSwap is provided "as is". We do our best to keep it online, but sessions are peer commitments — we are not party to them. If something goes wrong, talk to your partner first, then to an administrator.</p>
            </section>
            <section>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Sessions &amp; completion</h3>
              <p className="mt-1">A session is marked Completed only after both participants confirm. Confirmed sessions are eligible for one review each, one time, ever.</p>
            </section>
          </>
        )}

        {active === 'cookies' && (
          <>
            <section>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Cookie &amp; storage categories</h3>
              <div className="flex flex-col gap-2 mt-2">
                {[
                  { label: 'Essential', desc: 'Session cookie (HttpOnly, SameSite=Strict), CSRF token. Required for sign-in.', on: true, locked: true },
                  { label: 'Functional', desc: 'Remember Me duration and interface preferences stored in IndexedDB.', on: functional, locked: false, set: (v: boolean) => toggleCookie('cookie-functional', v, setFunctional) },
                  { label: 'Analytics', desc: 'Anonymous, aggregate usage counts. Off by default. No cross-site tracking.', on: analytics, locked: false, set: (v: boolean) => toggleCookie('cookie-analytics', v, setAnalytics) },
                ].map(({ label, desc, on, locked, set }) => (
                  <div key={label} className="flex items-center justify-between gap-4 border border-line rounded-input px-3 py-2 bg-inset">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink">{label}{locked && <span className="text-muted font-normal"> — always on</span>}</p>
                      <p className="text-2xs text-muted mt-0.5">{desc}</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={on}
                      aria-label={`${label} cookies`}
                      disabled={locked}
                      onClick={() => set?.(!on)}
                      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-accent' : 'bg-slate-600'} ${locked ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Clearing storage</h3>
              <p className="mt-1">"Clear local data" wipes IndexedDB (drafts, cached profile, preferences, outbox, the AES-GCM key) and session storage on this device. Your server-side account is untouched.</p>
              <button className="btn btn-subtle !py-1.5 text-2xs mt-2" onClick={() => void clearLocal()}>
                <Trash2 size={12} /> Clear local data now
              </button>
            </section>
          </>
        )}
      </div>
    </Dialog>
  );
}
