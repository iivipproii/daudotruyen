import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  mockCategories,
  mockContinueReading,
  mockPopularSearches,
  mockSearchHistory,
  mockStories
} from '../../data/mockStories';
import { hasCorruptText, repairText, repairTextArray } from '../../lib/textRepair.js';
import { Majesticon } from '../shared/Majesticon.jsx';

const coverFallback = '/images/cover-1.jpg';
const isDev = import.meta.env.DEV;
const LOAD_ERROR_MESSAGE = 'Không tải được dữ liệu từ máy chủ. Vui lòng thử lại.';

function normalizeStory(story = {}) {
  return {
    ...story,
    title: repairText(story.title),
    author: repairText(story.author),
    translator: repairText(story.translator),
    description: repairText(story.description),
    categories: repairTextArray(story.categories),
    tags: repairTextArray(story.tags)
  };
}

function isDisplaySafeStory(story = {}) {
  const textFields = [story.title, story.description, story.author, story.translator, ...(story.categories || [])];
  return Boolean(story.title && story.slug) && !textFields.some(value => hasCorruptText(value));
}

function isHeroDisplayStory(story = {}) {
  const textFields = [story.title, story.description, story.author, story.translator, ...(story.categories || [])];
  return Boolean(story.title && story.slug) && !textFields.some(value => typeof value === 'string' && value.includes('\uFFFD'));
}

function isImageAssetValue(value) {
  return typeof value === 'string' && Boolean(value.trim()) && value !== 'true' && value !== 'false';
}

function storyHeroImage(story) {
  const safeStory = story || {};
  return [safeStory.bannerImage, safeStory.bannerUrl, safeStory.coverImage, safeStory.cover, safeStory.banner]
    .find(isImageAssetValue) || '/images/hero.jpg';
}

function uniqueStories(items = []) {
  return Array.from(new Map(items.filter(Boolean).map(story => [story.id || story.slug, story])).values());
}

function normalizeStories(stories = []) {
  return stories.filter(Boolean).map(normalizeStory);
}

function uniqueCategoriesFrom(stories = []) {
  const values = stories.flatMap(story => story.categories || []).filter(Boolean).map(repairText);
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'vi'));
}

function toNumber(value) {
  return Number(value || 0);
}

function formatNumber(value = 0) {
  return toNumber(value).toLocaleString('vi-VN');
}

function formatCompactNumber(value = 0) {
  const number = toNumber(value);
  if (number >= 1000000) return `${Math.round(number / 100000) / 10}m`;
  if (number >= 1000) return `${Math.round(number / 100) / 10}k`.replace('.0k', 'k');
  return `${number}`;
}

function getChapterCount(story = {}) {
  return story.chapterCount || story.chapterCountEstimate || story.latestChapter?.number || 0;
}

function normalizeForSearch(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}

function chunkIntoColumns(items = [], columnCount = 4) {
  const columns = Array.from({ length: columnCount }, () => []);
  items.forEach((item, index) => {
    columns[index % columnCount].push(item);
  });
  return columns;
}

function sortByNumber(key) {
  return (a, b) => toNumber(b[key]) - toNumber(a[key]);
}

function sortByDate(key) {
  return (a, b) => new Date(b[key] || 0).getTime() - new Date(a[key] || 0).getTime();
}

function buildHomeSlices(sourceStories = []) {
  const normalizedStories = normalizeStories(sourceStories);
  const safeStories = normalizedStories.filter(isDisplaySafeStory);
  const stories = safeStories;
  const byViews = stories.slice().sort(sortByNumber('views'));
  const byRating = stories.slice().sort(sortByNumber('rating'));
  const byUpdated = stories.slice().sort(sortByDate('updatedAt'));
  const completed = stories.filter(story => story.status === 'completed');
  const featured = stories
    .filter(story => (story.featured || story.isFeatured) && isDisplaySafeStory(story))
    .concat(byRating.filter(isDisplaySafeStory))
    .filter((story, index, list) => list.findIndex(item => item.id === story.id) === index);
  const hot = stories.filter(story => story.hot || story.isHot);
  const recommended = stories.filter(story => story.recommended || story.isRecommended);
  const banner = stories.filter(story => story.banner || story.isBanner);
  const homeTrending = stories.filter(story => story.homeTrending).sort((a, b) => toNumber(a.homeTrendingOrder) - toNumber(b.homeTrendingOrder));
  const trendingStories = uniqueStories(homeTrending.length ? homeTrending.concat(byViews) : byViews);
  const completedStories = uniqueStories((completed.length ? completed : []).concat(byRating));

  return {
    all: stories,
    hero: (banner.length ? banner : featured).slice(0, 6),
    hot: (hot.length ? hot : byViews).slice(0, 12),
    featuredStories: featured.slice(0, 24),
    promotedStories: (recommended.length ? recommended : featured).slice(0, 24),
    trending: trendingStories.slice(0, 48),
    updated: byUpdated.slice(0, 10),
    reviewStories: byRating.slice(0, 12),
    completed: completedStories.slice(0, 48),
    newLaunch: stories.slice().sort(sortByDate('createdAt')).slice(0, 8),
    editorPicks: featured.slice(0, 8),
    recommended: (recommended.length ? recommended : featured).slice(0, 8),
    personalized: byRating.filter(story => story.categories?.some(category => ['Ngôn tình', 'Đô thị', 'Chữa lành', 'Trinh thám'].includes(category))).slice(0, 8),
    ranking: byViews.slice(0, 10),
    rankingsByPeriod: {
      day: byViews.slice(0, 10),
      week: byViews.slice(0, 10),
      month: byViews.slice(0, 10),
      year: byViews.slice(0, 10),
      all: byViews.slice(0, 10)
    },
    categories: uniqueCategoriesFrom(stories)
  };
}

function mapHistoryItem(item = {}) {
  const story = normalizeStory(item.story || item);
  return {
    id: item.id || `history-${story.id || story.slug}`,
    story,
    chapterNumber: item.chapter?.number || item.chapterNumber || item.latestChapter?.number || 1,
    progress: item.progress || Math.min(92, Math.max(12, Math.round((toNumber(item.chapterNumber || 1) / Math.max(getChapterCount(story), 1)) * 100))),
    updatedAt: item.updatedAt || story.updatedAt
  };
}

async function fetchSafe(apiClient, path) {
  if (!apiClient) return null;
  try {
    return await apiClient(path);
  } catch (error) {
    const status = Number(error?.status || 0);
    if (!status || status >= 500) {
      console.error('[API_ERROR]', {
        path,
        url: error?.url,
        status: error?.status,
        statusText: error?.statusText,
        message: error?.message,
        timestamp: new Date().toISOString()
      });
    }
    return null;
  }
}

