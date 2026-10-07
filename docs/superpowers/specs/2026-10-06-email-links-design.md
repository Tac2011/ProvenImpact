# Proven Impact: Email Confirmation and Forgot Password Design

**Date:** 2026-10-06
**Status:** Draft, awaiting Todd's review

## Purpose

Before real athletes are invited, new accounts must confirm their email, and
anyone must be able to reset a forgotten password without an admin editing
the database. Today "Confirm email" is off in Supabase because the app has
nowhere for the email link to land, and a password reset means updating
`auth.users` by hand.

Decided with Todd during brainstorming:

| Question | Decision |
|---|---|
| Timing | Build now. Leave "Confirm email" off until after the investor demo, so adding demo athletes stays quick. |
| Who sends the email | Supabase's built-in sender for now. It's for testing: a small hourly limit, a Supabase from-address, often filed as spam. A domain and an email service go on the go-live checklist once the company name is settled. Switching senders later is a Supabase setting, not code. |
| How the link signs someone in | A one-time token in the link (`token_hash`), checked by our own `/auth/confirm` route with `verifyOtp`. Works when the email is opened on a different device or browser from where the person started. Needs two Supabase email templates edited. |
| Screens | As below, approved by Todd. |

## Screens

All pages use the existing Log in page's plain style: `mx-auto flex max-w-sm flex-col gap-4 p-8`, `text-2xl font-bold` heading, bordered inputs, blue button.

### 1. Sign up

- `/signup` is unchanged except the message shown when Supabase returns no session (confirmation on):
  *"We sent a link to {email}. Click it to finish creating your account. If it isn't in your inbox in a few minutes, check spam."*
- While "Confirm email" is off, Supabase returns a session and sign-up goes straight to the profile, as today.
- The email link signs the person in and lands them where a normal login does: `/admin` for Platform Admins, `/profile` for everyone else.

### 2. Logging in before confirming

- When `signInWithPassword` fails with error code `email_not_confirmed`, `/login` shows, instead of Supabase's message:
  *"Please confirm your email first. We sent you a link when you signed up."*
  and a **Resend confirmation email** button.
- The button resends the sign-up email for the address in the email field. On success: *"Sent. Check your inbox and spam."* On failure: *"Couldn't send the email. Try again in a few minutes."*
- Other login errors show Supabase's message, as today.

### 3. Forgot password

- `/login` gets a **Forgot password?** link under the password field, to `/forgot-password`.
- `/forgot-password`: heading "Reset your password", an Email field, a **Send reset link** button, and a "Back to log in" link.
  - On success, always: *"If an account exists for that email, we sent a reset link."* It never says whether the email has an account.
  - On failure (for example the hourly email limit): *"Couldn't send the email. Try again in a few minutes."* The form stays usable.
- The email link signs the person in and opens `/reset-password`.
- `/reset-password`: heading "Set a new password", **New password** and **Confirm new password** fields (minimum 6 characters, matching sign-up), and a **Save password** button.
  - The two fields must match: *"The passwords don't match."*
  - Shorter than 6: *"Use at least 6 characters."*
  - Supabase errors (for example a new password equal to the old one) show Supabase's message.
  - On success: *"Password updated."*, then after about 1.5 seconds it goes to `/admin` or `/profile` by role.

### 4. Bad links

- An expired, already used, or broken link sends the person to `/login?error=link`, which shows a yellow note above the form:
  *"That link has expired or was already used. Log in below, or use Forgot password? to get a new one."*
- Someone who never confirmed can then log in, see flow 2, and resend.

### Access rules

- Signed-out visitors can reach `/`, `/login`, `/signup`, `/forgot-password`, and `/auth/confirm`.
- Signed-in visitors to `/login`, `/signup`, or `/forgot-password` are sent home by role, as `/login` and `/signup` are today.
- `/auth/confirm` is never redirected by the proxy, signed in or not, so a link always gets checked.
- `/reset-password` needs a signed-in user; signed-out visitors go to `/login` like any other private page.
- Archived (approved deletion) accounts that confirm or reset are sent to `/account-locked` by the existing proxy rule.

## How the Link Works

1. The app asks Supabase to send an email and passes `{origin}/auth/confirm` as the redirect address, where `origin` is `window.location.origin`. This makes links from `localhost:3000` come back to `localhost:3000`, and links from the live site come back to the live site.
   - Sign up: `signUp({ email, password, options: { emailRedirectTo } })`
   - Resend: `resend({ type: 'signup', email, options: { emailRedirectTo } })`
   - Forgot password: `resetPasswordForEmail(email, { redirectTo })`
