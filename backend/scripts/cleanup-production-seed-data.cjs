require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const CONFIRM = 'DELETE_PRODUCTION_SEED_DATA';
const seedStoryIds = ['story_test', 's1', 's10', 's11'];
const seedCoverPaths = ['/images/cover-1.jpg', '/images/cover-10.jpg', '/images/cover-11.jpg'];

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Set NODE_ENV=production to target production cleanup.');
  }

  const supabase = client();
  const { data, error } = await supabase
    .from('stories')
    .select('id, slug, title, cover, created_at')
    .or(`id.in.(${seedStoryIds.join(',')}),cover.in.(${seedCoverPaths.join(',')})`);

  if (error) throw error;

  const stories = data || [];
  console.log(JSON.stringify({
    dryRun: process.env.CONFIRM_CLEANUP_PRODUCTION_SEED_DATA !== CONFIRM,
    matchedStories: stories
  }, null, 2));

  if (process.env.CONFIRM_CLEANUP_PRODUCTION_SEED_DATA !== CONFIRM) {
    console.log(`Dry-run only. Set CONFIRM_CLEANUP_PRODUCTION_SEED_DATA=${CONFIRM} to delete matched stories and dependent rows.`);
    return;
  }

  const ids = stories.map(story => story.id).filter(Boolean);
  if (!ids.length) return;

  for (const table of ['story_categories', 'story_tags', 'view_events', 'ratings', 'comments', 'chapter_purchases', 'coin_transactions', 'reading_progress', 'follows', 'bookmarks', 'chapters']) {
    const { error: deleteError } = await supabase.from(table).delete().in('story_id', ids);
    if (deleteError) throw deleteError;
  }

  const { error: storyDeleteError } = await supabase.from('stories').delete().in('id', ids);
  if (storyDeleteError) throw storyDeleteError;

  console.log(JSON.stringify({ ok: true, deletedStoryIds: ids }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
