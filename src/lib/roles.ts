import type { SupabaseClient } from '@supabase/supabase-js';

export type UserRole =
  | 'platform_admin'
  | 'corporate_admin'
  | 'corporate_user'
  | 'university_admin'
  | 'university_user'
  | 'student_athlete';

export async function getUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<UserRole> {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  return (data?.role as UserRole | undefined) ?? 'student_athlete';
}
