import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { mockCategories, mockPopularSearches, mockStories } from '../../data/mockStories';

const defaultFilters = {
  q: '',
  category: '',
  tag: '',
  status: '',
  chapterRange: '',
  rating: '',
  views: '',
  premium: '',
  sort: 'updated'
};

const statusOptions = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'ongoing', label: 'Đang ra' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'paused', label: 'Tạm dừng' }
];

const chapterOptions = [
  { value: '', label: 'Mọi độ dài' },
  { value: '1-50', label: '1 - 50 chương' },
  { value: '51-100', label: '51 - 100 chương' },
  { value: '101-300', label: '101 - 300 chương' },
  { value: '301-999999', label: 'Trên 300 chương' }
];

const ratingOptions = [
  { value: '', label: 'Mọi đánh giá' },
  { value: '4', label: 'Từ 4.0 sao' },
  { value: '4.5', label: 'Từ 4.5 sao' },
  { value: '4.8', label: 'Từ 4.8 sao' }
];

const viewOptions = [
  { value: '', label: 'Mọi lượt xem' },
  { value: '10000', label: 'Từ 10.000 lượt' },
  { value: '100000', label: 'Từ 100.000 lượt' },
  { value: '500000', label: 'Từ 500.000 lượt' }
];

const premiumOptions = [
  { value: '', label: 'Miễn phí và VIP' },
  { value: 'false', label: 'Miễn phí' },
  { value: 'true', label: 'VIP' }
];

const sortOptions = [
  { value: 'updated', label: 'Mới cập nhật' },
  { value: 'views', label: 'Lượt xem' },
  { value: 'rating', label: 'Đánh giá' },
  { value: 'chapters', label: 'Số chương' },
  { value: 'created', label: 'Mới đăng' }
];

const coverFallback = '/images/cover-1.jpg';

const cp1252Map = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f
};

function repairText(value) {
  if (typeof value !== 'string') return value;
  if (!/(Ã|Ä|Â|Æ|áº|á»|â)/.test(value)) return value;
  try {
    const bytes = Array.from(value, char => {
      const code = char.charCodeAt(0);
      if (code <= 255) return code;
      return cp1252Map[char] || code;
    });
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return value;
  }
}

function normalizeStory(story = {}) {
  return {
    ...story,
    title: repairText(story.title),
    author: repairText(story.author),
    description: repairText(story.description),
    categories: Array.isArray(story.categories) ? story.categories.map(repairText) : [],
    tags: Array.isArray(story.tags) ? story.tags.map(repairText) : []
  };
}

