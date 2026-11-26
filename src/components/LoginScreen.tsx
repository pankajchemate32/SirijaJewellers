import React, { useState } from 'react';
import { Loader2, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { useStore } from '../context/StoreContext';

const inputCls =
  'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 outline-none transition-colors focus:border-[#B7801A] focus:ring-2 focus:ring-amber-100';
const primaryBtn =
  'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#B7801A] px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-[#9C6C12] disabled:opacity-60';

const Brand: React.FC<{ subtitle: string }> = ({ subtitle }) => (
  <div className="mb-8">
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#B7801A] text-sm font-bold text-white">SJ</div>
      <div>
        <div className="font-display text-xl font-bold tracking-tight text-slate-900">Sirija Jwellers</div>
        <div className="text-xs font-medium uppercase tracking-wider text-[#8A5E0B]">Bullion POS &amp; Inventory</div>
      </div>
    </div>
    <p className="mt-5 text-sm text-slate-500">{subtitle}</p>
  </div>
);

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-screen items-center justify-center bg-[#F7F5F0] px-4 py-10">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-8">
      {children}
    </div>
  </div>
);

const ErrorBox: React.FC<{ text: string }> = ({ text }) =>
  text ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{text}</p> : null;

/** Cloud Mode: Supabase email + password sign in, first-time shop setup. */
const CloudLogin: React.FC = () => {
  const { cloudStatus, cloudEmail, cloudSignIn, cloudSignUp, cloudCreateShop, logout } = useStore();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  if (cloudStatus === 'loading') {
    return (
      <Shell>
        <Brand subtitle="Loading your shop data…" />
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-[#B7801A]" /> Connecting to the database
        </div>
      </Shell>
    );
  }

  if (cloudStatus === 'needs_setup') {
    return (
      <Shell>
        <Brand subtitle="Welcome! This database is empty. Set up the shop and you will become its Owner." />
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            const res = await cloudCreateShop(ownerName);
            setBusy(false);
            if (!res.ok) setError(res.error || 'Setup failed.');
          }}
        >
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="owner-name">Your name</label>
            <input id="owner-name" required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} placeholder="Owner name" />
          </div>
          <p className="text-xs text-slate-500">Signed in as {cloudEmail}</p>
          <ErrorBox text={error} />
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Set up Sirija Jwellers
          </button>
          <button type="button" onClick={logout} className="w-full text-sm text-slate-500 hover:text-slate-800">Sign out</button>
        </form>
      </Shell>
    );
  }

  if (cloudStatus === 'no_access') {
    return (
      <Shell>
        <Brand subtitle="You are signed in, but this email has not been added to the shop yet." />
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          Ask the Owner to add <strong>{cloudEmail}</strong> under Settings → Users, then sign in again.
        </p>
        <button type="button" onClick={logout} className={`${primaryBtn} mt-5`}>Sign out</button>
      </Shell>
    );
  }

  return (
    <Shell>
      <Brand subtitle={mode === 'signin' ? 'Sign in to continue.' : 'Create your login. Use the email the Owner added for you.'} />
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setInfo('');
          const res = mode === 'signin' ? await cloudSignIn(email, password) : await cloudSignUp(email, password);
          setBusy(false);
          if (!res.ok) setError(res.error || 'Something went wrong.');
          else if ('info' in res && typeof res.info === 'string' && res.info) {
            setInfo(res.info);
            setMode('signin');
          }
        }}
      >
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="login-email">Email</label>
          <input id="login-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            required
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
          />
        </div>
        <ErrorBox text={error} />
        {info && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">{info}</p>}
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === 'signin' ? 'Sign in' : 'Create login'}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError('');
        }}
        className="mt-5 w-full text-sm font-medium text-[#8A5E0B] hover:underline"
      >
        {mode === 'signin' ? 'First time here? Create a login' : 'Already have a login? Sign in'}
      </button>
    </Shell>
  );
};

/** Local Mode: email + PIN against users kept in this browser. */
const LocalLogin: React.FC = () => {
  const { db, loginWithCredentials, switchDemoUser } = useStore();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  return (
    <Shell>
      <Brand subtitle="Sign in with your email and PIN." />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          const res = loginWithCredentials(email, pin);
          if (!res.ok) setError(res.error || 'Sign in failed.');
        }}
      >
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="login-email">Email</label>
          <input id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="login-pin">PIN</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 mt-0.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="login-pin"
              type="password"
              inputMode="numeric"
              required
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className={`${inputCls} pl-10 font-mono-num`}
            />
          </div>
        </div>
        <ErrorBox text={error} />
        <button type="submit" className={primaryBtn}>Sign in</button>
      </form>

      <div className="mt-7 border-t border-slate-200 pt-6">
        <p className="text-xs font-semibold text-slate-500">Local mode · sample accounts (tap to sign in)</p>
        <div className="mt-3 space-y-2.5">
          {db.users
            .filter((u) => u.active)
            .map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => switchDemoUser(user.id)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:border-amber-300 hover:bg-amber-50/60"
              >
                <div className="flex items-center gap-3">
                  {user.role === 'owner' ? <ShieldCheck className="h-5 w-5 text-[#B7801A]" /> : <UserCheck className="h-5 w-5 text-slate-600" />}
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{user.name}</div>
                    <div className="text-xs text-slate-500">{user.role === 'owner' ? 'Owner · full access' : 'Staff · billing & stock'}</div>
                  </div>
                </div>
                <span className="font-mono-num text-xs font-medium text-slate-500">PIN {user.pin}</span>
              </button>
            ))}
        </div>
      </div>
    </Shell>
  );
};

export const LoginScreen: React.FC = () => {
  const { isCloudMode } = useStore();
  return isCloudMode ? <CloudLogin /> : <LocalLogin />;
};
