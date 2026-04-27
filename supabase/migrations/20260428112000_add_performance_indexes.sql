begin;

create index if not exists stories_approval_created_idx
  on public.stories(approval_status, created_at desc);

create index if not exists stories_status_created_idx
  on public.stories(status, created_at desc);

create index if not exists stories_owner_updated_idx
  on public.stories(owner_id, updated_at desc);

create index if not exists chapters_story_created_idx
  on public.chapters(story_id, created_at desc);

create index if not exists chapters_status_created_idx
  on public.chapters(status, created_at desc);

create index if not exists users_role_idx
  on public.users(role);

commit;
