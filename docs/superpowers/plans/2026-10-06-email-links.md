# Email Confirmation and Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let email links from Supabase (sign-up confirmation and password reset) sign people in through our own `/auth/confirm` route, and add Forgot password, Set a new password, and friendlier login messages.

**Architecture:** Emails link to `/auth/confirm?token_hash=...&type=email|recovery`. The route verifies the one-time token with `verifyOtp` on the server, which sets the session cookies, then redirects by type and role. Path rules and small decisions live in a pure, tested module `src/lib/authLinks.ts`; the proxy, route, and pages use it.

**Tech Stack:** Next.js 16 (App Router, route handlers, proxy), `@supabase/ssr` and `@supabase/supabase-js` 2.116, TypeScript, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-email-links-design.md`

## Global Constraints

- Accepted link types: `email` and `recovery` only. Anything else is a bad link.
- Bad links redirect to `/login?error=link`. No `next` parameter anywhere.
- After a link: `recovery` → `/reset-password`; otherwise `/admin` for `platform_admin`, `/profile` for every other role.
- The app always passes `{window.location.origin}/auth/confirm` as `emailRedirectTo` / `redirectTo`.
- Public (signed out OK): `/`, `/login`, `/signup`, `/forgot-password`, `/auth/confirm`. Signed-in users on `/login`, `/signup`, `/forgot-password` go home by role. `/auth/confirm` is never redirected by the proxy.
- Minimum password length: 6.
- Page style: `mx-auto flex max-w-sm flex-col gap-4 p-8`, `text-2xl font-bold` heading, inputs `rounded border px-3 py-2`, button `rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50`.
- Copy, exactly:
  - Sign up: "We sent a link to {email}. Click it to finish creating your account. If it isn't in your inbox in a few minutes, check spam."
  - Not confirmed: "Please confirm your email first. We sent you a link when you signed up." Button: "Resend confirmation email". Sent: "Sent. Check your inbox and spam."
  - Email send failure (resend and forgot password): "Couldn't send the email. Try again in a few minutes."
  - Forgot password: heading "Reset your password", button "Send reset link", link "Back to log in", success "If an account exists for that email, we sent a reset link."
  - Reset password: heading "Set a new password", fields "New password" / "Confirm new password", button "Save password", errors "The passwords don't match." / "Use at least 6 characters.", success "Password updated."
  - Bad link note: "That link has expired or was already used. Log in below, or use Forgot password? to get a new one."
  - Login link text: "Forgot password?"
- No em dashes in any user-facing copy or email template.
- "Confirm email" stays OFF in Supabase until after the investor demo. Nothing in this plan turns it on.

## Review Focus

1. A path that only starts with a public name (`/loginx`, `/signup-promo`) must not become public. Test in Task 1.
2. Exactly 6 characters is a valid password; 5 is not. Test in Task 1.
3. Clicking Resend with an empty email field must not send a request or show a misleading result: the button is disabled until the email field has text. Built in Task 3; checked in Task 3's manual step.
4. A link opened while someone else is signed in in the same browser signs in as the link's account (the token decides), and still lands by that account's role. Route in Task 2 looks up the role of the user returned by `verifyOtp`, not the earlier session. Checked in Task 2's manual step.
5. Some email programs (Outlook "safe links") open links before the person does, which uses up the token. The person then sees the bad-link note, which points them to Forgot password. Nothing to build; Todd should know it if a tester reports "expired" on a fresh link.

---

### Task 1: Path rules and decisions in `src/lib/authLinks.ts`, used by the proxy

**Files:**
- Create: `src/lib/authLinks.ts`
- Test: `src/lib/authLinks.test.ts`
- Modify: `src/proxy.ts` (the `isAuthPage` / `isPublicPage` lines)

**Interfaces:**
- Consumes: `UserRole` from `src/lib/roles.ts`.
- Produces:
  ```ts
  export type ConfirmType = 'email' | 'recovery';
  export const MIN_PASSWORD_LENGTH = 6;
  export function isAuthPage(pathname: string): boolean
  export function isPublicPath(pathname: string): boolean
  export function parseConfirmType(value: string | null): ConfirmType | null
  export function homeForRole(role: UserRole): string
  export function destinationAfterConfirm(type: ConfirmType, role: UserRole): string
  export function confirmRedirectUrl(origin: string): string
  export function newPasswordError(password: string, confirm: string): string | null
  ```

- [ ] **Step 1: Write the failing tests**

`src/lib/authLinks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  confirmRedirectUrl,
  destinationAfterConfirm,
  homeForRole,
  isAuthPage,
  isPublicPath,
  newPasswordError,
  parseConfirmType,
} from './authLinks';

