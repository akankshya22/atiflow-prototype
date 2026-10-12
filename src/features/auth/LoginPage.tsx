import { useState, type FormEvent } from 'react';
import { AlertCircle, Eye, EyeOff, Lock03, Mail01 } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import { Input } from '@/components/base/input/input';
import { authStore } from './authStore';
import type { PublicUser } from './types';
import { notify } from '@/ui/toast';
import bg from './assets/login-bg.jpg';
import logo from './assets/ati-logo.svg';
import robot from './assets/xt-lite.png';
import ribbonTip from './assets/ribbon-tip.svg';
import './login.css';

/**
 * Standalone login screen. It knows nothing about routes or pages: the host passes `onAuthenticated`
 * (see src/app/AppRoot.tsx) and decides where each role lands.
 */
export function LoginPage({ onAuthenticated }: { onAuthenticated: (user: PublicUser) => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [keep, setKeep] = useState(true);
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [shake, setShake] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    if (!username.trim() || !password) { setError('Enter your username and password.'); setShake((n) => n + 1); return; }
    setBusy(true); setError(null);
    const res = await authStore.getState().login(username, password, keep);
    setBusy(false);
    if (res === 'ok') onAuthenticated(authStore.getState().user!);
    else { setError('Incorrect username or password. Please try again.'); setShake((n) => n + 1); }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#eef3f3]">
      <img src={bg} alt="" className="pointer-events-none absolute inset-0 size-full object-cover object-left" />
      <div className="absolute inset-0 bg-white/40" />

      <main className="relative z-10 flex flex-1 items-center justify-center gap-24 px-5 py-10 lg:px-24">
        <section className="hidden max-w-[360px] flex-1 flex-col items-center gap-3 text-center lg:flex">
          <h1 className="w-[342px] text-display-sm font-semibold text-primary">Unified Material Orchestration Platform</h1>
          <p className="w-[320px] text-sm text-secondary">Real-time automation, dispatch tracking, and staging analytics simplified.</p>
        </section>

        <section className="w-full max-w-[480px]">
          {/* robot + ribbon driving across the top of the card */}
          <div className="h-[54px] overflow-hidden px-4" aria-hidden>
            <div className="ati-drive flex w-[276px] items-end">
              <div className="relative mr-[-1px] h-[54px] w-[62px] shrink-0 overflow-hidden"><img src={robot} alt="" className="pointer-events-none absolute left-[-54%] top-[-24%] h-[143%] w-[197%] max-w-none" /></div>
              <div className="relative flex w-[168px] items-center py-2"><div className="w-full bg-[#33bab1] px-2 text-xs text-white">Ati’s bots run 70+ factories</div><img src={ribbonTip} alt="" className="absolute left-[168px] top-0 h-[18px] w-[12px]" /></div>
            </div>
          </div>

          <form onSubmit={submit} noValidate className={'overflow-hidden rounded-2xl bg-primary shadow-xl ring-1 ring-secondary ' + (shake ? 'ati-shake' : '')} key={shake}>
            {/* sidebar-theme header */}
            <div className="flex flex-col gap-4 bg-[image:var(--surface-sidebar)] px-8 py-7 text-white sm:px-12">
              <div className="flex items-center gap-1"><img src={logo} alt="" className="size-8" /><span className="text-[20px] font-semibold leading-5 text-[#5eead4]">Flow</span><span className="ml-1 rounded-md bg-[#5eead4]/12 px-1.5 text-[11px] font-medium text-[#5eead4]">v4.0</span></div>
              <div className="flex flex-col gap-1.5"><h2 className="text-display-xs font-semibold sm:text-display-sm">Welcome back!</h2><p className="text-sm text-slate-300">Enter your operational credentials to continue</p></div>
            </div>

            <div className="flex flex-col gap-6 px-8 py-8 sm:px-12">
              <div className="flex flex-col gap-4">
                <Input label="Username or Email" size="md" icon={Mail01} placeholder="e.g. arjun" value={username} onChange={setUsername} name="username" autoComplete="username" isRequired isInvalid={!!error} />
                <div className="relative">
                  <Input label="Password" size="md" icon={Lock03} type={show ? 'text' : 'password'} placeholder="••••••••••••" value={password} onChange={setPassword} name="password" autoComplete="current-password" isRequired isInvalid={!!error} inputClassName="pr-10" />
                  <ButtonUtility className="absolute right-1.5 bottom-1.5" size="sm" color="tertiary" icon={show ? EyeOff : Eye} tooltip={show ? 'Hide password' : 'Show password'} onPress={() => setShow((v) => !v)} />
                </div>
                {error && <div role="alert" className="flex items-start gap-2 rounded-lg bg-error-secondary px-3 py-2 text-sm text-error-primary"><AlertCircle className="mt-0.5 size-4 shrink-0" />{error}</div>}
                <div className="flex items-center justify-between gap-3">
                  <Checkbox size="sm" label="Keep me signed in" isSelected={keep} onChange={setKeep} />
                  <Button type="button" color="link-color" size="sm" onPress={() => notify.info('Password recovery', 'Please contact your administrator to reset your password.', 'recover')}>Recover Password</Button>
                </div>
              </div>
              <Button type="submit" size="lg" color="primary" className="w-full" isLoading={busy}>Log in</Button>
            </div>
          </form>
        </section>
      </main>

      {/* sidebar-theme footer */}
      <footer className="relative z-10 flex items-center justify-between gap-4 bg-[image:var(--surface-sidebar)] px-6 py-4 text-xs text-slate-300 sm:px-20">
        <span>© 2026 ATI Motors · AtiMotors/AtiFlow v4.0.0</span>
        <span className="flex items-center gap-2"><i className="size-2 rounded-full bg-[#22c55e] ring-2 ring-[#22c55e]/30" />All Systems Operational</span>
      </footer>
    </div>
  );
}
