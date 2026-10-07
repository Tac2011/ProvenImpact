'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getUserRole } from '@/lib/roles';
import { confirmRedirectUrl, homeForRole } from '@/lib/authLinks';

type SendStatus = 'idle' | 'sending' | 'sent' | 'failed';

export function LoginForm({ linkError }: { linkError: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notConfirmed, setNotConfirmed] = useState(false);
  const [resend, setResend] = useState<SendStatus>('idle');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotConfirmed(false);
    setResend('idle');
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      if (error.code === 'email_not_confirmed') {
        setNotConfirmed(true);
      } else {
        setError(error.message);
      }
      return;
    }

    const role = await getUserRole(supabase, data.user.id);
    setLoading(false);

    router.push(homeForRole(role));
    router.refresh();
  }

  async function handleResend() {
    setResend('sending');
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: confirmRedirectUrl(window.location.origin, 'email') },
    });
    setResend(error ? 'failed' : 'sent');
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Log in</h1>
      {linkError && (
        <p className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm">
          That link has expired or was already used. Log in below, or use Forgot password? to get a
          new one.
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
        <a href="/forgot-password" className="-mt-2 text-sm underline">
          Forgot password?
        </a>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notConfirmed && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-red-600">
              Please confirm your email first. We sent you a link when you signed up.
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={!email || resend === 'sending' || resend === 'sent'}
              className="self-start underline disabled:opacity-50"
            >
              Resend confirmation email
            </button>
            {resend === 'sent' && <p className="text-blue-700">Sent. Check your inbox and spam.</p>}
            {resend === 'failed' && (
              <p className="text-red-600">Couldn&rsquo;t send the email. Try again in a few minutes.</p>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>
      <p className="text-sm">
        Need an account?{' '}
        <a href="/signup" className="underline">
          Sign up
        </a>
      </p>
    </main>
  );
}
