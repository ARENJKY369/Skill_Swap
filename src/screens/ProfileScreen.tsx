import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, Trash2, Plus, X, Check, CloudUpload, CloudOff, Loader2, Search,
  ShieldCheck, ShieldOff, Download, Copy, BadgeCheck, GraduationCap,
} from 'lucide-react';
import Dialog from '../components/Dialog';
import CodeInput from '../components/CodeInput';
import Avatar from '../components/Avatar';
import { api, ApiError } from '../api/client';
import { useAppStore, type PublicUser } from '../store/appStore';
import { useToast } from '../lib/toastHook';
import { sanitizeHtml } from '../lib/sanitize';
import { saveProfileLocalFirst } from '../db/sync';
import { db as localDb } from '../db/dexie';

type SaveState = 'idle' | 'saving' | 'saved' | 'queued' | 'error';

const YEARS = ['1st year', '2nd year', '3rd year', '4th year', 'Graduate'] as const;
const LEVELS = ['low', 'med', 'high'] as const;

export default function ProfileScreen() {
  const me = useAppStore((s) => s.user)!;
  const setUser = useAppStore((s) => s.setUser);
  const toast = useToast();

  const [name, setName] = useState(me.name);
  const [bio, setBio] = useState(me.bio);
  const [university, setUniversity] = useState(me.university);
  const [major, setMajor] = useState(me.major);
  const [year, setYear] = useState(me.year || '1st year');
  const [teaches, setTeaches] = useState<string[]>(me.teaches);
  const [wants, setWants] = useState<string[]>(me.wants);
  const [teachLevels, setTeachLevels] = useState<Record<string, string>>(me.teachLevels);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [skillDialog, setSkillDialog] = useState<'teaches' | 'wants' | null>(null);
  const [totpDialogOpen, setTotpDialogOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | null>(null);
  const firstRender = useRef(true);

  const snapshot = useMemo(
    () => JSON.stringify({ name, bio, university, major, year, teaches, wants, teachLevels }),
    [name, bio, university, major, year, teaches, wants, teachLevels],
  );

  const persist = useCallback(async (patch: Record<string, unknown>) => {
    setSaveState('saving');
    try {
      if (navigator.onLine) {
        const res = await api.patch<{ user: PublicUser }>('/api/users/me', patch);
        setUser(res.user);
        await localDb.profileEdits.add({ payload: '"synced"', updatedAt: new Date().toISOString(), synced: 1 }).catch(() => undefined);
        setSaveState('saved');
      } else {
        await saveProfileLocalFirst(patch);
        setSaveState('queued');
      }
      setLastSavedAt(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    } catch (err) {
      try {
        await saveProfileLocalFirst(patch);
        setSaveState('queued');
        setLastSavedAt(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
      } catch {
        setSaveState('error');
        toast.error('Autosave failed', err instanceof ApiError ? err.message : 'Will retry when online');
      }
    }
  }, [setUser, toast]);

  // debounced autosave
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist({ name, bio, university, major, year, teaches, wants, teachLevels });
    }, 900);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  const addSkill = (kind: 'teaches' | 'wants', skill: string) => {
    const clean = skill.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!clean) return;
    const target = kind === 'teaches' ? teaches : wants;
    if (target.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      toast.info('Already added', `"${clean}" is in the list.`);
      return;
    }
    if (kind === 'teaches') {
      setTeaches([...teaches, clean]);
      setTeachLevels((lv) => ({ ...lv, [clean]: 'med' }));
    } else {
      setWants([...wants, clean]);
    }
  };

  const removeSkill = (kind: 'teaches' | 'wants', skill: string) => {
    if (kind === 'teaches') {
      setTeaches(teaches.filter((s) => s !== skill));
      setTeachLevels((lv) => { const next = { ...lv }; delete next[skill]; return next; });
    } else {
      setWants(wants.filter((s) => s !== skill));
    }
  };

  const uploadAvatar = async (file: File) => {
    try {
      const dataUrl = await resizeImage(file, 256);
      const res = await api.post<{ avatar: string }>('/api/users/me/avatar', { dataUrl });
      setUser({ ...useAppStore.getState().user!, avatar: res.avatar });
      toast.success('Avatar updated');
    } catch (err) {
      toast.error('Upload failed', err instanceof ApiError ? err.message : 'Use a PNG/JPEG under 2 MB.');
    }
  };

  const removeAvatar = async () => {
    try {
      await api.del('/api/users/me/avatar');
      setUser({ ...useAppStore.getState().user!, avatar: null });
      toast.info('Avatar removed');
    } catch {
      toast.error('Could not remove avatar');
    }
  };

  const statusLine = {
    idle: { icon: CloudUpload, text: 'Changes save automatically', cls: 'text-muted' },
    saving: { icon: Loader2, text: 'Saving…', cls: 'text-cyan-300' },
    saved: { icon: CloudUpload, text: 'Saved locally · synced to server', cls: 'text-emerald-300' },
    queued: { icon: CloudOff, text: 'Saved locally — will sync when online', cls: 'text-amber-300' },
    error: { icon: CloudOff, text: 'Save failed — will retry', cls: 'text-red-300' },
  }[saveState];
  const StatusIcon = statusLine.icon;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 grid grid-cols-1 xl:grid-cols-[400px_minmax(0,1fr)] gap-4 max-w-[1200px]">
        {/* ------- left card: identity ------- */}
        <section className="bg-panel border border-line rounded-card p-5 flex flex-col gap-4 h-fit" aria-label="Profile">
          <div className="flex flex-col items-center gap-2 pt-1">
            <div className="relative">
              <Avatar name={name || me.name} src={me.avatar} size={104} status={me.status} />
              <button
                onClick={() => fileRef.current?.click()}
                aria-label="Upload avatar"
                title="Upload avatar"
                className="absolute bottom-0 right-0 p-1.5 rounded-full bg-accent text-[#062831] border-2 border-panel hover:bg-cyan-300 transition-colors"
              >
                <Camera size={13} strokeWidth={2} />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAvatar(f); e.target.value = ''; }}
              />
            </div>
            {me.avatar && (
              <button className="text-[10px] text-muted hover:text-red-300 flex items-center gap-1" onClick={() => void removeAvatar()}>
                <Trash2 size={10} /> Remove photo
              </button>
            )}
            <div className="text-center">
              <input
                className="bg-transparent text-center text-md font-bold text-ink border-b border-transparent hover:border-line focus:border-accent outline-none transition-colors w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Display name"
                maxLength={80}
              />
              <p className="text-2xs text-muted mt-0.5">@{me.username}
                {me.demo && <span className="chip chip-amber ml-2 !text-[9px] !py-0">Demo account</span>}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="bio">Bio</label>
              <span className="text-[10px] text-muted num">{bio.length}/300</span>
            </div>
            <textarea
              id="bio"
              className="field min-h-[72px] resize-y"
              maxLength={300}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="What do you study? What do you want to trade?"
            />
            {bio.includes('<') && (
              <div className="mt-1.5 text-2xs border border-line rounded-input px-2 py-1.5 bg-inset" aria-label="Sanitized preview">
                <span className="text-[9px] uppercase text-muted tracking-wider">Sanitized preview</span>
                <p className="text-ink/85 mt-0.5" dangerouslySetInnerHTML={{ __html: sanitizeHtml(bio) }} />
              </div>
            )}
          </div>

          <fieldset className="border border-line rounded-card p-3">
            <legend className="text-2xs uppercase tracking-wider text-muted px-1.5 flex items-center gap-1.5">
              <GraduationCap size={12} strokeWidth={1.75} /> University Info
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="label" htmlFor="uni">University</label>
                <input id="uni" className="field" value={university} onChange={(e) => setUniversity(e.target.value)} maxLength={120} />
              </div>
              <div>
                <label className="label" htmlFor="major">Major</label>
                <input id="major" className="field" value={major} onChange={(e) => setMajor(e.target.value)} maxLength={80} />
              </div>
              <div>
                <label className="label" htmlFor="year">Year</label>
                <select id="year" className="field" value={year} onChange={(e) => setYear(e.target.value)}>
                  {YEARS.map((y) => <option key={y}>{y}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label" htmlFor="email">Email</label>
                <input id="email" className="field opacity-60" value={me.email} disabled readOnly />
              </div>
            </div>
          </fieldset>

          {/* security */}
          <div className="border border-line rounded-card p-3 flex items-center gap-3">
            <ShieldCheck size={18} strokeWidth={1.5} className={me.totpEnabled ? 'text-emerald-400' : 'text-muted'} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold">Two-factor authentication</p>
              <p className="text-[10px] text-muted">{me.totpEnabled ? 'TOTP enabled — codes required at sign-in' : 'Add an authenticator app for a second factor'}</p>
            </div>
            <button className="btn btn-subtle !py-1.5 text-2xs" onClick={() => setTotpDialogOpen(true)}>
              {me.totpEnabled ? 'Manage' : 'Enable'}
            </button>
          </div>

          {/* save status */}
          <div className={`flex items-center gap-1.5 text-2xs ${statusLine.cls} border-t border-line pt-3`} role="status" aria-live="polite">
            <StatusIcon size={12} strokeWidth={1.75} className={saveState === 'saving' ? 'animate-spin' : ''} />
            <span>{statusLine.text}</span>
            {lastSavedAt && <span className="num text-muted ml-auto">{lastSavedAt}</span>}
          </div>
        </section>

        {/* ------- right card: skill portfolio ------- */}
        <section className="bg-panel border border-line rounded-card p-5 flex flex-col gap-5 h-fit" aria-label="Skill portfolio">
          <SkillSection
            title="Skills I Can Teach"
            accent
            skills={teaches}
            levels={teachLevels}
            onLevelChange={(skill, level) => setTeachLevels((lv) => ({ ...lv, [skill]: level }))}
            onAdd={() => setSkillDialog('teaches')}
            onRemove={(s) => removeSkill('teaches', s)}
          />
          <hr className="divider" />
          <SkillSection
            title="Skills I Want to Learn"
            skills={wants}
            onAdd={() => setSkillDialog('wants')}
            onRemove={(s) => removeSkill('wants', s)}
          />
        </section>
      </div>

      {skillDialog && (
        <SkillAutocompleteDialog
          title={skillDialog === 'teaches' ? 'Add a skill you can teach' : 'Add a skill you want to learn'}
          onClose={() => setSkillDialog(null)}
          onPick={(skill) => { addSkill(skillDialog, skill); setSkillDialog(null); }}
        />
      )}
      {totpDialogOpen && <TotpDialog onClose={() => setTotpDialogOpen(false)} />}
    </div>
  );
}

