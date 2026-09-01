-- Right to Work capture & verification
-- Run in Supabase SQL Editor.

alter table public.workers
  add column if not exists right_to_work_method text;

alter table public.workers
  drop constraint if exists workers_right_to_work_method_check;

alter table public.workers
  add constraint workers_right_to_work_method_check
  check (
    right_to_work_method is null
    or right_to_work_method in ('passport', 'share_code', 'no_passport_manual')
  );

alter table public.workers
  add column if not exists right_to_work_document_url text;

alter table public.workers
  add column if not exists right_to_work_share_code text;

alter table public.workers
  add column if not exists right_to_work_status text;

update public.workers
set right_to_work_status = 'pending'
where right_to_work_status is null;

alter table public.workers
  alter column right_to_work_status set default 'pending';

alter table public.workers
  alter column right_to_work_status set not null;

alter table public.workers
  drop constraint if exists workers_right_to_work_status_check;

alter table public.workers
  add constraint workers_right_to_work_status_check
  check (right_to_work_status in ('pending', 'verified', 'follow_up'));

alter table public.workers
  add column if not exists right_to_work_verified_at timestamptz;

alter table public.workers
  add column if not exists right_to_work_verified_by text;

alter table public.workers
  add column if not exists right_to_work_note text;

alter table public.workers
  add column if not exists right_to_work_override_at timestamptz;

alter table public.workers
  add column if not exists right_to_work_override_by text;

alter table public.workers
  add column if not exists right_to_work_override_note text;
