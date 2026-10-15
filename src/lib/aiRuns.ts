import type { createClient } from '@/lib/supabase/server';
import { isOverDailyLimit, runWindowStart } from './experiences';

type Supabase = Awaited<ReturnType<typeof createClient>>;

const SAVE_ERROR = 'We could not save that. Please try again.';
const LIMIT_REACHED = "You've reached today's limit of 20 tries. Please try again tomorrow.";

// Every Claude call goes through here: it checks the daily limit, then logs the run.
// Experiences and bio reading share the limit. If the count can't be read, it refuses
// rather than spends.
export async function checkAndLogRun(
  supabase: Supabase,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { count, error } = await supabase
    .from('experience_runs')
    .select('*', { count: 'exact', head: true })
    .eq('athlete_id', userId)
    .gte('created_at', runWindowStart(new Date()));
  if (error) {
    return { ok: false, error: SAVE_ERROR };
  }
  if (isOverDailyLimit(count ?? 0)) {
    return { ok: false, error: LIMIT_REACHED };
  }

  const { error: logError } = await supabase.from('experience_runs').insert({ athlete_id: userId });
  if (logError) {
    return { ok: false, error: SAVE_ERROR };
  }
  return { ok: true };
}
