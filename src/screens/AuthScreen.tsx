import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  User, Lock, Eye, EyeOff, ShieldCheck, Mail, GraduationCap, Loader2, ArrowLeft, BadgeCheck, Check, WifiOff, AlertCircle, KeyRound,
} from 'lucide-react';
import TitleBar from '../components/TitleBar';
import CodeInput from '../components/CodeInput';
import LegalModal from '../components/LegalModal';
import { api, ApiError, formatApiErrorDetail } from '../api/client';
import { useAppStore, type PublicUser } from '../store/appStore';
import { useToast } from '../lib/toastHook';
import { PASSWORD_RULES, meetsPasswordPolicy, passwordStrength } from '../lib/format';

type View = 'login' | 'signup' | 'verify' | 'forgot' | 'reset' | 'totp' | 'changePassword';

interface ErrorBannerState {
  message: string;
  isNetwork: boolean;
  status?: number;
  correlationId?: string;
}

interface OAuthProviderInfo {
  id: string;
  label: string;
  configured: boolean;
  authPath: string;
}

const MAJORS = [
  'Computer Science', 'Mechanical Engineering', 'Electrical Engineering', 'Civil Engineering',
  'Biochemistry', 'Economics', 'Mathematics', 'Physics', 'English Literature', 'Art History',
  'Architecture', 'Music', 'Linguistics', 'Visual Design', 'Business Administration', 'Other',
];

const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLOR = ['#334155', '#EF4444', '#F59E0B', '#06B6D4', '#22C55E'];

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.02c2.2-2 3.5-5 3.5-8.8z"/>
      <path fill="#34A853" d="M12 24c3.1 0 5.9-1 7.8-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.7-2-6.7-4.8l-.14.01-3.7 2.8-.05.13C4.5 21.5 7.9 24 12 24z"/>
      <path fill="#FBBC05" d="M5.3 14.6c-.2-.7-.4-1.5-.4-2.6s.2-1.9.4-2.6l.01-.17L1.6 6.4l-.12.06C.5 8.6 0 10.2 0 12s.5 3.4 1.5 5.5l3.8-2.9z"/>
      <path fill="#EB4335" d="M12 4.6c2.2 0 3.7.9 4.5 1.7l3.3-3.2C17.8 1.1 15.1 0 12 0 7.9 0 4.5 2.5 1.5 6.5l3.8 3C6.3 6.6 8.9 4.6 12 4.6z"/>
    </svg>
  );
}
const FacebookIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="#E7E9EA" d="M13.5 22v-8h2.8l.4-3.2h-3.2V8.7c0-.9.3-1.6 1.7-1.6h1.6V4.2C16.7 4.1 15.5 4 14.1 4 11.1 4 9 5.8 9 8.4v2.4H6V14h3v8h4.5z"/></svg>
);
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#E7E9EA" d="M4 4h3.6l6 8.6L18.8 4H21l-6.6 10.4L21.6 24h-3.6l-6.3-9L4.8 24H2.6l6.9-10.8L4 4z"/></svg>
);
const LinkedInIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#E7E9EA" d="M6.9 8.6H3.3V21h3.6V8.6zM5.1 3.5a2.1 2.1 0 1 0 .1 4.2 2.1 2.1 0 0 0-.1-4.2zM9.6 21h3.6v-6.3c0-1.6.8-2.6 2.2-2.6 1.5 0 2.5 1 2.5 3.2V21h3.6v-7.1c0-3.5-1.7-5.7-4.8-5.7-2 0-3.3 1.1-4 2.2h-.1V8.6H9.6V21z"/></svg>
);

function toErrorBanner(err: unknown, fallback: string): ErrorBannerState {
  if (err instanceof ApiError) {
    return {
      message: err.message,
      isNetwork: err.isNetworkError,
      status: err.status > 0 ? err.status : undefined,
      correlationId: err.correlationId,
    };
  }
  return {
    message: err instanceof Error && err.message ? err.message : fallback,
    isNetwork: false,
  };
}

