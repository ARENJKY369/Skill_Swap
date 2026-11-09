import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { ChevronLeft, ChevronRight, Send, Link2, CalendarDays } from 'lucide-react';
import Dialog from './Dialog';
import Avatar from './Avatar';
import { api, ApiError } from '../api/client';
import { useToast } from '../lib/toastHook';
import { db as localDb } from '../db/dexie';
import { seal, unseal } from '../db/crypto';
import { useAppStore, type PublicUser } from '../store/appStore';

const DRAFT_KEY = 'session-invite';

const formSchema = z.object({
  recipientId: z.string().min(1, 'Pick a partner'),
  skillId: z.string().min(1, 'Pick a topic'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24h HH:MM'),
  durationMin: z.number().int().min(15).max(180),
  message: z.string().max(500),
  meetingUrl: z.string().trim().max(300).optional(),
});

interface MatchRow { user: PublicUser; score: number; mutualSkills: string[] }

const DURATIONS = [
  { value: 30, label: '0.5 hrs' }, { value: 45, label: '0.75 hrs' }, { value: 60, label: '1 hr' },
  { value: 90, label: '1.5 hrs' }, { value: 120, label: '2 hrs' }, { value: 150, label: '2.5 hrs' }, { value: 180, label: '3 hrs' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function ScheduleSessionDialog({ prefill, onClose, onCreated }: {
  prefill?: { recipientId?: string; skillId?: string };
  onClose: () => void;
  onCreated?: () => void;
}) {
  const toast = useToast();
  const me = useAppStore((s) => s.user);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [peers, setPeers] = useState<PublicUser[]>([]);
  const [skills, setSkills] = useState<Array<{ id: string; name: string }>>([]);
  const [recipientId, setRecipientId] = useState(prefill?.recipientId ?? '');
  const [skillId, setSkillId] = useState(prefill?.skillId ?? '');
  const [date, setDate] = useState(() => toKey(new Date(Date.now() + 86_400_000)));
  const [time, setTime] = useState('09:00');
  const [durationMin, setDurationMin] = useState(60);
  const [message, setMessage] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = new Date(`${date}T00:00:00`);
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());
  const draftTimer = useRef<number | null>(null);
  const restored = useRef(false);

  /* load partner + topic options (matches + all verified peers so fresh users can schedule immediately) */
  useEffect(() => {
    api.get<{ matches: MatchRow[] }>('/api/users/matches/list')
      .then((d) => setMatches(d.matches))
      .catch(() => setMatches([]));
    api.get<{ users: PublicUser[] }>('/api/users/explorer?limit=60')
      .then((d) => setPeers(d.users))
      .catch(() => setPeers([]));
    api.get<{ skills: Array<{ id: string; name: string }> }>('/api/skills')
      .then((d) => setSkills(d.skills))
      .catch(() => setSkills([]));
  }, []);

  /* restore draft once */
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    localDb.drafts.get(DRAFT_KEY).then(async (draft) => {
      if (!draft) return;
      try {
        const parsed = JSON.parse(await unseal(JSON.parse(draft.payload))) as {
          recipientId: string; skillId: string; date: string; time: string; durationMin: number; message: string; meetingUrl?: string;
        };
        if (!prefill?.recipientId) setRecipientId(parsed.recipientId ?? '');
        if (!prefill?.skillId) setSkillId(parsed.skillId ?? '');
        setDate(parsed.date ?? date);
        setTime(parsed.time ?? '09:00');
        setDurationMin(parsed.durationMin ?? 60);
        setMessage(parsed.message ?? '');
        setMeetingUrl(parsed.meetingUrl ?? '');
        const d = new Date(`${parsed.date}T00:00:00`);
        if (!Number.isNaN(d.getTime())) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }
      } catch { /* draft unreadable — ignore */ }
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* persist draft (debounced, encrypted) */
  useEffect(() => {
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      const payload = { recipientId, skillId, date, time, durationMin, message, meetingUrl };
      seal(JSON.stringify(payload)).then((sealed) =>
        localDb.drafts.put({ id: DRAFT_KEY, payload: JSON.stringify(sealed), updatedAt: new Date().toISOString() }),
      ).catch(() => undefined);
    }, 500);
    return () => { if (draftTimer.current) window.clearTimeout(draftTimer.current); };
  }, [recipientId, skillId, date, time, durationMin, message, meetingUrl]);

  const partnerOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ user: PublicUser; score?: number }> = [];
    for (const m of matches) {
      seen.add(m.user.id);
      list.push({ user: m.user, score: m.score });
    }
    for (const p of peers) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        list.push({ user: p });
      }
    }
    return list;
  }, [matches, peers]);

  const partner = partnerOptions.find((m) => m.user.id === recipientId)?.user ?? null;

  const topicOptions = useMemo(() => {
    const mine = me?.teaches ?? [];
    const theirs = partner?.teaches ?? [];
    const names = [...new Set([...mine, ...theirs])];
    const byName = new Map(skills.map((s) => [s.name, s]));
    const matched = names
      .map((n) => byName.get(n))
      .filter((s): s is { id: string; name: string } => Boolean(s));
    return matched.length > 0 ? matched : skills.slice(0, 60);
  }, [me?.teaches, partner?.teaches, skills]);

  /* calendar grid */
  const calendar = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startWeekday = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayKey = toKey(new Date());
    const cells: Array<{ key: string; day: number; disabled: boolean; isToday: boolean; isSelected: boolean } | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(viewYear, viewMonth, d);
      cells.push({
        key: toKey(dt),
        day: d,
        disabled: toKey(dt) < todayKey,
        isToday: toKey(dt) === todayKey,
        isSelected: toKey(dt) === date,
      });
    }
    return cells;
  }, [viewYear, viewMonth, date]);

  const moveMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const submit = async () => {
    setError(null);
    const parsed = formSchema.safeParse({ recipientId, skillId, date, time, durationMin, message, meetingUrl: meetingUrl || undefined });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Check the form');
      return;
    }
    if (meetingUrl && !/^https:\/\//i.test(meetingUrl.trim())) {
      setError('Meeting link must start with https://');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/sessions', parsed.data);
      toast.success('Invite proposal sent', partner ? `${partner.name} will be notified.` : undefined);
      await localDb.drafts.delete(DRAFT_KEY).catch(() => undefined);
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the invite');
    } finally {
      setBusy(false);
    }
  };

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Dialog
      title="Schedule Session"
      subtitle="Propose a time. The invitee can accept, decline or suggest a new slot."
      onClose={onClose}
      width={620}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-2xs text-muted">{message.length}/500</span>
          <button className="btn btn-primary w-full sm:w-auto justify-center" onClick={() => void submit()} disabled={busy}>
            <Send size={15} strokeWidth={1.75} /> {busy ? 'Sending…' : 'Send Invite Proposal'}
          </button>
        </div>
      }
    >
      <div className="grid md:grid-cols-[1fr_220px] gap-4">
        {/* left column: partner, calendar, time */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="label" htmlFor="ss-partner">Partner</label>
            <select id="ss-partner" className="field" value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
              <option value="">Select a student…</option>
              {partnerOptions.map(({ user: u, score }) => {
                const skillsText = u.teaches.length > 0 ? ` — ${u.teaches.slice(0, 2).join(', ')}` : '';
                const scoreText = score !== undefined ? ` (${score}%)` : '';
                return (
                  <option key={u.id} value={u.id}>{u.name}{skillsText}{scoreText}</option>
                );
              })}
            </select>
            {partner && (
              <div className="flex items-center gap-2 mt-1.5 text-2xs text-muted">
                <Avatar name={partner.name} src={partner.avatar} size={16} />
                <span className="truncate">@{partner.username} · {partner.major || 'Student'}</span>
              </div>
            )}
          </div>

          {/* calendar */}
          <div className="border border-line rounded-card bg-inset p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <button className="p-1 rounded hover:bg-panel-raised text-muted hover:text-ink" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={15} /></button>
              <span className="text-xs font-semibold flex items-center gap-1.5"><CalendarDays size={12} className="text-accent" />{monthLabel}</span>
              <button className="p-1 rounded hover:bg-panel-raised text-muted hover:text-ink" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={15} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                <div key={d} className="text-[10px] font-semibold text-muted uppercase py-1">{d}</div>
              ))}
              {calendar.map((cell, i) => cell === null ? <div key={`x${i}`} /> : (
                <button
                  key={cell.key}
                  disabled={cell.disabled}
                  onClick={() => setDate(cell.key)}
                  aria-pressed={cell.isSelected}
                  aria-label={cell.key}
                  className={[
                    'h-7 rounded-input text-2xs num transition-colors',
                    cell.isSelected ? 'bg-accent text-[#062831] font-bold' : '',
                    !cell.isSelected && cell.isToday ? 'border border-accent/60 text-cyan-300' : '',
                    !cell.isSelected && !cell.disabled && !cell.isToday ? 'hover:bg-panel-raised text-ink' : '',
                    cell.disabled ? 'text-muted/35 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {cell.day}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="ss-date">Date</label>
              <input id="ss-date" type="date" className="field" value={date} min={toKey(new Date())} onChange={(e) => {
                setDate(e.target.value);
                const d = new Date(`${e.target.value}T00:00:00`);
                if (!Number.isNaN(d.getTime())) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }
              }} />
            </div>
            <div>
              <label className="label" htmlFor="ss-time">Time (24h)</label>
              <input id="ss-time" type="time" className="field num" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
        </div>

        {/* right column: topic, duration, message, link */}
        <div className="flex flex-col gap-3">
          <div>
            <label className="label" htmlFor="ss-topic">Teach / Topic</label>
            <select id="ss-topic" className="field" value={skillId} onChange={(e) => setSkillId(e.target.value)}>
              <option value="">Select topic…</option>
              {topicOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ss-duration">Duration</label>
            <select id="ss-duration" className="field" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))}>
              {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ss-message">Message</label>
            <textarea
              id="ss-message"
              className="field min-h-[96px] resize-y"
              maxLength={500}
              placeholder="What do you want to cover? Any prep needed?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="ss-link"><Link2 size={11} className="inline mr-1 -mt-0.5" />Meeting link (https only)</label>
            <input
              id="ss-link"
              type="url"
              className="field"
              placeholder="https://zoom.us/j/…"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
            />
            <p className="text-[10px] text-muted mt-1">Zoom, Google Meet, or a campus room link. http links are rejected.</p>
          </div>
          {error && <p className="text-2xs text-red-300 border border-red-500/30 bg-red-500/10 rounded-input px-2 py-1.5" role="alert">{error}</p>}
        </div>
      </div>
    </Dialog>
  );
}