export function ProductionHeader({ user, logout, theme = 'light', toggleTheme, apiClient }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [genreOpen, setGenreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [categories, setCategories] = useState(isDev ? mockCategories : []);
  const [stories, setStories] = useState(isDev ? mockStories : []);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const headerRef = useRef(null);
  const navId = 'prod-mobile-nav';
  const genreMenuId = 'prod-genre-menu';
  const searchPanelId = 'prod-search-panel';
  const notificationMenuId = 'prod-notification-menu';
  const userMenuId = 'prod-user-menu';

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollingDown = currentScrollY > lastScrollY.current;

      setScrolled(currentScrollY > 24);
      setHidden(currentScrollY > 24 && scrollingDown);

      lastScrollY.current = currentScrollY;
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchSafe(apiClient, '/categories?limit=32'), fetchSafe(apiClient, '/stories?sort=views&limit=8')]).then(([categoryData, storyData]) => {
      if (!alive) return;
      const nextStories = normalizeStories(storyData?.stories || []);
      const nextCategories = (categoryData?.categories || []).map(repairText);
      setStories(nextStories.length ? nextStories : isDev ? mockStories : []);
      setCategories(nextCategories.length ? nextCategories : uniqueCategoriesFrom(nextStories.length ? nextStories : isDev ? mockStories : []));
    }).catch(() => {
      if (!alive) return;
      setStories(isDev ? mockStories : []);
      setCategories(isDev ? mockCategories : []);
    });
    return () => {
      alive = false;
    };
  }, [apiClient]);

  useEffect(() => {
    const closeByOutside = event => {
      if (!headerRef.current?.contains(event.target)) {
        setMobileOpen(false);
        setGenreOpen(false);
        setSearchOpen(false);
        setUserOpen(false);
        setNotificationOpen(false);
      }
    };
    const closeByEscape = event => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        setGenreOpen(false);
        setSearchOpen(false);
        setUserOpen(false);
        setNotificationOpen(false);
      }
    };
    document.addEventListener('mousedown', closeByOutside);
    window.addEventListener('keydown', closeByEscape);
    return () => {
      document.removeEventListener('mousedown', closeByOutside);
      window.removeEventListener('keydown', closeByEscape);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const updateLock = () => {
      const shouldLock = media.matches && (mobileOpen || genreOpen || searchOpen || userOpen || notificationOpen);
      document.body.classList.toggle('prod-mobile-panel-open', shouldLock);
    };
    updateLock();
    media.addEventListener('change', updateLock);
    return () => {
      media.removeEventListener('change', updateLock);
      document.body.classList.remove('prod-mobile-panel-open');
    };
  }, [mobileOpen, genreOpen, searchOpen, userOpen, notificationOpen]);

  const closeAll = () => {
    setMobileOpen(false);
    setGenreOpen(false);
    setSearchOpen(false);
    setUserOpen(false);
    setNotificationOpen(false);
  };

  const openSearch = () => {
    setSearchOpen(true);
    setMobileOpen(false);
    setGenreOpen(false);
    setUserOpen(false);
    setNotificationOpen(false);
  };

  const toggleMobileNav = () => {
    const nextOpen = !mobileOpen;
    setMobileOpen(nextOpen);
    if (nextOpen) {
      setGenreOpen(false);
      setSearchOpen(false);
      setUserOpen(false);
      setNotificationOpen(false);
    }
  };

  const goCategory = category => {
    closeAll();
    navigate(`/the-loai/${encodeURIComponent(category)}`);
  };

  return (
    <header className={`prod-header${hidden ? ' hidden' : ''}${scrolled ? ' scrolled' : ''}`} ref={headerRef}>
      <div className="prod-header-inner">
        <Link className="prod-brand" to="/" onClick={closeAll}>
          <img src="/images/logo.png" alt={'Truy\u1ec7n IO'} />
          {!scrolled && (
            <span>
              <strong>{'Truy\u1ec7n IO'}</strong>
              <small>{'Truy\u1ec7n online'}</small>
            </span>
          )}
        </Link>

        <Link className="prod-header-center-title" to="/" onClick={closeAll}>
          {'Truy\u1ec7n IO'}
        </Link>

        <button
          className="prod-icon-button prod-mobile-toggle"
          type="button"
          onClick={toggleMobileNav}
          aria-label={'M\u1edf menu'}
          aria-expanded={mobileOpen}
          aria-controls={navId}
        >
          <Majesticon name="menu" size={22} />
      </button>

        <nav id={navId} className={mobileOpen ? 'prod-nav open' : 'prod-nav'} aria-label="Menu chinh">
          <div className="prod-nav-group prod-nav-left">
            <NavLink end to="/" onClick={closeAll}><Majesticon name="homeSimple" size={18} />{'Trang ch\u1ee7'}</NavLink>
            <NavLink to="/danh-sach?status=completed" className={location.search.includes('status=completed') ? 'active' : ''} onClick={closeAll}><Majesticon name="checklist" size={18} />{'Ho\u00e0n th\u00e0nh'}</NavLink>
            <NavLink to="/truyen-ngan" onClick={closeAll}><Majesticon name="bookOpen" size={18} />{'Truy\u1ec7n ng\u1eafn'}</NavLink>
          </div>
          <div className="prod-nav-group prod-nav-right">
            <div className="prod-menu-wrap">
              <button
                className={genreOpen || location.pathname.startsWith('/the-loai') ? 'prod-nav-button active' : 'prod-nav-button'}
                type="button"
                onClick={() => {
                  const nextOpen = !genreOpen;
                  setGenreOpen(nextOpen);
                  setMobileOpen(false);
                  setSearchOpen(false);
                  setUserOpen(false);
                  setNotificationOpen(false);
                }}
                aria-expanded={genreOpen}
                aria-controls={genreMenuId}
              >
                <Majesticon name="list" size={18} />{'Th\u1ec3 lo\u1ea1i'} <Majesticon name="chevronDown" size={16} />
              </button>
            </div>
            <NavLink to="/xep-hang" onClick={closeAll}><Majesticon name="award" size={18} />{'X\u1ebfp h\u1ea1ng'}</NavLink>
          </div>
        </nav>
        {genreOpen && <MegaMenu id={genreMenuId} categories={categories} onSelect={goCategory} closeAll={closeAll} />}

        <div className="prod-header-actions">
          <SearchCommand
            open={searchOpen}
            setOpen={setSearchOpen}
            onFocus={openSearch}
            panelId={searchPanelId}
            stories={stories}
            categories={categories}
            navigate={navigate}
            closeAll={closeAll}
          />
          <NotificationDropdown
            user={user}
            apiClient={apiClient}
            open={notificationOpen}
            setOpen={next => {
              setNotificationOpen(next);
              setMobileOpen(false);
              setSearchOpen(false);
              setGenreOpen(false);
              setUserOpen(false);
            }}
            menuId={notificationMenuId}
          />
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} scrolled={scrolled} />
          <UserDropdown
            user={user}
            logout={logout}
            open={userOpen}
            setOpen={next => {
              setUserOpen(next);
              setMobileOpen(false);
              setSearchOpen(false);
              setGenreOpen(false);
              setNotificationOpen(false);
            }}
            closeAll={closeAll}
            menuId={userMenuId}
            scrolled={scrolled}
          />
        </div>
      </div>
    </header>
  );
}

export function MegaMenu({ id, categories, onSelect, closeAll }) {
  const columns = chunkIntoColumns(categories.slice(0, 32), 4);
  return (
    <div className="prod-mega-menu" id={id}>
      <div className="prod-mega-head">
        <strong>Khám phá thể loại</strong>
        <span>{categories.length} chủ đề đang có truyện</span>
      </div>
      <div className="prod-mega-grid">
        {columns.map((column, columnIndex) => (
          <div className="prod-mega-col" key={`genre-column-${columnIndex}`}>
            {column.map(category => (
              <button type="button" key={category} onClick={() => onSelect(category)}>
                {category}
              </button>
            ))}
          </div>
        ))}
      </div>
      <Link className="prod-mega-all" to="/danh-sach" onClick={closeAll}>Xem tất cả truyện</Link>
    </div>
  );
}

