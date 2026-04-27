alter table public.stories
  add column if not exists deleted_at timestamptz;
