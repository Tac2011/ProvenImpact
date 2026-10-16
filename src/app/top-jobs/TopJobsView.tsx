'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateTopJobs, type GenerateResult } from './actions';

export interface CardView {
  code: string;
  title: string;
  description: string;
  level: 'strong' | 'good' | 'possible';
  isNew: boolean;
  pay: string;
  outlook: string;
  why: string | null;
  fallback: string;
  tags: string[];
  degreeLink: string;
}

const LEVEL_TEXT = { strong: 'Strong match', good: 'Good match', possible: 'Possible match' } as const;
const LEVEL_STYLE = {
  strong: 'bg-green-50 text-green-800',
  good: 'bg-blue-50 text-blue-800',
  possible: 'bg-gray-100 text-gray-700',
} as const;

export function TopJobsView({
  hasResults,
  buttonLabel,
  notes,
  cards,
  missingExplanations,
}: {
  hasResults: boolean;
  buttonLabel: string | null; // null when results are up to date
  notes: string[];
  cards: CardView[];
  missingExplanations: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    let result: GenerateResult;
    try {
      result = await generateTopJobs();
    } catch {
      result = { ok: false, error: "We couldn't find your matches. Please try again." };
    }
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {notes.map((note) => (
        <p key={note} className="text-sm text-gray-700">
          {note}
        </p>
      ))}

      {buttonLabel && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {busy ? 'Finding your matches...' : buttonLabel}
          </button>
          {busy && <span className="text-sm text-gray-500">This can take up to a minute.</span>}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {hasResults && missingExplanations && !buttonLabel && (
        <p className="text-sm text-gray-700">
          We couldn&apos;t write some explanations.{' '}
          <button type="button" onClick={generate} disabled={busy} className="text-blue-700 underline">
            {busy ? 'Trying...' : 'Try again'}
          </button>
        </p>
      )}

      <ol className="flex flex-col gap-4">
        {cards.map((card, index) => (
          <li key={card.code} className="rounded border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">{index + 1}.</span>
              <h2 className="font-semibold">{card.title}</h2>
              {card.isNew && <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-800">New</span>}
              <span className={`rounded px-1.5 py-0.5 text-xs ${LEVEL_STYLE[card.level]}`}>{LEVEL_TEXT[card.level]}</span>
            </div>
            <p className="mt-2 text-sm text-gray-700">{card.description}</p>
            <p className="mt-2 text-sm text-gray-600">
              {card.pay} · {card.outlook}
            </p>
            <p className="mt-3 text-sm">
              <span className="font-medium">Why you: </span>
              {card.why ?? card.fallback}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {card.tags.map((tag) => (
                <span key={tag} className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                  {tag}
                </span>
              ))}
              <span className="text-gray-500">{card.degreeLink}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