export function SearchCommand({ open, setOpen, onFocus, panelId, stories, categories, navigate, closeAll }) {
  const [keyword, setKeyword] = useState('');
  const mobileInputRef = useRef(null);
  const [history, setHistory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('daudo_search_history') || '[]');
      return saved.length ? saved : mockSearchHistory;
    } catch {
      return mockSearchHistory;
    }
  });

  useEffect(() => {
    if (!open) return;
    const shouldFocusMobileInput = window.matchMedia('(max-width: 768px)').matches;
    if (shouldFocusMobileInput) {
      window.requestAnimationFrame(() => mobileInputRef.current?.focus());
    }
  }, [open]);

  const searchText = normalizeForSearch(keyword.trim());
  const quickStories = useMemo(() => {
    const source = searchText
      ? stories.filter(story => normalizeForSearch([story.title, story.author, story.description, ...(story.categories || [])].join(' ')).includes(searchText))
      : stories;
    return source.slice(0, 5);
  }, [stories, searchText]);
  const quickCategories = useMemo(() => {
    const source = searchText ? categories.filter(category => normalizeForSearch(category).includes(searchText)) : categories;
    return source.slice(0, 8);
  }, [categories, searchText]);

  const saveHistory = value => {
    const text = value.trim();
    if (!text) return;
    const next = [text, ...history.filter(item => item !== text)].slice(0, 6);
    setHistory(next);
    localStorage.setItem('daudo_search_history', JSON.stringify(next));
  };

  const goSearch = value => {
    const text = String(value || keyword).trim();
    if (!text) return;
    saveHistory(text);
    setOpen(false);
    closeAll();
    navigate(`/danh-sach?q=${encodeURIComponent(text)}`);
  };

  const goStory = story => {
    if (!story?.slug) return;
    saveHistory(story.title);
    setOpen(false);
    closeAll();
    navigate(`/truyen/${story.slug}`);
  };

  const goCategory = category => {
    saveHistory(category);
    setOpen(false);
    closeAll();
    navigate(`/the-loai/${encodeURIComponent(category)}`);
  };

  return (
    <div className="prod-search">
      <button
        className="prod-icon-button prod-search-trigger"
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={'T\u00ecm ki\u1ebfm'}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <Majesticon name="search" size={20} />
      </button>
      <label className="prod-search-box">
        <Majesticon name="search" size={20} />
        <input
          value={keyword}
          onChange={event => setKeyword(event.target.value)}
          onFocus={onFocus}
          onKeyDown={event => {
            if (event.key === 'Enter') goSearch(keyword);
          }}
          placeholder={'T\u00ecm truy\u1ec7n, t\u00e1c gi\u1ea3...'}
        />
      </label>
      {open && (
        <div className="prod-search-panel" id={panelId}>
          <div className="prod-command-head">
            <strong>{'T\u00ecm ki\u1ebfm nhanh'}</strong>
            <button type="button" onClick={() => setOpen(false)}>ESC</button>
          </div>
          <label className="prod-search-panel-input">
            <Majesticon name="search" size={20} />
            <input
              ref={mobileInputRef}
              value={keyword}
              onChange={event => setKeyword(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') goSearch(keyword);
              }}
              placeholder={'T\u00ecm truy\u1ec7n, t\u00e1c gi\u1ea3...'}
            />
          </label>
          <SearchBlock title={'G\u1ee3i \u00fd ph\u1ed5 bi\u1ebfn'} items={mockPopularSearches} onSelect={goSearch} />
          {history.length > 0 && <SearchBlock title={'L\u1ecbch s\u1eed t\u00ecm ki\u1ebfm'} items={history} onSelect={goSearch} muted />}
          <div className="prod-search-results">
            <p>{'K\u1ebft qu\u1ea3 nhanh'}</p>
            {quickStories.map(story => (
              <button type="button" key={story.id} onClick={() => goStory(story)}>
                <img src={story.cover || coverFallback} alt={story.title} loading="lazy" onError={handleImageError} />
                <span>
                  <strong>{story.title}</strong>
                  <small>{story.author} {'\u00b7 \u2605'} {story.rating || 4.5}</small>
                </span>
              </button>
            ))}
            {quickStories.length === 0 && <div className="prod-empty-mini">{'Kh\u00f4ng c\u00f3 truy\u1ec7n ph\u00f9 h\u1ee3p.'}</div>}
          </div>
          <div className="prod-search-chips">
            {quickCategories.map(category => (
              <button type="button" key={category} onClick={() => goCategory(category)}>{category}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchBlock({ title, items, onSelect, muted = false }) {
  return (
    <div className={muted ? 'prod-search-block muted' : 'prod-search-block'}>
      <p>{title}</p>
      <div>
        {items.map(item => (
          <button type="button" key={item} onClick={() => onSelect(item)}>{item}</button>
        ))}
      </div>
    </div>
  );
}

export function NotificationDropdown({ open, setOpen, user, apiClient, menuId }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const dispatchChanged = () => window.dispatchEvent(new CustomEvent('daudo:notifications-changed'));

  async function loadUnread() {
    if (!user || !apiClient) {
      setUnread(0);
      setNotifications([]);
      return;
    }
    try {
      const data = await apiClient('/notifications/unread-count');
      setUnread(Number(data.count || 0));
    } catch {
      setUnread(0);
    }
  }

  async function loadNotifications() {
    if (!user || !apiClient) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiClient('/notifications?limit=6');
      setNotifications(data.notifications || []);
      setUnread(Number(data.unreadCount ?? 0));
    } catch (err) {
      setError(err.message || 'Không tải được thông báo.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUnread();
    const refresh = () => loadUnread();
    window.addEventListener('daudo:notifications-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('daudo:notifications-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [user?.id, apiClient]);

  useEffect(() => {
    if (open) loadNotifications();
  }, [open, user?.id, apiClient]);

  async function markAllRead() {
    if (!user || !apiClient) return;
    setNotifications(current => current.map(item => ({ ...item, read: true })));
    setUnread(0);
    try {
      await apiClient('/notifications/read-all', { method: 'POST' });
      dispatchChanged();
    } catch (err) {
      setError(err.message || 'Không đánh dấu được thông báo.');
      await loadNotifications();
    }
  }

  async function openNotification(item) {
    if (!item.read && apiClient) {
      try {
        const data = await apiClient(`/notifications/${item.id}/read`, { method: 'POST' });
        setUnread(Number(data.unreadCount || 0));
        dispatchChanged();
      } catch {
        await loadUnread();
      }
    }
    setOpen(false);
    if (item.link) navigate(item.link);
  }

  return (
    <div className="prod-dropdown-wrap">
      <button className="prod-icon-button" type="button" aria-label={'Th\u00f4ng b\u00e1o'} onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={menuId}>
        <Majesticon name="bell" size={20} />
        {unread > 0 && <b>{unread}</b>}
      </button>
      {open && (
        <div className="prod-notification-menu" id={menuId}>
          <div className="prod-dropdown-head">
            <strong>Thông báo</strong>
            {user && <button type="button" onClick={markAllRead} disabled={!unread}>Đánh dấu đã đọc</button>}
          </div>
          <div className="prod-notification-list">
            {!user && <div className="read"><span /><div><strong>Cần đăng nhập</strong><p>Đăng nhập để xem thông báo cá nhân.</p></div></div>}
            {user && loading && <div className="read"><span /><div><strong>Đang tải</strong><p>Đang lấy thông báo mới nhất.</p></div></div>}
            {user && error && <div className="read"><span /><div><strong>Lỗi</strong><p>{error}</p></div></div>}
            {user && !loading && !error && notifications.length === 0 && <div className="read"><span /><div><strong>Chưa có thông báo</strong><p>Thông báo mới sẽ xuất hiện ở đây.</p></div></div>}
            {user && notifications.map(item => (
              <button type="button" key={item.id} className={item.read ? 'read' : 'unread'} onClick={() => openNotification(item)}>
                <span />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </div>
              </button>
            ))}
          </div>
          <Link className="prod-notification-footer" to="/notifications" onClick={() => setOpen(false)}>
            Xem tất cả thông báo
          </Link>
        </div>
      )}
    </div>
  );
}

export function ThemeToggle({ theme, toggleTheme }) {
  return (
    <button className="prod-icon-button" type="button" onClick={toggleTheme} aria-label={'\u0110\u1ed5i giao di\u1ec7n'}>
      <Majesticon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
    </button>
  );
}

export function UserDropdown({ user, logout, open, setOpen, closeAll, menuId }) {
  const navigate = useNavigate();
  const guest = !user;
  const menuItems = user ? [
    { label: 'Tủ truyện', to: '/bookmarks', icon: 'bookmark' },
    { label: 'Lịch sử đọc', to: '/history', icon: 'clock' },
    { label: 'Nạp Đậu', to: '/wallet', icon: 'coins' },
    { label: 'Khu tác giả', to: '/author', icon: 'edit' },
    { label: 'Cài đặt', to: '/settings#profile', icon: 'settings' },
    ...(user.role === 'admin' ? [{ label: 'Quản trị viên', to: '/admin', icon: 'shield' }] : [])
  ] : [];

  return (
    <div className="prod-dropdown-wrap prod-user-wrap">
      <button className={open ? 'prod-user-button active' : 'prod-user-button'} type="button" onClick={() => setOpen(!open)} aria-label="Tài khoản" aria-expanded={open} aria-controls={menuId}>
        <img src={user?.avatar || '/images/logo.png'} alt={user?.name || 'Tài khoản'} />
        <span>{user?.name || 'Đăng nhập'}</span>
      </button>
      {open && (
        <div className="prod-user-menu" id={menuId}>
          {guest ? (
            <div className="prod-user-guest">
              <strong>Đăng nhập để đồng bộ tủ truyện</strong>
          <p>Lưu lịch sử đọc, nhận thông báo chương mới và quản lý Đậu.</p>
              <div>
                <button type="button" className="prod-primary-button" onClick={() => { closeAll(); navigate('/login'); }}>Đăng nhập</button>
                <button type="button" className="prod-soft-button" onClick={() => { closeAll(); navigate('/register'); }}>Đăng ký</button>
              </div>
            </div>
          ) : (
            <>
              <div className="prod-user-card">
                <img src={user.avatar || '/images/logo.png'} alt={user.name} />
                <div>
                  <strong>{user.name || 'Độc giả'}</strong>
                    <span>{formatNumber(user.seeds || 0)} Đậu · {user.role === 'admin' ? 'Admin' : 'User'}</span>
                </div>
              </div>
              <div className="prod-user-links">
                {menuItems.map(item => (
                  <Link key={item.label} to={item.to} onClick={closeAll}>
                    <Majesticon name={item.icon} size={18} />
                    {item.label}
                  </Link>
                ))}
                <button type="button" onClick={() => { logout?.(); closeAll(); }}>
                  <Majesticon name="logout" size={18} />
                  Đăng xuất
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ProductionHome({ apiClient, currentUser }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [homeData, setHomeData] = useState(() => buildHomeSlices(isDev ? mockStories : []));
  const [continueItems, setContinueItems] = useState([]);

  useEffect(() => {
    let alive = true;

    async function loadHome() {
      setLoading(true);
      const home = await fetchSafe(apiClient, '/home');
      const fallback = home ? null : await Promise.all([
        fetchSafe(apiClient, '/stories?sort=created&limit=20'),
        fetchSafe(apiClient, '/stories?sort=updated&limit=20'),
        fetchSafe(apiClient, '/stories?featured=true&sort=rating&limit=20'),
        fetchSafe(apiClient, '/stories?sort=views&limit=20'),
        fetchSafe(apiClient, '/stories?status=completed&sort=updated&limit=20'),
        fetchSafe(apiClient, '/categories?limit=30'),
        fetchSafe(apiClient, '/stories?homeTrending=true&limit=10')
      ]);
      const homeTrendingFallback = home && !normalizeStories(home?.trendingStories || []).length
        ? await fetchSafe(apiClient, '/stories?homeTrending=true&limit=10')
        : null;

      if (!alive) return;

      const merged = normalizeStories(home ? [
        ...(home?.banners || []),
        ...(home?.updatedStories || []),
        ...(home?.popularStories || []),
        ...(home?.completedStories || []),
        ...(home?.featuredStories || []),
        ...(home?.recommendedStories || []),
        ...(home?.promotedStories || []),
        ...(home?.reviewStories || []),
        ...(home?.trendingStories || []),
        ...Object.values(home?.rankingsByPeriod || {}).flat()
      ] : [
        ...(fallback?.[0]?.stories || []),
        ...(fallback?.[1]?.stories || []),
        ...(fallback?.[2]?.stories || []),
        ...(fallback?.[3]?.stories || []),
        ...(fallback?.[4]?.stories || []),
        ...(fallback?.[6]?.stories || [])
      ]);
      const unique = Array.from(new Map(merged.map(story => [story.id || story.slug, story])).values());
      const fallbackUsed = unique.length === 0;
      const nextData = buildHomeSlices(fallbackUsed ? mockStories : unique);
      const apiCategories = ((home?.categories || fallback?.[5]?.categories) || []).map(repairText);
      const homeTrending = normalizeStories(home?.trendingStories || []);
      const fallbackTrending = normalizeStories((homeTrendingFallback || fallback?.[6])?.stories || []);
      const bannerStories = normalizeStories(home?.banners || []);
      const heroStories = bannerStories.length >= 3
        ? bannerStories
        : uniqueStories([...bannerStories, ...(home?.featuredStories ? normalizeStories(home.featuredStories) : nextData.featuredStories), ...nextData.hero]).slice(0, 6);
      setHomeData({
        ...nextData,
        hero: heroStories.length ? heroStories : nextData.hero,
        featuredStories: normalizeStories(home?.featuredStories || []).length ? normalizeStories(home.featuredStories) : nextData.featuredStories,
        promotedStories: normalizeStories(home?.promotedStories || []).length ? normalizeStories(home.promotedStories) : nextData.promotedStories,
        updated: normalizeStories(home?.updatedStories || []).length ? normalizeStories(home.updatedStories) : nextData.updated,
        reviewStories: normalizeStories(home?.reviewStories || []).length ? normalizeStories(home.reviewStories) : nextData.reviewStories,
        trending: homeTrending.length ? homeTrending : fallbackTrending.length ? fallbackTrending : nextData.trending,
        completed: normalizeStories(home?.completedStories || []).length ? normalizeStories(home.completedStories) : nextData.completed,
        rankingsByPeriod: home?.rankingsByPeriod ? Object.fromEntries(Object.entries(home.rankingsByPeriod).map(([key, value]) => [key, normalizeStories(value)])) : nextData.rankingsByPeriod,
        categories: apiCategories.length ? apiCategories : nextData.categories
      });
      setError('');
      setLoading(false);
    }

    loadHome();
    return () => {
      alive = false;
    };
  }, [apiClient]);

  useEffect(() => {
    let alive = true;
    async function loadLibrary() {
      if (!currentUser) {
        setContinueItems([]);
        return;
      }
      const library = await fetchSafe(apiClient, '/me/library');
      if (!alive) return;
      const history = (library?.history || []).map(mapHistoryItem);
      setContinueItems(history.length ? history : isDev ? mockContinueReading : []);
    }
    loadLibrary();
    return () => {
      alive = false;
    };
  }, [apiClient, currentUser]);

  if (loading) {
    return (
      <div className="home-production">
        <HomeLoading />
      </div>
    );
  }

  return (
    <div className="home-production">
      {error && <div className="prod-error-state">{error}<button type="button" onClick={() => window.location.reload()}>Thử lại</button></div>}
      <HeroSlider stories={homeData.hero} />
      <ContinueReadingSection user={currentUser} items={continueItems} />
      <PagedStoryRail title="Truyện Nổi Bật" subtitle="Khám phá những câu chuyện được yêu thích nhất" stories={homeData.featuredStories} to="/danh-sach?featured=true" icon="star" />
      <PagedStoryRail title="Truyện Quảng Bá" subtitle="Khám phá những tác phẩm được đề xuất đặc biệt" stories={homeData.promotedStories} to="/danh-sach?recommended=true" icon="send" promoted />
      <div className="home-magazine-grid">
        <UpdatedStoryPanel stories={homeData.updated} />
        <aside className="home-side-stack">
          <ReviewTicker stories={homeData.reviewStories} />
          <GenreChips categories={homeData.categories} compact />
        </aside>
      </div>
      <StorySection icon="ranking" kicker="Hot" title="Truyện Đang Xu Hướng" subtitle="Truyện do admin chọn và sắp xếp vị trí." to="/danh-sach?sort=views">
        <StoryGrid stories={homeData.trending} className="home-trending-grid" />
      </StorySection>
      <StorySection icon="check" kicker="Full" title="Truyện Đã Hoàn Thành" subtitle="Các truyện đã kết thúc trọn vẹn, tự động cập nhật theo trạng thái." to="/danh-sach?status=completed">
        <StoryGrid stories={homeData.completed} className="home-completed-grid" />
      </StorySection>
      <HomeRankingBoard rankingsByPeriod={homeData.rankingsByPeriod} />
    </div>
  );
}

function HomeLoading() {
  return (
    <>
      <div className="prod-hero-skeleton" />
      <div className="prod-section-skeleton">
        {Array.from({ length: 8 }).map((_, index) => <span key={index} />)}
      </div>
    </>
  );
}

export function HeroSlider({ stories }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const slides = normalizeStories(stories?.length ? stories : isDev ? mockStories.slice(0, 6) : []).filter(isHeroDisplayStory).slice(0, 6);
  const current = slides.length ? slides[active % slides.length] : null;
  const currentIndex = slides.length ? active % slides.length : 0;
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => { setActive(0); }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1 || paused || prefersReducedMotion) return undefined;
    const timer = window.setInterval(() => setActive(index => (index + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, [slides.length, paused, prefersReducedMotion]);

  const goPrev = () => setActive(index => (index - 1 + slides.length) % slides.length);
  const goNext = () => setActive(index => (index + 1) % slides.length);

  if (!current) {
    return <div className="prod-empty-state">{'Ch\u01b0a c\u00f3 truy\u1ec7n ph\u00f9 h\u1ee3p \u0111\u1ec3 hi\u1ec3n th\u1ecb.'}</div>;
  }

  const heroImage = storyHeroImage(current);
  const detailHref = current.heroLink || current.detailUrl || current.url || `/truyen/${current.slug || mockStories[0]?.slug || ''}`;
  const readHref = current.readUrl || current.ctaUrl || detailHref;

  return (
    <section className="prod-hero-slider home-hero" style={{ '--hero-image': 'url("' + heroImage + '")' }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
      <img src={heroImage} alt="" aria-hidden="true" decoding="async" className="hero-bg" onError={handleHeroImageError} />
      <img src={heroImage} alt={current.title} fetchPriority="high" decoding="async" className="prod-hero-media hero-main" style={{ objectPosition: current.imagePosition || 'center center' }} onError={handleHeroImageError} />
      <div className="prod-hero-overlay hero-overlay" />
      <button className="prod-hero-arrow prev hero-arrow left" type="button" onClick={goPrev} aria-label={'Truy\u1ec7n tr\u01b0\u1edbc'}>&lsaquo;</button>
      <div className="prod-hero-content hero-content">
        <h1>{current.title}</h1>
        <p>{current.description}</p>
        <div className="prod-hero-meta">
          <span>{'\u2605'} {current.rating || 4.5}</span>
          <span>{formatNumber(getChapterCount(current))} {'ch\u01b0\u01a1ng'}</span>
          <span>{formatNumber(current.views)} {'l\u01b0\u1ee3t \u0111\u1ecdc'}</span>
          <span>{current.author}</span>
        </div>
        <div className="prod-hero-actions hero-actions">
          <Link className="prod-primary-button" to={readHref}>{'\u0110\u1ecdc ngay'}</Link>
          <Link className="prod-glass-button" to={detailHref}><Majesticon name="play" size={18} />{'Chi ti\u1ebft'}</Link>
        </div>
      </div>
      <button className="prod-hero-arrow next hero-arrow right" type="button" onClick={goNext} aria-label={'Truy\u1ec7n ti\u1ebfp theo'}>&rsaquo;</button>
      <div className="prod-hero-thumbs hero-featured-list">
        {slides.slice(0, 6).map((story, index) => {
          const cardImage = story.coverImage || story.cover || coverFallback;
          return (
            <button key={story.id || story.slug} className={index === currentIndex ? 'story-preview-card active' : 'story-preview-card'} type="button" onClick={() => setActive(index)} aria-label={`Chuy\u1ec3n \u0111\u1ebfn truy\u1ec7n ${story.title}` }>
              <img src={cardImage} alt={story.title} decoding="async" loading="lazy" onError={handleImageError} />
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{story.title}</strong>
              <small>{formatCompactNumber(story.views)} {'l\u01b0\u1ee3t \u0111\u1ecdc'}</small>
            </button>
          );
        })}
      </div>
      <div className="prod-hero-dots hero-dots">
        {slides.map((story, index) => <button key={`dot-${story.id || story.slug}`} type="button" className={index === currentIndex ? 'active' : ''} onClick={() => setActive(index)} aria-label={`Chuy\u1ec3n \u0111\u1ebfn truy\u1ec7n ${story.title}`} />)}
      </div>
    </section>
  );
}

function SectionHeader({ icon = 'book', kicker, title, subtitle, to, actionLabel = 'Tất cả' }) {
  return (
    <div className="prod-section-head home-section-head">
      <div className="home-section-title">
        <span className="home-section-icon"><Majesticon name={icon} size={22} /></span>
        <span>
          {kicker && <em>{repairText(kicker)}</em>}
          <h2>{repairText(title)}</h2>
          {subtitle && <p>{repairText(subtitle)}</p>}
        </span>
      </div>
      {to && <Link to={to}>{actionLabel}<Majesticon name="arrowRight" size={16} /></Link>}
    </div>
  );
}

function PagedStoryRail({ title, subtitle, stories = [], to, icon = 'star', promoted = false }) {
  const list = normalizeStories(stories).filter(isDisplaySafeStory);
  const isMobile = useMediaQuery('(max-width: 720px)');
  const perPage = isMobile ? (promoted ? 2 : 3) : 8;
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const railRef = useRef(null);
  const listKey = list.map(story => story.id || story.slug).join('|');
  const safePage = Math.min(Math.max(page, 0), pages - 1);
  const current = list.slice(safePage * perPage, safePage * perPage + perPage);

  useEffect(() => setPage(0), [listKey, perPage]);
  useEffect(() => {
    setPage(value => Math.min(value, pages - 1));
  }, [pages]);
  useEffect(() => {
    railRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [safePage]);
  useEffect(() => {
    if (!isMobile || paused || pages <= 1) return undefined;
    const timer = window.setInterval(() => {
      setPage(value => (value + 1) % pages);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [isMobile, pages, paused]);

  const go = direction => setPage(value => (value + direction + pages) % pages);
  const setPageManually = index => {
    setPaused(true);
    setPage(index);
  };

  return (
    <RevealSection className={promoted ? 'home-rail promoted' : 'home-rail'}>
      <SectionHeader icon={icon} kicker={promoted ? 'Promo' : 'Featured'} title={title} subtitle={subtitle} to={to} />
      <div className="home-rail-wrap" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
        {pages > 1 && <button type="button" className="home-rail-arrow prev" onClick={() => go(-1)} aria-label="Trang trước">‹</button>}
        <div className="home-rail-page" ref={railRef}>
          {current.map(story => <StoryCard key={story.id || story.slug} story={story} />)}
          {!list.length && <div className="home-rail-empty">Chua co truyen de hien thi.</div>}
        </div>
        {pages > 1 && <button type="button" className="home-rail-arrow next" onClick={() => go(1)} aria-label="Trang sau">›</button>}
      </div>
      {pages > 1 && (
        <div className="home-rail-dots">
          {Array.from({ length: pages }).map((_, index) => <button key={index} type="button" className={index === safePage ? 'active' : ''} onClick={() => setPageManually(index)} aria-label={`Trang ${index + 1}`} />)}
        </div>
      )}
    </RevealSection>
  );
}

function UpdatedStoryPanel({ stories = [] }) {
  const list = normalizeStories(stories).filter(isDisplaySafeStory).slice(0, 10);
  return (
    <RevealSection className="home-updated-panel">
      <SectionHeader icon="clock" kicker="Update" title="Truyện Mới Cập Nhật" to="/danh-sach?sort=updated" />
      <div className="home-updated-list">
        {list.map(story => (
          <Link key={story.id || story.slug} to={`/truyen/${story.slug}`} className="home-updated-item">
            <img src={story.cover || coverFallback} alt={story.title} decoding="async" loading="lazy" onError={handleImageError} />
            <span>
              <strong>{story.title}</strong>
              <small>{story.latestChapter?.title || `Chương ${getChapterCount(story) || 1}`}</small>
              <small>{formatNumber(story.views)} lượt đọc</small>
            </span>
          </Link>
        ))}
      </div>
    </RevealSection>
  );
}

function ReviewTicker({ stories = [] }) {
  const list = normalizeStories(stories).filter(isDisplaySafeStory).slice(0, 12);
  const loop = list.length > 4 ? [...list, ...list] : list;

  return (
    <RevealSection className="home-review-panel">
      <SectionHeader icon="star" kicker="Review" title="Đánh Giá Truyện" />
      <div className="home-review-viewport">
        <div className={list.length > 4 ? 'home-review-list scrolling' : 'home-review-list'}>
          {loop.map((story, index) => (
          <Link key={`${story.id || story.slug}-${index}`} to={`/truyen/${story.slug}`}>
            <img src={story.cover || coverFallback} alt={story.title} decoding="async" loading="lazy" onError={handleImageError} />
            <span>
              <strong>{story.title}</strong>
              <small>★ {story.rating || 0} · {formatNumber(story.ratingCount || 0)} đánh giá</small>
            </span>
          </Link>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}

const rankingPeriods = [
  ['day', 'Ngày'],
  ['week', 'Tuần'],
  ['month', 'Tháng'],
  ['year', 'Năm'],
  ['all', 'Tất cả']
];

function HomeRankingBoard({ rankingsByPeriod = {} }) {
  const [period, setPeriod] = useState('day');
  const list = normalizeStories(rankingsByPeriod?.[period] || rankingsByPeriod?.week || []).filter(isDisplaySafeStory).slice(0, 10);
  const rows = Array.from({ length: 5 }, (_, index) => list.slice(index * 2, index * 2 + 2));
  return (
    <RevealSection className="home-ranking-board">
      <SectionHeader icon="ranking" kicker="Top" title="Bảng Xếp Hạng Truyện" subtitle="Tự động cập nhật theo lượt xem." to="/xep-hang" actionLabel="Xem tất cả" />
      <div className="home-ranking-tabs">
        {rankingPeriods.map(([value, label]) => <button key={value} type="button" className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{label}</button>)}
      </div>
      <div className="home-ranking-rows">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="home-ranking-row">
            {row.map((story, itemIndex) => {
              const rank = rowIndex * 2 + itemIndex + 1;
              const completed = story.status === 'completed';
              return (
                <Link key={story.id || story.slug} to={`/truyen/${story.slug}`}>
                  <b>{rank <= 3 ? <Majesticon name="award" size={17} /> : rank}</b>
                  <img src={story.cover || coverFallback} alt={story.title} decoding="async" loading="lazy" onError={handleImageError} />
                  <span>
                    <strong>{story.title}</strong>
                    <small>{story.author || 'Đậu Đỏ Truyện'}</small>
                    <em><Majesticon name="eye" size={14} />{formatNumber(story.rankScore || story.periodViews || story.views)} · ★ {story.rating || 0}</em>
                  </span>
                  <i>{completed ? 'Hoàn thành' : 'Đang ra'}</i>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </RevealSection>
  );
}

export function StoryCard({ story }) {
  const [favorite, setFavorite] = useState(Boolean(story?.bookmarked || story?.followed));
  if (!story?.slug) return null;
  const chapterCount = getChapterCount(story);
  const isFull = story.status === 'completed';
  const isHot = Boolean(story.hot || story.isHot);
  const isVip = Boolean(story.premium);

  return (
    <article className="prod-story-card">
      <Link to={`/truyen/${story.slug}`} className="prod-card-cover" aria-label={story.title}>
        <img src={story.cover || coverFallback} alt={story.title} decoding="async" loading="lazy" onError={handleImageError} />
        <span className="prod-badge-row">
          {isHot && <b className="hot">HOT</b>}
          {isFull && <b className="full">FULL</b>}
          {isVip && <b className="vip">VIP</b>}
        </span>
        <span className="prod-card-views"><Majesticon name="eye" size={13} />{formatCompactNumber(story.views)}</span>
      </Link>
      <button
        className={favorite ? 'prod-fav-button active' : 'prod-fav-button'}
        type="button"
        onClick={() => setFavorite(value => !value)}
        aria-label={favorite ? 'Bo yeu thich' : 'Yeu thich truyen'}
      >
        <Majesticon name="heart" size={20} />
      </button>
      <div className="prod-card-body">
        <Link to={`/truyen/${story.slug}`}><h3>{story.title}</h3></Link>
        <p>{story.author}</p>
        <div className="prod-card-meta">
          <span>★ {story.rating || 4.5}</span>
          <span>{formatNumber(chapterCount)} chương</span>
        </div>
        <div className="prod-card-meta muted">
          <span>{formatNumber(story.views)} lượt đọc</span>
        </div>
      </div>
    </article>
  );
}

export function StorySection({ icon = 'book', kicker, title, subtitle, to, children }) {
  return (
    <RevealSection className="prod-story-section">
      <SectionHeader icon={icon} kicker={kicker} title={title} subtitle={subtitle} to={to} actionLabel="Xem tất cả" />
      {children}
    </RevealSection>
  );
}

function StoryGrid({ stories, compact = false, className = '' }) {
  const items = stories?.filter(story => story?.slug) || [];
  const isPagedGrid = className.includes('home-trending-grid') || className.includes('home-completed-grid');
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const [page, setPage] = useState(0);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [pageInput, setPageInput] = useState('1');
  const visibleItems = isPagedGrid ? items.slice(page * pageSize, page * pageSize + pageSize) : items;

  useEffect(() => {
    setPage(0);
  }, [items.length, isPagedGrid]);

  useEffect(() => {
    setPage(value => Math.min(value, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    setPageInput(String(page + 1));
  }, [page]);

  if (!items.length) {
    return <div className="prod-empty-state">Chưa có truyện phù hợp để hiển thị.</div>;
  }

  const goPage = nextPage => {
    const clampedPage = Math.max(0, Math.min(pageCount - 1, nextPage));
    setPage(clampedPage);
    setPageInput(String(clampedPage + 1));
  };
  const setQuickPage = nextPage => {
    const target = Math.max(0, Math.min(pageCount - 1, nextPage));
    setPageInput(String(target + 1));
  };
  const submitPagePicker = () => {
    const parsed = Number.parseInt(pageInput, 10);
    goPage(Number.isFinite(parsed) ? parsed - 1 : page);
    setPagePickerOpen(false);
  };
  const adjustPageInput = direction => {
    const parsed = Number.parseInt(pageInput, 10);
    const current = Number.isFinite(parsed) ? parsed : page + 1;
    const next = Math.max(1, Math.min(pageCount, current + direction));
    setPageInput(String(next));
  };

  return (
    <>
      <div className={[compact ? 'prod-story-grid compact' : 'prod-story-grid', className].filter(Boolean).join(' ')}>
        {visibleItems.map(story => <StoryCard key={story.id || story.slug} story={story} />)}
      </div>
      {isPagedGrid && (
        <div className={pagePickerOpen ? 'home-pagination-wrap picker-open' : 'home-pagination-wrap'}>
          <div className="home-mobile-pagination" aria-label="Phân trang truyện">
            <button type="button" className="page-edge" onClick={() => goPage(page - 1)} disabled={page === 0} aria-label="Trang trước">‹ Trước</button>
            {Array.from({ length: Math.min(pageCount, 4) }).map((_, index) => {
              const pageNumber = index + 1;
              return <button key={pageNumber} type="button" className={page === index ? 'active' : ''} onClick={() => goPage(index)}>{pageNumber}</button>;
            })}
            <button type="button" className="search-page-button" onClick={() => setPagePickerOpen(true)} aria-label="Chọn trang"><Majesticon name="search" size={14} /><span>Trang</span></button>
            <button type="button" className="page-edge" onClick={() => goPage(page + 1)} disabled={page === pageCount - 1} aria-label="Trang sau">Sau ›</button>
            <span>Hiển thị <b>{page * pageSize + 1} - {Math.min((page + 1) * pageSize, items.length)}</b> / {formatNumber(items.length)} truyện</span>
          </div>
          {pagePickerOpen && (
            <div className="home-page-picker-backdrop" role="dialog" aria-modal="true" aria-label="Đi đến trang">
              <div className="home-page-picker">
                <div className="home-page-picker-head">
                  <strong>Đi đến trang</strong>
                  <button type="button" onClick={() => setPagePickerOpen(false)} aria-label="Đóng">×</button>
                </div>
                <p>Trang <b>{page + 1}</b> / <b>{formatNumber(pageCount)}</b></p>
                <div className="home-page-picker-quick">
                  <button type="button" onClick={() => setQuickPage(0)}>Đầu</button>
                  <button type="button" onClick={() => setQuickPage(Math.floor((pageCount - 1) / 2))}>Giữa</button>
                  <button type="button" onClick={() => setQuickPage(pageCount - 1)}>Cuối</button>
                </div>
                <div className="home-page-picker-stepper">
                  <button type="button" onClick={() => adjustPageInput(-1)} aria-label="Giảm trang">−</button>
                  <input
                    type="number"
                    min="1"
                    max={pageCount}
                    value={pageInput}
                    onChange={event => setPageInput(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') submitPagePicker();
                      if (event.key === 'Escape') setPagePickerOpen(false);
                    }}
                    aria-label="Số trang"
                  />
                  <button type="button" onClick={() => adjustPageInput(1)} aria-label="Tăng trang">+</button>
                </div>
                <button type="button" className="home-page-picker-submit" onClick={submitPagePicker}>→ Đi đến trang</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function PagedStoryGridDeprecated({ stories, compact = false, className = '' }) {
  const items = stories?.filter(story => story?.slug) || [];
  const isPagedMobileGrid = className.includes('home-trending-grid') || className.includes('home-completed-grid');
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const [page, setPage] = useState(0);
  const visibleItems = isPagedMobileGrid ? items.slice(page * pageSize, page * pageSize + pageSize) : items;

  useEffect(() => {
    setPage(0);
  }, [items.length, isPagedMobileGrid]);

  useEffect(() => {
    setPage(value => Math.min(value, pageCount - 1));
  }, [pageCount]);

  if (!items.length) {
    return <div className="prod-empty-state">Chưa có truyện phù hợp để hiển thị.</div>;
  }

  const goPage = nextPage => setPage(Math.max(0, Math.min(pageCount - 1, nextPage)));

  return (
    <>
      <div className={[compact ? 'prod-story-grid compact' : 'prod-story-grid', className].filter(Boolean).join(' ')}>
        {visibleItems.map(story => <StoryCard key={story.id || story.slug} story={story} />)}
      </div>
      {isPagedMobileGrid && pageCount > 1 && (
        <div className="home-mobile-pagination" aria-label="Phân trang truyện">
          <button type="button" onClick={() => goPage(page - 1)} disabled={page === 0} aria-label="Trang trước">‹</button>
          {Array.from({ length: Math.min(pageCount, 4) }).map((_, index) => {
            const pageNumber = index + 1;
            return <button key={pageNumber} type="button" className={page === index ? 'active' : ''} onClick={() => goPage(index)}>{pageNumber}</button>;
          })}
          {pageCount > 4 && <button type="button" className="search-page-button" onClick={() => goPage(Math.min(pageCount - 1, page + 1))} aria-label="Tìm trang"><Majesticon name="search" size={14} /></button>}
          <button type="button" onClick={() => goPage(page + 1)} disabled={page === pageCount - 1} aria-label="Trang sau">›</button>
          <span>Hiển thị <b>{page * pageSize + 1} - {Math.min((page + 1) * pageSize, items.length)}</b> / {formatNumber(items.length)} truyện</span>
        </div>
      )}
    </>
  );
}

function LegacyStoryGrid({ stories, compact = false, className = '' }) {
  if (!stories?.length) {
    return <div className="prod-empty-state">Chưa có truyện phù hợp để hiển thị.</div>;
  }
  return (
    <div className={[compact ? 'prod-story-grid compact' : 'prod-story-grid', className].filter(Boolean).join(' ')}>
      {stories.filter(story => story?.slug).map(story => <StoryCard key={story.id || story.slug} story={story} />)}
    </div>
  );
}

export function ContinueReadingSection({ user, items }) {
  if (!user) {
    return (
      <RevealSection className="prod-continue-login">
        <div>
          <span>Tiếp tục đọc</span>
          <h2>Đăng nhập để đồng bộ lịch sử đọc</h2>
          <p>Lưu vị trí đọc, nhận thông báo chương mới và mở lại truyện đang theo dõi trên mọi thiết bị.</p>
        </div>
          <Link className="prod-primary-button" to="/login">Đăng nhập</Link>
      </RevealSection>
    );
  }

  if (!items?.length) return null;

  return (
    <RevealSection className="prod-continue-section">
      <div className="prod-section-head">
        <div>
          <span>Reading</span>
          <h2>Tiếp tục đọc</h2>
          <p>Quay lại đúng chương bạn đang theo dõi.</p>
        </div>
        <Link to="/history">Xem lịch sử</Link>
      </div>
      <div className="prod-continue-grid">
        {items.filter(item => item?.story?.slug).slice(0, 3).map(item => (
          <Link key={item.id} to={`/truyen/${item.story.slug}/chuong/${item.chapterNumber}`} className="prod-continue-card">
            <img src={item.story.cover || coverFallback} alt={item.story.title} decoding="async" loading="lazy" onError={handleImageError} />
            <div>
              <strong>{item.story.title}</strong>
              <span>Chương {item.chapterNumber}</span>
              <em><i style={{ width: `${Math.min(100, item.progress || 18)}%` }} /></em>
            </div>
          </Link>
        ))}
      </div>
    </RevealSection>
  );
}

export function RankingMini({ stories }) {
  const list = (stories?.length ? stories : mockStories.slice(0, 10)).filter(story => story?.slug);
  if (!list.length) return <RevealSection className="prod-ranking-mini"><div className="prod-empty-state">Chưa có dữ liệu xếp hạng.</div></RevealSection>;
  return (
    <RevealSection className="prod-ranking-mini">
      <div className="prod-section-head">
        <div>
          <span>Top 10</span>
          <h2>Bảng xếp hạng mini</h2>
          <p>Truyện được đọc nhiều nhất hiện tại.</p>
        </div>
        <Link to="/xep-hang">Xem tất cả</Link>
      </div>
      <div className="prod-ranking-list">
        {list.slice(0, 10).map((story, index) => (
          <Link key={story.id || story.slug} to={`/truyen/${story.slug}`}>
            <b>{index + 1}</b>
            <span>
              <strong>{story.title}</strong>
              <small>{story.author}</small>
            </span>
            <em>{formatNumber(story.views)}</em>
          </Link>
        ))}
      </div>
    </RevealSection>
  );
}

export function GenreChips({ categories, compact = false }) {
  const items = categories?.length ? categories : isDev ? mockCategories : [];
  return (
    <RevealSection className={compact ? 'prod-genre-chips compact' : 'prod-genre-chips'}>
      <SectionHeader icon="category" kicker="Genres" title="Thể loại phổ biến" subtitle="Chọn nhanh gu đọc bạn thích." to="/danh-sach" actionLabel="Xem tất cả" />
      <div>
        {items.slice(0, compact ? 14 : 18).map(category => (
          <Link key={category} to={`/the-loai/${encodeURIComponent(category)}`}>{category}</Link>
        ))}
      </div>
    </RevealSection>
  );
}

export function AuthorCTA() {
  return (
    <RevealSection className="prod-author-cta">
      <div>
        <span>Dành cho tác giả</span>
        <h2>Đăng truyện và xây dựng cộng đồng độc giả riêng</h2>
        <p>Quản lý chương, theo dõi tương tác và mở khóa các công cụ xuất bản trong khu vực tác giả.</p>
      </div>
      <Link className="prod-primary-button" to="/author/stories/new">Đăng truyện</Link>
    </RevealSection>
  );
}

export function ProductionFooter({ apiClient }) {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterState, setNewsletterState] = useState({ loading: false, error: '', success: '' });
  const quickLinks = [
    ['Trang chủ', '/'],
    ['Hoàn thành', '/danh-sach?status=completed'],
    ['Truyện ngắn', '/truyen-ngan'],
    ['Xếp hạng', '/xep-hang']
  ];
  const supportLinks = [
    ['Liên hệ', '/lien-he'],
    ['Điều khoản sử dụng', '/dieu-khoan'],
    ['Chính sách bảo mật', '/bao-mat'],
    ['FAQ', '/faq'],
    ['DMCA', '/dmca'],
    ['Quy định nội dung', '/quy-dinh-noi-dung']
  ];
  const authorLinks = [
    ['Khu vực tác giả', '/author'],
    ['Đăng truyện mới', '/author/stories/new'],
    ['Quản lý truyện', '/author/stories'],
    ['Thống kê doanh thu', '/author/revenue'],
    ['Quảng bá', '/author/promotions']
  ];

  async function submitNewsletter(event) {
    event.preventDefault();
    const email = newsletterEmail.trim().toLowerCase();
    setNewsletterState({ loading: false, error: '', success: '' });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setNewsletterState({ loading: false, error: 'Email không hợp lệ.', success: '' });
      return;
    }

    if (!apiClient) {
      setNewsletterState({ loading: false, error: 'API newsletter chưa sẵn sàng. Vui lòng thử lại sau.', success: '' });
      return;
    }

    setNewsletterState({ loading: true, error: '', success: '' });
    try {
      const result = await apiClient('/newsletter', {
        method: 'POST',
        body: JSON.stringify({ email, source: 'footer' })
      });
      setNewsletterEmail('');
      setNewsletterState({
        loading: false,
        error: '',
        success: result?.message || 'Đăng ký nhận thông báo thành công.'
      });
    } catch (err) {
      setNewsletterState({
        loading: false,
        error: err.message || 'Không thể đăng ký lúc này. Vui lòng thử lại.',
        success: ''
      });
    }
  }

  return (
    <footer className="prod-footer">
      <div className="prod-footer-inner">
        <div className="prod-footer-brand">
          <Link to="/" className="prod-brand">
            <img src="/images/logo.png" alt="Đậu Đỏ Truyện" />
            <span>
              <strong>Đậu Đỏ</strong>
              <small>Truyện online</small>
            </span>
          </Link>
          <p>Nền tảng đọc truyện online với kho truyện đa thể loại, cập nhật liên tục và tối ưu cho trải nghiệm đọc dài hơi.</p>
        </div>
        <FooterColumn title="Link nhanh" links={quickLinks} />
        <div className="prod-footer-col">
          <strong>Thể loại phổ biến</strong>
          {mockCategories.slice(0, 5).map(category => <Link key={category} to={`/the-loai/${encodeURIComponent(category)}`}>{category}</Link>)}
        </div>
        <FooterColumn title="Dành cho tác giả" links={authorLinks} />
        <FooterColumn title="Hỗ trợ" links={supportLinks} />
        <div className="prod-footer-col prod-newsletter-col">
          <strong>Đăng ký nhận thông báo</strong>
          <p>Nhận thông báo truyện hot, chương mới và cập nhật sản phẩm.</p>
          <form onSubmit={submitNewsletter} noValidate>
            <label htmlFor="footer-newsletter-email">Email</label>
            <div>
              <input
                id="footer-newsletter-email"
                type="email"
                value={newsletterEmail}
                onChange={event => setNewsletterEmail(event.target.value)}
                placeholder="tenban@gmail.com"
                disabled={newsletterState.loading}
              />
              <button type="submit" disabled={newsletterState.loading}>
                {newsletterState.loading ? 'Đang gửi...' : 'Đăng ký'}
              </button>
            </div>
            {newsletterState.error && <span className="prod-newsletter-message error">{newsletterState.error}</span>}
            {newsletterState.success && <span className="prod-newsletter-message success">{newsletterState.success}</span>}
          </form>
        </div>
      </div>
      <div className="prod-footer-bottom">
        <span>© 2026 Đậu Đỏ Truyện. Tất cả quyền được bảo lưu.</span>
        <span>Made for readers, authors and admins.</span>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }) {
  return (
    <div className="prod-footer-col">
      <strong>{title}</strong>
      {links.map(([label, to]) => <Link key={label} to={to}>{label}</Link>)}
    </div>
  );
}

function RevealSection({ children, className = '' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.12 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className={`${className} prod-reveal ${visible ? 'visible' : ''}`}>
      {children}
    </section>
  );
}

function handleImageError(event) {
  if (event.currentTarget.src.endsWith(coverFallback)) return;
  event.currentTarget.src = coverFallback;
}

function handleHeroImageError(event) {
  if (event.currentTarget.src.endsWith('/images/hero.jpg')) return;
  event.currentTarget.src = '/images/hero.jpg';
}




