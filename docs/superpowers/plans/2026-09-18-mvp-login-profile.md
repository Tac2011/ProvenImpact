# MVP Login + Athlete Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Proven Impact MVP — an athlete can sign up, log in, and create/edit a profile (name, college, sport, degree, and either team positions or individual-sport disciplines).

**Architecture:** Single Next.js (App Router, TypeScript) app deployed to Vercel. Supabase provides Postgres (the already-created `profiles` table with row-level security), email/password auth, and is accessed via `@supabase/ssr` browser/server clients. Middleware protects all routes except `/login` and `/signup`.

**Tech Stack:** Next.js 15 (App Router, TypeScript, Tailwind CSS), `@supabase/ssr` + `@supabase/supabase-js`, Vitest for unit tests, npm, Vercel hosting.

**Spec:** `docs/superpowers/specs/2026-09-18-mvp-login-profile-design.md`

## Global Constraints

- TypeScript everywhere (no `.js`/`.jsx` files) — per spec's Tech Stack section.
- Every user can only read/write their own `profiles` row — enforced by RLS policies already applied in Supabase (per spec's Data Model section); application code must never try to bypass this (e.g., no service-role key in client code).
- Required profile fields: first name, last name, college, sport, degree. Conditional: at least one position (team) or one discipline (individual) — per spec's Validation & Error Handling section.
- No resume upload, scoring, employer portal, or admin console in this phase — per spec's Purpose & Scope section.
- No e2e test infrastructure this phase; unit-test only the pure validation logic, everything else verified manually — per spec's Testing section.
- Supabase Project URL: `https://mxbzrdwkngdaoparmuzn.supabase.co`; Publishable (anon) key: `sb_publishable_pFQ63N5ocCD7uVbT4woI2g_LRUpjBnt`. Never commit these to a file that isn't already gitignored (`.env.local` only).

---

### Task 1: Scaffold the Next.js Project

**Files:**
- Create: entire Next.js project structure at `C:\development\ProvenImpact` (package.json, tsconfig.json, next.config.ts, src/app/*, public/*, etc.) via `create-next-app`
- Modify: none (this is the first code in the repo; `docs/` already exists and is preserved)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a running Next.js dev server on `http://localhost:3000`, `src/app/` directory for later tasks to add pages into, `public/` directory for the logo

- [ ] **Step 1: Run create-next-app in the existing repo**

Run from `C:\development\ProvenImpact`:

```bash
npx create-next-app@latest . --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm
```

If prompted for anything not covered by these flags (e.g. Turbopack), accept the default by pressing Enter. `create-next-app` detects the existing `.git` repo and will NOT re-initialize git or complain about the existing `docs/` folder (it's on its allowed-files list).

- [ ] **Step 2: Verify the dev server boots**

Run:
```bash
npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```
Expected: `200`. Then stop the dev server (`kill %1` or equivalent).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js app with TypeScript and Tailwind"
```

---

### Task 2: Supabase Clients and Environment Config

**Files:**
- Create: `.env.local` (gitignored — real credentials)
- Create: `.env.local.example` (committed — placeholder values)
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Modify: none

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars
- Produces: `createClient()` from `@/lib/supabase/client` (browser, for Client Components) and `createClient()` from `@/lib/supabase/server` (async, for Server Components) — both later tasks import one or the other by path, not by name collision, since they live in different files

- [ ] **Step 1: Install Supabase packages**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Confirm `.env.local` is gitignored**

Check `.gitignore` (created by `create-next-app`) contains a line matching `.env*.local`. It does by default — no edit needed. If it's missing, add the line `.env*.local` to `.gitignore`.

- [ ] **Step 3: Create the real env file**

Create `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://mxbzrdwkngdaoparmuzn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_pFQ63N5ocCD7uVbT4woI2g_LRUpjBnt
```

- [ ] **Step 4: Create the example env file**

Create `.env.local.example`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
```

- [ ] **Step 5: Create the browser client**

Create `src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 6: Create the server client**

Create `src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render; middleware refreshes the session instead.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 7: Verify the project still builds**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add .env.local.example .gitignore src/lib/supabase package.json package-lock.json
git commit -m "Add Supabase browser/server clients and env config"
```

---

### Task 3: Session Middleware (Route Protection)

**Files:**
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars (Task 2)
- Produces: automatic redirect behavior — unauthenticated users are sent to `/login` for any route other than `/login`/`/signup`; authenticated users hitting `/login` or `/signup` are sent to `/profile`. Later page tasks (signup, login, profile) rely on this: they don't need to duplicate the "redirect if wrong auth state" check for the unauthenticated case, only the profile page double-checks (belt-and-suspenders, Task 7).

- [ ] **Step 1: Create the middleware**

Create `src/middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup');

  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/profile';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "Add auth middleware to protect routes"
```

---

### Task 4: Profile Validation Logic (TDD)

**Files:**
- Create: `src/lib/validateProfile.ts`
- Test: `src/lib/validateProfile.test.ts`
- Modify: `package.json` (add `vitest`, add `test` script), create `vitest.config.ts`

**Interfaces:**
- Consumes: nothing (pure function, no Supabase/React dependency)
- Produces: `validateProfile(values: ProfileFormValues): ValidationResult`, and the types `ProfileFormValues`, `SportType`, `ValidationResult` — Task 7's `ProfileForm` imports all of these from `@/lib/validateProfile`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run"
```

- [ ] **Step 3: Create the Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `src/lib/validateProfile.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { validateProfile, type ProfileFormValues } from './validateProfile';

function baseValues(overrides: Partial<ProfileFormValues> = {}): ProfileFormValues {
  return {
    firstName: 'Jordan',
    lastName: 'Smith',
    college: 'State University',
    sport: 'Soccer',
    sportType: 'team',
    degree: 'B.S. Kinesiology',
    positions: ['Midfielder'],
    disciplines: [],
    ...overrides,
  };
}

describe('validateProfile', () => {
  it('passes with valid team-sport values', () => {
    const result = validateProfile(baseValues());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('passes with valid individual-sport values', () => {
    const result = validateProfile(
      baseValues({ sportType: 'individual', positions: [], disciplines: ['Long Jump'] })
    );
    expect(result.valid).toBe(true);
  });

  it('requires first name', () => {
    const result = validateProfile(baseValues({ firstName: '  ' }));
    expect(result.valid).toBe(false);
    expect(result.errors.firstName).toBeDefined();
  });

  it('requires a sport type to be selected', () => {
    const result = validateProfile(baseValues({ sportType: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.sportType).toBeDefined();
  });

  it('requires at least one position when sport type is team', () => {
    const result = validateProfile(baseValues({ positions: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.positions).toBeDefined();
  });

  it('requires at least one discipline when sport type is individual', () => {
    const result = validateProfile(
      baseValues({ sportType: 'individual', positions: [], disciplines: [] })
    );
    expect(result.valid).toBe(false);
    expect(result.errors.disciplines).toBeDefined();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/lib/validateProfile.ts` does not exist yet.

- [ ] **Step 6: Implement the validation function**

Create `src/lib/validateProfile.ts`:
```ts
export type SportType = 'team' | 'individual' | '';

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  college: string;
  sport: string;
  sportType: SportType;
  degree: string;
  positions: string[];
  disciplines: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof ProfileFormValues, string>>;
}

export function validateProfile(values: ProfileFormValues): ValidationResult {
  const errors: ValidationResult['errors'] = {};

  if (!values.firstName.trim()) errors.firstName = 'First name is required';
  if (!values.lastName.trim()) errors.lastName = 'Last name is required';
  if (!values.college.trim()) errors.college = 'College is required';
  if (!values.sport.trim()) errors.sport = 'Sport is required';
  if (!values.degree.trim()) errors.degree = 'Degree is required';

  if (values.sportType !== 'team' && values.sportType !== 'individual') {
    errors.sportType = 'Select a sport type';
  } else if (values.sportType === 'team' && values.positions.length === 0) {
    errors.positions = 'Add at least one position';
  } else if (values.sportType === 'individual' && values.disciplines.length === 0) {
    errors.disciplines = 'Add at least one discipline';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: all 6 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/validateProfile.ts src/lib/validateProfile.test.ts vitest.config.ts package.json package-lock.json
git commit -m "Add profile validation logic with tests"
```

---

### Task 5: Signup Page

**Files:**
- Create: `src/app/signup/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/client` (Task 2)
- Produces: `/signup` route. No exports consumed by later tasks.

- [ ] **Step 1: Create the signup page**

Create `src/app/signup/page.tsx`:
```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (data.session) {
      router.push('/profile');
      router.refresh();
    } else {
      setInfo('Check your email to confirm your account, then log in.');
    }
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Create your account</h1>
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
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-blue-700">{info}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Sign up'}
        </button>
      </form>
      <p className="text-sm">
        Already have an account?{' '}
        <a href="/login" className="underline">
          Log in
        </a>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/signup
git commit -m "Add signup page"
```

---

### Task 6: Login Page

**Files:**
- Create: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/client` (Task 2)
- Produces: `/login` route. No exports consumed by later tasks.

- [ ] **Step 1: Create the login page**

Create `src/app/login/page.tsx`:
```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push('/profile');
    router.refresh();
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Log in</h1>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
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

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/login
git commit -m "Add login page"
```

---

### Task 7: Profile Page and Form

**Files:**
- Create: `src/app/profile/page.tsx`
- Create: `src/app/profile/ProfileForm.tsx`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/server` (Task 2, server-side fetch), `createClient()` from `@/lib/supabase/client` (Task 2, client-side save), `validateProfile`/`ProfileFormValues`/`SportType` from `@/lib/validateProfile` (Task 4)
- Produces: `/profile` route with a working create/edit form backed by the `profiles` table

- [ ] **Step 1: Create the profile page (server component)**

Create `src/app/profile/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ProfileForm } from './ProfileForm';

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-bold">Your Profile</h1>
      <ProfileForm userId={user.id} initialProfile={profile} />
    </main>
  );
}
```

- [ ] **Step 2: Create the profile form (client component)**

Create `src/app/profile/ProfileForm.tsx`:
```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { validateProfile, type ProfileFormValues, type SportType } from '@/lib/validateProfile';

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  college: string;
  sport: string;
  sport_type: SportType;
  degree: string;
  positions: string[] | null;
  disciplines: string[] | null;
}

function toFormValues(profile: ProfileRow | null): ProfileFormValues {
  if (!profile) {
    return {
      firstName: '',
      lastName: '',
      college: '',
      sport: '',
      sportType: '',
      degree: '',
      positions: [],
      disciplines: [],
    };
  }

  return {
    firstName: profile.first_name,
    lastName: profile.last_name,
    college: profile.college,
    sport: profile.sport,
    sportType: profile.sport_type,
    degree: profile.degree,
    positions: profile.positions ?? [],
    disciplines: profile.disciplines ?? [],
  };
}

function splitTags(text: string): string[] {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function ProfileForm({
  userId,
  initialProfile,
}: {
  userId: string;
  initialProfile: ProfileRow | null;
}) {
  const router = useRouter();
  const initialValues = toFormValues(initialProfile);
  const [values, setValues] = useState<ProfileFormValues>(initialValues);
  const [positionsText, setPositionsText] = useState(initialValues.positions.join(', '));
  const [disciplinesText, setDisciplinesText] = useState(initialValues.disciplines.join(', '));
  const [errors, setErrors] = useState<ReturnType<typeof validateProfile>['errors']>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);

    const positions = splitTags(positionsText);
    const disciplines = splitTags(disciplinesText);
    const nextValues: ProfileFormValues = { ...values, positions, disciplines };

    const result = validateProfile(nextValues);
    setErrors(result.errors);

    if (!result.valid) {
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      first_name: nextValues.firstName,
      last_name: nextValues.lastName,
      college: nextValues.college,
      sport: nextValues.sport,
      sport_type: nextValues.sportType,
      degree: nextValues.degree,
      positions: nextValues.sportType === 'team' ? positions : null,
      disciplines: nextValues.sportType === 'individual' ? disciplines : null,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);

    if (error) {
      setErrors({ ...result.errors, firstName: error.message });
      return;
    }

    setValues(nextValues);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        First Name
        <input
          value={values.firstName}
          onChange={(e) => setValues({ ...values, firstName: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {errors.firstName && <span className="text-sm text-red-600">{errors.firstName}</span>}
      </label>

      <label className="flex flex-col gap-1">
        Last Name
        <input
          value={values.lastName}
          onChange={(e) => setValues({ ...values, lastName: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {errors.lastName && <span className="text-sm text-red-600">{errors.lastName}</span>}
      </label>

      <label className="flex flex-col gap-1">
        College
        <input
          value={values.college}
          onChange={(e) => setValues({ ...values, college: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {errors.college && <span className="text-sm text-red-600">{errors.college}</span>}
      </label>

      <label className="flex flex-col gap-1">
        Degree
        <input
          value={values.degree}
          onChange={(e) => setValues({ ...values, degree: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {errors.degree && <span className="text-sm text-red-600">{errors.degree}</span>}
      </label>

      <label className="flex flex-col gap-1">
        Sport
        <input
          value={values.sport}
          onChange={(e) => setValues({ ...values, sport: e.target.value })}
          className="rounded border px-3 py-2"
        />
        {errors.sport && <span className="text-sm text-red-600">{errors.sport}</span>}
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend>Sport Type</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="sportType"
            checked={values.sportType === 'team'}
            onChange={() => setValues({ ...values, sportType: 'team' })}
          />
          Team
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="sportType"
            checked={values.sportType === 'individual'}
            onChange={() => setValues({ ...values, sportType: 'individual' })}
          />
          Individual
        </label>
        {errors.sportType && <span className="text-sm text-red-600">{errors.sportType}</span>}
      </fieldset>

      {values.sportType === 'team' && (
        <label className="flex flex-col gap-1">
          Positions (comma-separated)
          <input
            value={positionsText}
            onChange={(e) => setPositionsText(e.target.value)}
            placeholder="e.g. Midfielder, Defender"
            className="rounded border px-3 py-2"
          />
          {errors.positions && <span className="text-sm text-red-600">{errors.positions}</span>}
        </label>
      )}

      {values.sportType === 'individual' && (
        <label className="flex flex-col gap-1">
          Disciplines (comma-separated)
          <input
            value={disciplinesText}
            onChange={(e) => setDisciplinesText(e.target.value)}
            placeholder="e.g. Long Jump, 100m Dash"
            className="rounded border px-3 py-2"
          />
          {errors.disciplines && (
            <span className="text-sm text-red-600">{errors.disciplines}</span>
          )}
        </label>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
      {saved && <p className="text-sm text-green-700">Profile saved.</p>}
    </form>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/profile
git commit -m "Add profile page and form"
```

---

### Task 8: Header with Logo, Logout, and Root Redirect

**Files:**
- Create: `src/components/Header.tsx`
- Create: `src/components/LogoutButton.tsx`
- Create: `public/ProvenImpact.png` (copy from `C:\development\Claude Code\Proven\ProvenImpact.png`)
- Modify: `src/app/layout.tsx` (render `Header`)
- Modify: `src/app/page.tsx` (redirect to `/profile`)

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/server` (Task 2, in `Header`), `createClient()` from `@/lib/supabase/client` (Task 2, in `LogoutButton`)
- Produces: nothing consumed by later tasks (this is the last UI task)

- [ ] **Step 1: Copy the logo into the project**

```bash
cp "C:/development/Claude Code/Proven/ProvenImpact.png" "C:/development/ProvenImpact/public/ProvenImpact.png"
```

- [ ] **Step 2: Create the logout button**

Create `src/components/LogoutButton.tsx`:
```tsx
'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button onClick={handleLogout} className="text-sm underline">
      Log out
    </button>
  );
}
```

- [ ] **Step 3: Create the header**

Create `src/components/Header.tsx`:
```tsx
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
```

- [ ] **Step 4: Wire the header into the root layout**

Open `src/app/layout.tsx` (generated by `create-next-app`). Replace its contents with:
```tsx
import type { Metadata } from 'next';
import './globals.css';
import { Header } from '@/components/Header';

export const metadata: Metadata = {
  title: 'Proven Impact',
  description: 'Turning athletic performance into workforce competency.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Make the root page redirect**

Replace the contents of `src/app/page.tsx` (generated by `create-next-app`) with:
```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/profile');
}
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components src/app/layout.tsx src/app/page.tsx public/ProvenImpact.png
git commit -m "Add header with logo/logout and root redirect"
```

---

### Task 9: Manual End-to-End Verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: the full app from Tasks 1-8
- Produces: confirmation the MVP works end to end

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Walk through the flow in a browser**

Visit `http://localhost:3000`:
1. Should redirect to `/login` (no session yet)
2. Click "Sign up", create an account with a real email + password
3. If Supabase email confirmation is on, you'll see "Check your email..." — confirm via the email link, then log in at `/login`. If it's off, you'll land on `/profile` immediately.
4. On `/profile`, fill in First/Last Name, College, Degree, Sport, pick "Team" and enter Positions (or "Individual" and enter Disciplines)
5. Click "Save Profile" — expect "Profile saved."
6. Refresh the page — the saved values should still be there (confirms the Supabase round-trip and RLS policy both work for your own row)
7. Click "Log out" — should return to `/login`
8. Try visiting `/profile` directly while logged out — should redirect to `/login` (confirms middleware protection)

- [ ] **Step 3: Run the automated test suite one more time**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 4: Push to GitHub**

If you haven't yet created the GitHub repo, do that now (Todd — this is the step where I'll walk you through `git remote add` / `git push` interactively rather than scripting it, since it needs your GitHub authentication).

```bash
git remote add origin <your-repo-url>
git push -u origin master
```

- [ ] **Step 5: Deploy to Vercel**

Import the GitHub repo in the Vercel dashboard, add the two environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) in the Vercel project settings, and deploy. Re-run the Step 2 walkthrough against the deployed URL.
