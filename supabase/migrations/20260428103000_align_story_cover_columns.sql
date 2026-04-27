begin;

alter table public.stories
  add column if not exists cover text;

alter table public.stories
  add column if not exists cover_path text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stories'
      and column_name = 'cover_url'
  ) then
    execute 'update public.stories set cover = coalesce(cover, cover_url) where cover is null';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
