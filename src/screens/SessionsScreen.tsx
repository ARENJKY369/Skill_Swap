import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Check, X, CalendarClock, Video, Star, ChevronRight, ExternalLink, Inbox, CalendarCheck2, History,
} from 'lucide-react';
import Avatar from '../components/Avatar';
import FeedbackDialog from '../components/FeedbackDialog';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { useToast } from '../lib/toastHook';
import { isHttpsUrl, sessionEndIso } from '../lib/format';
import { canMarkCompleted, type SessionStatus } from '@shared/sessionStateMachine';
import type { SessionDto } from './Dashboard';

type Tab = 'incoming' | 'scheduled' | 'past';

const STATUS_CHIP: Record<string, string> = {
  Confirmed: 'chip chip-green',
  Accepted: 'chip chip-green',
  Pending: 'chip chip-amber',
  Rescheduled: 'chip chip-amber',
  Declined: 'chip chip-red',
  Completed: 'chip chip-teal',
};

function statusLabel(s: SessionStatus): string {
  return s === 'Accepted' ? 'Confirmed' : s;
}

export default function SessionsScreen() {
  const me = useAppStore((s) => s.user)!;
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || 'incoming';
  const setTab = (t: Tab) => setSearchParams({ tab: t }, { replace: true });

  const [sessions, setSessions] = useState<SessionDto[] | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  const [feedbackFor, setFeedbackFor] = useState<SessionDto | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        api.get<{ sessions: SessionDto[] }>('/api/sessions'),
        api.get<{ reviews: Array<{ session_id: string }> }>('/api/reviews/mine'),
      ]);
      setSessions(s.sessions);
      setReviewed(new Set(r.reviews.map((x) => x.session_id)));
    } catch {
      setSessions((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const nowIso = useMemo(() => new Date().toISOString(), [sessions]); // recompute per load

  const buckets = useMemo(() => {
    const all = sessions ?? [];
    const endOf = (s: SessionDto) => sessionEndIso(s.start, s.durationMin);
    const incoming = all.filter((s) => s.recipient_id === me.id && (s.status === 'Pending' || s.status === 'Rescheduled'));
    const scheduled = all
      .filter((s) => (s.status === 'Accepted' || (s.status === 'Rescheduled' && s.recipient_id !== me.id)) && endOf(s) >= nowIso)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const past = all
      .filter((s) => s.status === 'Completed' || s.status === 'Declined' || endOf(s) < nowIso)
      .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
    return { incoming, scheduled, past };
  }, [sessions, me.id, nowIso]);

  const act = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api.patch(`/api/sessions/${id}`, body);
      await load();
    } catch (err) {
      toast.error('Action failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const TABS: Array<{ id: Tab; label: string; count: number; icon: typeof Inbox }> = [
    { id: 'incoming', label: 'Incoming Requests', count: buckets.incoming.length, icon: Inbox },
    { id: 'scheduled', label: 'Scheduled Sessions', count: buckets.scheduled.length, icon: CalendarCheck2 },
    { id: 'past', label: 'Past Activity', count: buckets.past.length, icon: History },
  ];

  const list = tab === 'incoming' ? buckets.incoming : tab === 'scheduled' ? buckets.scheduled : buckets.past;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 max-w-[980px] flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-md font-bold text-ink">Schedule &amp; Sessions</h1>
            <p className="text-2xs text-muted mt-0.5">Accept, reschedule or complete sessions. Meeting links must be https.</p>
          </div>
        </div>

        {/* tab strip */}
        <div role="tablist" aria-label="Sessions" className="flex items-center gap-1 border-b border-line">
          {TABS.map(({ id, label, count, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`relative flex items-center gap-2 px-3 pb-2 pt-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                tab === id ? 'border-accent text-cyan-300' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              <Icon size={13} strokeWidth={1.75} aria-hidden="true" /> {label}
              <span className="chip chip-gray num !text-[9px] !py-0">{count}</span>
            </button>
          ))}
        </div>

        {sessions === null ? (
          <div className="flex flex-col gap-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-20" />)}</div>
        ) : list.length === 0 ? (
          <div className="py-14 text-center border border-dashed border-line rounded-card">
            <CalendarClock size={22} strokeWidth={1.25} className="text-muted mx-auto" aria-hidden="true" />
            <p className="text-sm text-muted mt-2">
              {tab === 'incoming' && 'No incoming requests. New invites land here.'}
              {tab === 'scheduled' && 'No sessions scheduled. Find a match.'}
              {tab === 'past' && 'No past activity yet.'}
            </p>
            {tab !== 'incoming' && (
              <a href="#/app/matches" className="btn btn-primary !py-1.5 text-xs mt-3 inline-flex"><ChevronRight size={13} /> Open Matchmaker</a>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((s) => {
              const endIso = sessionEndIso(s.start, s.durationMin);
              const start = new Date(s.start);
              const isRecipient = s.recipient_id === me.id;
              const myFlag = isRecipient ? s.completed_by_recipient : s.completed_by_requester;
              const completable = canMarkCompleted(s.status, endIso, new Date().toISOString()) && myFlag === 0;
              const waitingForPartner = s.status === 'Accepted' && endIso < nowIso && myFlag === 1;
              const canReview = s.status === 'Completed' && !reviewed.has(s.id);
              const partner = s.partner;
              return (
                <li key={s.id} className="bg-panel border border-line rounded-card p-3 flex flex-wrap items-center gap-3 hover:border-slate-500 transition-colors">
                  {/* date badge */}
                  <div className="flex flex-col items-center justify-center w-14 shrink-0 border border-line rounded-input bg-inset py-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-muted">{start.toLocaleString(undefined, { month: 'short' })}</span>
                    <span className="num text-xl font-bold text-ink leading-tight">{start.getDate()}</span>
                    <span className="text-[9px] text-muted num">{start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                  </div>

                  {/* partner info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-ink">{s.skill_name}</h3>
                      <span className={STATUS_CHIP[s.status] ?? 'chip chip-gray'}>{statusLabel(s.status)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {partner && <Avatar name={partner.name} src={partner.avatar} size={18} status={partner.status} />}
                      <span className="text-2xs text-muted truncate">
                        Partner Info · <span className="text-ink/90">{partner?.name}</span> <span className="num">@{partner?.username}</span> · {s.durationMin} min
                      </span>
                    </div>
                    {s.message && <p className="text-2xs text-muted/90 mt-1 leading-snug line-clamp-2">“{s.message}”</p>}
                    {s.meeting_url && isHttpsUrl(s.meeting_url) && (
                      <a href={s.meeting_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-cyan-300 hover:text-cyan-200 mt-1 max-w-full">
                        <Video size={10} aria-hidden="true" /> <span className="truncate num">{s.meeting_url}</span> <ExternalLink size={9} />
                      </a>
                    )}
                    {waitingForPartner && <p className="text-[10px] text-amber-300/90 mt-1">Waiting for your partner to confirm completion…</p>}
                  </div>

                  {/* actions */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {tab === 'incoming' && (
                      <>
                        <button className="btn btn-primary !py-1.5 text-2xs w-28 justify-center" disabled={busy} onClick={() => void act(s.id, { action: 'accept' })}>
                          <Check size={12} strokeWidth={2} /> Accept
                        </button>
                        <button className="btn btn-ghost !py-1.5 text-2xs w-28 justify-center" onClick={() => { setRescheduleId((cur) => (cur === s.id ? null : s.id)); setRescheduleDate(''); }}>
                          Reschedule
                        </button>
                        <button className="btn btn-danger !py-1.5 text-2xs w-28 justify-center" disabled={busy} onClick={() => void act(s.id, { action: 'decline' })}>
                          <X size={12} strokeWidth={2} /> Decline
                        </button>
                      </>
                    )}
                    {tab === 'scheduled' && (
                      <>
                        {s.meeting_url && isHttpsUrl(s.meeting_url) && (
                          <a className="btn btn-primary !py-1.5 text-2xs w-32 justify-center" href={s.meeting_url} target="_blank" rel="noopener noreferrer">
                            <Video size={12} /> Launch Session
                          </a>
                        )}
                        <button className="btn btn-ghost !py-1.5 text-2xs w-32 justify-center" onClick={() => { setRescheduleId((cur) => (cur === s.id ? null : s.id)); setRescheduleDate(''); }}>
                          Reschedule
                        </button>
                        {completable && (
                          <button className="btn btn-subtle !py-1.5 text-2xs w-32 justify-center" disabled={busy} onClick={() => void act(s.id, { action: 'complete' })}>
                            <Check size={12} /> Mark Completed
                          </button>
                        )}
                      </>
                    )}
                    {tab === 'past' && (
                      <>
                        {completable && (
                          <button className="btn btn-primary !py-1.5 text-2xs w-32 justify-center" disabled={busy} onClick={() => void act(s.id, { action: 'complete' })}>
                            <Check size={12} /> Mark Completed
                          </button>
                        )}
                        {canReview && (
                          <button className="btn btn-primary !py-1.5 text-2xs w-32 justify-center" onClick={() => setFeedbackFor(s)}>
                            <Star size={12} /> Leave Review
                          </button>
                        )}
                        {s.status === 'Completed' && reviewed.has(s.id) && (
                          <span className="text-[10px] text-teal-300/80 flex items-center gap-1"><Check size={10} /> Reviewed</span>
                        )}
                      </>
                    )}
                  </div>

                  {/* inline reschedule row */}
                  {rescheduleId === s.id && (
                    <div className="w-full flex items-center gap-2 border-t border-line pt-2 mt-1">
                      <input type="date" className="field !w-36" min={new Date().toISOString().slice(0, 10)} value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} aria-label="New date" />
                      <input type="time" className="field !w-28 num" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} aria-label="New time" />
                      <button className="btn btn-primary !py-1.5 text-2xs" disabled={busy || !rescheduleDate} onClick={async () => { await act(s.id, { action: 'reschedule', date: rescheduleDate, time: rescheduleTime }); setRescheduleId(null); }}>
                        Propose new time
                      </button>
                      <button className="btn btn-ghost !py-1.5 text-2xs" onClick={() => setRescheduleId(null)}>Cancel</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {feedbackFor && feedbackFor.partner && (
        <FeedbackDialog
          sessionId={feedbackFor.id}
          partnerName={feedbackFor.partner.name}
          onClose={() => setFeedbackFor(null)}
          onSubmitted={() => { setReviewed((prev) => new Set(prev).add(feedbackFor.id)); void load(); }}
        />
      )}
    </div>
  );
}