describe('isPublicPath', () => {
  it('allows the pages a signed-out visitor needs', () => {
    for (const path of ['/', '/login', '/signup', '/forgot-password', '/auth/confirm']) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });

  it('keeps everything else private', () => {
    for (const path of ['/reset-password', '/profile', '/admin', '/experiences', '/auth']) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });

  it("doesn't open paths that only start with a public name", () => {
    for (const path of ['/loginx', '/signup-promo', '/forgot-passwords', '/auth/confirmed']) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });
});

describe('isAuthPage', () => {
  it('is true for the log in, sign up, and forgot password pages', () => {
    for (const path of ['/login', '/signup', '/forgot-password']) {
      expect(isAuthPage(path), path).toBe(true);
    }
  });

  it('is false for the link route, the reset page, and home', () => {
    for (const path of ['/auth/confirm', '/reset-password', '/']) {
      expect(isAuthPage(path), path).toBe(false);
    }
  });
});

describe('parseConfirmType', () => {
  it('accepts email and recovery', () => {
    expect(parseConfirmType('email')).toBe('email');
    expect(parseConfirmType('recovery')).toBe('recovery');
  });

  it('rejects everything else', () => {
    for (const value of ['signup', 'magiclink', 'invite', '', null]) {
      expect(parseConfirmType(value), String(value)).toBeNull();
    }
  });
});

describe('homeForRole', () => {
  it('sends Platform Admins to the Dashboard and everyone else to their profile', () => {
    expect(homeForRole('platform_admin')).toBe('/admin');
    expect(homeForRole('student_athlete')).toBe('/profile');
    expect(homeForRole('university_admin')).toBe('/profile');
  });
});

describe('destinationAfterConfirm', () => {
  it('sends a password reset to Set a new password, whatever the role', () => {
    expect(destinationAfterConfirm('recovery', 'platform_admin')).toBe('/reset-password');
    expect(destinationAfterConfirm('recovery', 'student_athlete')).toBe('/reset-password');
  });

  it('sends a confirmed sign-up home by role', () => {
    expect(destinationAfterConfirm('email', 'platform_admin')).toBe('/admin');
    expect(destinationAfterConfirm('email', 'student_athlete')).toBe('/profile');
  });
});

describe('confirmRedirectUrl', () => {
  it('points back at the site the request came from', () => {
    expect(confirmRedirectUrl('http://localhost:3000')).toBe('http://localhost:3000/auth/confirm');
    expect(confirmRedirectUrl('https://proven-impact.vercel.app')).toBe(
      'https://proven-impact.vercel.app/auth/confirm'
    );
  });
});

