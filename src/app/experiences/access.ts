import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentRubric } from '@/lib/rubric';

// Every experiences page needs a signed-in user and a usable rubric.
export async function requireExperiencesAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const rubric = await getCurrentRubric(supabase);
  if (!rubric) {
    redirect('/profile');
  }

  return { supabase, user, rubric };
}
