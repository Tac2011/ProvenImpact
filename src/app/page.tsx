import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/roles';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const role = await getUserRole(supabase, user.id);
    redirect(role === 'platform_admin' ? '/admin' : '/profile');
  }

  return (
    <main className="flex flex-col items-center px-6 py-24 text-center">
      <Image src="/ProvenImpact.png" alt="Proven Impact" width={160} height={160} priority />

      <h1 className="mt-8 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
        Athletic Experience, Real Opportunity
      </h1>

      <p className="mt-4 max-w-xl text-lg text-gray-600">
        Proven Impact translates what you&apos;ve already demonstrated in
        competition into evidence employers understand, turning your
        athletic career into a career advantage.
      </p>

      <div className="mt-10 flex gap-4">
        <Link
          href="/signup"
          className="rounded bg-blue-700 px-6 py-3 font-medium text-white hover:bg-blue-800"
        >
          Sign up
        </Link>
        <Link
          href="/login"
          className="rounded border border-gray-300 px-6 py-3 font-medium hover:bg-gray-50"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
