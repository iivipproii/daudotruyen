begin;

create table if not exists public.users (
  id text primary key,
  email text not null unique,
  password_hash text,
  salt text,
  role text not null default 'user' check (role in ('reader', 'user', 'author', 'admin')),
  status text not null default 'active' check (status in ('active', 'locked', 'deactivated')),
  seeds numeric not null default 0,
  token_version integer not null default 0,
  name text,
  avatar_url text,
  cover text,
  phone text,
  birthday text,
  gender text,
  address text,
  website text,
  bio text,
  social_links jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  notification_preferences jsonb not null default '{}'::jsonb,
  note text,
  sessions_revoked_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.stories (
  id text primary key,
  slug text not null unique,
  title text not null,
  author text,
  owner_id text references public.users(id) on delete set null,
  description text,
  cover_url text,
  cover_path text,
  status text,
  approval_status text not null default 'draft' check (approval_status in ('draft', 'pending', 'approved', 'rejected')),
  hidden boolean not null default false,
  rejection_reason text,
  premium boolean not null default false,
  price numeric not null default 0,
  views numeric not null default 0,
  follows numeric not null default 0,
  rating numeric not null default 0,
  translator text,
  language text,
  age_rating text,
  chapter_count_estimate numeric not null default 0,
  short_description text,
  cover_position text,
  featured boolean not null default false,
  hot boolean not null default false,
  recommended boolean not null default false,
  banner boolean not null default false,
  type text,
  chapter_price numeric not null default 0,
  vip_from_chapter numeric not null default 0,
  combo_price numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.chapters (
  id text primary key,
  story_id text not null references public.stories(id) on delete cascade,
  number numeric not null,
  title text not null,
  content text,
  preview text,
  is_premium boolean not null default false,
  price numeric not null default 0,
  views numeric not null default 0,
  status text not null default 'draft' check (status in ('draft', 'pending', 'reviewing', 'approved', 'published', 'rejected', 'hidden', 'scheduled')),
  scheduled_at timestamptz,
  word_count numeric not null default 0,
  rejection_reason text,
  password text,
  source_batch_id text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  unique(story_id, number)
);

create table if not exists public.bookmarks (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  story_id text not null references public.stories(id) on delete cascade,
  created_at timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb,
  unique(user_id, story_id)
);

create table if not exists public.follows (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  story_id text not null references public.stories(id) on delete cascade,
  created_at timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb,
  unique(user_id, story_id)
);

create table if not exists public.reading_progress (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  story_id text not null references public.stories(id) on delete cascade,
  chapter_id text references public.chapters(id) on delete set null,
  chapter_number numeric,
  progress_percent numeric,
  last_position numeric,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb,
  unique(user_id, story_id)
);

create table if not exists public.chapter_purchases (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  story_id text not null references public.stories(id) on delete cascade,
  chapter_id text not null references public.chapters(id) on delete cascade,
  price integer not null default 0,
  purchased_at timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb
);

create unique index if not exists chapter_purchases_user_chapter_unique
  on public.chapter_purchases(user_id, chapter_id);

create table if not exists public.user_wallets (
  user_id text primary key references public.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  locked_balance integer not null default 0 check (locked_balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_orders (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  provider text not null,
  provider_order_id text not null,
  amount_vnd integer not null default 0,
  coins integer not null check (coins > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(provider, provider_order_id),
  unique(idempotency_key)
);

create table if not exists public.coin_transactions (
  id text primary key,
  user_id text references public.users(id) on delete set null,
  story_id text references public.stories(id) on delete set null,
  chapter_id text references public.chapters(id) on delete set null,
  promotion_id text,
  package_id text,
  type text not null check (type in ('topup', 'purchase', 'refund', 'admin_adjustment', 'author_revenue', 'promotion', 'bonus', 'withdrawal', 'author_payout')),
  amount integer not null,
  balance_before integer not null default 0,
  balance_after integer not null default 0 check (balance_after >= 0),
  ref_type text,
  ref_id text,
  seeds numeric,
  price numeric,
  status text not null default 'success',
  method text,
  note text,
  created_by text references public.users(id) on delete set null,
  amount_vnd numeric,
  vnd_amount numeric,
  money numeric,
  created_at timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.comments (
  id text primary key,
  user_id text references public.users(id) on delete set null,
  story_id text not null references public.stories(id) on delete cascade,
  chapter_id text references public.chapters(id) on delete cascade,
  parent_id text references public.comments(id) on delete cascade,
  content text not null,
  status text not null default 'visible' check (status in ('visible', 'hidden', 'deleted')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.ratings (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  story_id text not null references public.stories(id) on delete cascade,
  value integer not null check (value between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  unique(user_id, story_id)
);

create table if not exists public.reports (
  id text primary key,
  user_id text references public.users(id) on delete set null,
  story_id text references public.stories(id) on delete cascade,
  chapter_id text references public.chapters(id) on delete cascade,
  comment_id text references public.comments(id) on delete cascade,
  target_type text,
  target_id text,
  type text,
  severity text,
  reason text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'rejected')),
  admin_note text,
  resolved_by text references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.notifications (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  message text not null default '',
  link text,
  read boolean not null default false,
  actor_id text references public.users(id) on delete set null,
  story_id text references public.stories(id) on delete cascade,
  chapter_id text references public.chapters(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.admin_logs (
  id text primary key,
  admin_id text references public.users(id) on delete set null,
  admin_name text,
  action text not null,
  entity_type text,
  entity_id text,
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.admin_notifications (
  id text primary key,
  title text not null,
  message text not null default '',
  type text not null default 'system',
  target_role text,
  target_user_id text,
  recipient_count numeric not null default 0,
  status text not null default 'sent',
  created_by text references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.taxonomy_categories (
  id text primary key,
  name text not null unique,
  slug text not null unique,
  description text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.taxonomy_tags (
  id text primary key,
  name text not null unique,
  slug text not null unique,
  description text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.story_categories (
  id text primary key,
  story_id text not null references public.stories(id) on delete cascade,
  category_id text not null references public.taxonomy_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(story_id, category_id)
);

create table if not exists public.story_tags (
  id text primary key,
  story_id text not null references public.stories(id) on delete cascade,
  tag_id text not null references public.taxonomy_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(story_id, tag_id)
);

create table if not exists public.promotions (
  id text primary key,
  story_id text not null references public.stories(id) on delete cascade,
  owner_id text not null references public.users(id) on delete cascade,
  package_id text not null,
  package_name text,
  cost numeric not null default 0,
  status text not null default 'active',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.view_events (
  id text primary key,
  user_id text references public.users(id) on delete set null,
  story_id text not null references public.stories(id) on delete cascade,
  chapter_id text references public.chapters(id) on delete cascade,
  created_at timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb
);

create table if not exists public.newsletters (
  id text primary key,
  email text not null unique,
  source text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  extra jsonb not null default '{}'::jsonb
);

create index if not exists stories_public_idx on public.stories(hidden, approval_status, updated_at desc);
create index if not exists chapters_story_number_idx on public.chapters(story_id, number);
create index if not exists comments_story_idx on public.comments(story_id, created_at desc);
create index if not exists coin_transactions_user_idx on public.coin_transactions(user_id, created_at desc);
create index if not exists notifications_user_idx on public.notifications(user_id, read, created_at desc);
create index if not exists admin_logs_entity_idx on public.admin_logs(entity_type, entity_id, created_at desc);
create index if not exists view_events_story_created_idx on public.view_events(story_id, created_at desc);

insert into storage.buckets(id, name, public)
values ('story-covers', 'story-covers', true)
on conflict (id) do nothing;

create table if not exists public.admin_audit_logs (
  id text primary key,
  admin_id text references public.users(id) on delete set null,
  admin_name text,
  action text not null,
  entity_type text,
  entity_id text,
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb
);

create or replace function public.rpc_topup_wallet(
  p_user_id text,
  p_amount numeric,
  p_transaction_id text,
  p_note text,
  p_notification_id text,
  p_notification_title text,
  p_notification_message text
) returns public.users
language plpgsql
security definer
as $$
declare
  v_user public.users;
begin
  if p_amount <= 0 then
    raise exception 'Invalid topup amount';
  end if;

  update public.users
  set seeds = seeds + p_amount,
      updated_at = now()
  where id = p_user_id
    and status = 'active'
  returning * into v_user;

  if not found then
    raise exception 'User not found or inactive';
  end if;

  insert into public.transactions(id, user_id, type, amount, status, method, note, created_at)
  values (p_transaction_id, p_user_id, 'topup', p_amount, 'success', 'mock', p_note, now())
  on conflict (id) do nothing;

  insert into public.notifications(id, user_id, type, title, message, link, read, created_at)
  values (p_notification_id, p_user_id, 'wallet', p_notification_title, p_notification_message, '/wallet', false, now())
  on conflict (id) do nothing;

  return v_user;
end;
$$;

create or replace function public.rpc_unlock_chapter(
  p_user_id text,
  p_chapter_id text,
  p_purchase_id text,
  p_transaction_id text,
  p_notification_id text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_user public.users;
  v_chapter public.chapters;
  v_story public.stories;
begin
  select * into v_chapter from public.chapters where id = p_chapter_id;
  if not found then
    raise exception 'Chapter not found';
  end if;

  if v_chapter.is_premium is false then
    select * into v_user from public.users where id = p_user_id;
    return jsonb_build_object('unlocked', true, 'alreadyUnlocked', false, 'balance', v_user.seeds, 'price', 0);
  end if;

  if exists(select 1 from public.purchases where user_id = p_user_id and chapter_id = p_chapter_id) then
    select * into v_user from public.users where id = p_user_id;
    return jsonb_build_object('unlocked', true, 'alreadyUnlocked', true, 'balance', v_user.seeds, 'price', 0);
  end if;

  update public.users
  set seeds = seeds - v_chapter.price,
      updated_at = now()
  where id = p_user_id
    and status = 'active'
    and seeds >= v_chapter.price
  returning * into v_user;

  if not found then
    raise exception 'Insufficient balance';
  end if;

  select * into v_story from public.stories where id = v_chapter.story_id;

  insert into public.purchases(id, user_id, story_id, chapter_id, combo, price, created_at)
  values (p_purchase_id, p_user_id, v_chapter.story_id, p_chapter_id, false, v_chapter.price, now())
  on conflict do nothing;

  insert into public.transactions(id, user_id, story_id, chapter_id, type, amount, price, status, note, created_at)
  values (p_transaction_id, p_user_id, v_chapter.story_id, p_chapter_id, 'purchase', -v_chapter.price, v_chapter.price, 'success', 'Mo khoa ' || v_chapter.title, now())
  on conflict (id) do nothing;

  insert into public.notifications(id, user_id, type, title, message, link, read, story_id, chapter_id, created_at)
  values (p_notification_id, p_user_id, 'purchase', 'Da mo khoa chuong', 'Ban da mo khoa ' || v_chapter.title || '.', coalesce('/truyen/' || v_story.slug || '/chuong/' || v_chapter.number, '/wallet'), false, v_chapter.story_id, p_chapter_id, now())
  on conflict (id) do nothing;

  return jsonb_build_object('unlocked', true, 'alreadyUnlocked', false, 'balance', v_user.seeds, 'price', v_chapter.price);
end;
$$;

create or replace function public.rpc_unlock_combo(
  p_user_id text,
  p_story_id text,
  p_purchase_id text,
  p_transaction_id text,
  p_notification_id text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_user public.users;
  v_story public.stories;
  v_price numeric;
  v_public_chapters numeric;
  v_premium_chapters numeric;
begin
  select * into v_story from public.stories where id = p_story_id;
  if not found then
    raise exception 'Story not found';
  end if;

  if exists(select 1 from public.purchases where user_id = p_user_id and story_id = p_story_id and combo is true) then
    select * into v_user from public.users where id = p_user_id;
    return jsonb_build_object('unlocked', true, 'alreadyUnlocked', true, 'balance', v_user.seeds, 'price', 0);
  end if;

  select count(*) into v_public_chapters
  from public.chapters
  where story_id = p_story_id
    and (status = 'approved' or status = 'published' or (status = 'scheduled' and scheduled_at <= now()));

  select count(*) into v_premium_chapters
  from public.chapters
  where story_id = p_story_id
    and is_premium is true
    and (status = 'approved' or status = 'published' or (status = 'scheduled' and scheduled_at <= now()));

  if v_premium_chapters = 0 then
    select * into v_user from public.users where id = p_user_id;
    return jsonb_build_object('unlocked', true, 'alreadyUnlocked', false, 'balance', v_user.seeds, 'price', 0);
  end if;

  v_price := greatest(1, greatest(49, coalesce(v_story.price, 1) * greatest(v_public_chapters, 1)));

  update public.users
  set seeds = seeds - v_price,
      updated_at = now()
  where id = p_user_id
    and status = 'active'
    and seeds >= v_price
  returning * into v_user;

  if not found then
    raise exception 'Insufficient balance';
  end if;

  insert into public.purchases(id, user_id, story_id, chapter_id, combo, price, created_at)
  values (p_purchase_id, p_user_id, p_story_id, null, true, v_price, now())
  on conflict do nothing;

  insert into public.transactions(id, user_id, story_id, chapter_id, type, amount, price, status, note, created_at)
  values (p_transaction_id, p_user_id, p_story_id, null, 'purchase', -v_price, v_price, 'success', 'Mua combo ' || v_story.title, now())
  on conflict (id) do nothing;

  insert into public.notifications(id, user_id, type, title, message, link, read, story_id, created_at)
  values (p_notification_id, p_user_id, 'purchase', 'Da mo khoa combo', 'Ban da mo khoa toan bo chuong VIP hien tai cua ' || v_story.title || '.', '/truyen/' || v_story.slug, false, p_story_id, now())
  on conflict (id) do nothing;

  return jsonb_build_object('unlocked', true, 'alreadyUnlocked', false, 'balance', v_user.seeds, 'price', v_price);
end;
$$;

create or replace function public.rpc_admin_adjust_balance(
  p_admin_id text,
  p_user_id text,
  p_amount numeric,
  p_transaction_id text,
  p_note text,
  p_log_id text,
  p_before jsonb,
  p_after jsonb,
  p_notification_id text
) returns public.users
language plpgsql
security definer
as $$
declare
  v_admin public.users;
  v_user public.users;
begin
  select * into v_admin from public.users where id = p_admin_id and role = 'admin' and status = 'active';
  if not found then
    raise exception 'Admin required';
  end if;

  update public.users
  set seeds = greatest(0, seeds + p_amount),
      updated_at = now()
  where id = p_user_id
  returning * into v_user;

  if not found then
    raise exception 'User not found';
  end if;

  insert into public.transactions(id, user_id, type, amount, seeds, status, method, note, created_by, created_at)
  values (p_transaction_id, p_user_id, 'admin_adjustment', p_amount, abs(p_amount), 'success', 'admin', p_note, p_admin_id, now())
  on conflict (id) do nothing;

  insert into public.admin_logs(id, admin_id, admin_name, action, entity_type, entity_id, before, after, note, created_at)
  values (p_log_id, p_admin_id, coalesce(v_admin.name, v_admin.email), 'adjust_balance', 'user', p_user_id, p_before, p_after, p_note, now())
  on conflict (id) do nothing;

  insert into public.notifications(id, user_id, type, title, message, link, read, created_at)
  values (p_notification_id, p_user_id, 'wallet', 'So du Dau duoc dieu chinh', p_note, '/wallet', false, now())
  on conflict (id) do nothing;

  return v_user;
end;
$$;

create or replace function public.rpc_topup_wallet(
  p_user_id text,
  p_amount numeric,
  p_transaction_id text,
  p_note text,
  p_notification_id text,
  p_notification_title text,
  p_notification_message text
) returns public.users
language plpgsql
security definer
as $$
declare
  v_user public.users;
  v_before integer;
  v_after integer;
begin
  if p_amount <= 0 then
    raise exception 'Invalid topup amount';
  end if;

  insert into public.user_wallets(user_id, balance, locked_balance)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select balance into v_before
  from public.user_wallets
  where user_id = p_user_id
  for update;

  update public.user_wallets
  set balance = balance + p_amount::integer,
      updated_at = now()
  where user_id = p_user_id
  returning balance into v_after;

  update public.users
  set seeds = v_after,
      updated_at = now()
  where id = p_user_id
    and status = 'active'
  returning * into v_user;

  if not found then
    raise exception 'User not found or inactive';
  end if;

  insert into public.coin_transactions(id, user_id, type, amount, balance_before, balance_after, ref_type, ref_id, status, method, note, created_at)
  values (p_transaction_id, p_user_id, 'topup', p_amount::integer, v_before, v_after, 'manual_topup', p_transaction_id, 'success', 'mock', p_note, now())
  on conflict (id) do nothing;

  insert into public.notifications(id, user_id, type, title, message, link, read, created_at)
  values (p_notification_id, p_user_id, 'wallet', p_notification_title, p_notification_message, '/wallet', false, now())
  on conflict (id) do nothing;

  return v_user;
end;
$$;

create or replace function public.rpc_unlock_chapter(
  p_user_id text,
  p_chapter_id text,
  p_purchase_id text,
  p_transaction_id text,
  p_notification_id text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_user public.users;
  v_chapter public.chapters;
  v_story public.stories;
  v_before integer;
  v_after integer;
begin
  select * into v_chapter from public.chapters where id = p_chapter_id;
  if not found then
    raise exception 'Chapter not found';
  end if;

  if v_chapter.is_premium is false then
    select * into v_user from public.users where id = p_user_id;
    return jsonb_build_object('unlocked', true, 'alreadyUnlocked', false, 'balance', v_user.seeds, 'price', 0);
  end if;

  if exists(select 1 from public.chapter_purchases where user_id = p_user_id and chapter_id = p_chapter_id) then
    select * into v_user from public.users where id = p_user_id;
    return jsonb_build_object('unlocked', true, 'alreadyUnlocked', true, 'balance', v_user.seeds, 'price', 0);
  end if;

  insert into public.user_wallets(user_id, balance, locked_balance)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select balance into v_before
  from public.user_wallets
  where user_id = p_user_id
  for update;

  if v_before < v_chapter.price then
    raise exception 'Insufficient balance';
  end if;

  insert into public.chapter_purchases(id, user_id, story_id, chapter_id, price, purchased_at)
  values (p_purchase_id, p_user_id, v_chapter.story_id, p_chapter_id, v_chapter.price::integer, now())
  on conflict (user_id, chapter_id) do nothing;

  if not found then
    select * into v_user from public.users where id = p_user_id;
    return jsonb_build_object('unlocked', true, 'alreadyUnlocked', true, 'balance', v_user.seeds, 'price', 0);
  end if;

  update public.user_wallets
  set balance = balance - v_chapter.price::integer,
      updated_at = now()
  where user_id = p_user_id
  returning balance into v_after;

  update public.users
  set seeds = v_after,
      updated_at = now()
  where id = p_user_id
  returning * into v_user;

  select * into v_story from public.stories where id = v_chapter.story_id;

  insert into public.coin_transactions(id, user_id, story_id, chapter_id, type, amount, balance_before, balance_after, ref_type, ref_id, price, status, note, created_at)
  values (p_transaction_id, p_user_id, v_chapter.story_id, p_chapter_id, 'purchase', -v_chapter.price::integer, v_before, v_after, 'chapter_purchase', p_purchase_id, v_chapter.price, 'success', 'Mo khoa ' || v_chapter.title, now())
  on conflict (id) do nothing;

  insert into public.notifications(id, user_id, type, title, message, link, read, story_id, chapter_id, created_at)
  values (p_notification_id, p_user_id, 'purchase', 'Da mo khoa chuong', 'Ban da mo khoa ' || v_chapter.title || '.', coalesce('/truyen/' || v_story.slug || '/chuong/' || v_chapter.number, '/wallet'), false, v_chapter.story_id, p_chapter_id, now())
  on conflict (id) do nothing;

  return jsonb_build_object('unlocked', true, 'alreadyUnlocked', false, 'balance', v_after, 'price', v_chapter.price);
end;
$$;

create or replace function public.rpc_unlock_combo(
  p_user_id text,
  p_story_id text,
  p_purchase_id text,
  p_transaction_id text,
  p_notification_id text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_user public.users;
  v_story public.stories;
  v_price integer;
  v_before integer;
  v_after integer;
  v_inserted integer;
begin
  select * into v_story from public.stories where id = p_story_id;
  if not found then
    raise exception 'Story not found';
  end if;

  if not exists(
    select 1 from public.chapters
    where story_id = p_story_id
      and is_premium is true
      and (status = 'approved' or status = 'published' or (status = 'scheduled' and scheduled_at <= now()))
      and not exists (
        select 1 from public.chapter_purchases
        where user_id = p_user_id
          and chapter_id = chapters.id
      )
  ) then
    select * into v_user from public.users where id = p_user_id;
    return jsonb_build_object('unlocked', true, 'alreadyUnlocked', true, 'balance', v_user.seeds, 'price', 0);
  end if;

  select greatest(1, greatest(49, coalesce(v_story.price, 1) * greatest(count(*), 1)))::integer into v_price
  from public.chapters
  where story_id = p_story_id
    and (status = 'approved' or status = 'published' or (status = 'scheduled' and scheduled_at <= now()));

  insert into public.user_wallets(user_id, balance, locked_balance)
  values (p_user_id, 0, 0)
  on conflict (user_id) do nothing;

  select balance into v_before
  from public.user_wallets
  where user_id = p_user_id
  for update;

  if v_before < v_price then
    raise exception 'Insufficient balance';
  end if;

  insert into public.chapter_purchases(id, user_id, story_id, chapter_id, price, purchased_at)
  select p_purchase_id || '-' || c.id, p_user_id, p_story_id, c.id, coalesce(c.price, v_story.price, 0)::integer, now()
  from public.chapters c
  where c.story_id = p_story_id
    and c.is_premium is true
    and (c.status = 'approved' or c.status = 'published' or (c.status = 'scheduled' and c.scheduled_at <= now()))
  on conflict (user_id, chapter_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into v_user from public.users where id = p_user_id;
    return jsonb_build_object('unlocked', true, 'alreadyUnlocked', true, 'balance', v_user.seeds, 'price', 0);
  end if;

  update public.user_wallets
  set balance = balance - v_price,
      updated_at = now()
  where user_id = p_user_id
  returning balance into v_after;

  update public.users
  set seeds = v_after,
      updated_at = now()
  where id = p_user_id
  returning * into v_user;

  insert into public.coin_transactions(id, user_id, story_id, type, amount, balance_before, balance_after, ref_type, ref_id, price, status, note, created_at)
  values (p_transaction_id, p_user_id, p_story_id, 'purchase', -v_price, v_before, v_after, 'combo_purchase', p_story_id, v_price, 'success', 'Mua combo ' || v_story.title, now())
  on conflict (id) do nothing;

  insert into public.notifications(id, user_id, type, title, message, link, read, story_id, created_at)
  values (p_notification_id, p_user_id, 'purchase', 'Da mo khoa combo', 'Ban da mo khoa toan bo chuong VIP hien tai cua ' || v_story.title || '.', '/truyen/' || v_story.slug, false, p_story_id, now())
  on conflict (id) do nothing;

  return jsonb_build_object('unlocked', true, 'alreadyUnlocked', false, 'balance', v_after, 'price', v_price);
end;
$$;

commit;
