import React, { useEffect, useMemo, useState } from 'react';
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

function uniqueStories(stories = []) {
  return Array.from(new Map(stories.filter(Boolean).map(story => [story.id || story.slug, normalizeStory(story)])).values());
}

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function getChapterCount(story = {}) {
  return story.chapterCount || story.chapterCountEstimate || story.latestChapter?.number || 0;
}

function hashValue(value = '') {
  return String(value).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function periodMultiplier(period) {
  return { day: .08, week: .22, month: .48, year: .78, all: 1 }[period] || 1;
}

function metricValue(story, metric, period) {
  const multiplier = periodMultiplier(period);
  if (metric === 'views') return Math.round(Number(story.views || 0) * multiplier);
  if (metric === 'follows') return Math.round(Number(story.follows || 0) * multiplier);
  if (metric === 'rating') return Number(story.rating || 0);
  if (metric === 'comments') return Math.round(((Number(story.follows || 0) / 9) + hashValue(story.slug) % 90) * multiplier);
  if (metric === 'revenue') {
    const vipBonus = story.premium ? 1.9 : .35;
    return Math.round((Number(story.views || 0) / 160 + Number(story.follows || 0) * vipBonus) * multiplier);
  }
  return Number(story.views || 0);
}

function metricLabel(metric) {
  return metricOptions.find(option => option.value === metric)?.label || 'Chỉ số';
}

function metricSuffix(metric) {
  if (metric === 'rating') return 'sao';
  if (metric === 'revenue') return 'xu';
  return '';
}

function rankDelta(story, index, period) {
  const value = (hashValue(`${story.slug}-${period}`) + index) % 7;
  return value - 3;
}

async function fetchSafe(apiClient, path) {
  if (!apiClient) return null;
  try {
    return await apiClient(path);
  } catch {
    return null;
  }
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
      const [views, follows, rating, chapters] = await Promise.all([
        fetchSafe(apiClient, '/stories?sort=views'),
        fetchSafe(apiClient, '/stories?sort=follows'),
        fetchSafe(apiClient, '/stories?sort=rating'),
        fetchSafe(apiClient, '/stories?sort=chapters')
      ]);
      if (!alive) return;
      const apiStories = uniqueStories([
        ...(views?.stories || []),
        ...(follows?.stories || []),
        ...(rating?.stories || []),
        ...(chapters?.stories || [])
      ]);
      setStories(apiStories.length ? apiStories : uniqueStories(mockStories));
        setError(apiStories.length ? '' : 'Không kết nối được API, đang dùng dữ liệu dự phòng cho bảng xếp hạng.');
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, [apiClient]);

  const rankedStories = useMemo(() => {
    return stories
      .map((story, index) => ({
        ...story,
        rankScore: metricValue(story, metric, period),
        rankDelta: rankDelta(story, index, period)
      }))
      .sort((a, b) => {
        if (metric === 'rating') {
          if (Number(b.rankScore) !== Number(a.rankScore)) return Number(b.rankScore) - Number(a.rankScore);
          return Number(b.views || 0) - Number(a.views || 0);
        }
        return Number(b.rankScore || 0) - Number(a.rankScore || 0);
      })
      .slice(0, 100);
  }, [stories, metric, period]);

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
          <RankingPodium stories={rankedStories.slice(0, 3)} metric={metric} />
          <RankingTable stories={rankedStories} metric={metric} period={period} />
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
            <img src={story.cover || coverFallback} alt={story.title} loading="lazy" onError={handleImageError} />
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
              <img src={story.cover || coverFallback} alt={story.title} loading="lazy" onError={handleImageError} />
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
