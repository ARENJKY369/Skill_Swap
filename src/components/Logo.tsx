interface LogoProps {
  size?: 'sm' | 'lg';
  withWordmark?: boolean;
}

/** SkillSwap mark: two interlocking strokes (handshake) inside an angled shield. */
export function LogoMark({ px }: { px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        d="M20 2.5 33.5 8.4V19c0 8.4-5.4 14.4-13.5 18C11.9 33.4 6.5 27.4 6.5 19V8.4L20 2.5Z"
        fill="rgba(6,182,212,0.08)"
        stroke="#06B6D4"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      {/* left hook (cyan) */}
      <path
        d="M11.5 24.2 16 19.7a2.6 2.6 0 0 1 3.7 0l1.6 1.6"
        stroke="#22D3EE"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* right hook (teal) */}
      <path
        d="M28.5 13.8 24 18.3a2.6 2.6 0 0 1-3.7 0l-1.6-1.6"
        stroke="#14B8A6"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* clasp knot */}
      <path d="M15 18.2 21.8 25" stroke="#67E8F9" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="20.1" cy="21.6" r="1.55" fill="#06B6D4" />
    </svg>
  );
}

export default function Logo({ size = 'sm', withWordmark = true }: LogoProps) {
  if (size === 'lg') {
    return (
      <div className="flex flex-col items-center gap-4">
        <LogoMark px={96} />
        <div className="text-[44px] leading-none font-extrabold tracking-tight select-none">
          <span className="text-ink">Skill</span>
          <span className="text-accent">Swap</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 select-none">
      <LogoMark px={26} />
      {withWordmark && (
        <span className="sidebar-wordmark text-[17px] font-extrabold tracking-tight">
          <span className="text-ink">Skill</span>
          <span className="text-accent">Swap</span>
        </span>
      )}
    </div>
  );
}
