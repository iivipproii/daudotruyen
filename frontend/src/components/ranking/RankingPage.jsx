import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { mockStories } from '../../data/mockStories';

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

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString('vi-VN');
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
        setStories(apiStories.length ? apiStories : fallbackRankingStories(metric));
        setError(apiStories.length ? '' : 'API /rankings chưa có dữ liệu, đang hiển thị dữ liệu mẫu.');
      } catch (err) {
        if (!alive) return;
        setStories(fallbackRankingStories(metric));
        setError(`${err.message || 'Không tải được API /rankings.'} Đang hiển thị dữ liệu mẫu.`);
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [apiClient, period, metric]);

  function updateQuery(patch) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => next.set(key, value));
    setSearchParams(next);
  }

  return (
    <div className="rk-page">
      <section className="rk-hero">
        <div>
          <span>Ranking</span>
          <h1>Bảng xếp hạng truyện</h1>
          <p>Theo dõi top truyện theo lượt xem, yêu thích, đánh giá, bình luận và doanh thu. Bộ lọc được lưu vào URL.</p>
        </div>
        <div className="rk-filter-bar">
          <SegmentedControl label="Khoảng thời gian" options={periodOptions} value={period} onChange={value => updateQuery({ period: value })} />
          <SegmentedControl label="Chỉ số" options={metricOptions} value={metric} onChange={value => updateQuery({ metric: value })} />
        </div>
      </section>

      {loading ? (
        <RankingLoading />
      ) : (
        <>
          {error && <div className="rk-warning">{error}</div>}
          <RankingPodium stories={stories.slice(0, 3)} metric={metric} />
          <RankingTable stories={stories} metric={metric} period={period} />
        </>
      )}
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
      <div className="rk-podium-skeleton">{Array.from({ length: 3 }).map((_, index) => <span key={index} />)}</div>
      <div className="rk-table-skeleton">{Array.from({ length: 8 }).map((_, index) => <span key={index} />)}</div>
    </div>
  );
}

export function RankingPodium({ stories, metric }) {
  if (!stories.length) {
    return <div className="rk-empty">Chưa có dữ liệu xếp hạng.</div>;
  }

  const arranged = [stories[1], stories[0], stories[2]].filter(Boolean);

  return (
    <section className="rk-podium">
      {arranged.map(story => {
        const actualRank = stories.findIndex(item => item.id === story.id) + 1;
        return (
          <Link key={story.id || story.slug} to={`/truyen/${story.slug}`} className={`rk-podium-card rank-${actualRank}`}>
            <b>#{actualRank}</b>
                <img src={story.cover || coverFallback} alt={story.title} decoding="async" loading="lazy" onError={handleImageError} />
            <span>
              <strong>{story.title}</strong>
              <small>{story.author}</small>
            </span>
            <em>{formatMetric(story.rankScore, metric)}</em>
          </Link>
        );
      })}
    </section>
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
          <h2>Xếp hạng theo {metricLabel(metric).toLowerCase()}</h2>
        </div>
        <p>{periodOptions.find(option => option.value === period)?.label || 'Toàn thời gian'}</p>
      </div>
      <div className="rk-table" role="table" aria-label="Bảng top 100 truyện">
        <div className="rk-table-row header" role="row">
          <span>Hạng</span>
          <span>Truyện</span>
          <span>Tác giả</span>
          <span>Chỉ số</span>
          <span>Thay đổi</span>
        </div>
        {stories.map((story, index) => (
          <Link key={story.id || story.slug} to={`/truyen/${story.slug}`} className="rk-table-row" role="row">
            <span className="rk-rank">#{index + 1}</span>
            <span className="rk-story-cell">
              <img src={story.cover || coverFallback} alt={story.title} decoding="async" loading="lazy" onError={handleImageError} />
              <strong>{story.title}</strong>
            </span>
            <span>{story.author}</span>
            <span>{formatMetric(story.rankScore, metric)}</span>
            <RankDelta value={story.rankDelta} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function RankDelta({ value }) {
  if (value > 0) return <span className="rk-delta up">▲ {value}</span>;
  if (value < 0) return <span className="rk-delta down">▼ {Math.abs(value)}</span>;
  return <span className="rk-delta same">● 0</span>;
}

function formatMetric(value, metric) {
  if (metric === 'rating') return `${Number(value || 0).toFixed(1)} ${metricSuffix(metric)}`;
  return `${formatNumber(value)}${metricSuffix(metric) ? ` ${metricSuffix(metric)}` : ''}`;
}

function handleImageError(event) {
  if (event.currentTarget.src.endsWith(coverFallback)) return;
  event.currentTarget.src = coverFallback;
}
