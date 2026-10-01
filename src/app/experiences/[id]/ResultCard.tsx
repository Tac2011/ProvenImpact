'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ANSWER_MAX_LENGTH, type Strength } from '@/lib/experiences';

export interface EvidenceView {
  id: string;
  label: string;
  definition: string;
  strength: Strength;
  quote: string;
  reason: string;
  included: boolean;
}

type TextKey = 'bullet' | 'line';

const SAVE_FAILED = 'Could not save that change. Please try again.';

export function ResultCard({
  experienceId,
  confirmed,
  evidence,
  resumeBullet,
  interviewLine,
}: {
  experienceId: string;
  confirmed: boolean;
  evidence: EvidenceView[];
  resumeBullet: string;
  interviewLine: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(evidence);
  const [text, setText] = useState({ bullet: resumeBullet, line: interviewLine });
  const [saved, setSaved] = useState({ bullet: resumeBullet, line: interviewLine });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<TextKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = items.filter((item) => item.included);
  const removed = items.filter((item) => !item.included);

  async function setIncluded(id: string, included: boolean) {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.from('experience_evidence').update({ included }).eq('id', id);
    if (error) {
      setError(SAVE_FAILED);
      return;
    }
    setItems((current) => current.map((item) => (item.id === id ? { ...item, included } : item)));
  }

  // Saves the bullet and line when a box loses focus, if either changed.
  async function saveText() {
    const next = { bullet: text.bullet.trim(), line: text.line.trim() };
    if (next.bullet === saved.bullet && next.line === saved.line) {
      return;
    }
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from('experiences')
      .update({
        resume_bullet: next.bullet,
        interview_line: next.line,
        updated_at: new Date().toISOString(),
      })
      .eq('id', experienceId);
    if (error) {
      setError(SAVE_FAILED);
      return;
    }
    setSaved(next);
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from('experiences')
      .update({
        status: 'confirmed',
        resume_bullet: text.bullet.trim(),
        interview_line: text.line.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', experienceId);
    setBusy(false);
    if (error) {
      setError(SAVE_FAILED);
      return;
    }
    router.refresh();
  }

  async function copy(which: TextKey) {
    try {
      await navigator.clipboard.writeText(text[which].trim());
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Could not copy. Select the text and copy it instead.');
    }
  }

  function textBox(which: TextKey, label: string) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label htmlFor={which} className="font-medium">
            {label}
          </label>
          <button
            type="button"
            onClick={() => copy(which)}
            disabled={!text[which].trim()}
            className="text-sm text-blue-700 hover:underline disabled:opacity-50"
          >
            {copied === which ? 'Copied' : 'Copy'}
          </button>
        </div>
        <textarea
          id={which}
          rows={2}
          value={text[which]}
          maxLength={ANSWER_MAX_LENGTH}
          onChange={(e) => setText({ ...text, [which]: e.target.value })}
          onBlur={saveText}
          className="rounded border border-gray-300 p-2 text-sm"
        />
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      {confirmed && (
        <div className="rounded border border-green-300 bg-green-50 p-4 text-sm">
          Confirmed. This experience will count toward your profile.
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold">Strengths this shows</h2>
        {shown.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">
            We didn&apos;t find clear evidence for these competencies yet. Adding detail usually
            helps: how often, for how long, what you measured, and what got in the way.{' '}
            <Link href={`/experiences/${experienceId}/edit`} className="font-medium underline">
              Add detail
            </Link>
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {shown.map((item) => (
              <li key={item.id} className="rounded border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="font-semibold">{item.label}</span>
                    <span
                      className={`ml-2 rounded px-2 py-0.5 text-xs font-medium ${
                        item.strength === 'strong'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {item.strength === 'strong' ? 'Strong' : 'Moderate'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncluded(item.id, false)}
                    className="text-sm text-gray-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500">{item.definition}</p>
                <p className="mt-2 italic">&ldquo;{item.quote}&rdquo;</p>
                <p className="mt-1 text-sm text-gray-700">{item.reason}</p>
              </li>
            ))}
          </ul>
        )}
        {removed.length > 0 && (
          <p className="mt-3 text-sm text-gray-500">
            Removed:{' '}
            {removed.map((item, i) => (
              <span key={item.id}>
                {i > 0 && ', '}
                {item.label}{' '}
                <button
                  type="button"
                  onClick={() => setIncluded(item.id, true)}
                  className="underline"
                >
                  add back
                </button>
              </span>
            ))}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        {textBox('bullet', 'Resume bullet')}
        {textBox('line', 'Interview line')}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-4">
        {!confirmed && (
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Confirm'}
          </button>
        )}
        <Link href={`/experiences/${experienceId}/edit`} className="text-sm text-gray-600 underline">
          Edit answers
        </Link>
      </div>
    </div>
  );
}
