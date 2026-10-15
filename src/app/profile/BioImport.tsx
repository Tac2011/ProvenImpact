'use client';

import { useState } from 'react';
import { BIO_MAX_LENGTH, type CheckedBio } from '@/lib/bioImport';
import { readBio, type ReadBioResult } from './bioActions';

export function BioImport({
  welcome,
  onRead,
}: {
  welcome: boolean;
  onRead: (result: { importId: string; bio: CheckedBio }) => void;
}) {
  // New students see the card open; everyone else opens it with the button.
  const [open, setOpen] = useState(welcome);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read() {
    setBusy(true);
    setError(null);
    let result: ReadBioResult;
    try {
      result = await readBio(text);
    } catch {
      result = { ok: false, error: 'Something went wrong. Please try again.' };
    }
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setText('');
    setOpen(false);
    onRead({ importId: result.importId, bio: result.bio });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 self-start rounded border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
      >
        Import from my bio
      </button>
    );
  }

  return (
    <div className="mb-6 flex flex-col gap-3 rounded border border-blue-200 bg-blue-50 p-4">
      <h2 className="font-semibold">{welcome ? 'Have a university bio?' : 'Import from my bio'}</h2>
      <p className="text-sm text-gray-700">
        Paste it and we&apos;ll fill in your profile for you. You&apos;ll check everything before
        it&apos;s saved.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={BIO_MAX_LENGTH}
        rows={8}
        disabled={busy}
        aria-label="Your university bio"
        className="rounded border border-gray-300 bg-white p-2 text-sm disabled:bg-gray-50"
      />
      <div className="flex justify-end text-xs text-gray-500">
        {text.length}/{BIO_MAX_LENGTH}
      </div>
      <p className="text-xs text-gray-600">
        Your bio is sent to Claude, an AI from Anthropic, to fill in your profile. Anthropic
        doesn&rsquo;t use it to train its models. We remove birthdates and family names before
        storing it.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={read}
          disabled={busy}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {busy ? 'Reading your bio...' : 'Read my bio'}
        </button>
        {busy && <span className="text-sm text-gray-500">This can take up to a minute.</span>}
        {!busy && (
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-600 underline">
            {welcome ? "Skip, I'll fill it in myself" : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  );
}
