'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { confirmRedirectUrl } from '@/lib/authLinks';

type SendStatus = 'idle' | 'sending' | 'sent' | 'failed';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<SendStatus>('idle');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: confirmRedirectUrl(window.location.origin),
    });

    // Supabase doesn't say whether the email has an account, and neither do we.
    setStatus(error ? 'failed' : 'sent');
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Reset your password</h1>
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
        {status === 'sent' && (
          <p className="text-sm text-blue-700">
            If an account exists for that email, we sent a reset link.
          </p>
        )}
        {status === 'failed' && (
          <p className="text-sm text-red-600">Couldn&rsquo;t send the email. Try again in a few minutes.</p>
        )}
        <button
          type="submit"
          disabled={status === 'sending'}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
      <p className="text-sm">
        <a href="/login" className="underline">
          Back to log in
        </a>
      </p>
    </main>
  );
}
