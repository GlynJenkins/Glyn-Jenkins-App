-- UK/Irish citizen no-passport declaration at enrolment
-- Run in Supabase SQL Editor.

alter table public.workers
  add column if not exists right_to_work_citizen_declared boolean not null default false;
