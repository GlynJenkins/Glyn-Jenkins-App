-- QA snag & re-inspection loop (Task 1)
-- Run in Supabase SQL Editor.

alter table public.qa_plot_inspections
  add column if not exists inspection_state text not null default 'passed';

alter table public.qa_plot_inspections
  drop constraint if exists qa_plot_inspections_inspection_state_check;

alter table public.qa_plot_inspections
  add constraint qa_plot_inspections_inspection_state_check
  check (inspection_state in ('passed', 'failed_open', 'awaiting_reinspection'));

update public.qa_plot_inspections
set inspection_state = case
  when coalesce(form_data->>'result', 'Pass') = 'Fail' then 'failed_open'
  else 'passed'
end
where status = 'completed';

create table if not exists public.qa_inspection_snags (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.qa_plot_inspections(id) on delete cascade,
  round int not null default 1,
  description text not null,
  raised_photo_path text,
  fixed boolean not null default false,
  fixed_at timestamptz,
  fixed_photo_path text,
  fixed_note text,
  fixed_by uuid references public.workers(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_qa_snags_inspection
  on public.qa_inspection_snags (inspection_id);

create index if not exists idx_qa_snags_open
  on public.qa_inspection_snags (inspection_id)
  where fixed = false;

alter table public.qa_inspection_snags enable row level security;
alter table public.qa_inspection_snags force row level security;
