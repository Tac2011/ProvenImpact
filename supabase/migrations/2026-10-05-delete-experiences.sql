-- Let athletes permanently delete their own experiences.
-- Evidence rows go with them (on delete cascade). The run log is untouched,
-- so deleting never gives back runs already used. Run once in the Supabase SQL editor.

create policy "Athletes can delete own experiences"
  on experiences for delete
  using (auth.uid() = athlete_id);