/* ================= Skill pill section ================= */

function SkillSection({ title, skills, levels, onLevelChange, onAdd, onRemove, accent }: {
  title: string;
  skills: string[];
  levels?: Record<string, string>;
  onLevelChange?: (skill: string, level: string) => void;
  onAdd: () => void;
  onRemove: (skill: string) => void;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-2">
          {title}
          <span className="chip chip-gray num">{skills.length}</span>
        </h2>
        <button className="btn btn-ghost !py-1 text-2xs" onClick={onAdd}>
          <Plus size={12} strokeWidth={2} /> Add New Skill
        </button>
      </div>
      {skills.length === 0 ? (
        <p className="text-2xs text-muted border border-dashed border-line rounded-input px-3 py-4 text-center">
          No skills listed yet. Add one so matches can find you.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <li
              key={skill}
              className={`group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-input border text-xs font-medium transition-colors ${
                accent
                  ? 'text-teal-200 border-teal-500/40 bg-teal-400/10 hover:border-teal-400/70'
                  : 'text-slate-200 border-line bg-inset hover:border-slate-500'
              }`}
            >
              {skill}
              {accent && levels && (
                <select
                  value={levels[skill] ?? 'med'}
                  onChange={(e) => onLevelChange?.(skill, e.target.value)}
                  aria-label={`Level for ${skill}`}
                  className="bg-transparent text-[10px] uppercase tracking-wide text-teal-300/90 border border-teal-500/30 rounded px-1 py-0.5 cursor-pointer focus-visible:outline-none"
                >
                  {LEVELS.map((l) => <option key={l} value={l} className="bg-panel">{l === 'med' ? 'Med' : l[0].toUpperCase() + l.slice(1)}</option>)}
                </select>
              )}
              <button
                onClick={() => onRemove(skill)}
                aria-label={`Remove ${skill}`}
                className="pill-remove text-muted hover:text-ink transition-colors"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ================= Skill autocomplete dialog ================= */

function SkillAutocompleteDialog({ title, onClose, onPick }: {
  title: string;
  onClose: () => void;
  onPick: (skill: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const t = window.setTimeout(() => {
      api.get<{ skills: Array<{ id: string; name: string; category: string }> }>(`/api/skills?q=${encodeURIComponent(query)}`)
        .then((d) => { setResults(d.skills.slice(0, 12)); setActive(0); })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 140);
    return () => window.clearTimeout(t);
  }, [query]);

  const commit = (value: string) => { if (value.trim()) onPick(value); };

  return (
    <Dialog title={title} subtitle="Pick from the catalog or type a custom skill" onClose={onClose} width={440}>
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" strokeWidth={1.5} />
          <input
            autoFocus
            className="field !pl-9"
            placeholder="Search skills… e.g. Java OOP"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter') {
                e.preventDefault();
                const targetList = results;
                if (targetList[active]) commit(targetList[active].name);
                else commit(query);
              }
            }}
            aria-label="Skill search"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto border border-line rounded-input divide-y divide-line/60" role="listbox" aria-label="Skill catalog matches">
          {loading && <li className="px-3 py-2.5 text-2xs text-muted">Searching…</li>}
          {!loading && results.length === 0 && query.trim() && (
            <li>
              <button className="w-full text-left px-3 py-2.5 text-xs hover:bg-panel-raised flex items-center justify-between" onClick={() => commit(query)}>
                <span>Add custom skill <span className="text-accent">“{query.trim()}”</span></span>
                <Plus size={12} className="text-accent" />
              </button>
            </li>
          )}
          {results.map((s, i) => (
            <li key={s.id}>
              <button
                role="option"
                aria-selected={i === active}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${i === active ? 'bg-accent-soft text-cyan-200' : 'hover:bg-panel-raised'}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(s.name)}
              >
                <span>{s.name}</span>
                <span className="text-[9px] uppercase tracking-wider text-muted">{s.category}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

/* ================= TOTP setup dialog ================= */

function TotpDialog({ onClose }: { onClose: () => void }) {
  const me = useAppStore((s) => s.user)!;
  const setUser = useAppStore((s) => s.setUser);
  const toast = useToast();
  const [phase, setPhase] = useState<'intro' | 'qr' | 'recovery' | 'enabled'>(me.totpEnabled ? 'enabled' : 'intro');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [copied, setCopied] = useState(false);

  const refreshMe = async () => {
    try {
      const res = await api.get<{ user: PublicUser }>('/api/auth/me');
      setUser(res.user);
    } catch { /* keep current */ }
  };

  const startSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ secret: string; qrDataUrl: string }>('/api/auth/2fa/setup');
      setSecret(res.secret);
      setQr(res.qrDataUrl);
      setPhase('qr');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start setup');
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ recoveryCodes: string[] }>('/api/auth/2fa/enable', { code });
      setRecoveryCodes(res.recoveryCodes);
      setPhase('recovery');
      await refreshMe();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid code');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/2fa/disable', { password: disablePassword });
      toast.info('Two-factor disabled');
      await refreshMe();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid credentials');
    } finally {
      setBusy(false);
    }
  };

  const downloadRecovery = () => {
    const blob = new Blob([`SkillSwap recovery codes — @${me.username}\nKeep these somewhere safe. Each code works once.\n\n${recoveryCodes.join('\n')}\n`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skillswap-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      title="Two-factor authentication"
      subtitle="Time-based one-time passwords (RFC 6238)"
      onClose={onClose}
      width={440}
    >
      {phase === 'intro' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted leading-relaxed">Scan the QR code with any authenticator app (1Password, Authy, Google Authenticator). You will need a fresh 6-digit code at every sign-in. Enabling rotates your active session.</p>
          {error && <p className="text-2xs text-red-300" role="alert">{error}</p>}
          <button className="btn btn-primary justify-center" onClick={() => void startSetup()} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} strokeWidth={1.75} />} Generate QR code
          </button>
        </div>
      )}

      {phase === 'qr' && (
        <div className="flex flex-col items-center gap-3">
          {qr && <img src={qr} alt="TOTP QR code" width={176} height={176} className="rounded-input border border-line" />}
          <div className="w-full">
            <label className="label">Secret (manual entry)</label>
            <div className="flex items-center gap-1.5">
              <code className="field num text-2xs flex-1 truncate">{secret}</code>
              <button className="btn btn-subtle !p-2" aria-label="Copy secret" onClick={() => { navigator.clipboard.writeText(secret).catch(() => undefined); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
            </div>
          </div>
          <CodeInput value={code} onChange={setCode} autoFocus />
          {error && <p className="text-2xs text-red-300" role="alert">{error}</p>}
          <button className="btn btn-primary w-full justify-center" onClick={() => void enable()} disabled={busy || code.length !== 6}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} strokeWidth={1.75} />} Confirm &amp; enable
          </button>
        </div>
      )}

      {phase === 'recovery' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-emerald-300 flex items-center gap-1.5"><BadgeCheck size={14} /> Two-factor authentication is enabled.</p>
          <p className="text-2xs text-muted">Recovery codes — shown once. Each works one time. Store them offline:</p>
          <ul className="grid grid-cols-2 gap-1.5">
            {recoveryCodes.map((c) => (
              <li key={c} className="num text-2xs border border-line rounded-input bg-inset px-2 py-1.5 text-center text-cyan-200">{c}</li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button className="btn btn-subtle flex-1 justify-center text-xs" onClick={downloadRecovery}><Download size={13} /> Download .txt</button>
            <button className="btn btn-primary flex-1 justify-center text-xs" onClick={onClose}>Done</button>
          </div>
        </div>
      )}

      {phase === 'enabled' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-emerald-300 flex items-center gap-1.5"><ShieldCheck size={14} /> TOTP is active on this account.</p>
          <label className="label" htmlFor="disable-2fa">Disable 2FA — confirm password</label>
          <input id="disable-2fa" type="password" className="field" autoComplete="current-password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} placeholder="Your password" />
          {error && <p className="text-2xs text-red-300" role="alert">{error}</p>}
          <button className="btn btn-danger justify-center text-xs" onClick={() => void disable()} disabled={busy || !disablePassword}>
            <ShieldOff size={13} /> Disable two-factor authentication
          </button>
        </div>
      )}
    </Dialog>
  );
}

async function resizeImage(file: File, size: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const min = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - min) / 2;
  const sy = (bitmap.height - min) / 2;
  ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}
