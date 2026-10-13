// Checks the education tables' rules against the real database, signed in as two test
// athletes (A and B) and an admin. Use test accounts only; the plan's Task 10 sets them up.
// A's education rows are removed at the end. Audit rows stay, which is the point of them.
// Usage: npm run education-check

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` (${detail})` : ''}`);
  if (!ok) failures += 1;
}

async function signIn(prefix: string): Promise<{ client: SupabaseClient; id: string }> {
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) {
    console.error(`Set ${prefix}_EMAIL and ${prefix}_PASSWORD in .env.local.`);
    process.exit(1);
  }
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    console.error(`Could not sign in as ${email}: ${error?.message}`);
    process.exit(1);
  }
  return { client, id: data.user.id };
}

const PROFILE = {
  first_name: 'Check',
  last_name: 'Account',
  sport: 'Golf',
  sport_type: 'individual',
  positions: null,
  disciplines: ['Stroke play'],
};

function education(collegeId: number, overrides: Record<string, unknown> = {}) {
  return {
    college_id: collegeId,
    college_other: null,
    degree_type: 'BS',
    degree_other: null,
    primary_field_code: '11.07',
    primary_field_other: null,
    secondary_field_code: null,
    secondary_field_other: null,
    start_month: 8,
    start_year: 2023,
    end_month: 5,
    end_year: 2027,
    ...overrides,
  };
}

async function main() {
  const a = await signIn('EDUCATION_CHECK_A');
  const b = await signIn('EDUCATION_CHECK_B');
  const admin = await signIn('EDUCATION_CHECK_ADMIN');

  const { data: colleges } = await a.client.from('colleges').select('id').order('id').limit(2);
  if (!colleges || colleges.length < 2) {
    console.error('No colleges found. Run supabase/reference/reference-data-v1.sql first.');
    process.exit(1);
  }
  const [firstCollege, secondCollege] = colleges.map((c) => c.id as number);

  // Start clean in case an earlier run stopped partway.
  await a.client.from('athlete_education').delete().eq('athlete_id', a.id);

  // 1. Profile and current school save together.
  const saved = await a.client.rpc('save_profile', { p: PROFILE, current_education: education(firstCollege) });
  check('save_profile saves the profile and current school', !saved.error, saved.error?.message);

  const { data: current } = await a.client
    .from('athlete_education')
    .select('*')
    .eq('athlete_id', a.id)
    .eq('is_current', true)
    .maybeSingle();
  check('the athlete can read their current school', current !== null);
  if (!current) {
    process.exit(1);
  }

  // 2. Another athlete can't see or change it.
  const bRead = await b.client.from('athlete_education').select('id').eq('id', current.id);
  check('another athlete cannot read it', (bRead.data ?? []).length === 0);
  const bUpdate = await b.client.from('athlete_education').update({ start_year: 2020 }).eq('id', current.id).select('id');
  check('another athlete cannot change it', (bUpdate.data ?? []).length === 0);
  const bDelete = await b.client.from('athlete_education').delete().eq('id', current.id).select('id');
  check('another athlete cannot delete it', (bDelete.data ?? []).length === 0);

  // 3. The audit trail is write-protected.
  const historyInsert = await a.client
    .from('athlete_education_history')
    .insert({ education_id: current.id, athlete_id: a.id, action: 'insert' });
  check('an athlete cannot write to the audit trail', historyInsert.error !== null);
  const historyRead = await a.client.from('athlete_education_history').select('id').eq('athlete_id', a.id);
  check('an athlete cannot read the audit trail', (historyRead.data ?? []).length === 0);
  const adminUpdate = await admin.client
    .from('athlete_education_history')
    .update({ action: 'delete' })
    .eq('education_id', current.id)
    .select('id');
  check('an admin cannot change audit rows', (adminUpdate.data ?? []).length === 0);
  const adminDelete = await admin.client
    .from('athlete_education_history')
    .delete()
    .eq('education_id', current.id)
    .select('id');
  check('an admin cannot delete audit rows', (adminDelete.data ?? []).length === 0);

  // 4. An edit (recorded below).
  const edit = await a.client.from('athlete_education').update({ start_year: 2022 }).eq('id', current.id);
  check('the athlete can edit their school', !edit.error, edit.error?.message);

  // 5. Rules.
  const secondCurrent = await a.client
    .from('athlete_education')
    .insert({ ...education(secondCollege), athlete_id: a.id, is_current: true });
  check('a second current school is rejected', secondCurrent.error !== null);
  const noSchool = await a.client
    .from('athlete_education')
    .insert({ ...education(firstCollege), college_id: null, athlete_id: a.id });
  check('a school with no college is rejected', noSchool.error !== null);
  const blankSchool = await a.client
    .from('athlete_education')
    .insert({ ...education(firstCollege), college_id: null, college_other: '   ', athlete_id: a.id });
  check('a blank "not listed" school is rejected', blankSchool.error !== null);
  const backwards = await a.client
    .from('athlete_education')
    .insert({ ...education(firstCollege, { start_year: 2027, end_year: 2023 }), athlete_id: a.id });
  check('an end before the start is rejected', backwards.error !== null);
  const currentNoDegree = await a.client.rpc('save_profile', {
    p: PROFILE,
    current_education: education(firstCollege, { degree_type: 'NONE' }),
  });
  check('"No degree" on the current school is rejected', currentNoDegree.error !== null);

  // 6. Transfer: the old school becomes previous and the new one is current, together.
  const moved = await a.client.rpc('save_profile', {
    p: PROFILE,
    current_education: education(secondCollege, { degree_type: 'BA', start_year: 2025 }),
    transfer: { end_month: 5, end_year: 2025 },
  });
  check('save_profile with a transfer succeeds', !moved.error, moved.error?.message);
  const { data: afterTransfer } = await a.client.from('athlete_education').select('*').eq('athlete_id', a.id);
  const old = afterTransfer?.find((r) => r.id === current.id);
  const now = afterTransfer?.find((r) => r.is_current);
  check(
    'the old school is now previous, ending May 2025',
    old?.is_current === false && old?.end_month === 5 && old?.end_year === 2025
  );
  check('the new school is current', now?.college_id === secondCollege && now?.id !== current.id);

  // 7. Remove the previous school (recorded below).
  const removed = await a.client.from('athlete_education').delete().eq('id', current.id);
  check('the athlete can remove a previous school', !removed.error, removed.error?.message);

  // 8. The audit trail recorded insert, edit, transfer, and delete for that school.
  const { data: history } = await admin.client
    .from('athlete_education_history')
    .select('*')
    .eq('education_id', current.id)
    .order('id');
  const actions = (history ?? []).map((h) => h.action);
  check(
    'every change left an audit row',
    JSON.stringify(actions) === JSON.stringify(['insert', 'update', 'update', 'delete']),
    `got ${JSON.stringify(actions)}`
  );
  const editRow = history?.[1];
  check(
    'the edit row shows who, before, and after',
    editRow?.changed_by === a.id && editRow?.old_row?.start_year === 2023 && editRow?.new_row?.start_year === 2022
  );
  const deleteRow = history?.[3];
  check('the delete row keeps the removed values', deleteRow?.old_row !== null && deleteRow?.new_row === null);

  // Clean up A's rows.
  await a.client.from('athlete_education').delete().eq('athlete_id', a.id);

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
