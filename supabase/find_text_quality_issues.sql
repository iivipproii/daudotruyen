select 'stories' as table_name, id, slug, 'title' as field_name, left(title, 160) as preview
from stories
where title ~ '[�ÃÂÆ]' or title like '%á»%' or title ilike '%test từ Supabase%'
union all
select 'stories', id, slug, 'author', left(author, 160)
from stories
where author ~ '[�ÃÂÆ]' or author like '%á»%' or author ilike '%test từ Supabase%'
union all
select 'stories', id, slug, 'slug', left(slug, 160)
from stories
where slug ~ '[�ÃÂÆ]' or slug like '%á»%' or slug ilike '%test từ Supabase%'
union all
select 'chapters', id, story_id::text, 'title', left(title, 160)
from chapters
where title ~ '[�ÃÂÆ]' or title like '%á»%' or title ilike '%test từ Supabase%'
union all
select 'chapters', id, story_id::text, 'content', left(content, 160)
from chapters
where content ~ '[�ÃÂÆ]' or content like '%á»%' or content ilike '%test từ Supabase%';
