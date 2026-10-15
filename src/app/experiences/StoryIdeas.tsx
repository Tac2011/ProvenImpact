'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function StoryIdeas({ ideas }: { ideas: { id: string; prompt: string }[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function dismiss(id: string) {
    setError(null);
    // A write blocked by a security rule returns no error, just no rows, so ask for the row back.
    const { data, error: dismissError } = await createClient()
      .from('story_ideas')
      .update({ status: 'dismissed' })
      .eq('id', id)
      .eq('status', 'open')
      .select('id');
    if (dismissError || !data || data.length === 0) {
      setError('Could not remove that idea. Please try again.');
      return;
    }
    setHidden([...hidden, id]);
    router.refresh();
  }

  const visible = ideas.filter((idea) => !hidden.includes(idea.id));
  if (visible.length === 0) {
    return null;
  }

  return (
    <section className="mt-6 rounded border border-blue-200 bg-blue-50 p-4">
      <h2 className="font-semibold">Story ideas from your bio</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {visible.map((idea) => (
          <li key={idea.id} className="flex flex-col gap-2 rounded border border-blue-100 bg-white p-3">
            <span className="text-sm">{idea.prompt}</span>
            <span className="flex gap-3 text-sm">
              <Link href={`/experiences/new?idea=${idea.id}`} className="font-medium text-blue-700 underline">
                Write this story
              </Link>
              <button type="button" onClick={() => dismiss(idea.id)} className="text-gray-600 underline">
                Not for me
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
