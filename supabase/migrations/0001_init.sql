create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  canvas_uid text,
  title text not null check (length(trim(title)) > 0),
  description text,
  due_date date,
  due_time text,
  category text not null default 'classes' check (category in ('classes', 'orgs', 'social')),
  course_code text,
  is_pinned boolean not null default false,
  is_completed boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'ical')),
  kind text not null default 'task' check (kind in ('task', 'event')),
  end_time text,
  series_id uuid,
  recurrence_rule text,
  series_until date,
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_end_time_event_only check (end_time is null or kind = 'event'),
  constraint tasks_events_not_completed check (kind <> 'event' or is_completed = false)
);

comment on column public.tasks.due_time is
  'Due time for tasks and start time for events, stored as app-local display text.';

create unique index if not exists tasks_canvas_uid_idx on public.tasks (canvas_uid);
create index if not exists tasks_due_date_idx on public.tasks (due_date);
create index if not exists tasks_category_idx on public.tasks (category);
create index if not exists tasks_series_id_idx on public.tasks (series_id);
create index if not exists tasks_import_batch_id_idx on public.tasks (import_batch_id);
create index if not exists tasks_dashboard_idx
  on public.tasks (category, kind, is_completed, due_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

-- This makes the table fully readable and writable by anyone holding the publishable key.
-- That is acceptable only for this single-tenant app without auth; replace it with
-- user-scoped policies before adding authentication.
drop policy if exists "tasks_all_access" on public.tasks;
drop policy if exists "public_full_access" on public.tasks;
create policy "public_full_access"
on public.tasks
for all
to anon, authenticated
using (true)
with check (true);
