import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Send, Zap, RefreshCw, Search, Info, Check, X, Inbox,
} from 'lucide-react';
import Avatar from '../components/Avatar';
import ScheduleSessionDialog from '../components/ScheduleSessionDialog';
import { api } from '../api/client';
import { useToast } from '../lib/toastHook';
import type { PublicUser } from '../store/appStore';

interface MatchRow {
  user: PublicUser;
  score: number;
  mutualSkills: string[];
  teachesMe: string[];
  learnFromMe: string[];
  skillLevel: 'High' | 'Med' | 'Low';
  bidirectional: boolean;
}

interface ConnectionRequestRow {
  id: string;
  from_id: string;
  to_id: string;
  skill: string | null;
  message: string;
  status: 'Pending' | 'Accepted' | 'Declined';
  from_name?: string;
  from_username?: string;
  from_avatar?: string | null;
  from_major?: string;
}

type SortKey = 'score' | 'name' | 'level' | 'mutual';

const LEVEL_RANK: Record<string, number> = { High: 3, Med: 2, Low: 1 };

function chipFor(score: number): string {
  if (score >= 80) return 'chip chip-teal';
  if (score >= 50) return 'chip chip-amber';
  return 'chip chip-gray';
}

function levelChip(level: MatchRow['skillLevel']): string {
  if (level === 'High') return 'chip chip-teal';
  if (level === 'Med') return 'chip chip-amber';
  return 'chip chip-gray';
}

