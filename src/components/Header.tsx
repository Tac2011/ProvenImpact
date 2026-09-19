import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { LogoutButton } from './LogoutButton';

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <Image src="/ProvenImpact.png" alt="Proven Impact" width={160} height={40} priority />
      {user && <LogoutButton />}
    </header>
  );
}
