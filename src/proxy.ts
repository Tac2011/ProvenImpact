import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getUserRole } from '@/lib/roles';
import { getOpenDeletionStatus, isLockedOut } from '@/lib/deletionRequests';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  function redirectTo(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => response.cookies.set(c));
    return response;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup');

  const isPublicPage = request.nextUrl.pathname === '/' || isAuthPage;

  if (!user && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const isLockedPage = request.nextUrl.pathname.startsWith('/account-locked');

  if (user && !isPublicPage && !isLockedPage) {
    const status = await getOpenDeletionStatus(supabase, user.id);
    if (isLockedOut(status)) {
      return redirectTo('/account-locked');
    }
  }

  if (user && isAuthPage) {
    const role = await getUserRole(supabase, user.id);
    return redirectTo(role === 'platform_admin' ? '/admin' : '/profile');
  }

  if (user && request.nextUrl.pathname.startsWith('/admin')) {
    const role = await getUserRole(supabase, user.id);
    if (role !== 'platform_admin') {
      return redirectTo('/profile');
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