2. The edited email templates build the link from that address: `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email` (sign up) or `&type=recovery` (reset).
3. `GET /auth/confirm` reads `token_hash` and `type`, and calls `supabase.auth.verifyOtp({ type, token_hash })` with the server Supabase client, which sets the session cookies.
4. On success it redirects: `type=recovery` to `/reset-password`; anything else to `/admin` or `/profile` by role. There is no `next` parameter, so the link can't be used to send someone to another site.
5. On a missing parameter, an unknown `type`, or a `verifyOtp` error, it redirects to `/login?error=link`.

Accepted `type` values: `email` and `recovery`. Anything else is a bad link.

## Supabase Dashboard Setup (Todd)

Done once, in the Supabase dashboard for project Proven Impact. The plan gives the exact text to paste.

1. **Authentication → URL Configuration:**
   - Site URL: `https://proven-impact.vercel.app`
   - Redirect URLs: add `http://localhost:3000/auth/confirm` and `https://proven-impact.vercel.app/auth/confirm`.
   If an address isn't on this list, Supabase falls back to the Site URL and the link lands on the home page without signing anyone in, so both are needed.
2. **Authentication → Email Templates:**
   - "Confirm signup": link `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`
   - "Reset password": link `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`
3. **After the demo, before inviting real athletes:** Authentication → Sign In / Providers → turn **Confirm email** on.

Existing accounts were created while confirmation was off and are already marked confirmed, so turning it on doesn't lock anyone out.

## Code Structure

| File | Change |
|---|---|
| `src/lib/authLinks.ts` | New. Pure functions: `isPublicPath(pathname)`, `isAuthPage(pathname)` (moved out of the proxy so they can be tested), `parseConfirmType(value)` returning `'email' \| 'recovery' \| null`, `destinationAfterConfirm(type, role)`, `newPasswordError(password, confirm)`, and `homeForRole(role)`. |
| `src/lib/authLinks.test.ts` | New. Unit tests for the above. |
| `src/proxy.ts` | Uses `isPublicPath` and `isAuthPage`. `/auth/confirm` is public and skips the signed-in redirects. |
| `src/app/auth/confirm/route.ts` | New. The GET route described above. |
| `src/app/login/page.tsx` | Becomes a server component that reads `searchParams.error` and renders `LoginForm`. |
| `src/app/login/LoginForm.tsx` | New. Today's login form, moved, plus the bad-link note, the not-confirmed message with Resend, and the Forgot password? link. |
| `src/app/signup/page.tsx` | Passes `emailRedirectTo`; new check-your-email message. |
| `src/app/forgot-password/page.tsx` | New. Client page. |
| `src/app/reset-password/page.tsx` | New. Client page using `supabase.auth.updateUser({ password })`. |

`homeForRole` replaces the repeated `role === 'platform_admin' ? '/admin' : '/profile'` in the new code; existing callers are left alone.

## Testing

- **Unit (Vitest), `authLinks.test.ts`:**
  - `isPublicPath`: `/`, `/login`, `/signup`, `/forgot-password`, `/auth/confirm` are public; `/reset-password`, `/profile`, `/admin`, `/loginx` are not.
  - `isAuthPage`: `/login`, `/signup`, `/forgot-password` yes; `/auth/confirm`, `/reset-password`, `/` no.
  - `parseConfirmType`: `email` and `recovery` accepted; `signup`, `magiclink`, empty, and missing rejected.
  - `destinationAfterConfirm`: recovery goes to `/reset-password` for any role; email goes to `/admin` for Platform Admins and `/profile` for others.
  - `newPasswordError`: mismatch, too short, and valid.
- **Manual, with Confirm email still off (before the demo):**
  1. Forgot password on localhost: the email arrives, the link opens Set a new password, the new password works at Log in.
  2. Open a reset link a second time: `/login` shows the bad-link note.
  3. Forgot password for an email with no account: the same neutral message.
  4. Open `/reset-password` signed out: sent to `/login`.
  5. Sign up still goes straight to the profile.
- **Manual, after the demo, with Confirm email on:**
  6. Sign up with a new `+` address: the check-your-email message shows; the link signs in and lands on `/profile`.
  7. Log in before clicking the link: the not-confirmed message and Resend work.
  8. Open the sign-up link on a phone: it works on a different device.

## Out of Scope

- A custom domain and email service, and branded email design. Go-live checklist.
- A "change password" link for signed-in users. `/reset-password` works while signed in, but nothing links to it except the reset email.
- Changing the email address on an account.
- Magic-link (passwordless) login.
