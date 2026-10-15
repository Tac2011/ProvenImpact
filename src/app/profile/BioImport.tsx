'use client';

import { useState } from 'react';
import { BIO_MAX_LENGTH, type CheckedBio } from '@/lib/bioImport';
import { readBio, type ReadBioResult } from './bioActions';

export function BioImport({
  welcome,
  onRead,
  onBusyChange,
}: {
  welcome: boolean;
  onRead: (result: { importId: string; bio: CheckedBio }) => void;
  // The profile form is locked while reading, so the result never lands on top of
  // something the student typed in the meantime.
  onBusyChange: (busy: boolean) => void;
}) {
  // New students see the card open; everyone else opens it with the button.
  const [open, setOpen] = useState(welcome);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooLong = text.trim().length > BIO_MAX_LENGTH;

  async function read() {
    setBusy(true);
    onBusyChange(true);
    setError(null);
    let result: ReadBioResult;
    try {
      result = await readBio(text);
    } catch {
      result = { ok: false, error: 'Something went wrong. Please try again.' };
    }
    setBusy(false);
    onBusyChange(false);

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
        rows={8}
        disabled={busy}
        aria-label="Your university bio"
        className="rounded border border-gray-300 bg-white p-2 text-sm disabled:bg-gray-50"
      />
      {/* No maxLength: the browser would cut a long paste off silently, usually losing the honors at the end. */}
      <div className={`flex justify-end text-xs ${tooLong ? 'text-red-600' : 'text-gray-500'}`}>
        {text.trim().length}/{BIO_MAX_LENGTH}
      </div>
      {tooLong && (
        <p className="text-sm text-red-600">That&apos;s longer than a bio. Paste up to 15,000 characters.</p>
      )}
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
          disabled={busy || tooLong}
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
