import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/roles';
import { destinationAfterConfirm, parseConfirmType } from '@/lib/authLinks';

const BAD_LINK = '/login?error=link';

// Sign-up confirmation and password reset emails link here, and checking the
// link signs the person in (it sets the session cookies). Two kinds of link:
// - token_hash: from our own email templates. Works on any device.
// - code: from Supabase's default templates, which are locked until we have our
//   own email service. Works only in the browser that asked for the email.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = parseConfirmType(params.get('type'));
  const tokenHash = params.get('token_hash');
  const code = params.get('code');

  if (!type || (!tokenHash && !code)) {
    redirect(BAD_LINK);
  }

  const supabase = await createClient();
  const { data, error } = tokenHash
    ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error || !data.user) {
    console.error('Email link failed', error?.code ?? error?.name, error?.message);
    redirect(BAD_LINK);
  }

  // The role of the account in the link, not whoever was signed in before.
  const role = await getUserRole(supabase, data.user.id);
  redirect(destinationAfterConfirm(type, role));
}