describe('newPasswordError', () => {
  it('rejects a password shorter than 6 characters', () => {
    expect(newPasswordError('12345', '12345')).toBe('Use at least 6 characters.');
  });

  it('rejects passwords that do not match', () => {
    expect(newPasswordError('123456', '123457')).toBe("The passwords don't match.");
  });

  it('accepts exactly 6 matching characters', () => {
    expect(newPasswordError('123456', '123456')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/authLinks.test.ts`
Expected: FAIL, cannot find module `./authLinks`.

- [ ] **Step 3: Write the implementation**

`src/lib/authLinks.ts`:

```ts
import type { UserRole } from './roles';

// Email links (sign-up confirmation, password reset) land here. See /auth/confirm.
const CONFIRM_PATH = '/auth/confirm';
const AUTH_PAGES = ['/login', '/signup', '/forgot-password'];

export type ConfirmType = 'email' | 'recovery';

export const MIN_PASSWORD_LENGTH = 6;

// "/login" and "/login/anything", but not "/loginx".
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

// Pages a signed-in user is sent away from.
export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((base) => isUnder(pathname, base));
}

// Pages a signed-out visitor may open.
export function isPublicPath(pathname: string): boolean {
  return pathname === '/' || isAuthPage(pathname) || pathname === CONFIRM_PATH;
}

export function parseConfirmType(value: string | null): ConfirmType | null {
  return value === 'email' || value === 'recovery' ? value : null;
}

export function homeForRole(role: UserRole): string {
  return role === 'platform_admin' ? '/admin' : '/profile';
}

export function destinationAfterConfirm(type: ConfirmType, role: UserRole): string {
  return type === 'recovery' ? '/reset-password' : homeForRole(role);
}

export function confirmRedirectUrl(origin: string): string {
  return `${origin}${CONFIRM_PATH}`;
}

export function newPasswordError(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) {
    return "The passwords don't match.";
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/authLinks.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Use the rules in the proxy**

In `src/proxy.ts`, add the import:

```ts
import { isAuthPage, isPublicPath } from '@/lib/authLinks';
```

Replace:

```ts
  const isAuthPage =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup');

  const isPublicPage = request.nextUrl.pathname === '/' || isAuthPage;
```

with:

```ts
  const pathname = request.nextUrl.pathname;
  const onAuthPage = isAuthPage(pathname);
  const isPublicPage = isPublicPath(pathname);
```

and change the later `if (user && isAuthPage) {` to `if (user && onAuthPage) {`.

`/auth/confirm` is public, so signed-in visitors skip the lockout check there, and it isn't an auth page, so they aren't redirected away. The route itself decides where they go.

- [ ] **Step 6: Type-check, lint, full suite**

Run: `npx tsc --noEmit -p .` then `npx eslint src/lib/authLinks.ts src/lib/authLinks.test.ts src/proxy.ts` then `npx vitest run`
Expected: no output from tsc and eslint; all tests pass (107 before this task, 121 after).

- [ ] **Step 7: Commit**

```bash
git add src/lib/authLinks.ts src/lib/authLinks.test.ts src/proxy.ts
git commit -m "Move page access rules into authLinks and open the email link pages"
```

---

### Task 2: Forgot password flow: `/forgot-password`, `/auth/confirm`, `/reset-password`

**Files:**
- Create: `src/app/auth/confirm/route.ts`
- Create: `src/app/forgot-password/page.tsx`
- Create: `src/app/reset-password/page.tsx`

**Interfaces:**
- Consumes (Task 1): `parseConfirmType`, `destinationAfterConfirm`, `confirmRedirectUrl`, `homeForRole`, `newPasswordError`, `MIN_PASSWORD_LENGTH`. Also `getUserRole` from `@/lib/roles`, server `createClient` from `@/lib/supabase/server`, browser `createClient` from `@/lib/supabase/client`.
- Produces: `GET /auth/confirm` (also used by Task 3's sign-up and resend links), `/forgot-password`, `/reset-password`.

- [ ] **Step 1: Write the link route**

`src/app/auth/confirm/route.ts`:

```ts
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
```

- [ ] **Step 2: Write the Forgot password page**

`src/app/forgot-password/page.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { confirmRedirectUrl } from '@/lib/authLinks';

type SendStatus = 'idle' | 'sending' | 'sent' | 'failed';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<SendStatus>('idle');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: confirmRedirectUrl(window.location.origin),
    });

    // Supabase doesn't say whether the email has an account, and neither do we.
    setStatus(error ? 'failed' : 'sent');
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Reset your password</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
        {status === 'sent' && (
          <p className="text-sm text-blue-700">
            If an account exists for that email, we sent a reset link.
          </p>
        )}
        {status === 'failed' && (
          <p className="text-sm text-red-600">Couldn&rsquo;t send the email. Try again in a few minutes.</p>
        )}
        <button
          type="submit"
          disabled={status === 'sending'}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
      <p className="text-sm">
        <a href="/login" className="underline">
          Back to log in
        </a>
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Write the Set a new password page**

`src/app/reset-password/page.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getUserRole } from '@/lib/roles';
import { homeForRole, MIN_PASSWORD_LENGTH, newPasswordError } from '@/lib/authLinks';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const problem = newPasswordError(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError || !data.user) {
      setSaving(false);
      setError(updateError?.message ?? 'Something went wrong. Please try again.');
      return;
    }

    setSaved(true);
    const home = homeForRole(await getUserRole(supabase, data.user.id));
    setTimeout(() => {
      router.push(home);
      router.refresh();
    }, 1500);
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Set a new password</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          New password
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={saving}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          Confirm new password
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={saving}
            className="rounded border px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-blue-700">Password updated.</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save password'}
        </button>
      </form>
    </main>
  );
}
```

`saving` stays true after success, so the button can't be pressed twice before the redirect.

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint src/app/auth src/app/forgot-password src/app/reset-password`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/app/auth/confirm/route.ts src/app/forgot-password/page.tsx src/app/reset-password/page.tsx
git commit -m "Add Forgot password, the email link route, and Set a new password"
```

- [ ] **Step 6: Todd sets up the Supabase dashboard**

In the Supabase dashboard, project Proven Impact:

1. **Authentication → URL Configuration**
   - Site URL: `https://proven-impact.vercel.app`
   - Redirect URLs, **Add URL** twice:
     - `http://localhost:3000/auth/confirm`
     - `https://proven-impact.vercel.app/auth/confirm`
   - Save.
2. **Authentication → Email Templates → Reset password.** Replace the message body with:
   ```html
   <h2>Reset your password</h2>
   <p>Someone asked to reset the password for your Proven Impact account. If it was you, click the link below to choose a new one.</p>
   <p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Reset my password</a></p>
   <p>If you didn't ask for this, you can ignore this email. Your password won't change.</p>
   ```
   Save.
3. **Authentication → Email Templates → Confirm signup.** Replace the message body with:
   ```html
   <h2>Confirm your email</h2>
   <p>Thanks for joining Proven Impact. Click the link below to confirm your email and finish creating your account.</p>
   <p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Confirm my email</a></p>
   ```
   Save.

Do **not** turn on Confirm email.

- [ ] **Step 7: Check in the browser (dev server on http://localhost:3000)**

1. Signed out, open `/forgot-password`. Enter `toddtest1@gmail.com` and click Send reset link. Expected: "If an account exists for that email, we sent a reset link."
2. Open the email (check spam). The link starts with `http://localhost:3000/auth/confirm?token_hash=`. Click it. Expected: "Set a new password" page.
3. Try a 5-character password: "Use at least 6 characters." Try two different passwords: "The passwords don't match." Then save a real one. Expected: "Password updated.", then My Profile.
4. Log out, log in with the new password. Expected: works. (Set it back to `password` the same way if you want the test login unchanged.)
5. Click the same email link again. Expected: Log in page. (The yellow bad-link note arrives in Task 3.)
6. Forgot password for `nobody-here-123@example.com`. Expected: the same "If an account exists..." message.
7. Signed out, open `/reset-password`. Expected: sent to Log in.
8. Signed in as the admin, open a fresh reset link for `toddtest1@gmail.com` in the same browser. Expected: Set a new password, and after saving, My Profile (the athlete's home, not the Dashboard).

If a link lands on the home page instead of `/auth/confirm`, the Redirect URLs in step 6 are missing or misspelled.

---

### Task 3: Log in and Sign up changes

**Files:**
- Create: `src/app/login/LoginForm.tsx`
- Modify (rewrite): `src/app/login/page.tsx`
- Modify: `src/app/signup/page.tsx`

**Interfaces:**
- Consumes (Task 1): `confirmRedirectUrl`, `homeForRole`. `getUserRole` from `@/lib/roles`, browser `createClient`.
- Produces: `LoginForm({ linkError }: { linkError: boolean })`.

- [ ] **Step 1: Move the login form into `LoginForm.tsx` and add the new pieces**

`src/app/login/LoginForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getUserRole } from '@/lib/roles';
import { confirmRedirectUrl, homeForRole } from '@/lib/authLinks';

type SendStatus = 'idle' | 'sending' | 'sent' | 'failed';

export function LoginForm({ linkError }: { linkError: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notConfirmed, setNotConfirmed] = useState(false);
  const [resend, setResend] = useState<SendStatus>('idle');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotConfirmed(false);
    setResend('idle');
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      if (error.code === 'email_not_confirmed') {
        setNotConfirmed(true);
      } else {
        setError(error.message);
      }
      return;
    }

    const role = await getUserRole(supabase, data.user.id);
    setLoading(false);

    router.push(homeForRole(role));
    router.refresh();
  }

  async function handleResend() {
    setResend('sending');
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: confirmRedirectUrl(window.location.origin) },
    });
    setResend(error ? 'failed' : 'sent');
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Log in</h1>
      {linkError && (
        <p className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm">
          That link has expired or was already used. Log in below, or use Forgot password? to get a
          new one.
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
        <a href="/forgot-password" className="-mt-2 text-sm underline">
          Forgot password?
        </a>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notConfirmed && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-red-600">
              Please confirm your email first. We sent you a link when you signed up.
            </p>
            <button
              type="button"
              onClick={handleResend}
              disabled={!email || resend === 'sending' || resend === 'sent'}
              className="self-start underline disabled:opacity-50"
            >
              Resend confirmation email
            </button>
            {resend === 'sent' && <p className="text-blue-700">Sent. Check your inbox and spam.</p>}
            {resend === 'failed' && (
              <p className="text-red-600">Couldn&rsquo;t send the email. Try again in a few minutes.</p>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>
      <p className="text-sm">
        Need an account?{' '}
        <a href="/signup" className="underline">
          Sign up
        </a>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Make the login page a server component that reads the bad-link flag**

`src/app/login/page.tsx` (replace the whole file):

```tsx
import { LoginForm } from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <LoginForm linkError={error === 'link'} />;
}
```

- [ ] **Step 3: Sign up sends the link back to this site, with the new message**

In `src/app/signup/page.tsx`, add the import:

```ts
import { confirmRedirectUrl } from '@/lib/authLinks';
```

Replace:

```ts
    const { data, error } = await supabase.auth.signUp({ email, password });
```

with:

```ts
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: confirmRedirectUrl(window.location.origin) },
    });
```

Replace:

```ts
      setInfo('Check your email to confirm your account, then log in.');
```

with:

```ts
      setInfo(
        `We sent a link to ${email}. Click it to finish creating your account. If it isn't in your inbox in a few minutes, check spam.`
      );
```

- [ ] **Step 4: Type-check, lint, full suite**

Run: `npx tsc --noEmit -p .` then `npx eslint src/app/login src/app/signup` then `npx vitest run`
Expected: no output from tsc and eslint; 121 tests pass.

- [ ] **Step 5: Check in the browser**

1. Signed out, open `/login`. Expected: "Forgot password?" link under the password field; it opens Reset your password.
2. Open `/login?error=link`. Expected: the yellow note above the form.
3. Log in with a wrong password. Expected: Supabase's "Invalid login credentials", as before.
4. Log in as `toddtest1@gmail.com`. Expected: My Profile. Log in as the admin. Expected: Dashboard.
5. Sign up with a new address (for example `nsxdude82+confirmtest@gmail.com`). Expected, with Confirm email still off: straight to My Profile, as today.
6. Click a used reset link from Task 2. Expected: Log in with the yellow note.

The not-confirmed message, Resend, and the sign-up email can only be checked after the demo, with Confirm email on (see Step 7).

- [ ] **Step 6: Commit**

```bash
git add src/app/login/LoginForm.tsx src/app/login/page.tsx src/app/signup/page.tsx
git commit -m "Log in: bad link note, Forgot password link, resend confirmation; sign up returns links here"
```

- [ ] **Step 7: Update the Parking Lot and go-live list**

In `C:\development\Claude Code\Proven\Parking_Lot.md`:

1. Move "Forgot password" from Open to Resolved:
   ```markdown
   ### Forgot password
   **Resolved:** 2026-10-06. Forgot password? on Log in sends a reset link; `/auth/confirm` checks it and opens Set a new password. Works on any device.
   ```
2. Add under Open:
   ```markdown
   ### Before inviting real athletes: email
   **Logged:** 2026-10-06

   - After the demo: Supabase → Authentication → Sign In / Providers → turn **Confirm email** on. Then test: sign up with a new `+` address, check the email arrives and its link lands on My Profile; log in before clicking it and try Resend; open a sign-up link on a phone.
   - Once the company name and domain are settled: set up an email service (for example Resend) on the domain, and enter it in Supabase → Authentication → SMTP Settings. Supabase's built-in sender is for testing only: a small hourly limit, a Supabase from-address, and often filed as spam.
   - Some email programs (Outlook "safe links") open links before the person does, which uses up the one-time token. If testers report "expired" on a fresh link, that's the likely cause.
   ```