function normalizeForSearch(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function getChapterCount(story = {}) {
  return story.chapterCount || story.chapterCountEstimate || story.latestChapter?.number || 0;
}

function formatDate(value) {
  if (!value) return 'Đang cập nhật';
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function uniqueStories(stories = []) {
  return Array.from(new Map(stories.filter(Boolean).map(story => [story.id || story.slug, normalizeStory(story)])).values());
}

function categoriesFromStories(stories = []) {
  return Array.from(new Set(stories.flatMap(story => story.categories || []).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
}

function filtersFromUrl(searchParams, routeCategory, presetFilters = {}) {
  return {
    ...defaultFilters,
    ...presetFilters,
    q: searchParams.get('q') || '',
    category: routeCategory || searchParams.get('category') || presetFilters.category || '',
    tag: searchParams.get('tag') || '',
    status: searchParams.get('status') || '',
    chapterRange: searchParams.get('chapterRange') || '',
    rating: searchParams.get('rating') || '',
    views: searchParams.get('views') || '',
    premium: searchParams.get('premium') || '',
    sort: searchParams.get('sort') || presetFilters.sort || 'updated'
  };
}

function toSearchParams(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== defaultFilters[key]) params.set(key, value);
  });
  return params;
}

function scoreSort(filters) {
  return (a, b) => {
    if (filters.sort === 'views') return Number(b.views || 0) - Number(a.views || 0);
    if (filters.sort === 'rating') return Number(b.rating || 0) - Number(a.rating || 0);
    if (filters.sort === 'chapters') return getChapterCount(b) - getChapterCount(a);
    if (filters.sort === 'created') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  };
}

function storyMatchesFilters(story, filters) {
  const haystack = normalizeForSearch([
    story.title,
    story.author,
    story.description,
    ...(story.categories || []),
    ...(story.tags || [])
  ].join(' '));

  if (filters.q && !haystack.includes(normalizeForSearch(filters.q))) return false;
  if (filters.category && !(story.categories || []).some(category => normalizeForSearch(category) === normalizeForSearch(filters.category))) return false;
  if (filters.tag && !normalizeForSearch([...(story.tags || []), ...(story.categories || [])].join(' ')).includes(normalizeForSearch(filters.tag))) return false;
  if (filters.status && story.status !== filters.status) return false;
  if (filters.premium && String(Boolean(story.premium)) !== filters.premium) return false;
  if (filters.rating && Number(story.rating || 0) < Number(filters.rating)) return false;
  if (filters.views && Number(story.views || 0) < Number(filters.views)) return false;
  if (filters.chapterRange) {
    const [min, max] = filters.chapterRange.split('-').map(Number);
    const chapters = getChapterCount(story);
    if (chapters < min || chapters > max) return false;
  }
  return true;
}

async function fetchSafe(apiClient, path) {
  if (!apiClient) return null;
  try {
    return await apiClient(path);
  } catch {
    return null;
  }
}

function useRecentSearches() {
  const [recent, setRecent] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('daudo_search_recent') || '[]');
    } catch {
      return [];
    }
  });

  function saveRecent(value) {
    const text = String(value || '').trim();
    if (!text) return;
    const next = [text, ...recent.filter(item => item !== text)].slice(0, 8);
    setRecent(next);
    localStorage.setItem('daudo_search_recent', JSON.stringify(next));
  }

  function clearRecent() {
    setRecent([]);
    localStorage.removeItem('daudo_search_recent');
  }

  return { recent, saveRecent, clearRecent };
}

