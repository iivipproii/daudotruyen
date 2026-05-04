alter table public.stories
  add column if not exists home_trending boolean not null default false,
  add column if not exists home_trending_order numeric not null default 0;

create index if not exists idx_stories_home_trending_order
  on public.stories (home_trending, home_trending_order)
  where home_trending = true;
