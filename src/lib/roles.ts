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

export interface UserRoleInfo {
  role: UserRole;
  name: string | null;
  organizationName: string | null;
  createdAt: string | null;
}

export async function getUserRoleInfo(
  supabase: SupabaseClient,
  userId: string
): Promise<UserRoleInfo> {
  const { data } = await supabase
    .from('user_roles')
    .select('role, name, organization_name, created_at')
    .eq('id', userId)
    .maybeSingle();

  return {
    role: (data?.role as UserRole | undefined) ?? 'student_athlete',
    name: data?.name ?? null,
    organizationName: data?.organization_name ?? null,
    createdAt: data?.created_at ?? null,
  };
}
