import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { mockCategories, mockPopularSearches, mockStories } from '../../data/mockStories';
import { Majesticon } from '../shared/Majesticon.jsx';

const isDev = import.meta.env.DEV;
const LOAD_ERROR_MESSAGE = 'Không tải được dữ liệu từ máy chủ. Vui lòng thử lại.';

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
  { value: '', label: 'Tất cả' },
  { value: 'ongoing', label: 'Đang ra' },
  { value: 'completed', label: 'Hoàn thành' }
];

const chapterOptions = [
  { value: '', label: 'Tất cả' },
  { value: '1-99', label: '< 100' },
  { value: '100-500', label: '100 - 500' },
  { value: '501-1000', label: '500 - 1000' },
  { value: '1001-999999', label: '> 1000' }
];

const ratingOptions = [
  { value: '', label: 'Tất cả' },
  { value: '4.5', label: '4.5+' },
  { value: '4', label: '4.0+' },
  { value: '3.5', label: '3.5+' }
];

const sortOptions = [
  { value: 'views', label: 'Phổ biến nhất' },
  { value: 'updated', label: 'Mới cập nhật' },
  { value: 'rating', label: 'Đánh giá cao' },
  { value: 'chapters', label: 'Nhiều chương' },
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

function compactNumber(value = 0) {
  const number = Number(value || 0);
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}K`;
  return formatNumber(number);
}

function getChapterCount(story = {}) {
  return story.chapterCount || story.chapterCountEstimate || story.latestChapter?.number || 0;
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
    category: routeCategory ? decodeURIComponent(routeCategory) : searchParams.get('category') || presetFilters.category || '',
    tag: searchParams.get('tag') || '',
    status: searchParams.get('status') || '',
    chapterRange: searchParams.get('chapterRange') || '',
    rating: searchParams.get('rating') || '',
    views: searchParams.get('views') || '',
    premium: searchParams.get('premium') || '',
    sort: searchParams.get('sort') || presetFilters.sort || 'updated'
  };
}

function toSearchParams(filters, defaults = defaultFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== defaults[key]) params.set(key, value);
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
  } catch (error) {
    console.error('[API_ERROR]', {
      endpoint: path,
      message: error?.message
    });
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

export function SearchPage({ apiClient, presetFilters = {}, pageTitle = '', heroTitle = '', shortOnly = false, basePath = '' }) {
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeCategory = params.category ? decodeURIComponent(params.category) : '';
  const pageDefaults = useMemo(() => ({ ...defaultFilters, ...presetFilters }), [presetFilters]);
  const [filters, setFilters] = useState(() => filtersFromUrl(searchParams, params.category, presetFilters));
  const [draftQ, setDraftQ] = useState(filters.q);
  const [stories, setStories] = useState([]);
  const [categories, setCategories] = useState(isDev ? mockCategories.map(repairText) : []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const { recent, saveRecent, clearRecent } = useRecentSearches();

  useEffect(() => {
    const next = filtersFromUrl(searchParams, params.category, presetFilters);
    setFilters(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    setDraftQ(next.q);
  }, [params.category, presetFilters, searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = draftQ.trim();
      if (!nextQ && filters.q) {
        updateFilters({ q: '' });
        return;
      }
      if (nextQ.length >= 2 && nextQ !== filters.q) {
        saveRecent(nextQ);
        updateFilters({ q: nextQ });
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftQ]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError('');
      const [homeData, categoryData] = await Promise.all([
        fetchSafe(apiClient, '/home'),
        fetchSafe(apiClient, '/categories?limit=30')
      ]);
      if (!alive) return;
      const apiStories = uniqueStories([
        ...(homeData?.updatedStories || []),
        ...(homeData?.popularStories || []),
        ...(homeData?.featuredStories || []),
        ...(homeData?.recommendedStories || []),
        ...(homeData?.completedStories || [])
      ]);
      const sourceStories = apiStories.length ? apiStories : isDev ? uniqueStories(mockStories) : [];
      const nextCategories = (categoryData?.categories || []).map(repairText);
      setStories(sourceStories);
      setCategories(nextCategories.length ? nextCategories : categoriesFromStories(sourceStories));
      setError(apiStories.length || isDev ? '' : LOAD_ERROR_MESSAGE);
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [apiClient, retryCount]);

  const filteredStories = useMemo(() => {
    const shortStories = stories.filter(story => {
      const chapters = getChapterCount(story);
      return chapters > 0 && chapters <= 100;
    });
    const sourceStories = shortOnly
      ? (shortStories.length >= 6 ? shortStories : stories.slice().sort((a, b) => getChapterCount(a) - getChapterCount(b)))
      : stories;
    return sourceStories.filter(story => storyMatchesFilters(story, filters)).sort(scoreSort(filters));
  }, [stories, filters, shortOnly]);

  const popularTags = useMemo(() => {
    const fromStories = Array.from(new Set(stories.flatMap(story => [...(story.tags || []), ...(story.categories || [])]).filter(Boolean))).slice(0, 12);
    return fromStories.length ? fromStories : mockPopularSearches.map(repairText).slice(0, 6);
  }, [stories]);

  function pushFilters(nextFilters) {
    const normalized = { ...defaultFilters, ...nextFilters };
    setFilters(normalized);
    const paramsToPush = toSearchParams(normalized, pageDefaults);
    let nextPath = basePath || '/danh-sach';

    if (routeCategory) {
      if (!normalized.category) {
        nextPath = '/danh-sach';
      } else if (normalizeForSearch(normalized.category) !== normalizeForSearch(routeCategory)) {
        nextPath = `/the-loai/${encodeURIComponent(normalized.category)}`;
      } else {
        nextPath = `/the-loai/${encodeURIComponent(routeCategory)}`;
        paramsToPush.delete('category');
      }
    }

    const nextUrl = `${nextPath}${paramsToPush.toString() ? `?${paramsToPush.toString()}` : ''}`;
    navigate(nextUrl);
  }

  function updateFilters(patch) {
    pushFilters({ ...filters, ...patch });
  }

  function submitSearch(event) {
    event.preventDefault();
    saveRecent(draftQ);
    updateFilters({ q: draftQ.trim() });
  }

  function useSuggestion(value) {
    setDraftQ(value);
    saveRecent(value);
    updateFilters({ q: value });
  }

  function resetFilters() {
    setDraftQ('');
    setFilters(pageDefaults);
    navigate(basePath || '/danh-sach');
  }

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => value && value !== pageDefaults[key]);
  const title = heroTitle || pageTitle || (filters.category ? `Thể loại ${filters.category}` : filters.q ? `Tìm kiếm "${filters.q}"` : 'Tìm Kiếm Truyện');
  const heroTags = [...new Set([...popularTags.slice(0, 4), ...recent.slice(0, 2)])].slice(0, 5);

  return (
    <div className="sr-page">
      <section className="sr-hero">
        <h1>{title}</h1>
        <form className="sr-search-main" onSubmit={submitSearch}>
          <label>
            <Majesticon name="search" size={18} />
            <input value={draftQ} onChange={event => setDraftQ(event.target.value)} placeholder="Tìm theo tên truyện, tác giả, thể loại..." />
          </label>
        </form>
        {heroTags.length > 0 && (
          <div className="sr-hero-tags" aria-label="Gợi ý tìm kiếm">
            {heroTags.map(tag => <button type="button" key={tag} onClick={() => useSuggestion(tag)}>↻ {tag}</button>)}
          </div>
        )}
      </section>

      <div className="sr-browse-layout">
        <AdvancedFilters
          filters={filters}
          categories={categories}
          tags={popularTags}
          updateFilters={updateFilters}
          resetFilters={resetFilters}
          hasActiveFilters={hasActiveFilters}
          recent={recent}
          clearRecent={clearRecent}
          useSuggestion={useSuggestion}
        />

        <SearchResults
          stories={filteredStories}
          loading={loading}
          error={error}
          filters={filters}
          resetFilters={resetFilters}
          onRetry={() => setRetryCount(count => count + 1)}
          updateFilters={updateFilters}
          resultLabel={shortOnly ? 'truyện ngắn' : 'truyện'}
        />
      </div>
    </div>
  );
}

export function AdvancedFilters({ filters, categories, tags, updateFilters, resetFilters, hasActiveFilters, recent, clearRecent, useSuggestion }) {
  return (
    <aside className="sr-filter-panel" aria-label="Bộ lọc tìm kiếm">
      <div className="sr-filter-head">
        <h2>Bộ Lọc</h2>
        <button type="button" disabled={!hasActiveFilters} onClick={resetFilters}>Xóa lọc</button>
      </div>

      <FilterChipGroup
        title="Thể Loại"
        options={[{ value: '', label: 'Tất cả' }, ...categories.slice(0, 13).map(category => ({ value: category, label: category }))]}
        value={filters.category}
        onChange={value => updateFilters({ category: value })}
      />

      <FilterRadioGroup title="Trạng Thái" name="status" options={statusOptions} value={filters.status} onChange={value => updateFilters({ status: value })} />
      <FilterRadioGroup title="Số Chương" name="chapters" options={chapterOptions} value={filters.chapterRange} onChange={value => updateFilters({ chapterRange: value })} />
      <FilterRadioGroup title="Đánh Giá" name="rating" options={ratingOptions} value={filters.rating} onChange={value => updateFilters({ rating: value })} />

      {tags.length > 0 && (
        <div className="sr-filter-block">
          <h3>Gợi Ý</h3>
          <div className="sr-tag-cloud">
            {tags.slice(0, 8).map(tag => <button type="button" key={tag} onClick={() => updateFilters({ tag })}>{tag}</button>)}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="sr-filter-block">
          <div className="sr-filter-inline-head">
            <h3>Gần Đây</h3>
            <button type="button" onClick={clearRecent}>Xóa</button>
          </div>
          <div className="sr-tag-cloud">
            {recent.slice(0, 4).map(item => <button type="button" key={item} onClick={() => useSuggestion(item)}>{item}</button>)}
          </div>
        </div>
      )}
    </aside>
  );
}

function FilterChipGroup({ title, options, value, onChange }) {
  return (
    <div className="sr-filter-block">
      <h3>{title}</h3>
      <div className="sr-category-chips">
        {options.map(option => (
          <button
            type="button"
            key={option.value || 'all'}
            className={value === option.value ? 'active' : ''}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterRadioGroup({ title, name, options, value, onChange }) {
  return (
    <div className="sr-filter-block">
      <h3>{title}</h3>
      <div className="sr-radio-list">
        {options.map(option => (
          <label key={option.value || 'all'}>
            <input
              type="radio"
              name={`sr-${name}`}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
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

export function SearchResults({ stories, loading, error, filters, resetFilters, onRetry, updateFilters, resultLabel = 'truyện' }) {
  if (loading) {
    return (
      <section className="sr-results">
        <div className="sr-results-head">
          <p>Đang tải kết quả</p>
        </div>
        <div className="sr-result-skeleton">{Array.from({ length: 10 }).map((_, index) => <span key={index} />)}</div>
      </section>
    );
  }

  return (
    <section className="sr-results">
      <div className="sr-results-head">
        <div>
          <p>{error ? 'Lỗi tải dữ liệu' : <>Tìm thấy <strong>{formatNumber(stories.length)}</strong> {resultLabel}</>}</p>
          {error && <span>{error}</span>}
        </div>
        <SortSelect value={filters.sort} onChange={value => updateFilters({ sort: value })} />
      </div>

      {error && <button className="sr-retry-button" type="button" onClick={onRetry}>Thử lại</button>}

      {stories.length === 0 ? (
        <div className="sr-empty-state">
          <h3>Không tìm thấy truyện phù hợp</h3>
          <p>Hãy thử bỏ bớt điều kiện lọc hoặc đổi từ khóa tìm kiếm.</p>
          <button type="button" onClick={resetFilters}>Reset bộ lọc</button>
        </div>
      ) : (
        <div className="sr-result-list">
          {stories.map((story, index) => <SearchResultCard key={story.id || story.slug} story={story} index={index} />)}
        </div>
      )}
    </section>
  );
}

function SearchResultCard({ story, index }) {
  const categories = story.categories || [];
  const isCompleted = story.status === 'completed';
  const isNew = index > 5 && new Date(story.createdAt || 0) > Date.now() - 1000 * 60 * 60 * 24 * 45;
  const showHot = Number(story.views || 0) >= 400000 || Number(story.rating || 0) >= 4.8;

  return (
    <article className="sr-result-card">
      <Link to={`/truyen/${story.slug}`} className="sr-result-cover" aria-label={story.title}>
        <img src={story.cover || coverFallback} alt={story.title} decoding="async" loading="lazy" onError={handleImageError} />
        <div className="sr-badge-stack">
          {showHot && <b className="hot">HOT</b>}
          {isCompleted && <b className="full">FULL</b>}
          {isNew && <b className="new">MỚI</b>}
          {story.premium && <b className="vip">VIP</b>}
        </div>
        <span className="sr-favorite" aria-label="Yêu thích"><Majesticon name="heart" size={18} /></span>
        <div className="sr-cover-meta">
          <span><Majesticon name="star" size={16} /> {story.rating || 4.5}</span>
          <span>◉ {compactNumber(story.views)}</span>
        </div>
      </Link>
      <div className="sr-result-copy">
        <Link to={`/truyen/${story.slug}`} className="sr-result-title"><h3>{story.title}</h3></Link>
        <p className="sr-result-author">{story.author}</p>
        <div className="sr-result-tags">
          {categories.slice(0, 2).map(category => <Link key={category} to={`/the-loai/${encodeURIComponent(category)}`}>{category}</Link>)}
        </div>
      </div>
    </article>
  );
}

function handleImageError(event) {
  if (event.currentTarget.src.endsWith(coverFallback)) return;
  event.currentTarget.src = coverFallback;
}
