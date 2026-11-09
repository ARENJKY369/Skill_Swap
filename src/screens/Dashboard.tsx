import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Clock3, Inbox, CalendarClock, ExternalLink, CheckCircle2, Info, Star,
  CalendarCheck2, UserPlus, AlertTriangle, Video,
} from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { useToast } from '../lib/toastHook';
import { relativeTime, isHttpsUrl, sessionEndIso } from '../lib/format';

export interface SessionDto {
  id: string;
  requester_id: string;
  recipient_id: string;
  skill_id: string;
  skill_name: string;
  skill_category: string;
  start: string;
  durationMin: number;
  status: 'Pending' | 'Accepted' | 'Declined' | 'Rescheduled' | 'Completed';
  message: string;
  meeting_url: string | null;
  proposed_by?: string | null;
  completed_by_requester: number;
  completed_by_recipient: number;
  partner: { id: string; name: string; username: string; avatar: string | null; status: string; major: string } | null;
}

interface NotificationRow { id: string; title: string; body: string; kind: string; read: number; created_at: string }
interface MatchDto { user: { id: string }; score: number }

const kindIcon: Record<string, typeof Info> = {
  request: UserPlus, invite: CalendarClock, reminder: CalendarCheck2, review: Star, moderation: AlertTriangle, info: Info,
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

export default function Dashboard() {
  const me = useAppStore((s) => s.user)!;
  const navigate = useNavigate();
  const toast = useToast();
  const setUnread = useAppStore((s) => s.setUnreadCount);

  const [sessions, setSessions] = useState<SessionDto[] | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [matches, setMatches] = useState<MatchDto[] | null>(null);
  const [pendingConnects, setPendingConnects] = useState(0);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, n, m, r] = await Promise.allSettled([
        api.get<{ sessions: SessionDto[] }>('/api/sessions'),
        api.get<{ notifications: NotificationRow[]; unread: number }>('/api/notifications'),
        api.get<{ matches: MatchDto[] }>('/api/users/matches/list'),
        api.get<{ incoming: Array<{ status: string }> }>('/api/users/me/requests/list'),
      ]);
      if (s.status === 'fulfilled') setSessions(s.value.sessions);
      if (n.status === 'fulfilled') { setNotifications(n.value.notifications.slice(0, 12)); setUnread(n.value.unread); }
      if (m.status === 'fulfilled') setMatches(m.value.matches);
      if (r.status === 'fulfilled') setPendingConnects(r.value.incoming.filter((x) => x.status === 'Pending').length);
    } catch { /* keep last data */ }
  }, [setUnread]);

  useEffect(() => {
    void load();
    const t = window.setInterval(load, 6000);
    return () => window.clearInterval(t);
  }, [load]);

  const now = Date.now();
  const upcoming = useMemo(
    () => (sessions ?? [])
      .filter((s) => (s.status === 'Accepted' || s.status === 'Rescheduled') && Date.parse(sessionEndIso(s.start, s.durationMin)) > now)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .slice(0, 6),
    [sessions, now],
  );

  const hoursTaught = useMemo(() => {
    if (!sessions) return 0;
    const mine = new Set(me.teaches);
    const minutes = sessions
      .filter((s) => s.status === 'Completed' && mine.has(s.skill_name))
      .reduce((acc, s) => acc + s.durationMin, 0);
    return Math.round((minutes / 60) * 10) / 10;
  }, [sessions, me.teaches]);

  const matchedCount = useMemo(() => (matches ?? []).filter((m) => m.score >= 50).length, [matches]);
  const pendingInvites = useMemo(() => {
    const pendingSessions = (sessions ?? []).filter((s) => s.status === 'Pending' && s.recipient_id === me.id).length;
    return pendingSessions + pendingConnects;
  }, [sessions, pendingConnects, me.id]);

  const markAllRead = async () => {
    try {
      await api.post('/api/notifications/read-all');
      setNotifications((ns) => ns.map((n) => ({ ...n, read: 1 })));
      setUnread(0);
    } catch { /* ignore */ }
  };

  const reschedule = async (id: string) => {
    if (!rescheduleDate) return;
    setActionBusy(true);
    try {
      await api.patch(`/api/sessions/${id}`, { action: 'reschedule', date: rescheduleDate, time: rescheduleTime });
      toast.success('Reschedule proposed', 'The other party will be notified.');
      setRescheduleId(null);
      void load();
    } catch (err) {
      toast.error('Could not reschedule', err instanceof Error ? err.message : undefined);
    } finally {
      setActionBusy(false);
    }
  };

  const metricSkeleton = sessions === null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4">
        {/* main column */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* section header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-md font-bold text-ink">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {me.name.split(' ')[0]}</h1>
              <p className="text-2xs text-muted mt-0.5">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <button className="btn btn-subtle !py-1.5 text-xs" onClick={() => navigate('/app/matches')}>Find a match</button>
          </div>

          {/* metric cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Matched Partners', value: matchedCount, sub: 'score ≥ 50', icon: Users },
              { label: 'Hours Taught', value: `${hoursTaught}`, unit: 'hrs', sub: 'completed sessions', icon: Clock3 },
              { label: 'Pending Invites', value: pendingInvites, sub: 'awaiting your response', icon: Inbox },
            ].map(({ label, value, unit, sub, icon: Icon }) => (
              <div key={label} className="bg-panel border border-line rounded-card p-3.5 flex flex-col gap-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs uppercase tracking-wider text-muted font-semibold truncate">{label}</span>
                  <Icon size={14} strokeWidth={1.5} className="text-muted shrink-0" aria-hidden="true" />
                </div>
                {metricSkeleton ? (
                  <div className="skeleton h-7 w-16 rounded" />
                ) : (
                  <p className="num text-[26px] leading-7 font-semibold text-ink">
                    {value}
                    {unit && <span className="text-xs text-muted ml-1">{unit}</span>}
                  </p>
                )}
                <p className="text-[10px] text-muted">{sub}</p>
              </div>
            ))}
          </div>

          {/* upcoming sessions */}
          <section className="bg-panel border border-line rounded-card overflow-hidden" aria-labelledby="upcoming-heading">
            <div className="flex items-center justify-between px-4 h-10 border-b border-line">
              <h2 id="upcoming-heading" className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-2">
                <CalendarClock size={13} strokeWidth={1.75} className="text-accent" /> Upcoming Sessions
              </h2>
              <button className="text-2xs text-accent hover:text-cyan-300" onClick={() => navigate('/app/sessions')}>View all</button>
            </div>
            {sessions === null ? (
              <div className="p-4 flex flex-col gap-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
            ) : upcoming.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted">No sessions scheduled. Find a match.</p>
                <button className="btn btn-primary !py-1.5 text-xs mt-3" onClick={() => navigate('/app/matches')}>Open Matchmaker</button>
              </div>
            ) : (
              <ul className="divide-y divide-line/60">
                {upcoming.map((s) => {
                  const isToday = dayLabel(s.start) === 'Today';
                  const joinable = s.status === 'Accepted' && s.meeting_url && isHttpsUrl(s.meeting_url);
                  return (
                    <li key={s.id} className="px-4 py-2.5 hover:bg-panel-raised/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="flex flex-col items-center justify-center w-12 shrink-0 border border-line rounded-input bg-inset py-1">
                          <span className="num text-sm font-bold leading-none text-ink">{new Date(s.start).getDate()}</span>
                          <span className="text-[9px] uppercase text-muted leading-none mt-0.5">{new Date(s.start).toLocaleString(undefined, { month: 'short' })}</span>
                        </span>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.status === 'Accepted' ? 'var(--success)' : 'var(--warning)' }} title={s.status} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-ink truncate">
                            {isToday && <span className="text-cyan-300">Today · </span>}
                            {s.skill_name}
                            <span className="text-muted font-normal"> with </span>
                            {s.partner?.name}
                          </p>
                          <p className="text-2xs text-muted mt-0.5 num">{fmtTime(s.start)} · {s.durationMin} min · {dayLabel(s.start)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {joinable ? (
                            <a className="btn btn-primary !py-1.5 text-2xs" href={s.meeting_url!} target="_blank" rel="noopener noreferrer">
                              <Video size={12} /> Join
                            </a>
                          ) : (
                            <button className="btn btn-subtle !py-1.5 text-2xs opacity-60 cursor-not-allowed" disabled title={s.meeting_url ? 'Only https links allowed' : 'No meeting link yet'}>
                              <Video size={12} /> Join
                            </button>
                          )}
                          <button className="btn btn-ghost !py-1.5 text-2xs" onClick={() => { setRescheduleId((cur) => (cur === s.id ? null : s.id)); setRescheduleDate(''); }}>
                            Reschedule
                          </button>
                        </div>
                      </div>
                      {rescheduleId === s.id && (
                        <div className="flex items-center gap-2 mt-2 ml-[60px]">
                          <input type="date" className="field !w-36" min={new Date().toISOString().slice(0, 10)} value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} aria-label="New date" />
                          <input type="time" className="field !w-28 num" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} aria-label="New time" />
                          <button className="btn btn-primary !py-1.5 text-2xs" disabled={actionBusy || !rescheduleDate} onClick={() => void reschedule(s.id)}>Propose</button>
                          <button className="btn btn-ghost !py-1.5 text-2xs" onClick={() => setRescheduleId(null)}>Cancel</button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* pending incoming quick actions */}
          {sessions?.some((s) => s.status === 'Pending' && s.recipient_id === me.id) && (
            <section className="bg-amber-400/5 border border-amber-500/25 rounded-card px-4 py-2.5 flex items-center gap-3">
              <Inbox size={15} className="text-amber-300 shrink-0" strokeWidth={1.75} />
              <p className="text-xs text-amber-100/90 flex-1">You have session invites waiting for a response.</p>
              <button className="btn btn-subtle !py-1.5 text-2xs" onClick={() => navigate('/app/sessions?tab=incoming')}>Review invites</button>
            </section>
          )}
        </div>

        {/* notifications rail */}
        <aside className="notif-rail bg-panel border border-line rounded-card overflow-hidden flex flex-col max-h-[calc(100vh-140px)]" aria-label="Notifications feed">
          <div className="flex items-center justify-between px-4 h-10 border-b border-line shrink-0">
            <h2 className="text-xs font-bold uppercase tracking-wider">Notifications</h2>
            <button className="text-2xs text-accent hover:text-cyan-300 flex items-center gap-1" onClick={() => void markAllRead()}>
              <CheckCircle2 size={11} /> Mark all read
            </button>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-line/50">
            {notifications.length === 0 && <p className="px-4 py-8 text-center text-xs text-muted">No notifications yet.</p>}
            {notifications.map((n) => {
              const Icon = kindIcon[n.kind] ?? Info;
              return (
                <div key={n.id} className="px-3.5 py-2.5 flex items-start gap-2.5 hover:bg-panel-raised/50 transition-colors">
                  <Icon size={14} strokeWidth={1.5} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-2xs font-semibold text-ink leading-snug flex items-center gap-1.5">
                      {n.read === 0 && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" aria-label="Unread" />}
                      {n.title}
                    </p>
                    <p className="text-2xs text-muted leading-snug mt-0.5">{n.body}</p>
                    <p className="text-[10px] text-muted/70 num mt-1">{relativeTime(n.created_at)}</p>
                  </div>
                  {isHttpsUrl(n.body) && <ExternalLink size={11} className="text-muted" />}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