export default function Matchmaker() {
  const toast = useToast();
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<ConnectionRequestRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [actingReqId, setActingReqId] = useState<string | null>(null);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [quickSessionFor, setQuickSessionFor] = useState<{ recipientId: string; skillName?: string } | null>(null);
  const [skillIds, setSkillIds] = useState<Map<string, string> | null>(null);

  const load = useCallback(() => {
    api.get<{ matches: MatchRow[] }>('/api/users/matches/list')
      .then((d) => setMatches(d.matches))
      .catch(() => setMatches([]));
    api.get<{ incoming: ConnectionRequestRow[]; outgoing: ConnectionRequestRow[] }>('/api/users/me/requests/list')
      .then((d) => {
        setIncomingRequests(d.incoming.filter((r) => r.status === 'Pending'));
        setRequested(new Set(d.outgoing.map((r) => r.to_id)));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get<{ skills: Array<{ id: string; name: string }> }>('/api/skills')
      .then((d) => setSkillIds(new Map(d.skills.map((s) => [s.name, s.id]))))
      .catch(() => setSkillIds(null));
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
  };

  const rows = useMemo(() => {
    if (!matches) return [];
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? matches.filter((m) => [m.user.name, m.user.username, m.user.major, ...m.mutualSkills].join(' ').toLowerCase().includes(q))
      : [...matches];
    const dir = sortDir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.user.name.localeCompare(b.user.name) * dir;
        case 'level': return (LEVEL_RANK[a.skillLevel] - LEVEL_RANK[b.skillLevel]) * dir;
        case 'mutual': return (a.mutualSkills.length - b.mutualSkills.length) * dir;
        case 'score':
        default: return (a.score - b.score) * dir;
      }
    });
    return filtered;
  }, [matches, filter, sortKey, sortDir]);

  const connect = async (m: MatchRow) => {
    setConnecting(m.user.id);
    try {
      await api.post(`/api/users/${m.user.id}/connect`, {
        skill: m.mutualSkills[0],
        message: m.mutualSkills.length ? `Saw we match on ${m.mutualSkills.slice(0, 2).join(' + ')} — trade an hour?` : 'Would like to connect.',
      });
      setRequested((prev) => new Set(prev).add(m.user.id));
      toast.success('Connection request sent', `${m.user.name} will be notified.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not send the request';
      toast.error('Request not sent', msg);
      if (msg.toLowerCase().includes('already')) setRequested((prev) => new Set(prev).add(m.user.id));
    } finally {
      setConnecting(null);
    }
  };

  const handleRequestAction = async (req: ConnectionRequestRow, action: 'accept' | 'decline') => {
    setActingReqId(req.id);
    try {
      await api.patch(`/api/users/me/requests/${req.id}`, { action });
      setIncomingRequests((prev) => prev.filter((r) => r.id !== req.id));
      if (action === 'accept') {
        toast.success('Connection accepted', `You can now schedule a session with ${req.from_name ?? 'your peer'}.`);
        setQuickSessionFor({ recipientId: req.from_id, skillName: req.skill ?? undefined });
      } else {
        toast.info('Connection request declined');
      }
    } catch (err) {
      toast.error('Action failed', err instanceof Error ? err.message : undefined);
    } finally {
      setActingReqId(null);
    }
  };

  const SortHeader = ({ label, k, className = '' }: { label: string; k: SortKey; className?: string }) => {
    const active = sortKey === k;
    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th scope="col" className={className}>
        <button className="flex items-center gap-1 uppercase tracking-wider hover:text-ink transition-colors" onClick={() => toggleSort(k)} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
          {label}
          <Icon size={11} strokeWidth={2} className={active ? 'text-accent' : 'text-muted/60'} aria-hidden="true" />
        </button>
      </th>
    );
  };

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      <div className="p-4 pb-2 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-md font-bold text-ink">The Matchmaker</h1>
          <p className="text-2xs text-muted mt-0.5 flex items-center gap-1.5">
            <Info size={11} aria-hidden="true" />
            Score = weighted overlap of your teaches ↔ their wants (16 pts/skill × level), bidirectional bonus +18, online tie-breaker +4.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" strokeWidth={1.5} />
            <input className="field !pl-8 !w-56" placeholder="Filter by name, skill, major…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter matches" />
          </div>
          <button className="btn btn-subtle !p-2" onClick={load} title="Refresh matches" aria-label="Refresh matches">
            <RefreshCw size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {incomingRequests.length > 0 && (
        <div className="px-4 pb-2">
          <div className="bg-panel border border-accent/35 rounded-card p-3 flex flex-col gap-2">
            <p className="text-2xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
              <Inbox size={12} /> Incoming Connection Requests ({incomingRequests.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {incomingRequests.map((req) => (
                <div key={req.id} className="flex items-center justify-between gap-3 bg-inset border border-line rounded-input px-3 py-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={req.from_name ?? 'Student'} src={req.from_avatar ?? null} size={28} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink truncate">
                        {req.from_name} <span className="text-muted font-normal num">@{req.from_username}</span>
                        {req.skill && <span className="chip chip-teal !text-[9px] ml-2">{req.skill}</span>}
                      </p>
                      {req.message && <p className="text-2xs text-muted truncate">{req.message}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      className="btn btn-primary !py-1 text-2xs"
                      disabled={actingReqId === req.id}
                      onClick={() => void handleRequestAction(req, 'accept')}
                    >
                      <Check size={11} /> Accept &amp; Schedule
                    </button>
                    <button
                      className="btn btn-danger !py-1 text-2xs"
                      disabled={actingReqId === req.id}
                      onClick={() => void handleRequestAction(req, 'decline')}
                    >
                      <X size={11} /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pb-4 flex-1 min-h-0">
        <div className="bg-panel border border-line rounded-card overflow-auto h-full">
          {matches === null ? (
            <div className="p-4 flex flex-col gap-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-11 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <p className="text-sm text-muted">No matches yet — add skills to your profile.</p>
              <a href="#/app/profile" className="btn btn-primary !py-1.5 text-xs mt-3 inline-flex"><ChevronRight size={13} /> Open Profile</a>
            </div>
          ) : (
            <table className="data-table" role="table" aria-label="Recommended skill-exchange partners">
              <thead>
                <tr>
                  <SortHeader label="Match Name" k="name" />
                  <SortHeader label="Mutual Skills" k="mutual" />
                  <SortHeader label="Skill Level" k="level" />
                  <SortHeader label="Best Match" k="score" />
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const sent = requested.has(m.user.id);
                  return (
                    <tr key={m.user.id}>
                      <td>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar name={m.user.name} src={m.user.avatar} size={32} status={m.user.status} />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink leading-tight truncate">{m.user.name}</p>
                            <p className="text-[10px] text-muted leading-tight">@{m.user.username} · {m.user.major}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1 max-w-[300px]">
                          {m.mutualSkills.slice(0, 3).map((skill) => (
                            <span key={skill} className="chip chip-teal !text-[10px]">{skill}</span>
                          ))}
                          {m.mutualSkills.length > 3 && <span className="chip chip-gray !text-[10px]">+{m.mutualSkills.length - 3}</span>}
                          {m.mutualSkills.length === 0 && <span className="text-2xs text-muted">—</span>}
                        </div>
                      </td>
                      <td><span className={levelChip(m.skillLevel)}>{m.skillLevel}</span></td>
                      <td><span className={`${chipFor(m.score)} num`}>{m.score}%</span></td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <button
                            className="btn btn-primary !py-1 text-2xs"
                            onClick={() => void connect(m)}
                            disabled={sent || connecting === m.user.id}
                          >
                            <Send size={11} strokeWidth={2} />
                            {sent ? 'Requested' : connecting === m.user.id ? 'Sending…' : 'Connect'}
                          </button>
                          <button
                            className="btn btn-ghost !py-1 text-2xs"
                            onClick={() => setQuickSessionFor({ recipientId: m.user.id, skillName: m.mutualSkills[0] })}
                            title="Open the scheduler prefilled for this partner"
                          >
                            <Zap size={11} strokeWidth={2} /> Quick Session
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {quickSessionFor && (
        <ScheduleSessionDialog
          prefill={{
            recipientId: quickSessionFor.recipientId,
            skillId: quickSessionFor.skillName ? skillIds?.get(quickSessionFor.skillName) : undefined,
          }}
          onClose={() => setQuickSessionFor(null)}
        />
      )}
    </div>
  );
}
