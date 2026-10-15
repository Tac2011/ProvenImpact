-- Applies a bio import in one transaction: adds the honors the student kept and the
-- import's story ideas, then marks it applied. All or nothing, so a failure leaves the
-- import ready to retry. The row lock means a double click applies it once.
-- Security invoker, so the athlete's own row rules still apply.
-- Run once in the Supabase SQL editor, after 2026-10-15-bio-import.sql.

create function apply_bio_import(import_id uuid, honors jsonb)
returns void
language plpgsql security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  imp bio_imports%rowtype;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select * into imp from bio_imports
    where id = import_id and athlete_id = uid
    for update;
  if not found then
    raise exception 'Bio import not found';
  end if;
  if imp.applied_at is not null then
    return;
  end if;

  insert into athlete_honors (athlete_id, title, years, source)
    select uid, h->>'title', nullif(h->>'years', ''), 'bio'
    from jsonb_array_elements(coalesce(honors, '[]'::jsonb)) as h;

  insert into story_ideas (athlete_id, bio_import_id, prompt, source)
    select uid, import_id, i->>'prompt', i->>'source'
    from jsonb_array_elements(coalesce(imp.extracted->'ideas', '[]'::jsonb)) as i;

  update bio_imports set applied_at = now() where id = import_id;
end;
$$;

revoke execute on function apply_bio_import(uuid, jsonb) from public, anon;
grant execute on function apply_bio_import(uuid, jsonb) to authenticated;
