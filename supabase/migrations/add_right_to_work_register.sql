-- Right to Work register: follow-up dates + permanent check log
-- Run in Supabase SQL Editor.

alter table public.workers
  add column if not exists right_to_work_type text;

alter table public.workers
  drop constraint if exists workers_right_to_work_type_check;

alter table public.workers
  add constraint workers_right_to_work_type_check
  check (
    right_to_work_type is null
    or right_to_work_type in ('continuous', 'time_limited')
  );

alter table public.workers
  add column if not exists right_to_work_expiry date;

create table if not exists public.right_to_work_checks (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  checked_by text not null,
  checked_at timestamptz not null default now(),
  method text,
  outcome text not null,
  note text,
  document_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rtw_checks_worker
  on public.right_to_work_checks (worker_id);

alter table public.right_to_work_checks enable row level security;
alter table public.right_to_work_checks force row level security;
