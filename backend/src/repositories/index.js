const { getSupabase } = require('../supabase');

const PAGE_SIZE = 1000;

let memoryDb = {};
let lock = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  return (items || []).filter(item => {
    const key = keyFn(item);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeSnapshot(db) {
  const next = clone(db);
  next.users ||= [];
  next.stories ||= [];
  next.chapters ||= [];
  next.bookmarks = dedupeBy(next.bookmarks, item => `${item.userId}:${item.storyId}`);
  next.follows = dedupeBy(next.follows, item => `${item.userId}:${item.storyId}`);
  next.history = dedupeBy(next.history, item => `${item.userId}:${item.storyId}`);
  next.ratings = dedupeBy(next.ratings, item => `${item.userId}:${item.storyId}`);
  next.purchases = dedupeBy(next.purchases, item => item.chapterId ? `${item.userId}:chapter:${item.chapterId}` : item.combo ? `${item.userId}:combo:${item.storyId}` : item.id);
  return next;
}

function storeName() {
  return process.env.DATA_STORE || (process.env.NODE_ENV === 'test' ? 'memory' : 'supabase');
}

function isMemoryStore() {
  return storeName() === 'memory';
}

const TIMESTAMP_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'scheduledAt',
  'notifiedAt',
  'sessionsRevokedAt',
  'deactivatedAt',
  'resolvedAt',
  'startsAt',
  'endsAt'
]);

