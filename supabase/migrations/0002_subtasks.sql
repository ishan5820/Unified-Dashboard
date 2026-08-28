alter table public.tasks
add column if not exists subtasks jsonb not null default '[]'::jsonb;

alter table public.tasks
add column if not exists location text;

alter table public.tasks
add constraint tasks_subtasks_array
check (jsonb_typeof(subtasks) = 'array');

comment on column public.tasks.subtasks is
  'Ordered checklist items stored with their parent task.';

comment on column public.tasks.location is
  'Optional human-readable place for an event or task.';
