'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getUserRole } from '@/lib/roles';
import { homeForRole, newPasswordError } from '@/lib/authLinks';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const problem = newPasswordError(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError || !data.user) {
      setSaving(false);
      setError(updateError?.message ?? 'Something went wrong. Please try again.');
      return;
    }

    setSaved(true);
    const home = homeForRole(await getUserRole(supabase, data.user.id));
    setTimeout(() => {
      router.push(home);
      router.refresh();
    }, 1500);
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Set a new password</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          New password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={saving}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          Confirm new password
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={saving}
            className="rounded border px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-blue-700">Password updated.</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save password'}
        </button>
      </form>
    </main>
  );
}
