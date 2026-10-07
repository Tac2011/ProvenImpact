import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/roles';
import { destinationAfterConfirm, parseConfirmType } from '@/lib/authLinks';

const BAD_LINK = '/login?error=link';

// Sign-up confirmation and password reset emails link here. Checking the
// one-time token signs the person in (it sets the session cookies), so the
// link works on any device, not only the browser where they started.
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = parseConfirmType(request.nextUrl.searchParams.get('type'));

  if (!tokenHash || !type) {
    redirect(BAD_LINK);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error || !data.user) {
    redirect(BAD_LINK);
  }

  // The role of the account in the link, not whoever was signed in before.
  const role = await getUserRole(supabase, data.user.id);
  redirect(destinationAfterConfirm(type, role));
}