function ErrorBanner({ err }: { err: ErrorBannerState | null }) {
  if (!err) return null;
  return (
    <div
      className="text-2xs text-red-200 border border-red-500/35 bg-red-500/10 rounded-input px-2.5 py-2 flex items-start gap-2"
      role="alert"
    >
      {err.isNetwork ? (
        <WifiOff size={14} className="text-red-300 shrink-0 mt-0.5" aria-hidden="true" />
      ) : (
        <AlertCircle size={14} className="text-red-300 shrink-0 mt-0.5" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-red-200">{err.message}</p>
        <p className="text-[10px] text-red-300/80 mt-0.5 num">
          {err.isNetwork
            ? 'Network failure — backend server unreachable'
            : [
                err.status ? `HTTP ${err.status}` : null,
                err.correlationId ? `Ref: ${err.correlationId}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'Server response'}
        </p>
      </div>
    </div>
  );
}

const SOCIAL_BUTTONS = [
  { key: 'google', label: 'Google', icon: <GoogleIcon /> },
  { key: 'facebook', label: 'Facebook', icon: <FacebookIcon /> },
  { key: 'twitter', label: 'X', icon: <XIcon /> },
  { key: 'linkedin', label: 'LinkedIn', icon: <LinkedInIcon /> },
] as const;

export default function AuthScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const currentUser = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  const [view, setView] = useState<View>(() =>
    searchParams.get('mode') === 'change-password' ? 'changePassword' : 'login',
  );
  const [legalTab, setLegalTab] = useState<'privacy' | 'terms' | null>(null);

  // OAuth provider availability loaded from backend
  const [oauthProviders, setOauthProviders] = useState<Record<string, OAuthProviderInfo> | null>(null);

  // login
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState<ErrorBannerState | null>(null);
  const [busy, setBusy] = useState(false);

  // signup
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [major, setMajor] = useState(MAJORS[0]);
  const [terms, setTerms] = useState(false);
  const [signupError, setSignupError] = useState<ErrorBannerState | null>(null);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // verification / reset / totp / changePassword
  const [pendingEmail, setPendingEmail] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [mfaToken, setMfaToken] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // mandatory initial password change
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [nextPasswordInput, setNextPasswordInput] = useState('');
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [changePwError, setChangePwError] = useState<ErrorBannerState | null>(null);

  const handledUrlAction = useRef(false);

  const strength = passwordStrength(signupPassword);
  const changePwStrength = passwordStrength(nextPasswordInput);
  const recoveryOk = recoveryCode.trim().length >= 6;

  // Discover configured OAuth providers from backend (zero client IDs or secrets exposed)
  useEffect(() => {
    api
      .get<{ providers: Record<string, OAuthProviderInfo> }>('/api/auth/oauth/providers')
      .then((res) => setOauthProviders(res.providers))
      .catch(() => setOauthProviders(null));
  }, []);

  // Switch to mandatory password change if authenticated user still has mustChangePassword=true
  useEffect(() => {
    if (currentUser?.mustChangePassword) {
      setView('changePassword');
    }
  }, [currentUser?.mustChangePassword]);

  // Handle query parameters from OAuth callbacks and dev-mode email links
  useEffect(() => {
    const oauthErr = searchParams.get('oauthError');
    const verifyErr = searchParams.get('verifyError');
    const verifyEmail = searchParams.get('verifyEmail');
    const resetEmail = searchParams.get('resetEmail');
    const queryCode = searchParams.get('code');
    const mode = searchParams.get('mode');

    if (mode === 'change-password') {
      setView('changePassword');
      return;
    }

    if (oauthErr) {
      setView('login');
      setLoginError({ message: oauthErr, isNetwork: false });
      setSearchParams({}, { replace: true });
      return;
    }

    if (verifyErr) {
      setView('login');
      setLoginError({ message: verifyErr, isNetwork: false });
      setSearchParams({}, { replace: true });
      return;
    }

    if (verifyEmail && queryCode && !handledUrlAction.current) {
      handledUrlAction.current = true;
      setPendingEmail(verifyEmail);
      setCode(queryCode);
      setView('verify');
      setSearchParams({}, { replace: true });
      setBusy(true);
      api
        .post<{ user: PublicUser }>('/api/auth/verify-email', { email: verifyEmail, code: queryCode })
        .then((res) => {
          setUser(res.user);
          toast.success('Email verified', `Welcome to SkillSwap, ${res.user.name.split(' ')[0]}!`);
          navigate('/app', { replace: true });
        })
        .catch((err) => {
          toast.error('Verification failed', err instanceof ApiError ? err.message : 'Invalid code',);
          setCode('');
        })
        .finally(() => setBusy(false));
      return;
    }

    if (resetEmail && queryCode && !handledUrlAction.current) {
      handledUrlAction.current = true;
      setPendingEmail(resetEmail);
      setCode(queryCode);
      setView('reset');
      setSearchParams({}, { replace: true });
    }
  }, [navigate, searchParams, setSearchParams, setUser, toast]);

  const startResendCooldown = () => {
    setResendIn(30);
    const t = window.setInterval(() => {
      setResendIn((s) => {
        if (s <= 1) window.clearInterval(t);
        return s - 1;
      });
    }, 1000);
  };

  const handleAuthSuccess = (user: PublicUser, knownPassword?: string) => {
    setUser(user);
    if (user.mustChangePassword) {
      if (knownPassword) setCurrentPasswordInput(knownPassword);
      setView('changePassword');
      toast.warning('Password change required', 'Update your initial bootstrap password to continue.');
      return;
    }
    toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
    navigate(user.role === 'admin' ? '/app/admin' : '/app', { replace: true });
  };

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!identifier.trim() || !password) {
      setLoginError({ message: 'Enter your email/username and password.', isNetwork: false });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{
        user?: PublicUser;
        needsTotp?: boolean;
        mfaToken?: string;
        mustChangePassword?: boolean;
      }>('/api/auth/login', { identifier: identifier.trim(), password, rememberMe });
      if (res.needsTotp && res.mfaToken) {
        setMfaToken(res.mfaToken);
        setView('totp');
        return;
      }
      if (res.user) handleAuthSuccess(res.user, password);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        const emailAddr = String(err.payload?.email ?? identifier.trim());
        setPendingEmail(emailAddr);
        setLoginError(null);
        setView('verify');
        toast.warning('Email not verified', 'Enter the 6-digit verification code or use the dev console link.');
        return;
      }
      setLoginError(toErrorBanner(err, 'Invalid credentials'));
    } finally {
      setBusy(false);
    }
  };

  const submitSignup = async (e: FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    if (fullName.trim().length < 2) {
      setSignupError({ message: 'Enter your full name (at least 2 characters).', isNetwork: false });
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setSignupError({ message: 'Enter a valid email address.', isNetwork: false });
      return;
    }
    if (!meetsPasswordPolicy(signupPassword)) {
      setSignupError({
        message: 'Password must be at least 10 characters with uppercase, lowercase, and a digit.',
        isNetwork: false,
      });
      return;
    }
    if (!terms) {
      setSignupError({ message: 'Agree to the Terms and Privacy Policy to continue.', isNetwork: false });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{
        needsVerification: boolean;
        email?: string;
        devVerificationCode?: string;
      }>('/api/auth/signup', {
        name: fullName.trim(),
        email: email.trim(),
        password: signupPassword,
        major,
      });
      setPendingEmail(res.email ?? email.trim());
      setDevCode(res.devVerificationCode ?? null);
      setCode('');
      setView('verify');
      startResendCooldown();
    } catch (err) {
      setSignupError(toErrorBanner(err, 'Could not create the account'));
    } finally {
      setBusy(false);
    }
  };

  const submitVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    try {
      const res = await api.post<{ user: PublicUser }>('/api/auth/verify-email', {
        email: pendingEmail,
        code,
      });
      handleAuthSuccess(res.user);
    } catch (err) {
      toast.error('Verification failed', err instanceof ApiError ? err.message : 'Invalid code');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    try {
      const res = await api.post<{ devVerificationCode?: string }>(
        '/api/auth/resend-verification',
        { email: pendingEmail },
      );
      setDevCode(res.devVerificationCode ?? null);
      setCode('');
      startResendCooldown();
      toast.info('Code resent', `Check your inbox or server console for ${pendingEmail}.`);
    } catch (err) {
      toast.error('Could not resend', err instanceof ApiError ? err.message : formatApiErrorDetail(err));
    }
  };

  const submitForgot = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<{ devResetCode?: string }>('/api/auth/forgot-password', {
        email: (pendingEmail || email).trim(),
      });
      setDevCode(res.devResetCode ?? null);
      setView('reset');
      setCode('');
    } catch (err) {
      if (err instanceof ApiError && err.isNetworkError) {
        toast.error(err.message, formatApiErrorDetail(err));
      } else {
        setView('reset'); // prevent email enumeration on normal requests
      }
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!meetsPasswordPolicy(newPassword)) {
      toast.error('Weak password', 'Use 10+ characters with uppercase, lowercase, and a digit.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/auth/reset-password', {
        email: (pendingEmail || email).trim(),
        code,
        password: newPassword,
      });
      toast.success('Password updated', 'Sign in with your new password.');
      setView('login');
      setPassword('');
      setCode('');
      setNewPassword('');
    } catch (err) {
      toast.error('Reset failed', err instanceof ApiError ? err.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const submitTotp = async (e: FormEvent) => {
    e.preventDefault();
    const payload = useRecovery ? recoveryCode.trim() : code;
    if (!useRecovery && payload.length !== 6) return;
    if (useRecovery && !recoveryOk) return;
    setBusy(true);
    try {
      const res = await api.post<{ user: PublicUser }>('/api/auth/2fa', { mfaToken, code: payload });
      handleAuthSuccess(res.user, password);
    } catch (err) {
      toast.error('Invalid code', err instanceof ApiError ? err.message : 'Try again');
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const submitChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setChangePwError(null);
    if (!meetsPasswordPolicy(nextPasswordInput)) {
      setChangePwError({
        message: 'New password must be 10+ characters with uppercase, lowercase, and a digit.',
        isNetwork: false,
      });
      return;
    }
    if (currentPasswordInput === nextPasswordInput) {
      setChangePwError({
        message: 'New password must be different from the initial bootstrap password.',
        isNetwork: false,
      });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ user: PublicUser }>('/api/auth/change-password', {
        currentPassword: currentPasswordInput,
        newPassword: nextPasswordInput,
      });
      setUser(res.user);
      setCurrentPasswordInput('');
      setNextPasswordInput('');
      setPassword('');
      toast.success('Password updated', 'Your initial password has been replaced.');
      navigate(res.user.role === 'admin' ? '/app/admin' : '/app', { replace: true });
    } catch (err) {
      setChangePwError(toErrorBanner(err, 'Could not update password'));
    } finally {
      setBusy(false);
    }
  };

  const startSocialLogin = (providerKey: string, label: string) => {
    const info = oauthProviders?.[providerKey];
    if (oauthProviders && (!info || !info.configured)) {
      const msg = `${label} sign-in is not configured on this server`;
      setLoginError({ message: msg, isNetwork: false, status: 501 });
      toast.warning('Provider unavailable', msg);
      return;
    }
    // Full-page redirect to the backend OAuth2 authorization endpoint (never fetch)
    const targetPath = info?.authPath ?? `/oauth2/authorization/${providerKey}`;
    window.location.assign(targetPath);
  };

  const isLogin = view === 'login';

  return (
    <div className="h-full flex flex-col bg-canvas">
      <TitleBar context="SkillSwap — Account" />
      <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-[460px] max-w-full bg-panel border border-line rounded-card shadow-pop overflow-hidden">
          {/* card header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={18} className="text-accent" strokeWidth={1.75} aria-hidden="true" />
              <div>
                <p className="text-sm font-bold leading-none"><span className="text-ink">Skill</span><span className="text-accent">Swap</span></p>
                <p className="text-[10px] text-muted mt-1">Student skill exchange — sign in to continue</p>
              </div>
            </div>
            <span className="chip chip-gray num">v2.4.9</span>
          </div>

          {/* tabs (hidden on sub-views) */}
          {(view === 'login' || view === 'signup') && (
            <div role="tablist" aria-label="Authentication mode" className="flex border-b border-line">
              {([['login', 'Login'], ['signup', 'Sign Up']] as const).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => { setView(id); setLoginError(null); setSignupError(null); }}
                  className={`relative flex-1 h-10 text-xs font-semibold tracking-wide uppercase transition-colors ${
                    view === id ? 'text-cyan-300' : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                  {view === id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}

          <div className="px-6 py-5">
            {/* ---------------- LOGIN ---------------- */}
            {isLogin && (
              <form onSubmit={submitLogin} className="flex flex-col gap-3.5" noValidate>
                <ErrorBanner err={loginError} />
                <div>
                  <label className="label" htmlFor="login-id">Username or Email</label>
                  <div className="relative">
                    <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" strokeWidth={1.5} aria-hidden="true" />
                    <input
                      id="login-id"
                      className="field !pl-9"
                      autoComplete="username"
                      autoFocus
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="you@university.edu"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="login-password">Password</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" strokeWidth={1.5} aria-hidden="true" />
                    <input
                      id="login-password"
                      className="field !pl-9 !pr-10"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none hover:text-ink">
                    <input
                      type="checkbox"
                      className="accent-[#06B6D4] w-3.5 h-3.5"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    Remember Me
                  </label>
                  <button
                    type="button"
                    className="text-xs text-accent hover:text-cyan-300 transition-colors"
                    onClick={() => {
                      setPendingEmail(identifier.includes('@') ? identifier : '');
                      setView('forgot');
                    }}
                  >
                    Forgot Password?
                  </button>
                </div>
                <button type="submit" className="btn btn-primary w-full justify-center h-9 text-sm" disabled={busy}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} strokeWidth={1.75} />} Sign In
                </button>

                {/* Social OAuth2 Authorization Code Redirects */}
                <div className="flex items-center gap-3 text-2xs text-muted" aria-hidden="true">
                  <span className="divider flex-1" /> or continue with <span className="divider flex-1" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {SOCIAL_BUTTONS.map(({ key, label, icon }) => {
                    const configured = oauthProviders ? Boolean(oauthProviders[key]?.configured) : true;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => startSocialLogin(key, label)}
                        aria-label={configured ? `Sign in with ${label}` : `${label} sign-in is not configured on this server`}
                        aria-disabled={!configured}
                        title={configured ? `Continue with ${label}` : `${label} sign-in is not configured on this server`}
                        className={`relative h-9 flex items-center justify-center rounded-input border transition-colors ${
                          configured
                            ? 'border-line bg-inset hover:border-accent hover:bg-panel-raised'
                            : 'border-line/60 bg-inset/40 opacity-50 hover:border-amber-500/40'
                        }`}
                      >
                        {icon}
                        {!configured && (
                          <span
                            className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-slate-500 border border-panel"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
                {oauthProviders && Object.values(oauthProviders).some((p) => !p.configured) && (
                  <p className="text-[10px] text-muted text-center">
                    Dimmed social providers are not configured on this server (see <span className="num">docs/OAUTH_SETUP.md</span>).
                  </p>
                )}

                <div className="flex items-center justify-center gap-1.5 text-2xs text-emerald-300/90 pt-1">
                  <ShieldCheck size={12} strokeWidth={2} /> Secured — bcrypt hashing, TOTP &amp; HttpOnly cookies
                </div>
              </form>
            )}

            {/* ---------------- SIGN UP ---------------- */}
            {view === 'signup' && (
              <form onSubmit={submitSignup} className="flex flex-col gap-3" noValidate>
                <ErrorBanner err={signupError} />
                <div>
                  <label className="label" htmlFor="su-name">Full Name</label>
                  <input
                    id="su-name"
                    className="field"
                    autoComplete="name"
                    autoFocus
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="su-email">Email</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" strokeWidth={1.5} aria-hidden="true" />
                    <input
                      id="su-email"
                      type="email"
                      className="field !pl-9"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@university.edu"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="su-password">Password</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" strokeWidth={1.5} aria-hidden="true" />
                    <input
                      id="su-password"
                      className="field !pl-9 !pr-10"
                      type={showSignupPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="Create a strong password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink"
                      aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                    >
                      {showSignupPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                    </button>
                  </div>
                  {/* strength meter */}
                  <div className="flex items-center gap-2 mt-1.5" aria-hidden="true">
                    <div className="flex gap-1 flex-1">
                      {[1, 2, 3, 4].map((i) => (
                        <span key={i} className="h-1 flex-1 rounded-full transition-colors" style={{ background: strength >= i ? STRENGTH_COLOR[strength] : '#334155' }} />
                      ))}
                    </div>
                    <span className="text-2xs font-semibold w-11 text-right" style={{ color: STRENGTH_COLOR[strength] }}>{STRENGTH_LABEL[strength]}</span>
                  </div>
                  <ul className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                    {PASSWORD_RULES.map((rule) => {
                      const pass = rule.test(signupPassword);
                      return (
                        <li key={rule.id} className={`flex items-center gap-1 text-[10px] ${pass ? 'text-emerald-400' : 'text-muted'}`}>
                          <Check size={9} strokeWidth={3} aria-hidden="true" /> {rule.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div>
                  <label className="label" htmlFor="su-major">Major</label>
                  <div className="relative">
                    <GraduationCap size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" strokeWidth={1.5} aria-hidden="true" />
                    <select id="su-major" className="field !pl-9 appearance-none" value={major} onChange={(e) => setMajor(e.target.value)}>
                      {MAJORS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <label className="flex items-start gap-2 text-2xs text-muted cursor-pointer select-none hover:text-ink leading-snug">
                  <input type="checkbox" className="accent-[#06B6D4] w-3.5 h-3.5 mt-0.5" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                  <span>I agree to the <button type="button" className="text-accent hover:text-cyan-300" onClick={() => setLegalTab('terms')}>Terms of Service</button> and <button type="button" className="text-accent hover:text-cyan-300" onClick={() => setLegalTab('privacy')}>Privacy Policy</button>. My account stays inactive until my email is verified.</span>
                </label>
                <button type="submit" className="btn btn-primary w-full justify-center h-9 text-sm" disabled={busy}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <BadgeCheck size={15} strokeWidth={1.75} />} Create Account
                </button>
              </form>
            )}

            {/* ---------------- VERIFY EMAIL ---------------- */}
            {view === 'verify' && (
              <form onSubmit={submitVerify} className="flex flex-col gap-4 items-center text-center py-1">
                <Mail size={30} strokeWidth={1.25} className="text-accent" aria-hidden="true" />
                <div>
                  <h2 className="text-md font-bold text-ink">Verify your email</h2>
                  <p className="text-xs text-muted mt-1">
                    We sent a 6-digit code to <span className="text-ink font-medium">{pendingEmail}</span>.<br />
                    In local dev mode, the verification link &amp; code are also printed to the backend console.
                  </p>
                </div>
                {devCode && (
                  <div className="border border-amber-500/30 bg-amber-500/10 rounded-input px-3 py-1.5 text-2xs text-amber-200">
                    Dev mode — your code is <span className="num font-bold">{devCode}</span>
                  </div>
                )}
                <CodeInput value={code} onChange={setCode} disabled={busy} autoFocus />
                <button type="submit" className="btn btn-primary w-full justify-center h-9" disabled={busy || code.length !== 6}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} strokeWidth={1.75} />} Verify &amp; Sign In
                </button>
                <div className="flex items-center gap-3 text-2xs">
                  <button type="button" className="text-accent hover:text-cyan-300 disabled:text-muted disabled:cursor-not-allowed" onClick={() => void resendCode()} disabled={resendIn > 0}>
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                  </button>
                  <span className="text-muted" aria-hidden="true">·</span>
                  <button type="button" className="text-muted hover:text-ink" onClick={() => setView('login')}>Back to sign in</button>
                </div>
              </form>
            )}

            {/* ---------------- FORGOT / RESET ---------------- */}
            {view === 'forgot' && (
              <form onSubmit={submitForgot} className="flex flex-col gap-3.5">
                <button type="button" className="self-start flex items-center gap-1 text-2xs text-muted hover:text-ink" onClick={() => setView('login')}><ArrowLeft size={12} /> Back to sign in</button>
                <h2 className="text-md font-bold">Reset your password</h2>
                <p className="text-xs text-muted">Enter your account email. We will send a 6-digit reset code (printed to the server console in dev mode when SMTP is unset).</p>
                <div>
                  <label className="label" htmlFor="forgot-email">Email</label>
                  <input id="forgot-email" type="email" className="field" autoFocus value={pendingEmail} onChange={(e) => setPendingEmail(e.target.value)} placeholder="you@university.edu" required />
                </div>
                <button type="submit" className="btn btn-primary w-full justify-center h-9" disabled={busy}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} strokeWidth={1.75} />} Send Reset Code
                </button>
              </form>
            )}
            {view === 'reset' && (
              <form onSubmit={submitReset} className="flex flex-col gap-3.5">
                <button type="button" className="self-start flex items-center gap-1 text-2xs text-muted hover:text-ink" onClick={() => setView('forgot')}><ArrowLeft size={12} /> Back</button>
                <h2 className="text-md font-bold">Enter your reset code</h2>
                {devCode && (
                  <div className="border border-amber-500/30 bg-amber-500/10 rounded-input px-3 py-1.5 text-2xs text-amber-200">
                    Dev mode — your code is <span className="num font-bold">{devCode}</span>
                  </div>
                )}
                <CodeInput value={code} onChange={setCode} autoFocus />
                <div>
                  <label className="label" htmlFor="reset-password">New password</label>
                  <input id="reset-password" type="password" className="field" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="10+ chars, mixed case, digit" required minLength={10} />
                </div>
                <button type="submit" className="btn btn-primary w-full justify-center h-9" disabled={busy || code.length !== 6}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} strokeWidth={1.75} />} Reset Password
                </button>
              </form>
            )}

            {/* ---------------- TOTP CHALLENGE ---------------- */}
            {view === 'totp' && (
              <form onSubmit={submitTotp} className="flex flex-col gap-4 items-center text-center">
                <ShieldCheck size={30} strokeWidth={1.25} className="text-accent" aria-hidden="true" />
                <div>
                  <h2 className="text-md font-bold text-ink">Two-factor authentication</h2>
                  <p className="text-xs text-muted mt-1">{useRecovery ? 'Enter one of your recovery codes.' : 'Enter the 6-digit code from your authenticator app.'}</p>
                </div>
                {!useRecovery ? (
                  <CodeInput value={code} onChange={setCode} autoFocus />
                ) : (
                  <input className="field num text-center w-[220px]" autoFocus value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} placeholder="xxxx-xxxx-xxxx" aria-label="Recovery code" />
                )}
                <button type="submit" className="btn btn-primary w-full justify-center h-9" disabled={busy || (useRecovery ? !recoveryOk : code.length !== 6)}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} strokeWidth={1.75} />} Verify
                </button>
                <button type="button" className="text-2xs text-accent hover:text-cyan-300" onClick={() => { setUseRecovery((v) => !v); setCode(''); setRecoveryCode(''); }}>
                  {useRecovery ? 'Use authenticator app instead' : 'Use a recovery code instead'}
                </button>
              </form>
            )}

            {/* ---------------- MANDATORY FIRST-LOGIN PASSWORD CHANGE ---------------- */}
            {view === 'changePassword' && (
              <form onSubmit={submitChangePassword} className="flex flex-col gap-3.5" noValidate>
                <div className="flex items-center gap-2 text-amber-300">
                  <KeyRound size={18} strokeWidth={1.75} aria-hidden="true" />
                  <h2 className="text-md font-bold text-ink">Change initial password</h2>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  For security, you must replace the initial bootstrap password before accessing SkillSwap.
                </p>
                <ErrorBanner err={changePwError} />
                <div>
                  <label className="label" htmlFor="cp-current">Current bootstrap password</label>
                  <input
                    id="cp-current"
                    type="password"
                    className="field"
                    autoComplete="current-password"
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder="Enter initial password"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="cp-new">New password</label>
                  <div className="relative">
                    <input
                      id="cp-new"
                      type={showNextPassword ? 'text' : 'password'}
                      className="field !pr-10"
                      autoComplete="new-password"
                      autoFocus
                      value={nextPasswordInput}
                      onChange={(e) => setNextPasswordInput(e.target.value)}
                      placeholder="10+ chars, uppercase, lowercase & digit"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNextPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink"
                      aria-label={showNextPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNextPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5" aria-hidden="true">
                    <div className="flex gap-1 flex-1">
                      {[1, 2, 3, 4].map((i) => (
                        <span key={i} className="h-1 flex-1 rounded-full transition-colors" style={{ background: changePwStrength >= i ? STRENGTH_COLOR[changePwStrength] : '#334155' }} />
                      ))}
                    </div>
                    <span className="text-2xs font-semibold w-11 text-right" style={{ color: STRENGTH_COLOR[changePwStrength] }}>{STRENGTH_LABEL[changePwStrength]}</span>
                  </div>
                  <ul className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                    {PASSWORD_RULES.map((rule) => {
                      const pass = rule.test(nextPasswordInput);
                      return (
                        <li key={rule.id} className={`flex items-center gap-1 text-[10px] ${pass ? 'text-emerald-400' : 'text-muted'}`}>
                          <Check size={9} strokeWidth={3} aria-hidden="true" /> {rule.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <button type="submit" className="btn btn-primary w-full justify-center h-9 text-sm" disabled={busy}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <BadgeCheck size={15} strokeWidth={1.75} />} Update Password &amp; Continue
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* footer */}
      <div className="h-8 flex items-center justify-center gap-3 text-2xs text-muted border-t border-line bg-panel shrink-0">
        <button className="hover:text-ink" onClick={() => setLegalTab('privacy')}>Privacy</button>
        <span aria-hidden="true">·</span>
        <button className="hover:text-ink" onClick={() => setLegalTab('terms')}>Terms</button>
        <span aria-hidden="true">·</span>
        <span className="num">v2.4.9</span>
      </div>

      {legalTab && <LegalModal tab={legalTab} onClose={() => setLegalTab(null)} />}
    </div>
  );
}
