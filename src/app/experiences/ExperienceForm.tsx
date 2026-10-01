'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ANSWER_MAX_LENGTH,
  EXPERIENCE_FIELDS,
  type AnswerErrors,
  type ExperienceAnswers,
} from '@/lib/experiences';
import { createExperience, updateExperience, type ActionResult } from './actions';

const EMPTY: ExperienceAnswers = {
  title: '',
  what_you_did: '',
  frequency: '',
  result: '',
  obstacle: '',
};

export function ExperienceForm({
  experienceId,
  initialAnswers,
}: {
  experienceId?: string;
  initialAnswers?: ExperienceAnswers;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<ExperienceAnswers>(initialAnswers ?? EMPTY);
  const [fieldErrors, setFieldErrors] = useState<AnswerErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    let result: ActionResult;
    try {
      result = experienceId
        ? await updateExperience(experienceId, answers)
        : await createExperience(answers);
    } catch {
      result = { ok: false, error: 'Something went wrong. Please try again.' };
    }

    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    router.push(`/experiences/${result.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
      {EXPERIENCE_FIELDS.map((field) => {
        const common = {
          id: field.key,
          value: answers[field.key],
          maxLength: ANSWER_MAX_LENGTH,
          required: true,
          disabled: busy,
          onChange: (e: { target: { value: string } }) =>
            setAnswers({ ...answers, [field.key]: e.target.value }),
          className: 'rounded border border-gray-300 p-2 text-sm disabled:bg-gray-50',
        };
        return (
          <div key={field.key} className="flex flex-col gap-1">
            <label htmlFor={field.key} className="font-medium">
              {field.label}
            </label>
            <p className="text-sm text-gray-500">
              {field.helper} For example: &ldquo;{field.example}&rdquo;
            </p>
            {field.key === 'title' ? <input type="text" {...common} /> : <textarea rows={3} {...common} />}
            <div className="flex justify-between text-xs">
              <span className="text-red-600">{fieldErrors[field.key]}</span>
              <span className="text-gray-400">
                {answers[field.key].length}/{ANSWER_MAX_LENGTH}
              </span>
            </div>
          </div>
        );
      })}

      <p className="text-xs text-gray-500">
        Your answers are sent to Claude, an AI from Anthropic, to find the strengths they show.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {busy ? 'Reading your experience...' : experienceId ? 'Save changes' : 'Show my strengths'}
        </button>
        {busy && <span className="text-sm text-gray-500">This can take up to a minute.</span>}
      </div>
    </form>
  );
}
