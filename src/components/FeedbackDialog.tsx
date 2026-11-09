import { useState } from 'react';
import { Star, BadgeCheck } from 'lucide-react';
import Dialog from './Dialog';
import { api, ApiError } from '../api/client';
import { useToast } from '../lib/toastHook';

function StarRow({ label, value, onChange, size = 22 }: { label?: string; value: number; onChange: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center justify-between gap-3">
      {label && <span className="text-xs text-muted w-24">{label}</span>}
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label ?? 'Overall rating'}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = (hover || value) >= n;
          return (
            <button
              key={n}
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              className="p-0.5 rounded focus-visible:outline-none"
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              onClick={() => onChange(n)}
            >
              <Star
                size={size}
                strokeWidth={1.5}
                className={active ? 'fill-amber-400 text-amber-400' : 'text-slate-500'}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function FeedbackDialog({ sessionId, partnerName, onClose, onSubmitted }: {
  sessionId: string;
  partnerName: string;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const toast = useToast();
  const [overall, setOverall] = useState(0);
  const [punctuality, setPunctuality] = useState(0);
  const [clarity, setClarity] = useState(0);
  const [engagement, setEngagement] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (overall === 0) { setError('Pick an overall rating'); return; }
    if (punctuality === 0 || clarity === 0 || engagement === 0) { setError('Rate punctuality, clarity and engagement'); return; }
    setBusy(true);
    try {
      await api.post('/api/reviews', { sessionId, punctuality, clarity, engagement, overall, text });
      toast.success('Rating submitted', `Thanks — your review for ${partnerName} is public.`);
      onSubmitted?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your review');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Feedback"
      onClose={onClose}
      width={480}
      footer={
        <div className="flex items-center justify-end gap-2">
          <span className="text-2xs text-muted mr-auto">{text.length}/500</span>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit Rating'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs text-teal-200 bg-teal-400/10 border border-teal-500/25 rounded-input px-2.5 py-1.5 w-fit">
          <BadgeCheck size={13} strokeWidth={1.75} /> Verified session — only participants can review
        </div>

        <div>
          <h3 className="text-sm font-semibold text-ink">Review Your Session with {partnerName}</h3>
          <p className="text-2xs text-muted mt-0.5">Your review is public and linked to a verified completed session.</p>
        </div>

        <div className="flex flex-col items-center gap-1.5 py-2 border border-line rounded-card bg-inset">
          <span className="text-2xs uppercase tracking-wider text-muted">Overall</span>
          <StarRow value={overall} onChange={setOverall} size={30} />
        </div>

        <div className="flex flex-col gap-2.5">
          <StarRow label="Punctuality" value={punctuality} onChange={setPunctuality} size={17} />
          <StarRow label="Clarity" value={clarity} onChange={setClarity} size={17} />
          <StarRow label="Engagement" value={engagement} onChange={setEngagement} size={17} />
        </div>

        <div>
          <label className="label" htmlFor="fb-comment">Comment</label>
          <textarea
            id="fb-comment"
            className="field min-h-[84px] resize-y"
            maxLength={500}
            placeholder="Add a little comment…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        {error && <p className="text-2xs text-red-300 border border-red-500/30 bg-red-500/10 rounded-input px-2 py-1.5" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