export function SearchPage({ apiClient, presetFilters = {} }) {
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => filtersFromUrl(searchParams, params.category, presetFilters));
  const [draftQ, setDraftQ] = useState(filters.q);
  const [stories, setStories] = useState([]);
  const [categories, setCategories] = useState(mockCategories);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { recent, saveRecent, clearRecent } = useRecentSearches();

  useEffect(() => {
    const next = filtersFromUrl(searchParams, params.category, presetFilters);
    setFilters(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    setDraftQ(next.q);
  }, [params.category, presetFilters, searchParams]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError('');
      const [updated, views, rating, chapters, categoryData] = await Promise.all([
        fetchSafe(apiClient, '/stories?sort=updated'),
        fetchSafe(apiClient, '/stories?sort=views'),
        fetchSafe(apiClient, '/stories?sort=rating'),
        fetchSafe(apiClient, '/stories?sort=chapters'),
        fetchSafe(apiClient, '/categories')
      ]);
      if (!alive) return;
      const apiStories = uniqueStories([
        ...(updated?.stories || []),
        ...(views?.stories || []),
        ...(rating?.stories || []),
        ...(chapters?.stories || [])
      ]);
      const sourceStories = apiStories.length ? apiStories : uniqueStories(mockStories);
      const nextCategories = (categoryData?.categories || []).map(repairText);
      setStories(sourceStories);
      setCategories(nextCategories.length ? nextCategories : categoriesFromStories(sourceStories));
        setError(apiStories.length ? '' : 'Không kết nối được API, đang dùng dữ liệu dự phòng để tìm kiếm.');
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [apiClient]);

  const filteredStories = useMemo(() => {
    return stories.filter(story => storyMatchesFilters(story, filters)).sort(scoreSort(filters));
  }, [stories, filters]);

  const quickResults = useMemo(() => {
    const text = normalizeForSearch(draftQ);
    if (!text) return [];
    return stories
      .filter(story => normalizeForSearch([story.title, story.author, ...(story.categories || []), ...(story.tags || [])].join(' ')).includes(text))
      .slice(0, 5);
  }, [stories, draftQ]);

  const popularTags = useMemo(() => {
    return Array.from(new Set(stories.flatMap(story => [...(story.tags || []), ...(story.categories || [])]).filter(Boolean))).slice(0, 12);
  }, [stories]);

  function pushFilters(nextFilters) {
    const normalized = { ...defaultFilters, ...nextFilters };
    setFilters(normalized);
    const paramsToPush = toSearchParams(normalized);
    const nextUrl = `/danh-sach${paramsToPush.toString() ? `?${paramsToPush.toString()}` : ''}`;
    navigate(nextUrl);
  }

  function updateFilters(patch) {
    pushFilters({ ...filters, ...patch });
  }

  function submitSearch(event) {
    event.preventDefault();
    saveRecent(draftQ);
    updateFilters({ q: draftQ });
  }

  function useSuggestion(value) {
    setDraftQ(value);
    saveRecent(value);
    updateFilters({ q: value });
  }

  function resetFilters() {
    setDraftQ('');
    setFilters(defaultFilters);
    navigate('/danh-sach');
  }

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => value && value !== defaultFilters[key]);
  const title = filters.category ? `Thể loại ${filters.category}` : filters.q ? `Tìm kiếm “${filters.q}”` : 'Tìm kiếm truyện';

  return (
    <div className="sr-page">
      <section className="sr-hero">
        <div>
          <span>Search</span>
          <h1>{title}</h1>
          <p>Tìm theo tên truyện, tác giả, thể loại hoặc tag. Bộ lọc được lưu vào URL để bạn chia sẻ lại kết quả.</p>
        </div>
        <form className="sr-search-main" onSubmit={submitSearch}>
          <label>
            <span>⌕</span>
            <input value={draftQ} onChange={event => setDraftQ(event.target.value)} placeholder="Nhập tên truyện, tác giả, thể loại, tag..." />
          </label>
          <button type="submit">Tìm kiếm</button>
        </form>
        {quickResults.length > 0 && (
          <div className="sr-quick-results">
            <strong>Kết quả nhanh</strong>
            {quickResults.map(story => (
              <Link key={story.id || story.slug} to={`/truyen/${story.slug}`}>
                <img src={story.cover || coverFallback} alt={story.title} loading="lazy" onError={handleImageError} />
                <span>{story.title}<small>{story.author}</small></span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="sr-suggestion-row">
        <SuggestionGroup title="Tìm kiếm gần đây" items={recent} onSelect={useSuggestion} empty="Chưa có lịch sử tìm kiếm." action={recent.length ? <button type="button" onClick={clearRecent}>Xóa</button> : null} />
        <SuggestionGroup title="Gợi ý phổ biến" items={mockPopularSearches} onSelect={useSuggestion} />
      </div>

      <AdvancedFilters
        filters={filters}
        categories={categories}
        tags={popularTags}
        updateFilters={updateFilters}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      <SearchResults
        stories={filteredStories}
        loading={loading}
        error={error}
        filters={filters}
        resetFilters={resetFilters}
      />
    </div>
  );
}

function SuggestionGroup({ title, items, onSelect, empty, action }) {
  return (
    <section className="sr-suggestion-card">
      <div>
        <strong>{title}</strong>
        {action}
      </div>
      {items.length ? (
        <p>
          {items.map(item => <button type="button" key={item} onClick={() => onSelect(item)}>{item}</button>)}
        </p>
      ) : (
        <em>{empty}</em>
      )}
    </section>
  );
}

export function AdvancedFilters({ filters, categories, tags, updateFilters, resetFilters, hasActiveFilters }) {
  return (
    <section className="sr-filter-panel">
      <div className="sr-filter-head">
        <div>
          <span>Filters</span>
          <h2>Bộ lọc nâng cao</h2>
        </div>
        <div>
          <SortSelect value={filters.sort} onChange={value => updateFilters({ sort: value })} />
          <button type="button" disabled={!hasActiveFilters} onClick={resetFilters}>Reset bộ lọc</button>
        </div>
      </div>
      <FilterSidebar filters={filters} categories={categories} tags={tags} updateFilters={updateFilters} />
    </section>
  );
}

export function FilterSidebar({ filters, categories, tags, updateFilters }) {
  return (
    <div className="sr-filter-grid">
      <label>
        <span>Thể loại</span>
        <select value={filters.category} onChange={event => updateFilters({ category: event.target.value })}>
          <option value="">Tất cả thể loại</option>
          {categories.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label>
        <span>Trạng thái</span>
        <select value={filters.status} onChange={event => updateFilters({ status: event.target.value })}>
          {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        <span>Số chương</span>
        <select value={filters.chapterRange} onChange={event => updateFilters({ chapterRange: event.target.value })}>
          {chapterOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        <span>Đánh giá</span>
        <select value={filters.rating} onChange={event => updateFilters({ rating: event.target.value })}>
          {ratingOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        <span>Lượt xem</span>
        <select value={filters.views} onChange={event => updateFilters({ views: event.target.value })}>
          {viewOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        <span>Miễn phí/VIP</span>
        <select value={filters.premium} onChange={event => updateFilters({ premium: event.target.value })}>
          {premiumOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        <span>Tag</span>
        <input value={filters.tag} onChange={event => updateFilters({ tag: event.target.value })} placeholder="VD: tu tiên, chữa lành..." list="sr-tag-options" />
        <datalist id="sr-tag-options">{tags.map(tag => <option key={tag} value={tag} />)}</datalist>
      </label>
    </div>
  );
}

export function SortSelect({ value, onChange }) {
  return (
    <label className="sr-sort-select">
      <span>Sắp xếp</span>
      <select value={value} onChange={event => onChange(event.target.value)}>
        {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function SearchResults({ stories, loading, error, filters, resetFilters }) {
  if (loading) {
    return (
      <section className="sr-results">
        <div className="sr-results-head"><h2>Đang tải kết quả</h2></div>
        <div className="sr-result-skeleton">{Array.from({ length: 8 }).map((_, index) => <span key={index} />)}</div>
      </section>
    );
  }

  return (
    <section className="sr-results">
      <div className="sr-results-head">
        <div>
            <span>{error ? 'Dữ liệu dự phòng' : 'Results'}</span>
          <h2>{formatNumber(stories.length)} truyện phù hợp</h2>
          {error && <p>{error}</p>}
        </div>
      </div>

      {stories.length === 0 ? (
        <div className="sr-empty-state">
          <h3>Không tìm thấy truyện phù hợp</h3>
          <p>Hãy thử bỏ bớt điều kiện lọc hoặc đổi từ khóa tìm kiếm.</p>
          <button type="button" onClick={resetFilters}>Reset bộ lọc</button>
        </div>
      ) : (
        <div className="sr-result-list">
          {stories.map(story => <SearchResultCard key={story.id || story.slug} story={story} activeQuery={filters.q} />)}
        </div>
      )}
    </section>
  );
}

function SearchResultCard({ story }) {
  const statusLabel = story.status === 'completed' ? 'Hoàn thành' : story.status === 'paused' ? 'Tạm dừng' : 'Đang ra';
  return (
    <article className="sr-result-card">
      <Link to={`/truyen/${story.slug}`} className="sr-result-cover">
        <img src={story.cover || coverFallback} alt={story.title} loading="lazy" onError={handleImageError} />
        {story.premium && <b>VIP</b>}
      </Link>
      <div className="sr-result-copy">
        <div className="sr-result-title">
          <Link to={`/truyen/${story.slug}`}><h3>{story.title}</h3></Link>
          <button type="button" aria-label="Yêu thích">♡</button>
        </div>
        <p className="sr-result-author">Tác giả: {story.author}</p>
        <p className="sr-result-desc">{story.description}</p>
        <div className="sr-result-tags">
          {(story.categories || []).slice(0, 5).map(category => <Link key={category} to={`/the-loai/${encodeURIComponent(category)}`}>{category}</Link>)}
        </div>
        <div className="sr-result-meta">
          <span>★ {story.rating || 4.5}</span>
          <span>{formatNumber(getChapterCount(story))} chương</span>
          <span>{formatNumber(story.views)} lượt xem</span>
          <span>{statusLabel}</span>
          <span>Cập nhật {formatDate(story.updatedAt)}</span>
        </div>
      </div>
    </article>
  );
}

function handleImageError(event) {
  if (event.currentTarget.src.endsWith(coverFallback)) return;
  event.currentTarget.src = coverFallback;
}
