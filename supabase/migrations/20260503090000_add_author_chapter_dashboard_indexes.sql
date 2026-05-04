create index if not exists chapters_story_status_updated_idx
  on public.chapters(story_id, status, updated_at desc);

create index if not exists chapters_story_premium_updated_idx
  on public.chapters(story_id, is_premium, updated_at desc);
