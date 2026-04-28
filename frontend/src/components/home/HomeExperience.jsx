import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  mockCategories,
  mockContinueReading,
  mockPopularSearches,
  mockSearchHistory,
  mockStories
} from '../../data/mockStories';

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
    translator: repairText(story.translator),
    description: repairText(story.description),
    categories: Array.isArray(story.categories) ? story.categories.map(repairText) : [],
    tags: Array.isArray(story.tags) ? story.tags.map(repairText) : []
  };
}

function replacementRatio(value = '') {
  const text = String(value || '');
  if (!text) return 0;
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  return replacementCount / text.length;
}

function hasCorruptText(value, maxRatio = 0) {
  if (typeof value !== 'string') return false;
  return replacementRatio(value) > maxRatio;
}

function isDisplaySafeStory(story = {}) {
  const textFields = [story.title, story.description, story.author, story.translator, ...(story.categories || [])];
  return Boolean(story.title && story.slug) && !textFields.some(value => hasCorruptText(value));
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

function getChapterCount(story = {}) {
  return story.chapterCount || story.chapterCountEstimate || story.latestChapter?.number || 0;
}

function normalizeForSearch(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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

function buildHomeSlices(sourceStories = mockStories) {
  const normalizedStories = normalizeStories(sourceStories.length ? sourceStories : mockStories);
  const safeStories = normalizedStories.filter(isDisplaySafeStory);
  const stories = safeStories.length ? safeStories : normalizeStories(mockStories).filter(isDisplaySafeStory);
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

  return {
    all: stories,
    hero: (banner.length ? banner : featured).slice(0, 5),
    hot: (hot.length ? hot : byViews).slice(0, 12),
    trending: byRating.slice(0, 8),
    updated: byUpdated.slice(0, 8),
    completed: (completed.length ? completed : byRating).slice(0, 8),
    newLaunch: stories.slice().sort(sortByDate('createdAt')).slice(0, 8),
    editorPicks: featured.slice(0, 8),
    recommended: (recommended.length ? recommended : featured).slice(0, 8),
    personalized: byRating.filter(story => story.categories?.some(category => ['Ngôn tình', 'Đô thị', 'Chữa lành', 'Trinh thám'].includes(category))).slice(0, 8),
    ranking: byViews.slice(0, 10),
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
    console.warn('[HOME_API_FALLBACK]', {
      path,
      url: error?.url,
      status: error?.status,
      statusText: error?.statusText,
      message: error?.message,
      timestamp: new Date().toISOString()
    });
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
  const [categories, setCategories] = useState(mockCategories);
  const [stories, setStories] = useState(mockStories);
  const headerRef = useRef(null);
  const navId = 'prod-mobile-nav';
  const genreMenuId = 'prod-genre-menu';
  const searchPanelId = 'prod-search-panel';
  const notificationMenuId = 'prod-notification-menu';
  const userMenuId = 'prod-user-menu';

  useEffect(() => {
    let alive = true;
    Promise.all([fetchSafe(apiClient, '/categories?limit=32'), fetchSafe(apiClient, '/stories?sort=views&limit=8')]).then(([categoryData, storyData]) => {
      if (!alive) return;
      const nextStories = normalizeStories(storyData?.stories || []);
      const nextCategories = (categoryData?.categories || []).map(repairText);
      setStories(nextStories.length ? nextStories : mockStories);
      setCategories(nextCategories.length ? nextCategories : uniqueCategoriesFrom(nextStories.length ? nextStories : mockStories));
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
    <header className="prod-header" ref={headerRef}>
      <div className="prod-header-inner">
        <Link className="prod-brand" to="/" onClick={closeAll}>
          <img src="/images/logo.png" alt="Đậu Đỏ Truyện" />
          <span>
            <strong>Đậu Đỏ</strong>
            <small>Truyện online</small>
          </span>
        </Link>

        <button
          className="prod-icon-button prod-mobile-toggle"
          type="button"
          onClick={toggleMobileNav}
          aria-label="Mở menu"
          aria-expanded={mobileOpen}
          aria-controls={navId}
        >
          <span aria-hidden="true">☰</span>
        </button>

        <nav id={navId} className={mobileOpen ? 'prod-nav open' : 'prod-nav'} aria-label="Menu chính">
          <NavLink end to="/" onClick={closeAll}>Trang chủ</NavLink>
          <NavLink to="/danh-sach?status=completed" className={location.search.includes('status=completed') ? 'active' : ''} onClick={closeAll}>Hoàn thành</NavLink>
          <NavLink to="/truyen-ngan" onClick={closeAll}>Truyện ngắn</NavLink>
          <NavLink to="/xep-hang" onClick={closeAll}>Xếp hạng</NavLink>
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
              Thể loại <span aria-hidden="true">⌄</span>
            </button>
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
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
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
        aria-label="Tìm kiếm"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span aria-hidden="true">⌕</span>
      </button>
      <label className="prod-search-box">
        <span aria-hidden="true">⌕</span>
        <input
          value={keyword}
          onChange={event => setKeyword(event.target.value)}
          onFocus={onFocus}
          onKeyDown={event => {
            if (event.key === 'Enter') goSearch(keyword);
          }}
          placeholder="Tìm truyện, tác giả..."
        />
      </label>
      {open && (
        <div className="prod-search-panel" id={panelId}>
          <div className="prod-command-head">
            <strong>Tìm kiếm nhanh</strong>
            <button type="button" onClick={() => setOpen(false)}>ESC</button>
          </div>
          <label className="prod-search-panel-input">
            <span aria-hidden="true">⌕</span>
            <input
              ref={mobileInputRef}
              value={keyword}
              onChange={event => setKeyword(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') goSearch(keyword);
              }}
              placeholder="Tìm truyện, tác giả..."
            />
          </label>
          <SearchBlock title="Gợi ý phổ biến" items={mockPopularSearches} onSelect={goSearch} />
          {history.length > 0 && <SearchBlock title="Lịch sử tìm kiếm" items={history} onSelect={goSearch} muted />}
          <div className="prod-search-results">
            <p>Kết quả nhanh</p>
            {quickStories.map(story => (
              <button type="button" key={story.id} onClick={() => goStory(story)}>
                <img src={story.cover || coverFallback} alt={story.title} loading="lazy" onError={handleImageError} />
                <span>
                  <strong>{story.title}</strong>
                  <small>{story.author} · ★ {story.rating || 4.5}</small>
                </span>
              </button>
            ))}
            {quickStories.length === 0 && <div className="prod-empty-mini">Không có truyện phù hợp.</div>}
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
      <button className="prod-icon-button" type="button" aria-label="Thông báo" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={menuId}>
        <span aria-hidden="true">🔔</span>
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
    <button className="prod-icon-button" type="button" onClick={toggleTheme} aria-label="Đổi giao diện">
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}

export function UserDropdown({ user, logout, open, setOpen, closeAll, menuId }) {
  const navigate = useNavigate();
  const guest = !user;
  const menuItems = user ? [
    { label: 'Tủ truyện', to: '/bookmarks', icon: '▤' },
    { label: 'Lịch sử đọc', to: '/history', icon: '◷' },
    { label: 'Nạp Đậu', to: '/wallet', icon: '◈' },
    { label: 'Khu tác giả', to: '/author', icon: '✎' },
    { label: 'Cài đặt', to: '/settings#profile', icon: '⚙' },
    ...(user.role === 'admin' ? [{ label: 'Quản trị viên', to: '/admin', icon: '✦' }] : [])
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
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
                <button type="button" onClick={() => { logout?.(); closeAll(); }}>
                  <span>↩</span>
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
  const [homeData, setHomeData] = useState(() => buildHomeSlices(mockStories));
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
        fetchSafe(apiClient, '/categories?limit=30')
      ]);

      if (!alive) return;

      const merged = normalizeStories(home ? [
        ...(home?.banners || []),
        ...(home?.updatedStories || []),
        ...(home?.popularStories || []),
        ...(home?.completedStories || []),
        ...(home?.featuredStories || []),
        ...(home?.recommendedStories || [])
      ] : [
        ...(fallback?.[0]?.stories || []),
        ...(fallback?.[1]?.stories || []),
        ...(fallback?.[2]?.stories || []),
        ...(fallback?.[3]?.stories || []),
        ...(fallback?.[4]?.stories || [])
      ]);
      const unique = Array.from(new Map(merged.map(story => [story.id || story.slug, story])).values());
      const fallbackUsed = unique.length === 0;
      const nextData = buildHomeSlices(fallbackUsed ? mockStories : unique);
      const apiCategories = ((home?.categories || fallback?.[5]?.categories) || []).map(repairText);
      setHomeData({ ...nextData, categories: apiCategories.length ? apiCategories : nextData.categories });
      setError(fallbackUsed ? 'Không kết nối được API, đang hiển thị dữ liệu dự phòng cho trang chủ.' : '');
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
      setContinueItems(history.length ? history : mockContinueReading);
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
      {error && <div className="prod-error-state">{error}</div>}
      <HeroSlider stories={homeData.hero} />
      <ContinueReadingSection user={currentUser} items={continueItems} />
      <StorySection kicker="Hot" title="Truyện hot" subtitle="Những bộ truyện có lượng đọc và theo dõi nổi bật trong cộng đồng." to="/danh-sach?sort=views">
        <StoryGrid stories={homeData.hot} />
      </StorySection>
      <StorySection kicker="Recommend" title="Đề cử" subtitle="Truyện được admin chọn để đề xuất trên trang chủ." to="/danh-sach?recommended=true">
        <StoryGrid stories={homeData.recommended} />
      </StorySection>
      <StorySection kicker="Trending" title="Đang thịnh hành" subtitle="Các tác phẩm tăng nhiệt nhanh nhờ đánh giá tốt và tương tác cao." to="/xep-hang">
        <StoryGrid stories={homeData.trending} />
      </StorySection>
      <StorySection kicker="Update" title="Mới cập nhật" subtitle="Theo dõi nhanh những chương mới nhất vừa được đăng." to="/danh-sach?sort=updated">
        <StoryGrid stories={homeData.updated} compact />
      </StorySection>
      <StorySection kicker="Full" title="Truyện hoàn thành" subtitle="Đọc liền mạch từ chương đầu đến chương cuối." to="/danh-sach?status=completed">
        <StoryGrid stories={homeData.completed} />
      </StorySection>
      <div className="prod-home-split">
        <StorySection kicker="New" title="Mới ra mắt" subtitle="Các bộ truyện vừa được lên kệ trong thời gian gần đây." to="/truyen-moi">
          <StoryGrid stories={homeData.newLaunch.slice(0, 4)} compact />
        </StorySection>
        <StorySection kicker="Editor" title="Editor đề xuất" subtitle="Lựa chọn nổi bật để thử ngay hôm nay." to="/danh-sach?featured=true">
          <StoryGrid stories={homeData.editorPicks.slice(0, 4)} compact />
        </StorySection>
      </div>
      {currentUser && (
        <StorySection kicker="For you" title="Đề cử cá nhân hóa" subtitle="Gợi ý dựa trên các thể loại bạn thường đọc." to="/danh-sach?sort=rating">
          <StoryGrid stories={homeData.personalized.length ? homeData.personalized : homeData.trending} />
        </StorySection>
      )}
      <div className="prod-home-bottom">
        <RankingMini stories={homeData.ranking} />
        <div className="prod-bottom-stack">
          <GenreChips categories={homeData.categories} />
          <AuthorCTA />
        </div>
      </div>
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
  const slides = normalizeStories(stories?.length ? stories : mockStories.slice(0, 4)).filter(isDisplaySafeStory);
  const current = slides.length ? slides[active % slides.length] : null;

  useEffect(() => {
    setActive(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActive(index => (index + 1) % slides.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const goPrev = () => setActive(index => (index - 1 + slides.length) % slides.length);
  const goNext = () => setActive(index => (index + 1) % slides.length);

  if (!current) {
    return <div className="prod-empty-state">Chưa có truyện nổi bật phù hợp để hiển thị.</div>;
  }

  return (
    <section className="prod-hero-slider" style={{ '--hero-image': `url("${current.banner || current.cover || '/images/hero.jpg'}")` }}>
      <img
        src={current.banner || current.cover || '/images/hero.jpg'}
        alt={current.title}
        fetchPriority="high"
        decoding="async"
        className="prod-hero-media"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div className="prod-hero-overlay" />
      <button className="prod-hero-arrow prev" type="button" onClick={goPrev} aria-label="Truyện nổi bật trước">‹</button>
      <div className="prod-hero-content">
        <div className="prod-hero-tags">
          {current.categories?.slice(0, 3).map(category => <span key={category}>{category}</span>)}
        </div>
        <h1>{current.title}</h1>
        <p>{current.description}</p>
        <div className="prod-hero-meta">
          <span>★ {current.rating || 4.5}</span>
          <span>{formatNumber(getChapterCount(current))} chương</span>
          <span>{formatNumber(current.views)} lượt đọc</span>
          <span>{current.author}</span>
        </div>
        <div className="prod-hero-actions">
          <Link className="prod-primary-button" to={`/truyen/${current.slug}`}>Đọc ngay</Link>
          <Link className="prod-glass-button" to={`/truyen/${current.slug}`}>Chi tiết</Link>
        </div>
      </div>
      <button className="prod-hero-arrow next" type="button" onClick={goNext} aria-label="Truyện nổi bật tiếp theo">›</button>
      <div className="prod-hero-thumbs">
        {slides.map((story, index) => (
          <button
            key={story.id || story.slug}
            className={index === active % slides.length ? 'active' : ''}
            type="button"
            onClick={() => setActive(index)}
            aria-label={`Chọn ${story.title}`}
          >
            <img src={story.cover || coverFallback} alt={story.title} decoding="async" loading="lazy" onError={handleImageError} />
            <span>{story.title}</span>
          </button>
        ))}
      </div>
      <div className="prod-hero-dots">
        {slides.map((story, index) => (
          <button key={`dot-${story.id || story.slug}`} type="button" className={index === active % slides.length ? 'active' : ''} onClick={() => setActive(index)} aria-label={`Slide ${index + 1}`} />
        ))}
      </div>
    </section>
  );
}

export function StoryCard({ story }) {
  const [favorite, setFavorite] = useState(Boolean(story.bookmarked || story.followed));
  const chapterCount = getChapterCount(story);
  const isFull = story.status === 'completed';
  const isHot = toNumber(story.views) > 400000 || story.featured;
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
      </Link>
      <button
        className={favorite ? 'prod-fav-button active' : 'prod-fav-button'}
        type="button"
        onClick={() => setFavorite(value => !value)}
        aria-label={favorite ? 'Bỏ yêu thích' : 'Yêu thích truyện'}
      >
        ♥
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

export function StorySection({ kicker, title, subtitle, to, children }) {
  return (
    <RevealSection className="prod-story-section">
      <div className="prod-section-head">
        <div>
          {kicker && <span>{kicker}</span>}
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {to && <Link to={to}>Xem tất cả</Link>}
      </div>
      {children}
    </RevealSection>
  );
}

function StoryGrid({ stories, compact = false }) {
  if (!stories?.length) {
    return <div className="prod-empty-state">Chưa có truyện phù hợp để hiển thị.</div>;
  }
  return (
    <div className={compact ? 'prod-story-grid compact' : 'prod-story-grid'}>
      {stories.map(story => <StoryCard key={story.id || story.slug} story={story} />)}
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
        {items.slice(0, 3).map(item => (
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
  const list = stories?.length ? stories : mockStories.slice(0, 10);
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

export function GenreChips({ categories }) {
  const items = categories?.length ? categories : mockCategories;
  return (
    <RevealSection className="prod-genre-chips">
      <div className="prod-section-head">
        <div>
          <span>Genres</span>
          <h2>Thể loại phổ biến</h2>
          <p>Chọn nhanh gu đọc bạn thích.</p>
        </div>
        <Link to="/danh-sach">Xem tất cả</Link>
      </div>
      <div>
        {items.slice(0, 18).map(category => (
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
