import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { mockStories } from '../../data/mockStories';
import { Majesticon } from '../shared/Majesticon.jsx';

const isDev = import.meta.env.DEV;
const LOAD_ERROR_MESSAGE = 'Không tải được dữ liệu từ máy chủ. Vui lòng thử lại.';
const coverFallback = '/images/cover-1.jpg';

const periodOptions = [
  { value: 'day', label: 'Ngày' },
  { value: 'week', label: 'Tuần' },
  { value: 'month', label: 'Tháng' },
  { value: 'year', label: 'Năm' },
  { value: 'all', label: 'Toàn thời gian' }
];

const metricOptions = [
  { value: 'views', label: 'Lượt xem' },
  { value: 'follows', label: 'Yêu thích' },
  { value: 'rating', label: 'Đánh giá' },
  { value: 'comments', label: 'Bình luận' },
  { value: 'revenue', label: 'Doanh thu' }
];

function repairText(value) {
  if (typeof value !== 'string') return value;
  if (!/(Ã|Ä|Â|Æ|áº|á»|â)/.test(value)) return value;
  try {
    const bytes = Array.from(value, char => char.charCodeAt(0)).filter(code => code <= 255);
    if (!bytes.length) return value;
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return value;
  }
}

function normalizeStory(story = {}) {
  return {
    ...story,
    title: repairText(story.title) || 'Truyện chưa đặt tên',
    author: repairText(story.author) || 'Đang cập nhật',
    categories: Array.isArray(story.categories) ? story.categories.map(repairText) : [],
    tags: Array.isArray(story.tags) ? story.tags.map(repairText) : []
  };
}

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function compactNumber(value = 0) {
  const number = Number(value || 0);
  if (number >= 1000000000) return `${(number / 1000000000).toFixed(1)}B`;
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}K`;
  return formatNumber(number);
}

function metricLabel(metric) {
  return metricOptions.find(option => option.value === metric)?.label || 'Chỉ số';
}

function metricSuffix(metric) {
  if (metric === 'rating') return 'sao';
  if (metric === 'revenue') return 'xu';
  return '';
}

function fallbackRankingStories(metric) {
  return mockStories
    .map(story => {
      const normalized = normalizeStory(story);
      const rankScore = {
        views: Number(normalized.views || 0),
        follows: Number(normalized.follows || 0),
        rating: Number(normalized.rating || 0),
        comments: 0,
        revenue: 0
      }[metric] ?? Number(normalized.views || 0);

      return {
        ...normalized,
        rankScore,
        rankDelta: 0,
        commentsCount: 0,
        revenueSeeds: 0,
        periodViews: metric === 'views' ? rankScore : 0,
        periodFollows: metric === 'follows' ? rankScore : 0
      };
    })
    .sort((a, b) => Number(b.rankScore || 0) - Number(a.rankScore || 0))
    .slice(0, 100);
}

export function RankingPage({ apiClient }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const period = searchParams.get('period') || 'week';
  const metric = searchParams.get('metric') || 'views';

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        if (!apiClient) throw new Error('Thiếu API client.');
        const data = await apiClient(`/rankings?period=${encodeURIComponent(period)}&metric=${encodeURIComponent(metric)}&limit=100`);
        if (!alive) return;
        const apiStories = Array.isArray(data?.stories) ? data.stories.map(normalizeStory) : [];
        setStories(apiStories.length ? apiStories : isDev ? fallbackRankingStories(metric) : []);
      } catch (err) {
        if (!alive) return;
        console.error('[API_ERROR]', {
          endpoint: '/rankings',
          message: err?.message
        });
        setStories(isDev ? fallbackRankingStories(metric) : []);
        setError(LOAD_ERROR_MESSAGE);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [apiClient, period, metric, retryCount]);

  function updateQuery(patch) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => next.set(key, value));
    setSearchParams(next);
  }

  const activePeriod = periodOptions.find(option => option.value === period)?.label || 'Toàn thời gian';
  const totalViews = stories.reduce((sum, story) => sum + Number(story.views || story.rankScore || 0), 0);

  return (
    <div className="rk-page">
      <section className="rk-hero">
        <div>
          <span>Bảng xếp hạng</span>
          <h1>Top truyện nổi bật</h1>
          <p>Cập nhật các truyện đang dẫn đầu theo lượt xem, yêu thích, đánh giá và tương tác cộng đồng.</p>
        </div>
        <div className="rk-hero-stats" aria-label="Thống kê bảng xếp hạng">
          <span><strong>{formatNumber(stories.length)}</strong> truyện</span>
          <span><strong>{compactNumber(totalViews)}</strong> lượt đọc</span>
          <span><strong>{activePeriod}</strong> chu kỳ</span>
        </div>
      </section>

      <div className="rk-browse-layout">
        <aside className="rk-sidebar" aria-label="Bộ lọc bảng xếp hạng">
          <SegmentedControl label="Khoảng thời gian" options={periodOptions} value={period} onChange={value => updateQuery({ period: value })} />
          <SegmentedControl label="Chỉ số xếp hạng" options={metricOptions} value={metric} onChange={value => updateQuery({ metric: value })} />
        </aside>

        <main className="rk-results">
          {loading ? (
            <RankingLoading />
          ) : (
            <>
              {error && (
                <div className="rk-warning">
                  <span>{error}</span>
                  <button type="button" onClick={() => setRetryCount(count => count + 1)}>Thử lại</button>
                </div>
              )}
              <RankingTopThree stories={stories.slice(0, 3)} metric={metric} />
              <RankingTable stories={stories} metric={metric} period={period} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div className="rk-segment">
      <strong>{label}</strong>
      <div>
        {options.map(option => (
          <button
            type="button"
            key={option.value}
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

function RankingLoading() {
  return (
    <div className="rk-loading">
      <div className="rk-top-skeleton">{Array.from({ length: 3 }).map((_, index) => <span key={index} />)}</div>
      <div className="rk-table-skeleton">{Array.from({ length: 8 }).map((_, index) => <span key={index} />)}</div>
    </div>
  );
}

export function RankingTopThree({ stories, metric }) {
  if (!stories.length) return null;

  const arranged = [stories[1], stories[0], stories[2]].filter(Boolean);

  return (
    <section className="rk-top-three" aria-label="Top 3 truyện nổi bật">
      {arranged.map(story => {
        const rank = stories.findIndex(item => (item.id || item.slug) === (story.id || story.slug)) + 1;
        return <RankingTopCard key={story.id || story.slug || rank} story={story} rank={rank || 1} metric={metric} />;
      })}
    </section>
  );
}

function RankingTopCard({ story, rank, metric }) {
  return (
    <Link to={`/truyen/${story.slug}`} className={`rk-top-card rank-${rank}`}>
      <span className="rk-top-rank">#{rank}</span>
      <img className="rk-top-cover" src={story.cover || coverFallback} alt={story.title} decoding="async" loading="lazy" onError={handleImageError} />
      <strong>{story.title}</strong>
      <small>{story.author}</small>
      <em className="rk-top-score">{formatMetric(story.rankScore, metric)}</em>
    </Link>
  );
}

export function RankingTable({ stories, metric, period }) {
  if (!stories.length) {
    return <div className="rk-empty">Không có truyện phù hợp với bộ lọc hiện tại.</div>;
  }

  return (
    <section className="rk-table-card">
      <div className="rk-table-head">
        <div>
          <span>Top 100</span>
          <h2>Bảng Xếp Hạng Đầy Đủ</h2>
        </div>
        <p>{metricLabel(metric)} · {periodOptions.find(option => option.value === period)?.label || 'Toàn thời gian'}</p>
      </div>
      <div className="rk-table" role="list" aria-label="Bảng top 100 truyện">
        {stories.map((story, index) => (
          <RankingRow key={story.id || story.slug || index} story={story} index={index} metric={metric} />
        ))}
      </div>
    </section>
  );
}

function RankingRow({ story, index, metric }) {
  const rank = index + 1;
  const categories = [...(story.categories || []), ...(story.tags || [])].filter(Boolean).slice(0, 2);
  const status = getStatusLabel(story);
  const rating = Number(story.rating || 0);

  return (
    <Link to={`/truyen/${story.slug}`} className="rk-table-row" role="listitem">
      <span className={`rk-rank ${rank <= 3 ? `top-${rank}` : ''}`} aria-label={`Hạng ${rank}`}>
        {rank <= 3 ? <span aria-hidden="true">♛</span> : rank}
      </span>
      <img className="rk-row-cover" src={story.cover || coverFallback} alt={story.title} decoding="async" loading="lazy" onError={handleImageError} />
      <span className="rk-story-info">
        <strong>{story.title}</strong>
        <small>{story.author}</small>
        <span className="rk-tags">
          {categories.map(category => <em key={category}>{category}</em>)}
        </span>
      </span>
      <span className="rk-row-stats">
        <strong><span aria-hidden="true">⊙</span> {formatMetric(story.rankScore, metric)}</strong>
        <small><Majesticon name="star" size={15} /> {rating ? rating.toFixed(1).replace(/\.0$/, '') : '0'}</small>
        <em className={status === 'Full' ? 'full' : ''}>{status}</em>
      </span>
    </Link>
  );
}

function getStatusLabel(story) {
  const rawStatus = String(story.status || '').toLowerCase();
  if (story.completed || rawStatus.includes('complete') || rawStatus.includes('full') || rawStatus.includes('hoàn')) return 'Full';
  return 'Đang ra';
}

function formatMetric(value, metric) {
  if (metric === 'rating') return `${Number(value || 0).toFixed(1).replace(/\.0$/, '')}`;
  return `${compactNumber(value)}${metricSuffix(metric) ? ` ${metricSuffix(metric)}` : ''}`;
}

function handleImageError(event) {
  if (event.currentTarget.src.endsWith(coverFallback)) return;
  event.currentTarget.src = coverFallback;
}
