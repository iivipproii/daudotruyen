alter table public.stories
  add column if not exists combo_price_changed_at timestamptz,
  add column if not exists combo_price_locked boolean not null default false;
