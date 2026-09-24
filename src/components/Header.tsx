import { createClient } from '@/lib/supabase/server';
import { getUserRoleInfo } from '@/lib/roles';
import { headerDisplayName, homeHrefFor, navItemsFor } from '@/lib/navigation';
import { HeaderNav } from './HeaderNav';

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <HeaderNav homeHref={homeHrefFor(null)} items={[]} displayName={null} pendingCount={0} />;
  }

  const info = await getUserRoleInfo(supabase, user.id);

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .maybeSingle();

  let pendingCount = 0;
  if (info.role === 'platform_admin') {
    const { count } = await supabase
      .from('deletion_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    pendingCount = count ?? 0;
  }

  return (
    <HeaderNav
      homeHref={homeHrefFor(info.role)}
      items={navItemsFor(info.role)}
      displayName={headerDisplayName({
        adminName: info.name,
        firstName: profile?.first_name ?? null,
        lastName: profile?.last_name ?? null,
        email: user.email ?? '',
      })}
      pendingCount={pendingCount}
    />
  );
}
