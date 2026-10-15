-- Let athletes save an experience to finish later. in_progress experiences haven't
-- been sent to Claude; blank answers are stored as empty text, so no columns change.
-- Run once in the Supabase SQL editor.

alter table experiences drop constraint experiences_status_check;

alter table experiences add constraint experiences_status_check
  check (status in ('in_progress', 'draft', 'needs_followup', 'mapped', 'failed', 'confirmed'));