const TABLES = {
  users: {
    table: 'users',
    key: 'users',
    map: {
      id: 'id',
      email: 'email',
      passwordHash: 'password_hash',
      salt: 'salt',
      role: 'role',
      status: 'status',
      seeds: 'seeds',
      tokenVersion: 'token_version',
      name: 'name',
      avatar: 'avatar_url',
      cover: 'cover',
      phone: 'phone',
      birthday: 'birthday',
      gender: 'gender',
      address: 'address',
      website: 'website',
      bio: 'bio',
      socialLinks: 'social_links',
      preferences: 'preferences',
      notificationPreferences: 'notification_preferences',
      note: 'note',
      sessionsRevokedAt: 'sessions_revoked_at',
      deactivatedAt: 'deactivated_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  stories: {
    table: 'stories',
    key: 'stories',
    ignoreExtra: new Set(['categories', 'tags']),
    map: {
      id: 'id',
      slug: 'slug',
      title: 'title',
      author: 'author',
      ownerId: 'owner_id',
      description: 'description',
      cover: 'cover',
      coverPath: 'cover_path',
      status: 'status',
      approvalStatus: 'approval_status',
      hidden: 'hidden',
      rejectionReason: 'rejection_reason',
      premium: 'premium',
      price: 'price',
      views: 'views',
      follows: 'follows',
      rating: 'rating',
      translator: 'translator',
      language: 'language',
      ageRating: 'age_rating',
      chapterCountEstimate: 'chapter_count_estimate',
      shortDescription: 'short_description',
      coverPosition: 'cover_position',
      featured: 'featured',
      hot: 'hot',
      recommended: 'recommended',
      banner: 'banner',
      type: 'type',
      chapterPrice: 'chapter_price',
      vipFromChapter: 'vip_from_chapter',
      comboPrice: 'combo_price',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  chapters: {
    table: 'chapters',
    key: 'chapters',
    map: {
      id: 'id',
      storyId: 'story_id',
      number: 'number',
      title: 'title',
      content: 'content',
      preview: 'preview',
      isPremium: 'is_premium',
      price: 'price',
      views: 'views',
      status: 'status',
      scheduledAt: 'scheduled_at',
      wordCount: 'word_count',
      rejectionReason: 'rejection_reason',
      password: 'password',
      sourceBatchId: 'source_batch_id',
      notifiedAt: 'notified_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  bookmarks: {
    table: 'bookmarks',
    key: 'bookmarks',
    map: { id: 'id', userId: 'user_id', storyId: 'story_id', createdAt: 'created_at' }
  },
  follows: {
    table: 'follows',
    key: 'follows',
    map: { id: 'id', userId: 'user_id', storyId: 'story_id', createdAt: 'created_at' }
  },
  history: {
    table: 'reading_progress',
    key: 'history',
    map: {
      id: 'id',
      userId: 'user_id',
      storyId: 'story_id',
      chapterId: 'chapter_id',
      chapterNumber: 'chapter_number',
      progress: 'progress_percent',
      progressPercent: 'progress_percent',
      lastPosition: 'last_position',
      lastReadAt: 'last_read_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  purchases: {
    table: 'chapter_purchases',
    key: 'purchases',
    map: {
      id: 'id',
      userId: 'user_id',
      storyId: 'story_id',
      chapterId: 'chapter_id',
      price: 'price',
      createdAt: 'purchased_at'
    }
  },
  transactions: {
    table: 'coin_transactions',
    key: 'transactions',
    map: {
      id: 'id',
      userId: 'user_id',
      storyId: 'story_id',
      chapterId: 'chapter_id',
      promotionId: 'promotion_id',
      packageId: 'package_id',
      type: 'type',
      amount: 'amount',
      balanceBefore: 'balance_before',
      balanceAfter: 'balance_after',
      refType: 'ref_type',
      refId: 'ref_id',
      seeds: 'seeds',
      price: 'price',
      status: 'status',
      method: 'method',
      note: 'note',
      createdBy: 'created_by',
      amountVnd: 'amount_vnd',
      vndAmount: 'vnd_amount',
      money: 'money',
      createdAt: 'created_at'
    }
  },
  comments: {
    table: 'comments',
    key: 'comments',
    map: {
      id: 'id',
      userId: 'user_id',
      storyId: 'story_id',
      chapterId: 'chapter_id',
      parentId: 'parent_id',
      body: 'content',
      status: 'status',
      adminNote: 'admin_note',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  ratings: {
    table: 'ratings',
    key: 'ratings',
    map: {
      id: 'id',
      userId: 'user_id',
      storyId: 'story_id',
      value: 'value',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  reports: {
    table: 'reports',
    key: 'reports',
    map: {
      id: 'id',
      userId: 'user_id',
      storyId: 'story_id',
      chapterId: 'chapter_id',
      commentId: 'comment_id',
      targetType: 'target_type',
      targetId: 'target_id',
      type: 'type',
      severity: 'severity',
      reason: 'reason',
      status: 'status',
      adminNote: 'admin_note',
      resolvedBy: 'resolved_by',
      resolvedAt: 'resolved_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  notifications: {
    table: 'notifications',
    key: 'notifications',
    map: {
      id: 'id',
      userId: 'user_id',
      type: 'type',
      title: 'title',
      body: 'message',
      link: 'link',
      read: 'read',
      actorId: 'actor_id',
      storyId: 'story_id',
      chapterId: 'chapter_id',
      data: 'data',
      createdAt: 'created_at'
    }
  },
  adminLogs: {
    table: 'admin_logs',
    key: 'adminLogs',
    map: {
      id: 'id',
      adminId: 'admin_id',
      adminName: 'admin_name',
      action: 'action',
      entityType: 'entity_type',
      entityId: 'entity_id',
      before: 'before',
      after: 'after',
      note: 'note',
      createdAt: 'created_at'
    }
  },
  adminNotifications: {
    table: 'admin_notifications',
    key: 'adminNotifications',
    map: {
      id: 'id',
      title: 'title',
      body: 'message',
      type: 'type',
      targetRole: 'target_role',
      targetUserId: 'target_user_id',
      recipientCount: 'recipient_count',
      status: 'status',
      createdBy: 'created_by',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  newsletters: {
    table: 'newsletters',
    key: 'newsletters',
    map: {
      id: 'id',
      email: 'email',
      source: 'source',
      active: 'active',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  },
  viewEvents: {
    table: 'view_events',
    key: 'viewEvents',
    map: {
      id: 'id',
      userId: 'user_id',
      storyId: 'story_id',
      chapterId: 'chapter_id',
      createdAt: 'created_at'
    }
  },
  promotions: {
    table: 'promotions',
    key: 'promotions',
    map: {
      id: 'id',
      storyId: 'story_id',
      ownerId: 'owner_id',
      packageId: 'package_id',
      packageName: 'package_name',
      cost: 'cost',
      status: 'status',
      startsAt: 'starts_at',
      endsAt: 'ends_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
};

const LOAD_DEFS = Object.values(TABLES);
const UPSERT_ORDER = [
  TABLES.users,
  TABLES.stories,
  TABLES.chapters,
  TABLES.bookmarks,
  TABLES.follows,
  TABLES.history,
  TABLES.purchases,
  TABLES.transactions,
  TABLES.comments,
  TABLES.ratings,
  TABLES.reports,
  TABLES.notifications,
  TABLES.adminLogs,
  TABLES.adminNotifications,
  TABLES.newsletters,
  TABLES.viewEvents,
  TABLES.promotions
];
const DELETE_ORDER = [
  TABLES.viewEvents,
  TABLES.promotions,
  TABLES.adminNotifications,
  TABLES.adminLogs,
  TABLES.notifications,
  TABLES.reports,
  TABLES.ratings,
  TABLES.comments,
  TABLES.transactions,
  TABLES.purchases,
  TABLES.history,
  TABLES.follows,
  TABLES.bookmarks,
  TABLES.chapters,
  TABLES.stories,
  TABLES.newsletters,
  TABLES.users
];

function dbValue(key, value) {
  if (value === undefined) return null;
  if (TIMESTAMP_FIELDS.has(key) && value === '') return null;
  return value;
}

function legacyValue(key, value) {
  if (TIMESTAMP_FIELDS.has(key) && value === null) return '';
  return value;
}

function toRow(item, def) {
  const row = {};
  const mapped = new Set(Object.keys(def.map));
  Object.entries(def.map).forEach(([legacyKey, column]) => {
    if (Object.prototype.hasOwnProperty.call(item, legacyKey)) {
      row[column] = dbValue(legacyKey, item[legacyKey]);
    }
  });

  const extra = {};
  Object.entries(item).forEach(([key, value]) => {
    if (mapped.has(key) || def.ignoreExtra?.has(key)) return;
    extra[key] = value;
  });
  row.extra = extra;
  return row;
}

function fromRow(row, def) {
  const item = { ...(row.extra || {}) };
  Object.entries(def.map).forEach(([legacyKey, column]) => {
    if (Object.prototype.hasOwnProperty.call(row, column)) {
      item[legacyKey] = legacyValue(legacyKey, row[column]);
    }
  });
  return item;
}

async function assertResult(result, table) {
  if (result.error) {
    throw new Error(`${table}: ${result.error.message}`);
  }
  return result.data || [];
}

async function selectAll(table) {
  const supabase = getSupabase();
  const rows = [];
  let from = 0;

  while (true) {
    const result = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);
    const page = await assertResult(result, table);
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function deleteMissing(table, ids) {
  const supabase = getSupabase();
  const existing = await selectAll(table);
  const keep = new Set(ids.filter(Boolean));
  const missing = existing.map(row => row.id).filter(id => id && !keep.has(id));

  for (let index = 0; index < missing.length; index += PAGE_SIZE) {
    const batch = missing.slice(index, index + PAGE_SIZE);
    const result = await supabase.from(table).delete().in('id', batch);
    await assertResult(result, table);
  }
}

async function upsertRows(table, rows, onConflict = 'id') {
  if (!rows.length) return;
  const supabase = getSupabase();
  for (let index = 0; index < rows.length; index += PAGE_SIZE) {
    const batch = rows.slice(index, index + PAGE_SIZE);
    const result = await supabase.from(table).upsert(batch, { onConflict });
    await assertResult(result, table);
  }
}

function taxonomyItem(value, prefix) {
  if (!value) return null;
  if (typeof value === 'object') {
    const name = String(value.name || value.label || '').trim();
    if (!name) return null;
    return {
      id: String(value.id || `${prefix}_${slugify(name)}`),
      name,
      slug: String(value.slug || slugify(name)),
      description: String(value.description || ''),
      color: String(value.color || ''),
      createdAt: value.createdAt || new Date().toISOString(),
      updatedAt: value.updatedAt || value.createdAt || new Date().toISOString()
    };
  }
  const name = String(value || '').trim();
  if (!name) return null;
  return {
    id: `${prefix}_${slugify(name)}`,
    name,
    slug: slugify(name),
    description: '',
    color: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function uniqueTaxonomy(input, storyNames, prefix) {
  const byName = new Map();
  [...(Array.isArray(input) ? input : []), ...storyNames].forEach(value => {
    const item = taxonomyItem(value, prefix);
    if (item && !byName.has(item.name.toLowerCase())) byName.set(item.name.toLowerCase(), item);
  });
  return Array.from(byName.values());
}

function taxonomyRow(item) {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    description: item.description || '',
    color: item.color || '',
    created_at: dbValue('createdAt', item.createdAt),
    updated_at: dbValue('updatedAt', item.updatedAt),
    extra: {}
  };
}

function taxonomyFromRow(row) {
  return {
    ...(row.extra || {}),
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || '',
    color: row.color || '',
    createdAt: legacyValue('createdAt', row.created_at),
    updatedAt: legacyValue('updatedAt', row.updated_at)
  };
}

function buildTaxonomy(db) {
  const storyCategories = (db.stories || []).flatMap(story => story.categories || []);
  const storyTags = (db.stories || []).flatMap(story => story.tags || []);
  return {
    categories: uniqueTaxonomy(db.taxonomy?.categories, storyCategories, 'cat'),
    tags: uniqueTaxonomy(db.taxonomy?.tags, storyTags, 'tag')
  };
}

async function loadRelations(db) {
  const [categoryRows, tagRows, storyCategoryRows, storyTagRows] = await Promise.all([
    selectAll('taxonomy_categories'),
    selectAll('taxonomy_tags'),
    selectAll('story_categories'),
    selectAll('story_tags')
  ]);

  db.taxonomy = {
    categories: categoryRows.map(taxonomyFromRow),
    tags: tagRows.map(taxonomyFromRow)
  };

  const categoriesById = new Map(db.taxonomy.categories.map(item => [item.id, item.name]));
  const tagsById = new Map(db.taxonomy.tags.map(item => [item.id, item.name]));
  const storyById = new Map((db.stories || []).map(story => [story.id, story]));

  storyCategoryRows.forEach(row => {
    const story = storyById.get(row.story_id);
    const name = categoriesById.get(row.category_id);
    if (story && name) {
      story.categories ||= [];
      if (!story.categories.includes(name)) story.categories.push(name);
    }
  });

  storyTagRows.forEach(row => {
    const story = storyById.get(row.story_id);
    const name = tagsById.get(row.tag_id);
    if (story && name) {
      story.tags ||= [];
      if (!story.tags.includes(name)) story.tags.push(name);
    }
  });

  (db.stories || []).forEach(story => {
    story.categories ||= [];
    story.tags ||= [];
  });
}

async function pruneRelations(db, taxonomy) {
  const categoryByName = new Map(taxonomy.categories.map(item => [item.name.toLowerCase(), item]));
  const tagByName = new Map(taxonomy.tags.map(item => [item.name.toLowerCase(), item]));
  const storyCategoryIds = [];
  const storyTagIds = [];

  (db.stories || []).forEach(story => {
    (story.categories || []).forEach(name => {
      const item = categoryByName.get(String(name).toLowerCase());
      if (item) storyCategoryIds.push(`${story.id}:${item.id}`);
    });
    (story.tags || []).forEach(name => {
      const item = tagByName.get(String(name).toLowerCase());
      if (item) storyTagIds.push(`${story.id}:${item.id}`);
    });
  });

  await deleteMissing('story_categories', storyCategoryIds);
  await deleteMissing('story_tags', storyTagIds);
  await deleteMissing('taxonomy_categories', taxonomy.categories.map(item => item.id));
  await deleteMissing('taxonomy_tags', taxonomy.tags.map(item => item.id));
}

async function saveTaxonomy(taxonomy) {
  await upsertRows('taxonomy_categories', taxonomy.categories.map(taxonomyRow));
  await upsertRows('taxonomy_tags', taxonomy.tags.map(taxonomyRow));
}

async function saveStoryRelations(db, taxonomy) {
  const categoryByName = new Map(taxonomy.categories.map(item => [item.name.toLowerCase(), item]));
  const tagByName = new Map(taxonomy.tags.map(item => [item.name.toLowerCase(), item]));

  const storyCategories = [];
  const storyTags = [];
  (db.stories || []).forEach(story => {
    (story.categories || []).forEach(name => {
      const item = categoryByName.get(String(name).toLowerCase());
      if (item) {
        storyCategories.push({
          id: `${story.id}:${item.id}`,
          story_id: story.id,
          category_id: item.id,
          created_at: story.createdAt || new Date().toISOString()
        });
      }
    });
    (story.tags || []).forEach(name => {
      const item = tagByName.get(String(name).toLowerCase());
      if (item) {
        storyTags.push({
          id: `${story.id}:${item.id}`,
          story_id: story.id,
          tag_id: item.id,
          created_at: story.createdAt || new Date().toISOString()
        });
      }
    });
  });

  await upsertRows('story_categories', storyCategories);
  await upsertRows('story_tags', storyTags);
}

async function loadSupabaseDb() {
  const pairs = await Promise.all(
    LOAD_DEFS.map(async def => [def.key, (await selectAll(def.table)).map(row => fromRow(row, def))])
  );
  const db = pairs.reduce((acc, [key, rows]) => {
    acc[key] = rows;
    return acc;
  }, {});
  await loadRelations(db);
  return db;
}

async function saveSupabaseDb(db, options = {}) {
  const shouldPrune = options.prune !== false;
  const nextDb = normalizeSnapshot(db);
  const taxonomy = buildTaxonomy(nextDb);

  if (shouldPrune) {
    await pruneRelations(nextDb, taxonomy);
    for (const def of DELETE_ORDER) {
      const ids = (nextDb[def.key] || []).map(item => item.id);
      await deleteMissing(def.table, ids);
    }
  }

  await upsertRows(TABLES.users.table, (nextDb.users || []).map(item => toRow(item, TABLES.users)));
  await saveTaxonomy(taxonomy);
  await upsertRows(TABLES.stories.table, (nextDb.stories || []).map(item => toRow(item, TABLES.stories)));
  await saveStoryRelations(nextDb, taxonomy);
  for (const def of UPSERT_ORDER.filter(def => def !== TABLES.users && def !== TABLES.stories)) {
    const rows = (nextDb[def.key] || []).map(item => toRow(item, def));
    await upsertRows(def.table, rows);
  }
}

async function loadDb() {
  if (isMemoryStore()) return clone(memoryDb);
  return loadSupabaseDb();
}

async function saveDb(db, options = {}) {
  if (isMemoryStore()) {
    memoryDb = normalizeSnapshot(db);
    return;
  }
  await saveSupabaseDb(db, options);
}

function reset(db = {}) {
  memoryDb = normalizeSnapshot(db);
}

function snapshot() {
  return clone(memoryDb);
}

async function health() {
  if (isMemoryStore()) {
    return { ok: true, database: 'memory', time: new Date().toISOString() };
  }
  const result = await getSupabase().from('users').select('id').limit(1);
  await assertResult(result, 'users');
  return { ok: true, database: 'supabase', time: new Date().toISOString() };
}

async function callRpc(name, params) {
  const result = await getSupabase().rpc(name, params);
  if (result.error) {
    throw new Error(result.error.message);
  }
  return result.data;
}

async function loadUser(userId) {
  const db = await loadSupabaseDb();
  return db.users.find(user => user.id === userId) || null;
}

async function topupWallet({ userId, amount, transactionId, note, notificationId, notificationTitle, notificationMessage }) {
  await callRpc('rpc_topup_wallet', {
    p_user_id: userId,
    p_amount: amount,
    p_transaction_id: transactionId,
    p_note: note,
    p_notification_id: notificationId,
    p_notification_title: notificationTitle,
    p_notification_message: notificationMessage
  });
  return loadUser(userId);
}

async function unlockChapter({ userId, chapterId, purchaseId, transactionId, notificationId }) {
  const result = await callRpc('rpc_unlock_chapter', {
    p_user_id: userId,
    p_chapter_id: chapterId,
    p_purchase_id: purchaseId,
    p_transaction_id: transactionId,
    p_notification_id: notificationId
  });
  return { result, user: await loadUser(userId) };
}

async function unlockCombo({ userId, storyId, purchaseId, transactionId, notificationId }) {
  const result = await callRpc('rpc_unlock_combo', {
    p_user_id: userId,
    p_story_id: storyId,
    p_purchase_id: purchaseId,
    p_transaction_id: transactionId,
    p_notification_id: notificationId
  });
  return { result, user: await loadUser(userId) };
}

async function withLock(fn) {
  const run = lock.then(fn, fn);
  lock = run.catch(() => {});
  return run;
}

module.exports = {
  loadDb,
  saveDb,
  reset,
  snapshot,
  health,
  topupWallet,
  unlockChapter,
  unlockCombo,
  storeName,
  withLock
};
