import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/roles';
import { COMPETENCIES } from '@/lib/competencies';
import { ADMIN_MANAGE_HREF, formatStat } from '@/lib/navigation';

interface DashboardStats {
  athletes: number;
  assessments_complete: number;
  pending_deletions: number;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  if ((await getUserRole(supabase, user.id)) !== 'platform_admin') {
    redirect('/profile');
  }

  const { data } = await supabase.rpc('admin_dashboard_stats', {
    competency_count: COMPETENCIES.length,
  });
  const stats = data as DashboardStats | null;

  const tiles = [
    { label: 'Athletes', value: stats?.athletes, href: '/admin/athletes', alert: false },
    {
      label: 'Assessments complete',
      value: stats?.assessments_complete,
      href: '/admin/athletes',
      alert: false,
    },
    {
      label: 'Pending deletions',
      value: stats?.pending_deletions,
      href: ADMIN_MANAGE_HREF,
      alert: (stats?.pending_deletions ?? 0) > 0,
    },
  ];

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className={`rounded border bg-white p-5 hover:shadow ${
              tile.alert ? 'border-l-4 border-l-brand-red' : ''
            }`}
          >
            <div className="text-3xl font-bold text-brand-slate">{formatStat(tile.value)}</div>
            <div className="mt-1 text-sm text-gray-600">{tile.label}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
