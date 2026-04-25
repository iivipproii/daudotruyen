import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import './styles.css';
import './publish.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const AuthContext = createContext(null);
const ThemeContext = createContext(null);

async function api(path, options = {}) {
  const token = localStorage.getItem('daudo_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.message || 'Có lỗi xảy ra.');
  return data;
}

function useAuth() {
  return useContext(AuthContext);
}

function useTheme() {
  return useContext(ThemeContext);
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('daudo_theme') || 'dark');

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('daudo_theme', theme);
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    toggleTheme() {
      setTheme(current => current === 'dark' ? 'light' : 'dark');
    }
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('daudo_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api('/auth/me')
      .then(data => setUser(data.user))
      .catch(() => localStorage.removeItem('daudo_token'))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    async login(email, password) {
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem('daudo_token', data.token);
      setUser(data.user);
      return data.user;
    },
    async register(name, email, password) {
      const data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
      localStorage.setItem('daudo_token', data.token);
      setUser(data.user);
      return data.user;
    },
    logout() {
      localStorage.removeItem('daudo_token');
      setUser(null);
    },
    updateUser(nextUser) {
      setUser(nextUser);
    }
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Shell>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/danh-sach" element={<CatalogEnhanced />} />
              <Route path="/the-loai/:category" element={<CatalogEnhanced />} />
              <Route path="/truyen-ngan" element={<ShortStoriesPage />} />
              <Route path="/xep-hang" element={<RankingPage />} />
              <Route path="/truyen-moi" element={<CatalogEnhanced />} />
              <Route path="/tac-gia/:name" element={<AuthorPage />} />
              <Route path="/truyen/:slug" element={<StoryDetail />} />
              <Route path="/truyen/:slug/chuong/:number" element={<Reader />} />
              <Route path="/dang-nhap" element={<Login />} />
              <Route path="/dang-ky" element={<Register />} />
              <Route path="/ho-so" element={<Protected><Profile /></Protected>} />
              <Route path="/bookmarks" element={<Protected><Library type="bookmarks" /></Protected>} />
              <Route path="/theo-doi" element={<Protected><Library type="follows" /></Protected>} />
              <Route path="/lich-su" element={<Protected><Library type="history" /></Protected>} />
              <Route path="/vi-hat" element={<Protected><Wallet /></Protected>} />
              <Route path="/thong-bao" element={<Protected><Notifications /></Protected>} />
              <Route path="/ai-tools" element={<AiTools />} />
              <Route path="/dang-truyen" element={<Protected admin><StoryPublish /></Protected>} />
              <Route path="/admin" element={<Protected admin><Admin /></Protected>} />
              <Route path="/lien-he" element={<StaticPage type="contact" />} />
              <Route path="/dieu-khoan" element={<StaticPage type="terms" />} />
              <Route path="/bao-mat" element={<StaticPage type="privacy" />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Shell>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

function scrollPageToTop(behavior = 'smooth') {
  if (typeof window === 'undefined') return;
  window.scrollTo({ top: 0, left: 0, behavior });
}

function RouteScrollReset() {
  const location = useLocation();

  useLayoutEffect(() => {
    scrollPageToTop('auto');
  }, [location.pathname, location.search]);

  return null;
}

function Shell({ children }) {
  const location = useLocation();
  const publishing = location.pathname === '/dang-truyen';
  const home = location.pathname === '/';

  if (publishing) {
    return <PublishShell>{children}</PublishShell>;
  }

  return (
    <div className="app-shell public-shell">
      <RouteScrollReset />
      {home && <PublicHeaderEnhanced />}
      <main className="container">{children}</main>
      <Footer />
    </div>
  );
}

function PublicHeader() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api('/categories')
      .then(data => setCategories(data.categories || []))
      .catch(() => setCategories([]));
  }, []);

  const suggestions = [
    'Ngôn tình hiện đại',
    'Tiên hiệp tu luyện',
    'Đô thị trọng sinh',
    'Huyền huyễn dị năng',
    'Kiếm hiệp cổ điển'
  ];

  const filteredCategories = categories.filter(item =>
    item.toLowerCase().includes(categorySearch.trim().toLowerCase())
  );

  const submitSearch = event => {
    if (event.key !== 'Enter') return;

    const keyword = categorySearch.trim();
    if (!keyword) return;

    setCategoryOpen(false);
    setOpen(false);
    navigate(`/danh-sach?q=${encodeURIComponent(keyword)}`);
  };

  const closeMenu = () => {
    setCategoryOpen(false);
    setOpen(false);
  };

  return (
    <header className="topbar public-header">
      <Link to="/" className="brand" onClick={closeMenu}>
        <img src="/images/logo.png" alt="logo" />
        <span>Đậu Đỏ Truyện</span>
      </Link>

      <button className="menu" onClick={() => setOpen(!open)}>☰</button>

      <nav className={open ? 'nav public-nav open' : 'nav public-nav'}>
        <NavLink to="/" onClick={closeMenu}>Trang chủ</NavLink>
        <NavLink to="/danh-sach?status=completed" onClick={closeMenu}>Hoàn thành</NavLink>
        <NavLink to="/danh-sach?sort=chapters" onClick={closeMenu}>Truyện ngắn</NavLink>

        <div className="nav-category-wrap">
          <button
            type="button"
            className={categoryOpen || location.pathname.startsWith('/the-loai') ? 'nav-category-trigger active' : 'nav-category-trigger'}
            onClick={() => setCategoryOpen(value => !value)}
          >
            Thể loại <span>▾</span>
          </button>

          {categoryOpen && (
            <div className="nav-category-panel">
              <div className="nav-category-tabs">
                <button type="button" className="active">Tất cả</button>
                <button type="button">Truyện</button>
                <button type="button">Tác giả</button>
                <button type="button">Thể loại</button>
              </div>

              <input
                value={categorySearch}
                onChange={event => setCategorySearch(event.target.value)}
                onKeyDown={submitSearch}
                placeholder="Tìm kiếm truyện, tác giả hoặc thể loại..."
              />

              <div className="nav-category-suggestions">
                {suggestions.map(item => (
                  <Link key={item} to={`/danh-sach?q=${encodeURIComponent(item)}`} onClick={closeMenu}>
                    {item}
                  </Link>
                ))}
              </div>

              <div className="nav-category-list">
                {(categorySearch ? filteredCategories : categories).slice(0, 18).map(item => (
                  <Link key={item} to={`/the-loai/${encodeURIComponent(item)}`} onClick={closeMenu}>
                    {item}
                  </Link>
                ))}

                {categorySearch && filteredCategories.length === 0 && (
                  <p className="nav-category-empty">Không tìm thấy thể loại phù hợp.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <NavLink to="/danh-sach?sort=views" onClick={closeMenu}>Xếp hạng</NavLink>
        <NavLink to="/ai-tools" onClick={closeMenu}>AI Tools</NavLink>
      </nav>

      <div className="userbar">
        {user ? (
          <>
            <Link to="/ho-so" className="pill">🌱 {user.seeds} Đậu</Link>
            {user.role === 'admin' && <Link to="/dang-truyen" className="pill admin-pill">Đăng truyện</Link>}
            {user.role === 'admin' && <Link to="/admin" className="pill admin-pill">Admin</Link>}
            <button onClick={logout} className="ghost">Thoát</button>
          </>
        ) : (
          <Link to="/dang-nhap" className="button small">Đăng nhập</Link>
        )}
      </div>
    </header>
  );
}


function Footer() {
  const readerLinks = ['Trang chủ', 'Danh sách truyện', 'Thể loại', 'Bảng xếp hạng', 'Truyện ngắn', 'Hoàn thành', 'Ví Đậu'];
  const authorLinks = ['Khu vực tác giả', 'Đăng truyện mới', 'Quản lý truyện', 'Thống kê doanh thu', 'AI Tools Beta', 'Vinh danh dịch giả'];
  const supportLinks = ['Liên hệ', 'Phản hồi / Báo lỗi', 'Câu hỏi thường gặp', 'Điều khoản sử dụng', 'Chính sách bảo mật', 'Xóa dữ liệu', 'Quy định nội dung'];

  return (
    <footer className="footer rich-footer">
      <div className="footer-inner">
        <div className="footer-brand-row">
          <Link to="/" className="footer-logo">
            <img src="/images/logo.png" alt="Đậu Đỏ Truyện" />
            <span>Đậu Đỏ <strong>Truyện</strong></span>
          </Link>
          <p>Nền tảng đọc truyện online hàng đầu Việt Nam với kho tàng truyện đa dạng, cập nhật liên tục. Trải nghiệm đọc truyện tuyệt vời với giao diện dark mode hiện đại, hỗ trợ mua từng chương hoặc combo trọn bộ.</p>
          <a className="footer-mail" href="mailto:support@daudotruyen.vn">✉ support@daudotruyen.vn</a>
          <div className="footer-socials">
            <span>f</span><span>☁</span><span>↗</span><span>◎</span>
          </div>
        </div>

        <div className="footer-newsletter">
          <h4>Đăng ký nhận thông báo</h4>
          <p>Nhận thông báo truyện mới và cập nhật hot nhất.</p>
          <form onSubmit={event => event.preventDefault()}>
            <input placeholder="Email của bạn" />
            <button type="submit">➜</button>
          </form>
        </div>

        <div className="footer-columns">
          <div>
            <h4>Dành cho độc giả</h4>
            {readerLinks.map(item => <Link key={item} to={item === 'Trang chủ' ? '/' : '/danh-sach'}>{item}</Link>)}
          </div>
          <div>
            <h4>Dành cho tác giả</h4>
            {authorLinks.map(item => <Link key={item} to={item === 'Đăng truyện mới' ? '/dang-truyen' : '/ai-tools'}>{item}</Link>)}
          </div>
          <div>
            <h4>Hỗ trợ & pháp lý</h4>
            {supportLinks.map(item => <a key={item} href="#support">{item}</a>)}
          </div>
        </div>

        <div className="footer-disclaimer"><strong>Miễn trừ trách nhiệm:</strong> Đậu Đỏ Truyện là nền tảng đăng tải nội dung do người dùng và dịch giả cung cấp. Nếu phát hiện vi phạm bản quyền, vui lòng liên hệ <b>dmca@daudotruyen.vn</b></div>
        <div className="footer-bottom"><span>© 2026 Đậu Đỏ Truyện. Tất cả quyền được bảo lưu.</span><span>Điều khoản · Bảo mật · Quy định · Liên hệ · Phản hồi</span></div>
      </div>
    </footer>
  );
}


function PublicHeaderEnhanced() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [categories, setCategories] = useState([]);
  const [allStories, setAllStories] = useState([]);
  const profileMenuRef = useRef(null);

  const normalizeText = value =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  useEffect(() => {
    Promise.all([api('/categories'), api('/stories?sort=views')])
      .then(([categoryData, storyData]) => {
        setCategories(categoryData.categories || []);
        setAllStories(storyData.stories || []);
      })
      .catch(() => {
        setCategories([]);
        setAllStories([]);
      });
  }, []);

  useEffect(() => {
    const closeByEsc = event => {
      if (event.key === 'Escape') {
        setCategoryOpen(false);
        setSearchOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener('keydown', closeByEsc);
    return () => window.removeEventListener('keydown', closeByEsc);
  }, []);

  useEffect(() => {
    const closeByOutsideClick = event => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', closeByOutsideClick);
    return () => document.removeEventListener('mousedown', closeByOutsideClick);
  }, []);

  const authors = useMemo(() => Array.from(new Set(allStories.map(story => story.author).filter(Boolean))).sort(), [allStories]);
  const searchText = normalizeText(keyword.trim());

  const filteredCategories = useMemo(() => {
    if (!searchText) return categories;
    return categories.filter(item => normalizeText(item).includes(searchText));
  }, [categories, searchText]);

  const filteredStories = useMemo(() => {
    const sourceStories = searchText
      ? allStories.filter(story => normalizeText([story.title, story.author, story.description, ...(story.categories || [])].join(' ')).includes(searchText))
      : allStories;
    return sourceStories.slice(0, 6);
  }, [allStories, searchText]);

  const filteredAuthors = useMemo(() => {
    if (!searchText) return authors.slice(0, 12);
    return authors.filter(author => normalizeText(author).includes(searchText)).slice(0, 12);
  }, [authors, searchText]);

  const popularSearches = ['Đấu Phá Thương Khung', 'Tiên Nghịch', 'Ngôn tình', 'Xuyên không', 'Huyền huyễn', 'Đam mỹ', 'Bách hợp', 'Kiếm hiệp'];
  const topCategories = categories.slice(0, 14);

  const closeMenu = () => {
    setOpen(false);
    setCategoryOpen(false);
    setProfileOpen(false);
  };

  const handleTopNavClick = () => {
    closeMenu();
    scrollPageToTop();
  };

  const handleHeaderLinkClick = event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('a[href], button[data-scroll-top]')) return;
    handleTopNavClick();
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setKeyword('');
  };

  const goSearch = value => {
    const text = String(value || '').trim();
    if (!text) return;
    closeMenu();
    closeSearch();
    navigate(`/danh-sach?q=${encodeURIComponent(text)}`);
  };

  const goCategory = value => {
    const category = String(value || '').trim();
    if (!category) return;
    closeMenu();
    closeSearch();
    navigate(`/the-loai/${encodeURIComponent(category)}`);
  };

  const goAuthor = value => {
    const author = String(value || '').trim();
    if (!author) return;
    closeMenu();
    closeSearch();
    navigate(`/danh-sach?q=${encodeURIComponent(author)}`);
  };

  const goStory = story => {
    if (!story?.slug) return;
    closeMenu();
    closeSearch();
    navigate(`/truyen/${story.slug}`);
  };

  const profileMenuItems = [
    { icon: '◉', label: 'Hồ sơ cá nhân', to: '/ho-so' },
    { icon: '▰', label: 'Tủ truyện', to: '/bookmarks' },
    { icon: '◒', label: 'Đăng truyện mới', to: '/dang-truyen', adminOnly: true },
    { icon: '▣', label: 'Quản lý truyện', to: '/admin', adminOnly: true },
    { icon: '▭', label: 'Ví của tôi', to: '/vi-hat' },
    { icon: '♜', label: 'Bảng xếp hạng', to: '/xep-hang' },
    { icon: '□', label: 'Mời bạn bè', to: '/ho-so' }
  ].filter(item => !item.adminOnly || user?.role === 'admin');

  const handleEnterSearch = event => {
    if (event.key !== 'Enter') return;
    const text = keyword.trim();
    if (!text) return;
    if (activeTab === 'category' && filteredCategories[0]) return goCategory(filteredCategories[0]);
    if (activeTab === 'story' && filteredStories[0]) return goStory(filteredStories[0]);
    if (activeTab === 'author' && filteredAuthors[0]) return goAuthor(filteredAuthors[0]);
    goSearch(text);
  };

  const searchPanel = (
    <div className="search-overlay" onMouseDown={event => event.target === event.currentTarget && closeSearch()}>
      <div className="search-modal">
        <div className="search-input-row">
          <span>⌕</span>
          <input autoFocus value={keyword} onChange={event => setKeyword(event.target.value)} onKeyDown={handleEnterSearch} placeholder="Tìm kiếm truyện, tác giả, thể loại..." />
          <button type="button" onClick={closeSearch}>ESC</button>
        </div>
        <div className="nav-category-tabs search-tabs-row">
          {[['all', 'Tất cả'], ['story', 'Truyện'], ['author', 'Tác giả'], ['category', 'Thể loại']].map(([value, label]) => (
            <button key={value} type="button" className={activeTab === value ? 'active' : ''} onClick={() => setActiveTab(value)}>{label}</button>
          ))}
        </div>
        {(activeTab === 'all' || activeTab === 'story') && (
          <div className="nav-story-results search-story-results">
            {filteredStories.map(story => (
              <button key={story.id} type="button" onClick={() => goStory(story)}>
                <img src={story.cover} alt={story.title} />
                <span><strong>{story.title}</strong><small>{story.author} · ★ {story.rating}</small></span>
              </button>
            ))}
          </div>
        )}
        {(activeTab === 'all' || activeTab === 'category') && (
          <>
            {searchText && (
              <>
                <p className="nav-category-title">Thể loại phù hợp</p>
                <div className="nav-category-list">
                  {filteredCategories.slice(0, 16).map(item => <button key={item} type="button" onClick={() => goCategory(item)}>{item}</button>)}
                </div>
              </>
            )}
            <p className="nav-category-title">Tìm kiếm phổ biến</p>
            <div className="nav-category-suggestions">{popularSearches.map(item => <button key={item} type="button" onClick={() => goSearch(item)}>{item}</button>)}</div>
          </>
        )}
        {(activeTab === 'all' || activeTab === 'author') && (
          <>
            <p className="nav-category-title">Tác giả</p>
            <div className="nav-category-list">{filteredAuthors.map(author => <button key={author} type="button" onClick={() => goAuthor(author)}>{author}</button>)}</div>
          </>
        )}
        {searchText && filteredStories.length === 0 && filteredAuthors.length === 0 && filteredCategories.length === 0 && (
          <div className="search-empty">Không có kết quả phù hợp. Nhấn Enter để tìm trong danh sách truyện.</div>
        )}
      </div>
    </div>
  );

  return (
    <header className="topbar public-header dd-header" onClickCapture={handleHeaderLinkClick}>
      <button className="menu dd-menu" type="button" onClick={() => setOpen(!open)}>☰</button>

      <nav className={open ? 'dd-header-nav rounded-pill px-3 py-2 open' : 'dd-header-nav rounded-pill px-3 py-2'}>
        <div className="dd-nav-container">
          <div className="dd-nav-section dd-nav-left">
            <NavLink end to="/" className="dd-nav-link" onClick={closeMenu}>⌂ Trang chủ</NavLink>
            <NavLink
              to="/danh-sach?status=completed"
              className={location.search.includes('status=completed') ? 'dd-nav-link active' : 'dd-nav-link'}
              onClick={closeMenu}
            >
              ✓ Hoàn thành
            </NavLink>
            <NavLink to="/truyen-ngan" className="dd-nav-link" onClick={closeMenu}>▣ Truyện ngắn</NavLink>
          </div>

          <Link to="/" className="dd-brand-title" onClick={closeMenu}>Đậu Đỏ Truyện</Link>

          <div className="dd-nav-section dd-nav-right">
            <div className="nav-category-wrap dd-category-wrap">
              <button
                type="button"
                className={categoryOpen || location.pathname.startsWith('/the-loai') ? 'dd-nav-link nav-category-trigger active' : 'dd-nav-link nav-category-trigger'}
                onClick={() => setCategoryOpen(value => !value)}
              >
                ▦ Thể loại <span>⌄</span>
              </button>

              {categoryOpen && (
                <div className="nav-category-panel dd-category-panel">
                  <div className="dd-category-grid">
                    {topCategories.map(item => (
                      <button key={item} type="button" onClick={() => goCategory(item)}>{item}</button>
                    ))}
                  </div>
                  <button type="button" className="dd-category-all" data-scroll-top onClick={() => { closeMenu(); navigate('/danh-sach'); }}>
                    Xem tất cả thể loại ➜
                  </button>
                </div>
              )}
            </div>

            <NavLink to="/xep-hang" className="dd-nav-link" onClick={closeMenu}>▥ Xếp hạng</NavLink>
            <button className="dd-icon-btn" type="button" title="Giao diện" aria-label="Giao diện" onClick={toggleTheme}><span className={theme === 'dark' ? 'theme-sun-icon' : 'theme-moon-icon'} aria-hidden="true" /></button>
            <button className="dd-icon-btn" type="button" onClick={() => setSearchOpen(true)} aria-label="Tìm kiếm">🔍</button>
            <Link to="/thong-bao" className="dd-icon-btn" title="Thông báo" aria-label="Thông báo" onClick={closeMenu}>🔔</Link>

            {user ? (
              <>
                <Link to="/bookmarks" className="dd-icon-btn" onClick={closeMenu}>♡</Link>
                <div className="dd-profile-menu-wrap" ref={profileMenuRef}>
                  <button
                    type="button"
                    className={profileOpen ? 'dd-avatar active' : 'dd-avatar'}
                    onClick={() => setProfileOpen(value => !value)}
                    aria-label="Mở menu tài khoản"
                    aria-expanded={profileOpen}
                    aria-haspopup="menu"
                  >
                    <img src={user.avatar || '/images/logo.png'} alt={user.name} />
                  </button>
                  {profileOpen && (
                    <div className="dd-profile-menu">
                      <div className="dd-profile-card">
                        <img src={user.avatar || '/images/logo.png'} alt={user.name} />
                        <div>
                          <strong>{user.name || 'Độc giả'}</strong>
                          <div className="dd-profile-meta">
                            <span>☁ {formatNumber(user.seeds || 0)} Đậu</span>
                            <span>★ Lv.{user.level || 1}</span>
                          </div>
                        </div>
                      </div>
                      <div className="dd-profile-list">
                        {profileMenuItems.map(({ icon, label, to }) => (
                          <Link key={label} to={to} onClick={closeMenu}>
                            <span>{icon}</span>
                            <strong>{label}</strong>
                          </Link>
                        ))}
                      </div>
                      <div className="dd-profile-list dd-profile-footer-list">
                        <Link to="/ho-so" onClick={closeMenu}><span>⚙</span><strong>Cài đặt</strong></Link>
                        <button type="button" onClick={() => { logout(); closeMenu(); }}>
                          <span>↵</span>
                          <strong>Đăng xuất</strong>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link to="/dang-nhap" className="dd-login-box" onClick={closeMenu}>
                <span className="dd-login-icon">◉</span>
                <span>Đăng nhập</span>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {searchOpen && searchPanel}
    </header>
  );
}

function PublishShell({ children }) {
  return (
    <div className="app-shell publish-shell">
      <main className="container publish-container">{children}</main>
    </div>
  );
}

function Protected({ children, admin = false }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/dang-nhap" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function Loader() {
  return <div className="center-card">Đang tải dữ liệu...</div>;
}

function ErrorBox({ message }) {
  if (!message) return null;
  return <div className="error">{message}</div>;
}


function getChapterCount(story = {}) {
  return story.chapterCount || story.chapterCountEstimate || story.latestChapter?.number || 0;
}

function getStatusLabel(status) {
  return status === 'completed' ? 'Hoàn' : 'Trả phí';
}

function getStatusClass(status) {
  return status === 'completed' ? 'completed' : 'ongoing';
}

function formatDateShort(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function statusLabel(value) {
  return { ongoing: 'Đang ra', completed: 'Hoàn thành', paused: 'Tạm ngưng' }[value] || value;
}

function approvalLabel(value) {
  return { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' }[value] || 'Đã duyệt';
}

function getStoryCardStatusLabel(status) {
  return {
    ongoing: '\u0110ang ra',
    completed: 'Ho\u00e0n',
    paused: 'T\u1ea1m d\u1eebng'
  }[status] || '\u0110ang ra';
}

function getStoryCardStatusClass(status) {
  return status === 'completed' ? 'completed' : status === 'paused' ? 'paused' : 'ongoing';
}

function SectionKicker({ children }) {
  return <span className="section-kicker">{children}</span>;
}

function MiniStoryRow({ story, index, compact = false }) {
  return (
    <Link to={`/truyen/${story.slug}`} className={compact ? 'mini-story-row compact-mini' : 'mini-story-row'}>
      {index !== undefined && <span className="mini-index">{index + 1}</span>}
      <img src={story.cover} alt={story.title} />
      <span className="mini-copy"><strong>{story.title}</strong><small>{story.author} · {story.categories?.slice(0, 2).join(', ')}</small></span>
      <span className="mini-score">★ {story.rating}</span>
    </Link>
  );
}


function StoryCard({ story }) {
  const chapterCount = getChapterCount(story);
  return (
    <Link to={`/truyen/${story.slug}`} className="story-card readdy-card">
      <div className="cover-wrap">
        <img src={story.cover} alt={story.title} />
        <span className={`badge status ${getStoryCardStatusClass(story.status)}`}>{getStoryCardStatusLabel(story.status)}</span>
        <span className="badge rating">★ {story.rating}</span>
        <span className="badge chapter">{chapterCount || '??'}ch</span>
      </div>
      <div className="story-info">
        <h3>{story.title}</h3>
        <p>{story.author}</p>
        <div className="story-submeta">{story.categories?.slice(0, 2).join(' · ')}</div>
      </div>
    </Link>
  );
}


function Home() {
  const [stories, setStories] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [popular, setPopular] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api('/stories?sort=updated'),
      api('/stories?featured=true&sort=rating'),
      api('/stories?sort=views'),
      api('/stories?status=completed&sort=updated'),
      api('/categories')
    ])
      .then(([all, top, views, done, categoryData]) => {
        setStories(all.stories || []);
        setFeatured(top.stories || []);
        setPopular(views.stories || []);
        setCompleted(done.stories || []);
        setCategories(categoryData.categories || []);
      })
      .catch(err => setError(err.message));
  }, []);

  const heroStories = (featured.length ? featured : stories).slice(0, 4);
  const paidStories = popular.filter(story => story.premium).slice(0, 7);

  return (
    <div className="home-page home-readdy">
      <ErrorBox message={error} />
      <HomeBanner stories={heroStories} />

      <HomeSection kicker="Featured" title="Truyện Nổi Bật" subtitle="Những tác phẩm được độc giả yêu thích nhất" to="/danh-sach?featured=true">
        <div className="grid stories">{featured.slice(0, 10).map(story => <StoryCard key={story.id} story={story} />)}</div>
      </HomeSection>

      <HomeSection kicker="New" title="Mới Cập Nhật" subtitle="Truyện vừa ra chương mới" to="/danh-sach?sort=updated">
        <div className="grid stories home-new-grid">{stories.slice(0, 6).map(story => <StoryCard key={story.id} story={story} />)}</div>
      </HomeSection>

      <HomeRankingPanel stories={popular.slice(0, 5)} />

      <HomeSection kicker="Completed" title="Truyện Hoàn Thành" subtitle="Những tác phẩm đã hoàn thành, đọc một mạch từ đầu đến cuối" to="/danh-sach?status=completed">
        <div className="grid stories completed-row">{completed.slice(0, 6).map(story => <StoryCard key={story.id} story={story} />)}</div>
      </HomeSection>

      <HomePremiumBlock stories={(paidStories.length ? paidStories : popular).slice(0, 7)} />

      <HomeSection kicker="Ranking" title="Bảng Xếp Hạng" subtitle="Top truyện được yêu thích theo thời gian" to="/xep-hang">
        <div className="ranking-board-home">{popular.slice(0, 8).map((story, index) => <MiniStoryRow key={story.id} story={story} index={index} />)}</div>
      </HomeSection>

      <HomeSection kicker="Categories" title="Thể Loại Phổ Biến" subtitle="Khám phá truyện theo sở thích của bạn" to="/danh-sach">
        <CategoryCloud categories={categories} />
      </HomeSection>
    </div>
  );
}

function HomeRankingPanel({ stories }) {
  if (!stories.length) return null;
  return (
    <section className="section trending-panel">
      <div className="section-head"><div><SectionKicker>Trending</SectionKicker><h2>Xu Hướng Hot</h2><p>Truyện đang được quan tâm nhiều nhất</p></div></div>
      <div className="hot-ranking-list">
        {stories.map((story, index) => (
          <Link key={story.id} to={`/truyen/${story.slug}`} className="hot-ranking-item">
            <span className="hot-number">{index + 1}</span>
            <img src={story.cover} alt={story.title} />
            <span><strong>{story.title}</strong><small>{story.author}</small></span>
            <b>★ {story.rating}</b>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HomePremiumBlock({ stories }) {
  if (!stories.length) return null;
  return (
    <section className="section premium-home">
      <div className="section-head"><div><SectionKicker>Premium</SectionKicker><h2>Truyện Trả Phí</h2><p>Mua từng chương hoặc combo trọn bộ — không cần đăng ký gói</p></div><Link to="/vi-hat" className="small-link">Nạp Đậu ➜</Link></div>
      <div className="premium-benefits"><span>📖 Đọc miễn phí chương đầu</span><span>🎁 Mua từng chương</span><span>📦 Combo trọn bộ</span></div>
      <div className="grid stories">{stories.map(story => <StoryCard key={story.id} story={story} />)}</div>
    </section>
  );
}


function Section({ title, subtitle, children }) {
  return <section className="section"><div className="section-head"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>;
}

function HomeSection({ kicker, title, subtitle, to, children }) {
  return <section className="section home-section"><div className="section-head"><div>{kicker && <SectionKicker>{kicker}</SectionKicker>}<h2>{title}</h2><p>{subtitle}</p></div>{to && <Link to={to} className="ghost small-link">Xem tất cả ➜</Link>}</div>{children}</section>;
}

function QuickSearch({ categories }) {
  const suggestions = ['Ngôn tình hiện đại', 'Tiên hiệp tu luyện', 'Đô thị trọng sinh', 'Huyền huyễn dị năng', 'Kiếm hiệp cổ điển'];
  return (
    <section className="quick-search">
      <div className="search-tabs"><span>Tất cả</span><span>Truyện</span><span>Tác giả</span><span>Thể loại</span></div>
      <input placeholder="Tìm kiếm truyện, tác giả hoặc thể loại..." />
      <div className="search-suggestions">{suggestions.map(item => <Link key={item} to={`/danh-sach?q=${encodeURIComponent(item)}`}>{item}</Link>)}</div>
      <div className="search-categories">{categories.slice(0, 12).map(item => <Link key={item} to={`/the-loai/${encodeURIComponent(item)}`}>{item}</Link>)}</div>
    </section>
  );
}

function HeroStory({ story }) {
  return (
    <article className="hero-story">
      <img src={story.cover} alt={story.title} />
      <div>
        <div className="hero-rating">★ {story.rating}</div>
        <h2>{story.title}</h2>
        <p className="hero-tags">{story.categories.slice(0, 3).join(' · ')}</p>
        <p>{story.description}</p>
        <div className="hero-actions">
          <Link to={`/truyen/${story.slug}`} className="button small">Đọc ngay</Link>
          <button className="ghost">Thích truyện</button>
        </div>
      </div>
    </article>
  );
}

function HomeBanner({ stories }) {
  const [active, setActive] = useState(0);

  if (!stories || stories.length === 0) return null;

  const currentIndex = active % stories.length;
  const story = stories[currentIndex];
  const bannerImage = story.banner || '/images/hero.jpg';

  const nextBanner = () => {
    setActive(index => (index + 1) % stories.length);
  };

  const prevBanner = () => {
    setActive(index => (index - 1 + stories.length) % stories.length);
  };

  return (
    <section className="home-banner" style={{ '--banner-bg': `url("${bannerImage}")` }}>
      <button type="button" className="banner-arrow banner-prev" onClick={prevBanner} aria-label="Banner trước">‹</button>

      <div className="banner-content">
        <div className="banner-badges">
          <span className="banner-rating">★ {story.rating || '4.5'}</span>
          {story.categories?.slice(0, 3).map(category => <span key={category} className="banner-tag">{category}</span>)}
        </div>
        <h1>{story.title}</h1>
        <p className="banner-desc">{story.description}</p>
        <div className="banner-actions">
          <Link to={`/truyen/${story.slug}`} className="button banner-read">📖 Đọc ngay</Link>
          <Link to={`/truyen/${story.slug}`} className="ghost banner-like">♡ Lưu ở trang chi tiết</Link>
        </div>
      </div>

      <button type="button" className="banner-arrow banner-next" onClick={nextBanner} aria-label="Banner tiếp theo">›</button>

      <div className="banner-dots">
        {stories.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={index === currentIndex ? 'active' : ''}
            onClick={() => setActive(index)}
            aria-label={`Chuyển đến banner ${index + 1}`}
          />
        ))}
      </div>

      <button type="button" className="banner-grid-btn">⬚</button>
    </section>
  );
}

function StoryUpdateList({ stories }) {
  return <div className="update-list">{stories.map(story => <Link key={story.id} to={`/truyen/${story.slug}`}><span>{story.premium ? '18+' : 'Mới'}</span><strong>{story.title}</strong><small>{story.author}</small></Link>)}</div>;
}

function RankingList({ stories }) {
  return <div className="ranking-list">{stories.map((story, index) => <Link key={story.id} to={`/truyen/${story.slug}`}><span>{index + 1}</span><strong>{story.title}</strong><small>{formatNumber(story.views)} lượt đọc</small></Link>)}</div>;
}

function CategoryCloud({ categories }) {
  return <div className="category-cloud">{categories.map(item => <Link key={item} to={`/the-loai/${encodeURIComponent(item)}`}>{item}</Link>)}</div>;
}

function Catalog() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stories, setStories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ q: searchParams.get('q') || '', category: params.category || searchParams.get('category') || '', status: searchParams.get('status') || '', premium: searchParams.get('premium') || '', sort: searchParams.get('sort') || 'updated' });
  const [error, setError] = useState('');
  useEffect(() => { api('/categories').then(data => setCategories(data.categories)).catch(() => {}); }, []);
  useEffect(() => {
    const qs = new URLSearchParams();
    Object.entries(form).forEach(([key, value]) => value && qs.set(key, value));
    api(`/stories?${qs}`)
      .then(data => setStories(data.stories))
      .catch(err => setError(err.message));
  }, [form]);
  function submit(event) {
    event.preventDefault();
    setSearchParams(form);
  }
  function quickPatch(next) {
    const merged = { ...form, ...next };
    setForm(merged);
    setSearchParams(merged);
  }
  return (
    <div className="catalog-page">
      <div className="page-title catalog-title"><h1>Danh sách truyện</h1><p>Tìm kiếm, lọc thể loại, trạng thái và sắp xếp theo xu hướng.</p></div>
      <form className="filters catalog-filters" onSubmit={submit}>
        <div className="filter-search"><label>Từ khóa</label><input placeholder="Tìm tên truyện, tác giả..." value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} /></div>
        <div><label>Thể loại</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
          <option value="">Tất cả thể loại</option>
          {categories.map(item => <option key={item} value={item}>{item}</option>)}
        </select></div>
        <div><label>Trạng thái</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
          <option value="">Mọi trạng thái</option>
          <option value="ongoing">Đang ra</option>
          <option value="completed">Hoàn thành</option>
        </select></div>
        <div><label>Loại truyện</label><select value={form.premium} onChange={e => setForm({ ...form, premium: e.target.value })}>
          <option value="">Tất cả</option>
          <option value="false">Miễn phí</option>
          <option value="true">Trả phí</option>
        </select></div>
        <div><label>Sắp xếp</label><select value={form.sort} onChange={e => setForm({ ...form, sort: e.target.value })}>
          <option value="updated">Mới cập nhật</option>
          <option value="views">Lượt xem</option>
          <option value="rating">Đánh giá</option>
          <option value="follows">Theo dõi</option>
          <option value="chapters">Số chương</option>
        </select></div>
        <button className="button">Lọc</button>
      </form>
      <div className="catalog-chips">
        <button onClick={() => quickPatch({ status: 'completed' })}>Hoàn thành</button>
        <button onClick={() => quickPatch({ sort: 'views' })}>Đọc nhiều</button>
        <button onClick={() => quickPatch({ sort: 'rating' })}>Đánh giá cao</button>
        <button onClick={() => quickPatch({ premium: 'false' })}>Miễn phí</button>
        <button onClick={() => quickPatch({ q: '', category: '', status: '', premium: '', sort: 'updated' })}>Xóa lọc</button>
      </div>
      <ErrorBox message={error} />
      <div className="catalog-summary">{stories.length} truyện phù hợp</div>
      <div className="grid stories">{stories.map(story => <StoryCard key={story.id} story={story} />)}</div>
    </div>
  );
}


function CatalogEnhanced() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryString = searchParams.toString();

  const [stories, setStories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ q: '', category: '', status: '', premium: '', sort: 'updated' });
  const [error, setError] = useState('');

  function toQueryParams(values) {
    const qs = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => value && qs.set(key, value));
    return qs;
  }

  useEffect(() => { api('/categories').then(data => setCategories(data.categories || [])).catch(() => {}); }, []);

  useEffect(() => {
    const paramsFromUrl = new URLSearchParams(queryString);
    const nextForm = {
      q: paramsFromUrl.get('q') || '',
      category: params.category || paramsFromUrl.get('category') || '',
      status: paramsFromUrl.get('status') || '',
      premium: paramsFromUrl.get('premium') || '',
      sort: paramsFromUrl.get('sort') || 'updated'
    };
    setForm(current => JSON.stringify(current) === JSON.stringify(nextForm) ? current : nextForm);
  }, [params.category, queryString]);

  useEffect(() => {
    const qs = toQueryParams(form);
    api(`/stories?${qs.toString()}`).then(data => setStories(data.stories || [])).catch(err => setError(err.message));
  }, [form]);

  function quickPatch(next) {
    const merged = { ...form, ...next };
    setForm(merged);
    setSearchParams(toQueryParams(merged));
  }

  const isCompleted = form.status === 'completed';
  const title = form.category || (isCompleted ? 'Truyện Đã Hoàn Thành' : form.q ? `Tìm kiếm: ${form.q}` : 'Danh sách truyện');
  const subtitle = form.category
    ? `${stories.length} truyện thuộc thể loại ${form.category}`
    : isCompleted
      ? 'Tổng hợp những bộ truyện đã hoàn thành — đọc trọn vẹn không cần chờ đợi.'
      : 'Tìm kiếm, lọc thể loại, trạng thái và sắp xếp theo xu hướng.';

  return (
    <div className="catalog-page catalog-readdy">
      <section className={`catalog-hero-readdy ${isCompleted ? 'completed-hero' : ''}`}>
        <div className="catalog-breadcrumb">Trang chủ › {form.category ? 'Thể loại' : 'Danh sách'}</div>
        <span className="catalog-hero-pill">{isCompleted ? 'Hoàn thành' : form.category || 'Kho truyện'}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {isCompleted && <div className="catalog-stats"><strong>{stories.length}</strong><span>Bộ truyện</span><strong>{stories.reduce((sum, item) => sum + getChapterCount(item), 0)}</strong><span>Tổng chương</span><strong>100%</strong><span>Đã hoàn thành</span></div>}
      </section>

      <div className="catalog-toolbar-readdy">
        <div className="catalog-chip-row">
          <button className={!form.category ? 'active' : ''} onClick={() => quickPatch({ category: '' })}>Tất cả</button>
          {categories.slice(0, 8).map(item => <button key={item} className={form.category === item ? 'active' : ''} onClick={() => quickPatch({ category: item })}>{item}</button>)}
        </div>
        <select value={form.sort} onChange={event => quickPatch({ sort: event.target.value })}>
          <option value="updated">Mới nhất</option>
          <option value="views">Lượt xem</option>
          <option value="rating">Đánh giá</option>
          <option value="chapters">Số chương</option>
        </select>
      </div>

      <div className="catalog-toolbar-readdy second-row">
        <div className="catalog-chip-row">
          <button className={!form.status ? 'active' : ''} onClick={() => quickPatch({ status: '' })}>Tất cả</button>
          <button className={form.status === 'ongoing' ? 'active' : ''} onClick={() => quickPatch({ status: 'ongoing' })}>Đang ra</button>
          <button className={form.status === 'completed' ? 'active' : ''} onClick={() => quickPatch({ status: 'completed' })}>Hoàn thành</button>
        </div>
        <div className="catalog-summary">Hiển thị {stories.length} truyện</div>
      </div>

      <ErrorBox message={error} />
      <div className="grid stories catalog-grid-readdy">{stories.map(story => <StoryCard key={story.id} story={story} />)}</div>
    </div>
  );
}

function ShortStoriesPage() {
  const [stories, setStories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [active, setActive] = useState('Tất cả');

  useEffect(() => {
    Promise.all([api('/stories?sort=updated'), api('/categories')]).then(([storyData, categoryData]) => {
      setStories((storyData.stories || []).slice().sort((a, b) => getChapterCount(a) - getChapterCount(b)));
      setCategories(categoryData.categories || []);
    }).catch(() => {});
  }, []);

  const visible = active === 'Tất cả' ? stories : stories.filter(story => story.categories?.includes(active));
  const highlighted = visible.slice(0, 3);

  return (
    <div className="short-page">
      <section className="catalog-hero-readdy short-hero"><span className="catalog-hero-pill purple">Truyện ngắn</span><h1>Truyện Ngắn</h1><p>Những câu chuyện gọn, súc tích — đọc xong trong một buổi, cảm xúc đọng lại mãi.</p></section>
      <HomeSection title="Nổi Bật Tuần Này" subtitle="Các truyện ngắn được đọc nhiều" kicker="Short">
        <div className="short-featured-row">{highlighted.map(story => <MiniStoryRow key={story.id} story={story} />)}</div>
      </HomeSection>
      <div className="catalog-chip-row short-filter-row"><button className={active === 'Tất cả' ? 'active' : ''} onClick={() => setActive('Tất cả')}>Tất cả</button>{categories.slice(0, 7).map(item => <button key={item} className={active === item ? 'active' : ''} onClick={() => setActive(item)}>{item}</button>)}</div>
      <div className="grid stories catalog-grid-readdy">{visible.slice(0, 18).map(story => <StoryCard key={story.id} story={story} />)}</div>
    </div>
  );
}

function RankingPage() {
  const [stories, setStories] = useState([]);
  useEffect(() => { api('/stories?sort=views').then(data => setStories(data.stories || [])).catch(() => {}); }, []);
  const topThree = stories.slice(0, 3);
  const list = stories.slice(0, 12);

  return (
    <div className="ranking-page">
      <section className="catalog-hero-readdy ranking-hero"><div className="catalog-breadcrumb">Trang chủ › Xếp hạng</div><span className="catalog-hero-pill gold">Bảng xếp hạng</span><h1>Top Truyện Hay</h1><p>Những tác phẩm được đọc nhiều nhất, đánh giá cao nhất từ cộng đồng độc giả.</p></section>
      <div className="ranking-tabs"><button>Hôm nay</button><button className="active">Tuần này</button><button>Tháng này</button><button>Năm nay</button><button>Tất cả</button><span></span><button className="active orange">Tất cả</button><button>Đang Hot</button><button>Truyện Mới</button><button>Hoàn Thành</button></div>
      <h2 className="ranking-title">🏆 Top 3 Nổi Bật</h2>
      <div className="podium-row">
        {topThree.map((story, index) => <Link key={story.id} to={`/truyen/${story.slug}`} className={`podium-card rank-${index + 1}`}><span className="podium-rank">{index + 1}</span><img src={story.cover} alt={story.title} /><strong>{story.title}</strong><small>{formatNumber(story.views)} lượt đọc</small><b>★ {story.rating}</b></Link>)}
      </div>
      <h2 className="ranking-title">▰ Bảng Xếp Hạng Đầy Đủ</h2>
      <div className="ranking-full-list">{list.map((story, index) => <Link key={story.id} to={`/truyen/${story.slug}`} className="ranking-full-row"><span className="ranking-medal">{index + 1}</span><img src={story.cover} alt={story.title} /><span><strong>{story.title}</strong><small>{story.author} · ★ {story.rating} · {getChapterCount(story)} chương</small></span><b>{formatNumber(story.views)}</b><small>lượt/tuần</small></Link>)}</div>
    </div>
  );
}
function CatalogEnhancedOld() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryString = searchParams.toString();

  const [stories, setStories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    q: '',
    category: '',
    status: '',
    premium: '',
    sort: 'updated'
  });
  const [error, setError] = useState('');

  function toQueryParams(values) {
    const qs = new URLSearchParams();

    Object.entries(values).forEach(([key, value]) => {
      if (value) qs.set(key, value);
    });

    return qs;
  }

  useEffect(() => {
    api('/categories')
      .then(data => setCategories(data.categories || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const paramsFromUrl = new URLSearchParams(queryString);

    const nextForm = {
      q: paramsFromUrl.get('q') || '',
      category: params.category || paramsFromUrl.get('category') || '',
      status: paramsFromUrl.get('status') || '',
      premium: paramsFromUrl.get('premium') || '',
      sort: paramsFromUrl.get('sort') || 'updated'
    };

    setForm(current => {
      const same =
        current.q === nextForm.q &&
        current.category === nextForm.category &&
        current.status === nextForm.status &&
        current.premium === nextForm.premium &&
        current.sort === nextForm.sort;

      return same ? current : nextForm;
    });
  }, [params.category, queryString]);

  useEffect(() => {
    const qs = toQueryParams(form);

    api(`/stories?${qs.toString()}`)
      .then(data => setStories(data.stories || []))
      .catch(err => setError(err.message));
  }, [form]);

  function submit(event) {
    event.preventDefault();
    setSearchParams(toQueryParams(form));
  }

  function quickPatch(next) {
    const merged = { ...form, ...next };
    setForm(merged);
    setSearchParams(toQueryParams(merged));
  }

  return (
    <div className="catalog-page">
      <div className="page-title catalog-title"><h1>Danh sÃ¡ch truyá»‡n</h1><p>TÃ¬m kiáº¿m, lá»c thá»ƒ loáº¡i, tráº¡ng thÃ¡i vÃ  sáº¯p xáº¿p theo xu hÆ°á»›ng.</p></div>
      <form className="filters catalog-filters" onSubmit={submit}>
        <div className="filter-search"><label>Tá»« khÃ³a</label><input placeholder="TÃ¬m tÃªn truyá»‡n, tÃ¡c giáº£..." value={form.q} onChange={e => setForm({ ...form, q: e.target.value })} /></div>
        <div><label>Thá»ƒ loáº¡i</label><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
          <option value="">Táº¥t cáº£ thá»ƒ loáº¡i</option>
          {categories.map(item => <option key={item} value={item}>{item}</option>)}
        </select></div>
        <div><label>Tráº¡ng thÃ¡i</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
          <option value="">Má»i tráº¡ng thÃ¡i</option>
          <option value="ongoing">Äang ra</option>
          <option value="completed">HoÃ n thÃ nh</option>
        </select></div>
        <div><label>Loáº¡i truyá»‡n</label><select value={form.premium} onChange={e => setForm({ ...form, premium: e.target.value })}>
          <option value="">Táº¥t cáº£</option>
          <option value="false">Miá»…n phÃ­</option>
          <option value="true">Tráº£ phÃ­</option>
        </select></div>
        <div><label>Sáº¯p xáº¿p</label><select value={form.sort} onChange={e => setForm({ ...form, sort: e.target.value })}>
          <option value="updated">Má»›i cáº­p nháº­t</option>
          <option value="views">LÆ°á»£t xem</option>
          <option value="rating">ÄÃ¡nh giÃ¡</option>
          <option value="follows">Theo dÃµi</option>
          <option value="chapters">Sá»‘ chÆ°Æ¡ng</option>
        </select></div>
        <button className="button">Lá»c</button>
      </form>
      <div className="catalog-chips">
        <button onClick={() => quickPatch({ status: 'completed' })}>HoÃ n thÃ nh</button>
        <button onClick={() => quickPatch({ sort: 'views' })}>Äá»c nhiá»u</button>
        <button onClick={() => quickPatch({ sort: 'rating' })}>ÄÃ¡nh giÃ¡ cao</button>
        <button onClick={() => quickPatch({ premium: 'false' })}>Miá»…n phÃ­</button>
        <button onClick={() => quickPatch({ q: '', category: '', status: '', premium: '', sort: 'updated' })}>XÃ³a lá»c</button>
      </div>
      <ErrorBox message={error} />
      <div className="catalog-summary">{stories.length} truyá»‡n phÃ¹ há»£p</div>
      <div className="grid stories">{stories.map(story => <StoryCard key={story.id} story={story} />)}</div>
    </div>
  );
}


function StoryDetail() {
  const { slug } = useParams();
  const { user, updateUser } = useAuth();
  const [data, setData] = useState(null);
  const [related, setRelated] = useState([]);
  const [error, setError] = useState('');
  const [commentText, setCommentText] = useState('');
  const [ratingValue, setRatingValue] = useState(0);
  const [notice, setNotice] = useState('');
  const load = () => api(`/stories/${slug}`).then(setData).catch(err => setError(err.message));

  useEffect(() => { load(); }, [slug]);

  useEffect(() => {
    if (!data?.story?.categories?.length) return;
    const category = encodeURIComponent(data.story.categories[0]);
    api(`/stories?category=${category}&sort=views`).then(result => setRelated((result.stories || []).filter(item => item.slug !== data.story.slug).slice(0, 8))).catch(() => setRelated([]));
  }, [data?.story?.slug]);

  async function toggle(type) {
    if (!user) return setError('Bạn cần đăng nhập để dùng chức năng này.');
    const result = await api(`/stories/${data.story.id}/${type}`, { method: 'POST' });
    setData(prev => ({ ...prev, story: { ...prev.story, bookmarked: result.bookmarked ?? prev.story.bookmarked, followed: result.followed ?? prev.story.followed, follows: result.follows ?? prev.story.follows } }));
  }

  async function submitComment() {
    if (!user) return setError('Bạn cần đăng nhập để bình luận.');
    try {
      const result = await api(`/stories/${data.story.id}/comments`, { method: 'POST', body: JSON.stringify({ body: commentText }) });
      setData(prev => ({ ...prev, comments: [result.comment, ...(prev.comments || [])] }));
      setCommentText('');
      setNotice('Đã gửi bình luận.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitRating(value = ratingValue) {
    if (!user) return setError('Bạn cần đăng nhập để đánh giá.');
    try {
      const result = await api(`/stories/${data.story.id}/rating`, { method: 'POST', body: JSON.stringify({ value }) });
      setRatingValue(value);
      setData(prev => ({ ...prev, story: { ...prev.story, rating: result.rating, ratingCount: result.ratingCount, myRating: result.myRating } }));
      setNotice('Đã lưu đánh giá của bạn.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function reportStory() {
    if (!user) return setError('Bạn cần đăng nhập để báo cáo nội dung.');
    const reason = prompt('Nhập lý do báo cáo nội dung này:');
    if (!reason) return;
    try {
      await api(`/stories/${data.story.id}/report`, { method: 'POST', body: JSON.stringify({ reason }) });
      setNotice('Đã gửi báo cáo cho admin.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function buyCombo() {
    if (!user) return setError('Bạn cần đăng nhập để mua combo.');
    try {
      const result = await api(`/stories/${data.story.id}/unlock-combo`, { method: 'POST' });
      updateUser(result.user);
      setNotice(result.price ? `Đã mua combo với ${result.price} Đậu.` : 'Combo đã được mở khóa.');
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loader />;

  const { story, chapters } = data;
  const comments = data.comments || [];
  const orderedChapters = chapters.slice().sort((a, b) => b.number - a.number);
  const freeCount = chapters.filter(chapter => !chapter.isPremium).length;
  const activeRating = ratingValue || story.myRating || 0;

  return (
    <div className="story-detail-page readdy-story-page">
      <section className="story-hero story-hero-readdy" style={{ '--story-bg': `url("${story.cover}")` }}>
        <div className="story-cover-panel"><img className="detail-cover" src={story.cover} alt={story.title} /></div>
        <div className="story-detail-body">
          <div className="catalog-breadcrumb">Trang chủ › Danh sách › {story.title}</div>
          <div className="story-category-row">{story.categories.map(item => <Link key={item} to={`/the-loai/${encodeURIComponent(item)}`}>{item}</Link>)}</div>
          <h1>{story.title}</h1>
          <div className="story-author">Tác giả: <Link to={`/tac-gia/${encodeURIComponent(story.author)}`}><strong>{story.author}</strong></Link></div>
          <div className="story-inline-stats"><span>★ {story.rating}/5</span><span>👁 {formatNumber(story.views)} lượt đọc</span><span>▣ {chapters.length} chương</span><span className="green">⦿ {statusLabel(story.status)}</span></div>
          <p className="story-description">{story.description}</p>
          <div className="purchase-strip"><span>📖 Miễn phí<br /><b>{freeCount} chương đầu</b></span><span>🪙 Mua lẻ<br /><b>{story.price || 1} Đậu/chương</b></span><span>🎁 Combo trọn bộ<br /><b>{Math.max(49, (story.price || 1) * chapters.length)} Đậu</b></span></div>
          <div className="hero-actions"><Link className="button" to={`/truyen/${story.slug}/chuong/1`}>◎ Đọc từ đầu</Link><button className="button gold" onClick={buyCombo}>🪙 Mua combo {Math.max(49, (story.price || 1) * chapters.length)} Đậu</button><button className="ghost light" onClick={() => toggle('follow')}>{story.followed ? '✓ Đang theo dõi' : '♡ Theo dõi'}</button><button className="ghost light" onClick={() => toggle('bookmark')}>{story.bookmarked ? '✓ Đã lưu' : '🔖 Lưu'}</button><button className="ghost light" onClick={reportStory}>⚑ Báo cáo</button></div>
          {notice && <div className="success-box">{notice}</div>}
        </div>
      </section>

      <section className="story-section chapter-section-readdy">
        <div className="story-section-head"><h2>▰ Danh sách chương <small>({chapters.length} chương)</small></h2><div className="chapter-tabs"><button className="active">Tất cả</button><button>Miễn phí</button><button>Trả phí</button><button>Mới nhất</button></div></div>
        <div className="free-note">📚 {freeCount} chương đầu miễn phí — Từ chương {freeCount + 1} trở đi cần <b>{story.price || 1} Đậu/chương</b></div>
        <div className="chapter-grid-readdy">
          {orderedChapters.map(chapter => (
            <Link key={chapter.id} to={`/truyen/${story.slug}/chuong/${chapter.number}`}>
              <span>{chapter.isPremium ? '🔒' : '📖'} Chương {chapter.number}: {chapter.title.replace(/^Chương\s*\d+[:：]?\s*/i, '')}</span>
              <small>{chapter.isPremium ? `🪙 ${chapter.price || story.price || 1}` : 'Free'} · {formatNumber(chapter.views)} lượt</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="rating-panel-readdy">
        <div className="big-rating"><strong>{story.rating}</strong><span>★★★★★</span><small>{story.ratingCount || 0} lượt đánh giá</small></div>
        <div className="rating-bars"><p>5 sao <i style={{ width: '72%' }} /></p><p>4 sao <i style={{ width: '42%' }} /></p><p>3 sao <i style={{ width: '18%' }} /></p><p>2 sao <i style={{ width: '8%' }} /></p><p>1 sao <i style={{ width: '4%' }} /></p></div>
        <div className="your-rating"><span>Đánh giá của bạn</span><div>{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" className="star-button" onClick={() => submitRating(value)}>{value <= activeRating ? '★' : '☆'}</button>)}</div><button className="button gold small" onClick={() => submitRating(activeRating || 5)}>Gửi đánh giá</button></div>
      </section>

      <section className="comments-readdy">
        <div className="story-section-head"><h2>◉ Bình luận <small>({comments.length})</small></h2><div className="chapter-tabs"><button className="active">Mới nhất</button></div></div>
        <textarea placeholder="Chia sẻ cảm nhận của bạn về truyện này..." maxLength="500" value={commentText} onChange={event => setCommentText(event.target.value)} />
        <button className="button comment-submit" onClick={submitComment}>Gửi bình luận</button>
        {comments.map(comment => <div key={comment.id} className="comment-item"><img src={comment.userAvatar || '/images/logo.png'} alt="avatar" /><div><strong>{comment.userName} <span>★★★★★</span></strong><p>{comment.body}</p><small>{formatDateShort(comment.createdAt)} · Trả lời</small></div></div>)}
      </section>

      {related.length > 0 && <HomeSection title="Truyện liên quan" subtitle="Các tác phẩm cùng thể loại" kicker="Related" to={`/the-loai/${encodeURIComponent(story.categories[0])}`}><div className="related-list-column">{related.slice(0, 6).map(item => <MiniStoryRow key={item.id} story={item} compact />)}</div></HomeSection>}
      <div className="combo-banner">Mua combo tiết kiệm hơn! <b>Mở khóa toàn bộ {chapters.length} chương chỉ với {Math.max(49, (story.price || 1) * chapters.length)} Đậu</b><button onClick={buyCombo}>Mua combo ngay</button></div>
      {related.length > 0 && <HomeSection title="Có thể bạn thích" subtitle="Gợi ý thêm cho bạn" kicker="Suggest"><div className="grid stories">{related.map(item => <StoryCard key={item.id} story={item} />)}</div></HomeSection>}
    </div>
  );
}

function Reader() {
  const { slug, number } = useParams();
  const { user, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [readerPrefs, setReaderPrefs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('daudo_reader_prefs') || '{}');
    } catch {
      return {};
    }
  });
  const [saved, setSaved] = useState(false);

  function ReaderIcon({ name }) {
    const props = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.9', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' };
    switch (name) {
      case 'home': return <svg {...props}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10.5V20h14v-9.5" /></svg>;
      case 'book': return <svg {...props}><path d="M6 5.5h10a3 3 0 0 1 3 3V19H9a3 3 0 0 0-3 3z" /><path d="M6 5.5v16" /></svg>;
      case 'chevron-right': return <svg {...props}><path d="m9 6 6 6-6 6" /></svg>;
      case 'chevron-left': return <svg {...props}><path d="m15 6-6 6 6 6" /></svg>;
      case 'chevron-down': return <svg {...props}><path d="m6 9 6 6 6-6" /></svg>;
      case 'line-tight': return <svg {...props}><path d="M5 7h14" /><path d="M5 12h10" /><path d="M5 17h7" /></svg>;
      case 'font-size': return <svg {...props}><path d="M8 18V7" /><path d="m5 10 3-3 3 3" /><path d="m5 15 3 3 3-3" /><path d="M15 7h4" /><path d="M17 7v11" /></svg>;
      case 'type': return <svg {...props}><path d="M5 7h14" /><path d="M12 7v12" /></svg>;
      case 'panel': return <svg {...props}><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M10 5v14" /></svg>;
      case 'panel-wide': return <svg {...props}><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M9 6v12" /><path d="M15 6v12" /></svg>;
      case 'heart': return <svg {...props}><path d="m12 20-6.2-6.1a4.2 4.2 0 1 1 5.9-5.9L12 8.3l.3-.3a4.2 4.2 0 1 1 5.9 5.9z" /></svg>;
      case 'share': return <svg {...props}><circle cx="18" cy="5" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="18" cy="19" r="2" /><path d="m8 12 8-5" /><path d="m8 12 8 7" /></svg>;
      case 'moon': return <svg {...props}><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" /></svg>;
      case 'sun': return <svg {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="m4.9 4.9 2.2 2.2" /><path d="m16.9 16.9 2.2 2.2" /><path d="m19.1 4.9-2.2 2.2" /><path d="m7.1 16.9-2.2 2.2" /></svg>;
      case 'droplet': return <svg {...props}><path d="M12 3s5 5.3 5 9a5 5 0 1 1-10 0c0-3.7 5-9 5-9Z" /></svg>;
      case 'spacing': return <svg {...props}><path d="M6 7h12" /><path d="M6 17h12" /><path d="m9 10 3 3 3-3" /><path d="m9 14 3-3 3 3" /></svg>;
      case 'settings': return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M12 2v2.5" /><path d="M12 19.5V22" /><path d="m4.9 4.9 1.8 1.8" /><path d="m17.3 17.3 1.8 1.8" /><path d="M2 12h2.5" /><path d="M19.5 12H22" /><path d="m4.9 19.1 1.8-1.8" /><path d="m17.3 6.7 1.8-1.8" /></svg>;
      case 'user': return <svg {...props}><path d="M18 20a6 6 0 0 0-12 0" /><circle cx="12" cy="8" r="4" /></svg>;
      case 'calendar': return <svg {...props}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M4 10h16" /></svg>;
      case 'eye': return <svg {...props}><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
      case 'message': return <svg {...props}><path d="M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" /></svg>;
      default: return <svg {...props}><circle cx="12" cy="12" r="8" /></svg>;
    }
  }

  const load = () => api(`/stories/${slug}/chapters/${number}`).then(setData).catch(err => setError(err.message));

  useEffect(() => { load(); }, [slug, number]);
  useEffect(() => {
    localStorage.setItem('daudo_reader_prefs', JSON.stringify(readerPrefs));
  }, [readerPrefs]);
  useEffect(() => {
    if (!saved) return undefined;
    const timer = setTimeout(() => setSaved(false), 1600);
    return () => clearTimeout(timer);
  }, [saved]);

  async function unlock() {
    if (!user) return setError('B?n c?n ??ng nh?p ?? m? kh?a ch??ng.');
    try {
      const result = await api(`/chapters/${data.chapter.id}/unlock`, { method: 'POST' });
      updateUser(result.user);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveStory(storyId) {
    if (!user) return setError('B?n c?n ??ng nh?p ?? l?u truy?n.');
    try {
      await api(`/stories/${storyId}/bookmark`, { method: 'POST' });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function shareChapter(story, chapter) {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: chapter.title, text: `${story.title} - ${chapter.title}`, url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setSaved(true);
      }
    } catch {}
  }

  function updateReaderPref(key, value) {
    setReaderPrefs(current => ({ ...current, [key]: value }));
  }

  function cycleValue(key, order, fallback) {
    const current = readerPrefs[key] || fallback;
    const index = order.indexOf(current);
    updateReaderPref(key, order[(index + 1) % order.length]);
  }

  if (error && !data) return <ErrorBox message={error} />;
  if (!data) return <Loader />;
  const { story, chapter, unlocked } = data;
  const prevLink = Number(number) > 1 ? `/truyen/${slug}/chuong/${Number(number) - 1}` : null;
  const nextLink = Number(number) < (story.chapterCount || 0) ? `/truyen/${slug}/chuong/${Number(number) + 1}` : null;
  const fontSize = readerPrefs.fontSize || 'md';
  const lineHeight = readerPrefs.lineHeight || 'normal';
  const fontFamily = readerPrefs.fontFamily || 'sans';
  const readerTone = readerPrefs.readerTone || (theme === 'light' ? 'light' : 'dark');
  const wide = Boolean(readerPrefs.wide);

  return (
    <div className={wide ? 'reader-page-shell reader-page-wide' : 'reader-page-shell'}>
      <div className="reader-crumbs">
        <Link to="/"><span className="reader-inline-icon"><ReaderIcon name="home" /></span><span>Trang ch?</span></Link>
        <span className="reader-separator"><ReaderIcon name="chevron-right" /></span>
        <Link to={`/truyen/${story.slug}`}><span className="reader-inline-icon"><ReaderIcon name="book" /></span><span>{story.title}</span></Link>
        <span className="reader-separator"><ReaderIcon name="chevron-right" /></span>
        <b>{chapter.title}</b>
      </div>

      <div className="reader-chapter-switcher">
        {prevLink ? <Link className="reader-switch ghost" to={prevLink}><ReaderIcon name="chevron-left" /><span>Ch??ng tr??c</span></Link> : <span className="reader-switch ghost disabled"><ReaderIcon name="chevron-left" /><span>Ch??ng tr??c</span></span>}
        <button type="button" className="reader-current-chip"><span>{chapter.title}</span><span className="reader-current-arrow"><ReaderIcon name="chevron-down" /></span></button>
        {nextLink ? <Link className="reader-switch next" to={nextLink}><span>Ch??ng sau</span><ReaderIcon name="chevron-right" /></Link> : <span className="reader-switch ghost disabled"><span>?? h?t ch??ng</span></span>}
      </div>

      <div className="reader-toolbar">
        <div className="reader-toolbar-group">
          <button type="button" className={lineHeight === 'tight' ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => cycleValue('lineHeight', ['tight', 'normal', 'relaxed'], 'normal')} title="Gi?n d?ng"><ReaderIcon name="line-tight" /></button>
          <button type="button" className={fontSize !== 'md' ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => cycleValue('fontSize', ['sm', 'md', 'lg'], 'md')} title="C? ch?"><ReaderIcon name="font-size" /></button>
          <button type="button" className={fontFamily === 'serif' ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => cycleValue('fontFamily', ['sans', 'serif'], 'sans')} title="Ki?u ch?"><ReaderIcon name="type" /></button>
          <button type="button" className={wide ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => updateReaderPref('wide', !wide)} title="Khung r?ng"><ReaderIcon name={wide ? 'panel-wide' : 'panel'} /></button>
          <button type="button" className={saved ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => saveStory(story.id)} title="L?u truy?n"><ReaderIcon name="heart" /></button>
          <button type="button" className="reader-tool-btn" onClick={() => shareChapter(story, chapter)} title="Chia s?"><ReaderIcon name="share" /></button>
        </div>
        <div className="reader-toolbar-group">
          <button type="button" className={readerTone === 'dark' ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => cycleValue('readerTone', ['dark', 'light', 'sepia'], theme === 'light' ? 'light' : 'dark')} title="N?n ??c"><ReaderIcon name={readerTone === 'dark' ? 'moon' : readerTone === 'light' ? 'sun' : 'droplet'} /></button>
          <button type="button" className={theme === 'light' ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={toggleTheme} title="S?ng t?i"><ReaderIcon name={theme === 'light' ? 'moon' : 'sun'} /></button>
          <button type="button" className={lineHeight === 'relaxed' ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => cycleValue('lineHeight', ['tight', 'normal', 'relaxed'], 'normal')} title="Gi?n d?ng r?ng"><ReaderIcon name="spacing" /></button>
          <button type="button" className="reader-tool-btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="L?n ??u trang"><ReaderIcon name="settings" /></button>
        </div>
      </div>

      <article className={`reader reader-tone-${readerTone} reader-font-${fontFamily} reader-size-${fontSize} reader-leading-${lineHeight}`}>
        <div className="reader-headline">
          <h1>{chapter.title} - {story.title}</h1>
          <h2>{story.title}</h2>
          <p className="reader-meta">
            <span><ReaderIcon name="user" /> T?c gi?: {story.author}</span>
            <span><ReaderIcon name="calendar" /> {formatDateShort(story.updatedAt || chapter.updatedAt || Date.now())}</span>
            <span><ReaderIcon name="eye" /> L??t ??c: {formatNumber(chapter.views)}</span>
            <span><ReaderIcon name="message" /> B?nh lu?n: 0</span>
          </p>
        </div>
        <ErrorBox message={error} />
        {!unlocked && <div className="paywall"><h3>Ch??ng tr? ph?</h3><p>B?n ?ang xem b?n preview. M? kh?a ?? ??c ??y ?? ch??ng n?y.</p><button className="button" onClick={unlock}>M? kh?a {chapter.price} H?t</button></div>}
        <div className="chapter-content">{chapter.content.split('\n').map((line, index) => line ? <p key={index}>{line}</p> : <br key={index} />)}</div>
        <div className="reader-nav">
          {prevLink ? <Link className="ghost" to={prevLink}>Ch??ng tr??c</Link> : <span className="ghost disabled">Ch??ng tr??c</span>}
          {nextLink ? <Link className="ghost" to={nextLink}>Ch??ng sau</Link> : <span className="ghost disabled">?? h?t ch??ng</span>}
        </div>
      </article>
    </div>
  );
}
function AuthorPage() {
  const { name } = useParams();
  const authorName = decodeURIComponent(name || '');
  const [stories, setStories] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/stories?q=${encodeURIComponent(authorName)}&sort=updated`)
      .then(data => setStories((data.stories || []).filter(story => story.author === authorName)))
      .catch(err => setError(err.message));
  }, [authorName]);
  return (
    <div className="catalog-page catalog-readdy">
      <section className="catalog-hero-readdy">
        <div className="catalog-breadcrumb">Trang chủ › Tác giả</div>
        <span className="catalog-hero-pill">Tác giả</span>
        <h1>{authorName}</h1>
        <p>Các truyện đang có trên Đậu Đỏ Truyện của tác giả/người đăng này.</p>
      </section>
      <ErrorBox message={error} />
      <div className="grid stories catalog-grid-readdy">{stories.map(story => <StoryCard key={story.id} story={story} />)}</div>
      {!error && stories.length === 0 && <div className="center-card">Chưa có truyện công khai của tác giả này.</div>}
    </div>
  );
}

function Notifications() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/notifications').then(data => setItems(data.notifications || [])).catch(err => setError(err.message));
  useEffect(() => { load(); }, []);
  async function markRead() {
    await api('/notifications/read-all', { method: 'POST' });
    await load();
  }
  if (error) return <ErrorBox message={error} />;
  if (!items) return <Loader />;
  return (
    <div className="library-page">
      <div className="library-head"><div><span className="library-icon">🔔</span><h1>Thông báo</h1><p>{items.length} thông báo gần đây</p></div><button className="button small" onClick={markRead}>Đánh dấu đã đọc</button></div>
      <div className="list-panel">{items.map(item => <div key={item.id} className={item.read ? '' : 'active-admin-row'}><span><strong>{item.title}</strong><small>{item.body}</small></span><small>{item.read ? 'Đã đọc' : 'Mới'} · {formatDateShort(item.createdAt)}</small></div>)}</div>
      {items.length === 0 && <div className="center-card">Chưa có thông báo.</div>}
    </div>
  );
}

function StaticPage({ type }) {
  const pages = {
    contact: ['Liên hệ', 'Gửi phản hồi, báo lỗi hoặc yêu cầu gỡ nội dung qua email support@daudotruyen.vn. Đội ngũ quản trị sẽ phản hồi trong thời gian sớm nhất.'],
    terms: ['Điều khoản sử dụng', 'Người dùng chịu trách nhiệm với nội dung đăng tải, không đăng nội dung vi phạm bản quyền, pháp luật hoặc gây hại cho cộng đồng. Admin có quyền ẩn hoặc gỡ nội dung khi cần.'],
    privacy: ['Chính sách bảo mật', 'Đậu Đỏ Truyện lưu thông tin tài khoản, lịch sử đọc và giao dịch Đậu để vận hành dịch vụ demo. Không chia sẻ dữ liệu cá nhân cho bên thứ ba trong phạm vi MVP này.']
  };
  const [title, body] = pages[type] || pages.contact;
  return (
    <div className="auth-card wide static-page">
      <h1>{title}</h1>
      <p className="muted">{body}</p>
      <Link className="button" to="/">Về trang chủ</Link>
    </div>
  );
}

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'user@example.com', password: '123456' });
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    try {
      const user = await login(form.email, form.password);
      navigate(user.role === 'admin' ? '/admin' : '/ho-so');
    } catch (err) {
      setError(err.message);
    }
  }
  return <AuthForm title="Đăng nhập" submitLabel="Đăng nhập" form={form} setForm={setForm} onSubmit={submit} error={error} footer={<p>Chưa có tài khoản? <Link to="/dang-ky">Đăng ký</Link></p>} />;
}

function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    try {
      await register(form.name, form.email, form.password);
      navigate('/ho-so');
    } catch (err) {
      setError(err.message);
    }
  }
  return <AuthForm title="Đăng ký" submitLabel="Tạo tài khoản" form={form} setForm={setForm} onSubmit={submit} error={error} register footer={<p>Đã có tài khoản? <Link to="/dang-nhap">Đăng nhập</Link></p>} />;
}


function AuthForm({ title, submitLabel, form, setForm, onSubmit, error, register = false, footer }) {
  return (
    <div className="auth-page">
      <Link to="/" className="auth-brand"><img src="/images/logo.png" alt="Đậu Đỏ Truyện" /><span>Đậu Đỏ <b>Truyện</b></span></Link>
      <div className="auth-card readdy-auth">
        <h1>{register ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
        <p className="muted">{register ? 'Tạo tài khoản miễn phí và bắt đầu hành trình đọc truyện.' : 'Chào mừng trở lại! Đăng nhập để tiếp tục đọc truyện.'}</p>
        <div className="auth-tabs"><Link className={!register ? 'active' : ''} to="/dang-nhap">Đăng nhập</Link><Link className={register ? 'active' : ''} to="/dang-ky">Đăng ký</Link></div>
        <ErrorBox message={error} />
        <form onSubmit={onSubmit} className="stack-form auth-stack">
          {register && <label>Tên người dùng<input placeholder="Tên hiển thị của bạn" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>}
          <label>Email<input placeholder="example@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          <label>Mật khẩu <Link to="/dang-nhap">Quên mật khẩu?</Link><input placeholder={register ? 'Tối thiểu 6 ký tự' : 'Nhập mật khẩu'} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
          {register && <label className="check-row"><input type="checkbox" /> Tôi đồng ý với <b>Điều khoản dịch vụ</b> và <b>Chính sách bảo mật</b></label>}
          <button className="button auth-submit">{submitLabel}</button>
        </form>
        {!register && <><div className="auth-divider"><span>hoặc</span></div><div className="social-login"><button>G Google</button><button>ⓕ Facebook</button></div></>}
        <div className="auth-footer-line">{footer}</div>
      </div>
      <Link to="/" className="auth-back">← Quay về trang chủ</Link>
    </div>
  );
}

function Profile() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => ({
    name: user?.name || '',
    username: user?.username || user?.id || '',
    email: user?.email || '',
    phone: user?.phone || '',
    birthday: user?.birthday || '',
    gender: user?.gender || '',
    address: user?.address || '',
    website: user?.website || '',
    bio: user?.bio || '',
    avatar: user?.avatar || '/images/logo.png',
    cover: user?.cover || ''
  }));
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [prefs, setPrefs] = useState(() => ({
    emailNotifications: user?.preferences?.emailNotifications ?? true,
    chapterNotifications: user?.preferences?.chapterNotifications ?? true,
    commentNotifications: user?.preferences?.commentNotifications ?? true,
    followNotifications: user?.preferences?.followNotifications ?? true,
    promoNotifications: user?.preferences?.promoNotifications ?? false,
    publicReading: user?.preferences?.publicReading ?? true
  }));
  const [library, setLibrary] = useState({ bookmarks: [], follows: [], history: [] });
  const [wallet, setWallet] = useState({ transactions: [] });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api('/me/library'), api('/wallet/transactions')])
      .then(([libraryData, walletData]) => {
        setLibrary(libraryData);
        setWallet(walletData);
      })
      .catch(err => setError(err.message));
  }, []);

  const myStories = useMemo(() => {
    if (user?.role !== 'admin') return [];
    return [];
  }, [user?.role]);

  const stats = {
    stories: myStories.length || (user?.role === 'admin' ? 265 : library.follows.length),
    chapters: user?.role === 'admin' ? 36600 : library.history.length,
    followers: library.follows.length || 5,
    views: user?.role === 'admin' ? 2000000 : library.history.length * 120
  };

  const showNotice = message => {
    setNotice(message);
    setTimeout(() => setNotice(''), 2600);
  };

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await api('/me/profile', { method: 'PATCH', body: JSON.stringify(form) });
      updateUser(result.user);
      showNotice('Đã lưu thay đổi hồ sơ.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function savePrefs(nextPrefs) {
    setPrefs(nextPrefs);
    setError('');
    try {
      const result = await api('/me/preferences', { method: 'PATCH', body: JSON.stringify(nextPrefs) });
      updateUser(result.user);
      showNotice('Đã cập nhật cài đặt.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api('/me/password', { method: 'POST', body: JSON.stringify(passwordForm) });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showNotice('Đã đổi mật khẩu.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const menuGroups = [
    ['TÀI KHOẢN', [['◉', 'Hồ sơ cá nhân', '/ho-so', true], ['◈', 'Bảo mật', '#security'], ['●', 'Thông báo', '#notifications', false, 7], ['▰', 'Ví của tôi', '#profile-wallet', false, `${formatNumber(user?.seeds || 0)} Đậu`], ['□', 'Mời bạn bè', '#invite'], ['⚙', 'Cài đặt', '#settings']]],
    ['SÁNG TÁC', [['▣', 'Quản lý truyện', '/admin', false, user?.role === 'admin' ? 14 : 0], ['◒', 'Đăng truyện mới', '/dang-truyen'], ['◢', 'Lọc từ nhạy cảm', '#filter']]],
    ['NỘI DUNG', [['▰', 'Thư viện', '/bookmarks'], ['▱', 'Đã đọc', '/lich-su'], ['♥', 'Yêu thích', '/theo-doi']]],
    ['THỐNG KÊ', [['◉', 'Doanh thu', '#revenue']]],
    ['QUẢN TRỊ', [['●', 'Duyệt bình luận', '/admin'], ['■', 'Duyệt truyện trùng', '/admin'], ['◷', 'Lịch sử MOD', '/admin']]],
    ['HỖ TRỢ', [['?', 'Hướng dẫn', '/lien-he'], ['♟', 'Liên hệ', '/lien-he'], ['☞', 'Phản hồi', '/lien-he']]]
  ];

  const quickLinks = [
    ['▣', 'Truyện của tôi', '/admin'],
    ['▰', 'Truyện đã lưu', '/bookmarks'],
    ['◷', 'Lịch sử đọc', '/lich-su'],
    ['◇', 'Thành tựu', '#achievements'],
    ['⚙', 'Cài đặt nâng cao', '#settings']
  ];

  const togglePref = key => savePrefs({ ...prefs, [key]: !prefs[key] });
  const membership = user?.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' }) : 'March 2026';

  return (
    <div className="profile-workspace">
      <aside className="profile-side-nav">
        <div className="profile-side-brand"><img src="/images/logo.png" alt="logo" /><strong>Đậu Đỏ</strong><button type="button" onClick={() => navigate('/')}>‹</button></div>
        <div className="profile-side-user"><img src={form.avatar || '/images/logo.png'} alt={user.name} /><div><strong>{user.name}</strong><span>Mod</span><small>⭐ Cấp 1</small></div></div>
        {menuGroups.map(([group, items]) => (
          <section className="profile-menu-group" key={group}>
            <h3>{group}<span>⌄</span></h3>
            {items.map(([icon, label, to, active, badge]) => (
              to.startsWith('/') ? (
                <Link key={label} className={active ? 'active' : ''} to={to}><span>{icon}</span>{label}{badge ? <b>{badge}</b> : null}</Link>
              ) : (
                <a key={label} className={active ? 'active' : ''} href={to}><span>{icon}</span>{label}{badge ? <b>{badge}</b> : null}</a>
              )
            ))}
          </section>
        ))}
        <button type="button" className="profile-logout" onClick={logout}>⇥ Đăng xuất</button>
      </aside>

      <main className="profile-main">
        <div className="profile-title"><span>♟</span><h1>Hồ sơ cá nhân</h1></div>
        <ErrorBox message={error} />
        {notice && <div className="success-box">{notice}</div>}

        <section className="profile-hero-card">
          <div className="profile-cover" style={{ backgroundImage: form.cover ? `url(${form.cover})` : 'none' }}><button type="button">◉</button></div>
          <div className="profile-identity">
            <button type="button" className="profile-avatar-edit" onClick={() => {
              const avatar = prompt('Nhập URL avatar:', form.avatar);
              if (avatar !== null) setForm(prev => ({ ...prev, avatar }));
            }}><img src={form.avatar || '/images/logo.png'} alt={user.name} /><span>●</span></button>
            <div><h2>{user.name}</h2><p>@_{user.id}</p><span>♛ {user.role === 'admin' ? 'Moderator' : 'Member'}</span></div>
            <button type="button" className="profile-share" onClick={() => navigator.clipboard?.writeText(window.location.href).then(() => showNotice('Đã sao chép link hồ sơ.'))}>↗ Chia sẻ hồ sơ</button>
          </div>
          <div className="profile-joined">▦ Tham gia từ {membership}</div>
        </section>

        <form className="profile-card" onSubmit={saveProfile}>
          <div className="profile-card-head"><h2>▣ Thông tin cá nhân</h2><button className="profile-save" disabled={saving}>▣ {saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div>
          <div className="profile-form-grid">
            <label>Tên hiển thị *<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label>Tên đăng nhập<input value={`_${form.username}`} disabled /></label>
            <label>Email *<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
            <label>Số điện thoại<input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Nhập số điện thoại" /></label>
            <label>Ngày sinh<input type="date" value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} /></label>
            <fieldset><legend>Giới tính</legend>{['Nam','Nữ','Khác'].map(item => <label key={item}><input type="radio" name="gender" checked={form.gender === item} onChange={() => setForm({ ...form, gender: item })} /> {item}</label>)}</fieldset>
            <label>Địa chỉ<input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="VD: Hà Nội, Việt Nam" /></label>
            <label>Website<input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://website.com" /></label>
            <label className="profile-wide">Giới thiệu bản thân<textarea maxLength="500" value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} placeholder="Viết vài dòng giới thiệu về bản thân..." /><small>Tối đa 500 ký tự</small></label>
          </div>
        </form>

        <form id="security" className="profile-card" onSubmit={changePassword}>
          <div className="profile-card-head"><h2>⌕ Đổi mật khẩu</h2></div>
          <p className="profile-alert">ⓘ Bảo mật tài khoản: Sử dụng mật khẩu mạnh với ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.</p>
          <label>Mật khẩu hiện tại *<input type="password" value={passwordForm.currentPassword} onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} placeholder="Nhập mật khẩu hiện tại" /></label>
          <div className="profile-form-grid">
            <label>Mật khẩu mới *<input type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder="Nhập mật khẩu mới" /><small>Ít nhất 8 ký tự</small></label>
            <label>Xác nhận mật khẩu mới *<input type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} placeholder="Nhập lại mật khẩu mới" /></label>
          </div>
          <div className="profile-card-actions"><button className="profile-save" disabled={saving}>⌕ Đổi mật khẩu</button></div>
        </form>

        <section id="notifications" className="profile-card">
          <div className="profile-card-head"><h2>● Cài đặt thông báo</h2></div>
          {[
            ['emailNotifications', 'Thông báo qua Email', 'Nhận thông báo về chương mới, bình luận và cập nhật hệ thống qua email'],
            ['chapterNotifications', 'Thông báo chương mới', 'Nhận thông báo khi truyện bạn theo dõi có chương mới'],
            ['commentNotifications', 'Thông báo bình luận', 'Nhận thông báo khi có người bình luận truyện của bạn'],
            ['followNotifications', 'Thông báo theo dõi', 'Nhận thông báo khi có người theo dõi bạn'],
            ['promoNotifications', 'Thông báo khuyến mãi', 'Nhận thông báo về các chương trình khuyến mãi và sự kiện đặc biệt']
          ].map(([key, title, desc]) => <ToggleRow key={key} title={title} desc={desc} checked={prefs[key]} onChange={() => togglePref(key)} />)}
        </section>

        <section className="profile-card">
          <div className="profile-card-head"><h2>◉ Quyền riêng tư</h2></div>
          <ToggleRow title="Hiển thị truyện đang đọc trên Tường nhà" desc="Cho phép mọi người xem danh sách truyện bạn đang đọc trên trang Tường nhà (my-wall)" checked={prefs.publicReading} onChange={() => togglePref('publicReading')} />
        </section>
      </main>

      <aside className="profile-right-rail">
        <section className="profile-card profile-mini"><h2>▥ Thống kê</h2><div className="profile-stat-grid"><strong>{formatCompact(stats.stories)}<span>Truyện đã đăng</span></strong><strong>{formatCompact(stats.chapters)}<span>Chương đã viết</span></strong><strong>{formatCompact(stats.followers)}<span>Người theo dõi</span></strong><strong>{formatCompact(stats.views)}<span>Lượt xem</span></strong></div></section>
        <section id="profile-wallet" className="profile-card profile-mini"><h2>☁ Ví của tôi</h2><div className="profile-wallet-line"><span>◒</span><b>Đậu<br />{formatNumber(user.seeds || 0)}</b><button type="button" onClick={() => navigate('/vi-hat')}>+</button></div><button type="button" className="profile-white-btn" onClick={() => navigate('/vi-hat')}>◉ Lịch sử giao dịch</button></section>
        <section className="profile-card profile-mini"><h2>♣ Liên kết mạng xã hội</h2><div className="profile-socials">{['f','𝕏','◎','♪'].map(item => <button key={item} type="button">{item}</button>)}</div><p>Cập nhật liên kết trong phần thông tin cá nhân</p></section>
        <section className="profile-card profile-mini"><h2>⌁ Liên kết nhanh</h2><div className="profile-quick-list">{quickLinks.map(([icon, label, to]) => to.startsWith('/') ? <Link key={label} to={to}><span>{icon}</span>{label}<b>›</b></Link> : <a key={label} href={to}><span>{icon}</span>{label}<b>›</b></a>)}</div></section>
        <section className="profile-card profile-danger"><h2>▲ Vùng nguy hiểm</h2><p>Các hành động dưới đây không thể hoàn tác. Hãy cân nhắc kỹ trước khi thực hiện.</p><button type="button" onClick={logout}>↳ Đăng xuất khỏi tất cả thiết bị</button></section>
      </aside>
    </div>
  );
}

function ToggleRow({ title, desc, checked, onChange }) {
  return (
    <div className="profile-toggle-row">
      <div><strong>{title}</strong><small>{desc}</small></div>
      <button type="button" className={checked ? 'profile-toggle on' : 'profile-toggle'} onClick={onChange} aria-pressed={checked}><span /></button>
    </div>
  );
}


function Library({ type }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('grid');
  const [keyword, setKeyword] = useState('');

  useEffect(() => { api('/me/library').then(setData).catch(err => setError(err.message)); }, []);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loader />;

  const titles = { bookmarks: 'Bookmark của tôi', follows: 'Truyện đang theo dõi', history: 'Lịch sử đọc' };
  const rawItems = type === 'history' ? data.history : data[type];
  const items = rawItems.filter(item => {
    const story = type === 'history' ? item.story : item;
    return !keyword || story.title.toLowerCase().includes(keyword.toLowerCase());
  });

  return (
    <div className="library-page">
      <div className="library-head"><div><span className="library-icon">🔖</span><h1>{titles[type]}</h1><p>{items.length} {type === 'history' ? 'mục lịch sử' : 'chương đã lưu'}</p></div><button className="dd-icon-btn" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}>{view === 'grid' ? '☷' : '▦'}</button></div>
      <div className="library-controls"><input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="Tìm kiếm bookmark..." /><select><option>Mới nhất</option><option>Cũ nhất</option></select></div>
      <div className={view === 'grid' && type !== 'history' ? 'library-grid' : 'library-list'}>
        {items.map(item => {
          const story = type === 'history' ? item.story : item;
          const chapter = type === 'history' ? item.chapter : story.latestChapter;
          return view === 'grid' && type !== 'history' ? (
            <article key={item.id || story.id} className="library-card"><img src={story.cover} alt={story.title} /><div><strong>{story.title}</strong><h3>{chapter?.title || 'Chương mới nhất'}</h3><p>{story.author}</p><em>“Đoạn Tiêu Viêm đánh bại Tiêu Vũ, hay lắm!”</em><Link to={`/truyen/${story.slug}/chuong/${chapter?.number || 1}`} className="button small">▶ Đọc tiếp</Link></div></article>
          ) : (
            <div key={item.id || story.id} className="library-row"><input type="checkbox" /><img src={story.cover} alt={story.title} /><span><strong>{story.title}</strong><small>{chapter?.title || 'Chương đang đọc'}</small><em>{story.author}</em></span><small>{formatDateShort(item.updatedAt || story.updatedAt)}<br />Hôm nay</small><Link className="button small" to={`/truyen/${story.slug}/chuong/${chapter?.number || 1}`}>▶ Đọc</Link><button className="ghost">🗑</button></div>
          );
        })}
      </div>
    </div>
  );
}

const DEFAULT_WALLET_PACKAGES = [
  { id: 'seed-10', seeds: 10, bonus: 0, price: 10000, label: 'Khởi đầu' },
  { id: 'seed-20', seeds: 20, bonus: 2, price: 20000, label: 'Cơ bản' },
  { id: 'seed-50', seeds: 50, bonus: 8, price: 50000, label: 'Phổ biến', featured: true },
  { id: 'seed-100', seeds: 100, bonus: 20, price: 100000, label: 'Tiết kiệm' },
  { id: 'seed-200', seeds: 200, bonus: 50, price: 200000, label: 'Giá trị nhất' },
  { id: 'seed-500', seeds: 500, bonus: 150, price: 500000, label: 'Cao cấp' }
];

const STORY_CATEGORY_GROUPS = [
  { icon: '⚔', title: 'Võ Hiệp & Kiếm Hiệp', items: ['Tiên Hiệp', 'Kiếm Hiệp', 'Huyền Huyễn', 'Kỳ Ảo', 'Tu Tiên', 'Tu Chân', 'Phong Thần'] },
  { icon: '▦', title: 'Hiện Đại & Đô Thị', items: ['Đô Thị', 'Hiện Đại', 'Khoa Huyễn', 'Hệ Thống', 'Đời Sống', 'Doanh Trường', 'Giải Trí', 'Thể Thao', 'Truyện Teen'] },
  { icon: '♥', title: 'Tình Cảm & Romance', items: ['Ngôn Tình', 'Đam Mỹ', 'Bách Hợp', 'Tình Cảm', 'Romance', 'Học Đường', 'Văn Phòng', 'Tổng Tài', 'Ngược', 'Sủng', 'Nữ Cường', 'Nữ Phụ'] },
  { icon: '◢', title: 'Đặc Biệt & Fantasy', items: ['Xuyên Không', 'Xuyên Nhanh', 'Trọng Sinh', 'Dị Giới', 'Võng Du', 'Mạt Thế', 'Dị Năng', 'Siêu Anh Hùng', 'Ma Pháp'] },
  { icon: '✊', title: 'Hành Động & Phiêu Lưu', items: ['Hành Động', 'Phiêu Lưu', 'Thám Hiểm', 'Sinh Tồn', 'Zombie', 'Quái Vật', 'Siêu Nhiên'] },
  { icon: '●', title: 'Kinh Dị & Bí Ẩn', items: ['Kinh Dị', 'Ma Quỷ', 'Linh Dị', 'Trinh Thám', 'Bí Ẩn', 'Tâm Lý', 'Tội Phạm'] },
  { icon: '▥', title: 'Lịch Sử & Cổ Đại', items: ['Lịch Sử', 'Cổ Đại', 'Cung Đình', 'Cung Đấu', 'Hoàng Gia', 'Chiến Tranh', 'Quân Sự', 'Quan Trường', 'Võ Tướng', 'Đông Phương'] },
  { icon: '☻', title: 'Hài Hước & Nhẹ Nhàng', items: ['Hài Hước', 'Hài Kịch', 'Parody', 'Slice of Life', 'Ấm Áp', 'Gia Đình', 'Hàng Ngày', 'Điền Văn', 'Gia Đấu'] },
  { icon: '✜', title: 'Game & Technology', items: ['Game', 'VRMMO', 'LitRPG', 'Công Nghệ', 'AI', 'Cyberpunk', 'Tương Lai'] },
  { icon: '+', title: 'Mở rộng', items: ['HE', 'SE', 'BE', 'OE', 'Ngọt', 'Chữa Lành', 'Ngược Nam', 'Ngược Nữ', 'Ngược Luyến Tàn Tâm', 'Truy Thê', 'Trả Thù', 'Vả Mặt', 'Sảng Văn', 'Cưới Trước Yêu Sau', 'Cường Thủ Hào Đoạt', 'Dưỡng Thê', 'Hào Môn Thế Gia', 'Gương Vỡ Lại Lành', 'Gương Vỡ Không Lành', 'Thế Thân', 'Nam Phụ Thượng Vị', 'Không CP', 'Ngôn Tình Thực Tế', 'Thanh Xuân Vườn Trường', 'Học Bá', 'Showbiz', 'Bác Sĩ', 'Cảnh Sát', 'Quân Nhân', 'Dân Quốc', 'Thập Niên', 'Phương Đông', 'Hoán Đổi Thân Xác', 'Đọc Tâm', 'Nhân Thú', 'Hư Cấu Kỳ Ảo', 'Phép Thuật', 'Xuyên Sách', 'Có Sử Dụng AI', 'Quy tắc', 'Đề Cử', 'Review truyện', 'Tiểu Thuyết', 'Truyện Sáng Tác', 'Truyện Việt', 'Vô Tri'] },
  { icon: '⚠', title: 'Nội dung người lớn', items: ['Sắc', 'H', 'H+', 'Cao H+ (*)'] },
  { icon: '•••', title: 'Khác', items: ['Phương Tây', 'Light Novel', 'Việt Nam', 'Zhihu', 'Đoản Văn', 'Review Sách', 'Khác'] }
];

const STORY_CATEGORIES = Array.from(new Set(STORY_CATEGORY_GROUPS.flatMap(group => group.items)));

function Wallet() {
  const { user, updateUser } = useAuth();
  const [data, setData] = useState({ packages: [], transactions: [] });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selected, setSelected] = useState('seed-50');
  const [method, setMethod] = useState('MoMo');
  const [paying, setPaying] = useState(false);

  const load = async () => {
    const [packs, txns] = await Promise.all([api('/wallet/packages'), api('/wallet/transactions')]);
    setData({ packages: packs.packages || [], transactions: txns.transactions || [], balance: txns.balance });
  };
  useEffect(() => { load().catch(err => setError(err.message)); }, []);

  async function topup(packageId) {
    setPaying(true);
    setError('');
    setSuccess('');
    try {
      const result = await api('/wallet/topup', { method: 'POST', body: JSON.stringify({ packageId, method }) });
      updateUser(result.user);
      await load();
      setSuccess(`Nạp thành công ${result.amount || 0} Đậu bằng ${method}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  }

  const packages = data.packages.length ? data.packages.map(pack => ({ ...pack, featured: pack.id === 'seed-50' })) : DEFAULT_WALLET_PACKAGES;
  const selectedPack = packages.find(pack => pack.id === selected) || packages[0] || DEFAULT_WALLET_PACKAGES[2];
  const usedSeeds = Math.abs(data.transactions.filter(txn => txn.amount < 0).reduce((sum, txn) => sum + txn.amount, 0));
  const toppedSeeds = data.transactions.filter(txn => txn.type === 'topup').reduce((sum, txn) => sum + Math.max(0, txn.amount), 0);
  const bonusSeeds = data.transactions.filter(txn => txn.type === 'bonus').reduce((sum, txn) => sum + Math.max(0, txn.amount), 0);

  return (
    <div className="wallet-page">
      <div className="catalog-breadcrumb">Trang chủ › Ví Đậu</div>
      <div className="wallet-title"><span>🪙</span><div><h1>Ví Đậu</h1><p>Nạp tiền vào ví sẽ chuyển thành Đậu để mua chương truyện yêu thích</p></div></div>
      <ErrorBox message={error} />
      {success && <div className="success-box">{success}</div>}
      <section className="wallet-balance-panel"><p>Số dư hiện tại</p><h2>🪙 {formatNumber(data.balance ?? user.seeds)} <span>Đậu</span></h2><div><span>🛒 Đã dùng: {formatNumber(usedSeeds)} Đậu</span><span>💵 Đã nạp: {formatNumber(toppedSeeds)} Đậu</span><span>🎁 Thưởng: {formatNumber(bonusSeeds)} Đậu</span></div></section>
      <div className="wallet-feature-row"><span>🪙 <b>1 Đậu</b><small>= 1.000đ</small></span><span>📖 <b>Mua lẻ</b><small>1–2 Đậu/chương</small></span><span>📦 <b>Combo</b><small>Tiết kiệm hơn 50%</small></span></div>
      <h2 className="wallet-section-title">◇ Chọn gói nạp</h2>
      <div className="wallet-packages">{packages.map(pack => <button key={pack.id} type="button" className={selected === pack.id ? 'active' : ''} onClick={() => setSelected(pack.id)}>{pack.featured && <b>Phổ biến nhất</b>}<strong>{pack.seeds}<small>{pack.bonus ? ` +${pack.bonus} Đậu` : ' Đậu'}</small></strong><em>{pack.bonus ? `Tặng thêm ${pack.bonus} Đậu` : 'Không bonus'}</em><span>{pack.price.toLocaleString('vi-VN')}đ</span><small>{pack.label}</small></button>)}</div>
      <h2 className="wallet-section-title">▰ Phương thức thanh toán</h2>
      <div className="payment-methods">{['MoMo', 'VNPay', 'ZaloPay', 'Chuyển khoản'].map(item => <button key={item} type="button" className={method === item ? 'active' : ''} onClick={() => setMethod(item)}>{item}</button>)}</div>
      <button className="button wallet-pay" type="button" disabled={paying} onClick={() => topup(selected)}>{paying ? 'Đang xử lý...' : `◎ Nạp ${selectedPack.price.toLocaleString('vi-VN')}đ — nhận ${selectedPack.seeds + (selectedPack.bonus || 0)} Đậu`}</button>
      <small className="wallet-safe">🛡 Thanh toán an toàn, được mã hóa SSL</small>
      <HomeSection title="Lịch sử giao dịch" subtitle="Các giao dịch gần đây" kicker="History"><div className="wallet-txn-list">{data.transactions.map(txn => <div key={txn.id}><span>{txn.type === 'purchase' ? '🛒' : txn.type === 'bonus' ? '🎁' : '💵'}</span><strong>{txn.note}</strong><small>{formatDateShort(txn.createdAt)}</small><b className={txn.amount > 0 ? 'plus' : 'minus'}>{txn.amount > 0 ? '+' : ''}{formatNumber(txn.amount)}</b></div>)}{data.transactions.length === 0 && <div className="wallet-empty">Chưa có giao dịch nào.</div>}</div></HomeSection>
      <section className="wallet-faq"><h3>◉ Câu hỏi thường gặp</h3><p><b>Đậu có hết hạn không?</b><br />Không, Đậu không có thời hạn sử dụng.</p><p><b>Có hoàn tiền không?</b><br />Đậu đã nạp không được hoàn tiền.</p><p><b>Mua combo có lợi hơn không?</b><br />Có, combo tiết kiệm hơn 50% so với mua lẻ từng chương.</p></section>
    </div>
  );
}

function AiTools() {
  const [text, setText] = useState('Ta muốn đọc truyện tiên hiệp có nhân vật chính trọng sinh, nhịp nhanh, nhiều bí mật.');
  const result = useMemo(() => {
    const lower = text.toLowerCase();
    if (lower.includes('ngôn') || lower.includes('tổng tài')) return 'Gợi ý: Cô Vợ Ngọt Ngào Của Tổng Tài · thể loại ngôn tình/sủng/hào môn.';
    if (lower.includes('game') || lower.includes('võng')) return 'Gợi ý: Vương Giả Vinh Quang · thể loại võng du/e-sport.';
    if (lower.includes('mạt thế')) return 'Gợi ý: Mạt Thế Siêu Cấp Hệ Thống · thể loại sinh tồn/hệ thống.';
    return 'Gợi ý: Đấu Phá Thương Khung, Thần Đạo Đan Tôn hoặc Kiếm Lai · hợp gu tiên hiệp/huyền huyễn.';
  }, [text]);
  return <div className="auth-card wide"><h1>AI Tools</h1><p className="muted">Bản demo chạy local: nhập gu đọc, hệ thống sẽ gợi ý truyện theo keyword.</p><textarea rows="6" value={text} onChange={e => setText(e.target.value)} /><div className="ai-result">{result}</div></div>;
}

function Admin() {
  const [stats, setStats] = useState(null);
  const [stories, setStories] = useState([]);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState({ title: '', author: '', categories: 'Tiên hiệp, Huyền huyễn', description: '', premium: false, featured: false });
  const [selectedStory, setSelectedStory] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [chapterForm, setChapterForm] = useState({ title: '', content: '', isPremium: false, price: 0 });
  const [error, setError] = useState('');
  const [storyQuery, setStoryQuery] = useState('');
  const [storyFilter, setStoryFilter] = useState('all');
  const load = async () => {
    const [s, list, u, r] = await Promise.all([api('/admin/stats'), api('/admin/stories'), api('/admin/users'), api('/admin/reports')]);
    setStats(s.stats); setStories(list.stories); setUsers(u.users); setReports(r.reports || []);
  };
  useEffect(() => { load().catch(err => setError(err.message)); }, []);
  async function selectStory(story) {
    const detail = await api(`/stories/${story.id}`);
    setSelectedStory(detail.story);
    setChapters(detail.chapters || []);
  }
  async function createStory(event) {
    event.preventDefault();
    try {
      await api('/admin/stories', { method: 'POST', body: JSON.stringify(form) });
      setForm({ ...form, title: '', description: '' });
      await load();
    } catch (err) { setError(err.message); }
  }
  async function deleteStory(id) {
    if (!confirm('Xóa truyện này?')) return;
    await api(`/admin/stories/${id}`, { method: 'DELETE' });
    if (selectedStory?.id === id) {
      setSelectedStory(null);
      setChapters([]);
    }
    await load();
  }
  async function updateStory(story, patch) {
    const result = await api(`/admin/stories/${story.id}/status`, { method: 'PATCH', body: JSON.stringify(patch) });
    setStories(prev => prev.map(item => item.id === story.id ? { ...item, ...result.story } : item));
    if (selectedStory?.id === story.id) setSelectedStory(prev => ({ ...prev, ...result.story }));
    await load();
  }
  async function renameStory(story) {
    const title = prompt('Tên truyện mới:', story.title);
    if (!title || title === story.title) return;
    const result = await api(`/admin/stories/${story.id}`, { method: 'PUT', body: JSON.stringify({ title }) });
    setStories(prev => prev.map(item => item.id === story.id ? { ...item, ...result.story } : item));
    if (selectedStory?.id === story.id) setSelectedStory(prev => ({ ...prev, ...result.story }));
  }
  async function createChapter(event) {
    event.preventDefault();
    if (!selectedStory) return setError('Hãy chọn truyện trước khi thêm chương.');
    const result = await api(`/admin/stories/${selectedStory.id}/chapters`, { method: 'POST', body: JSON.stringify(chapterForm) });
    setChapters(prev => [...prev, result.chapter].sort((a, b) => a.number - b.number));
    setChapterForm({ title: '', content: '', isPremium: false, price: 0 });
    await load();
  }
  async function updateChapter(chapter) {
    const title = prompt('Tiêu đề chương:', chapter.title);
    if (!title) return;
    const content = prompt('Nội dung chương:', chapter.content || '');
    if (content === null) return;
    const price = prompt('Giá Đậu:', String(chapter.price || 0));
    if (price === null) return;
    const isPremium = confirm('Đặt chương này là chương trả phí? Bấm OK để trả phí, Cancel để miễn phí.');
    const result = await api(`/admin/chapters/${chapter.id}`, { method: 'PUT', body: JSON.stringify({ title, content, price, isPremium }) });
    setChapters(prev => prev.map(item => item.id === chapter.id ? result.chapter : item).sort((a, b) => a.number - b.number));
  }
  async function deleteChapter(chapter) {
    if (!confirm(`Xóa ${chapter.title}?`)) return;
    await api(`/admin/chapters/${chapter.id}`, { method: 'DELETE' });
    setChapters(prev => prev.filter(item => item.id !== chapter.id));
    await load();
  }
  async function updateReport(report, status) {
    await api(`/admin/reports/${report.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await load();
  }
  if (!stats) return <Loader />;
  const visibleStories = stories.filter(story => {
    const keyword = storyQuery.trim().toLowerCase();
    const matchesKeyword = !keyword || [story.title, story.author, ...(story.categories || [])].join(' ').toLowerCase().includes(keyword);
    const matchesFilter =
      storyFilter === 'all' ||
      (storyFilter === 'visible' && !story.hidden) ||
      (storyFilter === 'hidden' && story.hidden) ||
      story.status === storyFilter ||
      story.approvalStatus === storyFilter;
    return matchesKeyword && matchesFilter;
  });
  return (
    <>
      <div className="page-title"><h1>Admin Dashboard</h1><p>Quản trị truyện, người dùng và giao dịch Đậu.</p></div>
      <ErrorBox message={error} />
      <div className="stats-grid">{Object.entries(stats).map(([key, value]) => <div className="panel stat" key={key}><span>{key}</span><strong>{formatNumber(value)}</strong></div>)}</div>
      <div className="admin-grid">
        <form className="panel stack-form" onSubmit={createStory}><h2>Thêm truyện</h2><input placeholder="Tên truyện" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /><input placeholder="Tác giả" value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} /><input placeholder="Thể loại, cách nhau bằng dấu phẩy" value={form.categories} onChange={e => setForm({ ...form, categories: e.target.value })} /><textarea placeholder="Mô tả" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /><label><input type="checkbox" checked={form.premium} onChange={e => setForm({ ...form, premium: e.target.checked })} /> Truyện trả phí</label><label><input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} /> Ghim nổi bật</label><button className="button">Tạo truyện</button></form>
        <div className="panel"><h2>Người dùng</h2><div className="list-panel compact">{users.map(user => <div key={user.id}><span>{user.name}</span><small>{user.email} · {user.role} · {user.seeds} Đậu</small></div>)}</div></div>
      </div>
      <Section title="Quản lý truyện" subtitle="Duyệt, ẩn/hiện, sửa tên và chọn truyện để quản lý chương.">
        <div className="admin-story-toolbar">
          <input placeholder="Tìm theo tên truyện, tác giả, thể loại..." value={storyQuery} onChange={e => setStoryQuery(e.target.value)} />
          <select value={storyFilter} onChange={e => setStoryFilter(e.target.value)}>
            <option value="all">Tất cả truyện</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
            <option value="ongoing">Đang ra</option>
            <option value="completed">Hoàn thành</option>
            <option value="visible">Đang hiện</option>
            <option value="hidden">Đang ẩn</option>
          </select>
        </div>
        <div className="admin-story-list">
          {visibleStories.map(story => (
            <article key={story.id} className={selectedStory?.id === story.id ? 'admin-story-card active' : 'admin-story-card'}>
              <button type="button" className="admin-story-cover" onClick={() => selectStory(story)}><img src={story.cover} alt={story.title} /></button>
              <div className="admin-story-body">
                <div className="admin-story-topline">
                  <button type="button" className="small-link admin-story-title" onClick={() => selectStory(story)}>{story.title}</button>
                  <span className={`admin-pill ${story.approvalStatus || 'pending'}`}>{approvalLabel(story.approvalStatus)}</span>
                  <span className={`admin-pill ${story.hidden ? 'hidden' : 'visible'}`}>{story.hidden ? 'Đang ẩn' : 'Đang hiện'}</span>
                </div>
                <p>{story.author} · {story.chapterCount || 0} chương · {statusLabel(story.status)} · {formatNumber(story.views || 0)} lượt đọc</p>
                <div className="admin-story-cats">{(story.categories || []).slice(0, 5).map(item => <span key={item}>{item}</span>)}</div>
              </div>
              <div className="admin-story-actions">
                <button className="ghost" onClick={() => selectStory(story)}>Chương</button>
                <button className="ghost" onClick={() => updateStory(story, { approvalStatus: story.approvalStatus === 'approved' ? 'pending' : 'approved' })}>{story.approvalStatus === 'approved' ? 'Đưa chờ duyệt' : 'Duyệt'}</button>
                <button className="ghost" onClick={() => updateStory(story, { hidden: !story.hidden })}>{story.hidden ? 'Hiện' : 'Ẩn'}</button>
                <button className="ghost" onClick={() => renameStory(story)}>Sửa</button>
                <button className="ghost danger" onClick={() => deleteStory(story.id)}>Xóa</button>
              </div>
            </article>
          ))}
          {visibleStories.length === 0 && <div className="center-card">Không có truyện phù hợp bộ lọc.</div>}
        </div>
      </Section>
      <Section title="Quản lý chương" subtitle={selectedStory ? `Đang chọn: ${selectedStory.title}` : 'Chọn một truyện ở danh sách trên để thêm/sửa/xóa chương.'}>
        {selectedStory ? (
          <div className="chapter-admin-grid">
            <form className="panel stack-form" onSubmit={createChapter}>
              <h2>Thêm chương</h2>
              <input placeholder="Tiêu đề chương" value={chapterForm.title} onChange={e => setChapterForm({ ...chapterForm, title: e.target.value })} />
              <textarea rows="6" placeholder="Nội dung chương" value={chapterForm.content} onChange={e => setChapterForm({ ...chapterForm, content: e.target.value })} />
              <label><input type="checkbox" checked={chapterForm.isPremium} onChange={e => setChapterForm({ ...chapterForm, isPremium: e.target.checked })} /> Chương trả phí</label>
              <input type="number" min="0" placeholder="Giá Đậu" value={chapterForm.price} onChange={e => setChapterForm({ ...chapterForm, price: e.target.value })} />
              <button className="button">Thêm chương</button>
            </form>
            <div className="list-panel">
              {chapters.map(chapter => <div key={chapter.id}><span><strong>Chương {chapter.number}</strong><small>{chapter.title} · {chapter.isPremium ? `${chapter.price} Đậu` : 'Miễn phí'}</small></span><button className="ghost" onClick={() => updateChapter(chapter)}>Sửa tên</button><button className="ghost danger" onClick={() => deleteChapter(chapter)}>Xóa</button></div>)}
            </div>
          </div>
        ) : <div className="center-card">Chưa chọn truyện.</div>}
      </Section>
      <Section title="Báo cáo nội dung" subtitle="Xử lý báo cáo bản quyền/nội dung do người đọc gửi.">
        <div className="list-panel">
          {reports.map(report => <div key={report.id}><span><strong>{report.story?.title || 'Truyện đã xóa'}</strong><small>{report.reason} · {report.user?.email || 'Ẩn danh'} · {report.status}</small></span><button className="ghost" onClick={() => updateReport(report, 'reviewing')}>Đang xem</button><button className="ghost" onClick={() => updateReport(report, 'resolved')}>Đã xử lý</button><button className="ghost danger" onClick={() => updateReport(report, 'rejected')}>Bỏ qua</button></div>)}
          {reports.length === 0 && <div>Chưa có báo cáo.</div>}
        </div>
      </Section>
    </>
  );
}

function PublishSidebar({ user }) {
  const groups = [
    ['TÀI KHOẢN', ['Hồ sơ cá nhân', 'Bảo mật', 'Thông báo', 'Ví của tôi']],
    ['SÁNG TÁC', ['Quản lý truyện', 'Đăng truyện mới', 'Kiểm tra chương lỗi']],
    ['NỘI DUNG', ['Thư viện', 'Đã đọc', 'Yêu thích']],
    ['THỐNG KÊ', ['Quảng bá', 'Độc giả', 'Doanh thu']]
  ];

  return (
    <aside className="publish-sidebar" aria-label="Bảng điều khiển đăng truyện">
      <Link to="/" className="sidebar-logo"><img src="/images/logo.png" alt="logo" /><span>Dau Do</span></Link>
      <div className="sidebar-user">
        <img src={user?.avatar || '/images/logo.png'} alt="avatar" />
        <div><strong>{user?.name || 'Admin'}</strong><span>Mod</span></div>
      </div>
      {groups.map(([group, items]) => (
        <div className="sidebar-group" key={group}>
          <strong>{group}</strong>
          {items.map(item => <span className={item === 'Đăng truyện mới' ? 'active' : ''} key={item}>{item}</span>)}
        </div>
      ))}
    </aside>
  );
}

function StoryPublish() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const draftKey = 'daudo_story_publish_draft';
  const [categories] = useState(STORY_CATEGORIES);
  const [form, setForm] = useState({
    title: '',
    author: '',
    translator: '',
    description: '',
    cover: '/images/cover-1.jpg',
    categories: ['Tiên Hiệp'],
    status: 'ongoing',
    language: 'Tiếng Việt',
    age: 'all',
    keywords: '',
    chapterCount: '',
    hide: false,
    featured: false,
    premium: false,
    price: 0
  });
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [draftEnabled, setDraftEnabled] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(draftKey);
    if (!raw) return;
    try {
      setForm(prev => ({ ...prev, ...JSON.parse(raw) }));
    } catch {
      localStorage.removeItem(draftKey);
    }
  }, []);

  useEffect(() => {
    if (!draftEnabled) return;
    localStorage.setItem(draftKey, JSON.stringify(form));
  }, [form, draftEnabled]);

  const filteredCategories = categories.filter(item => item.toLowerCase().includes(search.toLowerCase()));
  const filteredCategoryGroups = STORY_CATEGORY_GROUPS
    .map(group => ({ ...group, items: group.items.filter(item => item.toLowerCase().includes(search.trim().toLowerCase())) }))
    .filter(group => group.items.length > 0);

  function toggleCategory(item) {
    setForm(prev => {
      const exists = prev.categories.includes(item);
      const next = exists ? prev.categories.filter(cat => cat !== item) : [...prev.categories, item];
      return { ...prev, categories: next.slice(0, 5) };
    });
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await api('/admin/stories', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          author: form.author,
          translator: form.translator,
          description: form.description,
          cover: form.cover,
          categories: form.categories,
          status: form.status,
          language: form.language,
          ageRating: form.age,
          keywords: form.keywords,
          hidden: form.hide,
          chapterCountEstimate: form.chapterCount,
          featured: form.featured,
          premium: form.premium,
          price: form.price,
          tags: form.keywords
        })
      });
      localStorage.removeItem(draftKey);
      setDraftEnabled(false);
      setSuccess('Đã tạo truyện mới.');
      setForm(prev => ({ ...prev, title: '', author: '', translator: '', description: '', keywords: '' }));
      navigate(`/truyen/${result.story.slug}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function clearDraft() {
    localStorage.removeItem(draftKey);
    setDraftEnabled(false);
    setForm({
      title: '',
      author: '',
      translator: '',
      description: '',
      cover: '/images/cover-1.jpg',
      categories: ['Tiên Hiệp'],
      status: 'ongoing',
      language: 'Tiếng Việt',
      age: 'all',
      keywords: '',
      chapterCount: '',
      hide: false,
      featured: false,
      premium: false,
      price: 0
    });
    setSuccess('Đã xóa bản nháp.');
    setTimeout(() => setDraftEnabled(true), 0);
  }

  function handleCoverFile(file) {
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      setError('Vui lòng chọn file ảnh JPG, PNG hoặc WEBP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Ảnh bìa tối đa 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setError('');
      setForm(prev => ({ ...prev, cover: reader.result }));
    };
    reader.onerror = () => setError('Không thể tải ảnh bìa. Vui lòng thử lại.');
    reader.readAsDataURL(file);
  }

  return (
    <div className="publish-page">
      <PublishSidebar user={user} />
      <div className="publish-title">
        <div>
          <h1>Đăng truyện mới</h1>
          <p>{user?.name ? `Đăng nhập với tài khoản ${user.name}` : 'Tạo truyện theo bố cục nhiều cột giống ảnh mẫu.'}</p>
        </div>
        <div className="publish-actions">
          <Link to="/admin" className="ghost light">Quay lại admin</Link>
        </div>
      </div>

      <ErrorBox message={error} />
      {success && <div className="success-box">{success}</div>}

      <form className="publish-layout" onSubmit={submit}>
        <section className="publish-main panel">
          <h2>Thông tin cơ bản</h2>
          <label>Tên truyện *</label>
          <input placeholder="Nhập tên truyện" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <p className="hint">Tên truyện nên ngắn gọn, hấp dẫn và dễ nhớ.</p>

          <div className="two-cols">
            <div>
              <label>Tác giả *</label>
              <input placeholder="Nhập tên tác giả" value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} />
              <p className="hint">Tên tác giả gốc của truyện.</p>
            </div>
            <div>
              <label>Người dịch</label>
              <input placeholder="Nhập tên người dịch (nếu có)" value={form.translator} onChange={e => setForm({ ...form, translator: e.target.value })} />
              <p className="hint">Để trống nếu bạn là tác giả gốc.</p>
            </div>
          </div>

          <label>Giới thiệu truyện *</label>
          <textarea rows="12" placeholder="Nhập mô tả truyện của bạn..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <p className="hint">Mô tả nên bao gồm tóm tắt nội dung, điểm nổi bật và thu hút người đọc.</p>

          <div className="two-cols">
            <div>
              <label>Nhân vật chính</label>
              <input placeholder="Nhập tên nhân vật 1" />
            </div>
            <div>
              <label>Số chương</label>
              <input placeholder="Nhập số chương (không bắt buộc)" value={form.chapterCount} onChange={e => setForm({ ...form, chapterCount: e.target.value })} />
            </div>
          </div>

          <section className="publish-category-picker">
            <div className="publish-category-heading">
              <h2><span>◇</span> Thể loại</h2>
              <small>{form.categories.length}/5 đã chọn</small>
            </div>
            <label>Chọn thể loại <b>*</b><span title="Có thể chọn tối đa 5 thể loại">?</span></label>
            <div className="publish-category-search"><span>⌕</span><input placeholder="Tìm kiếm thể loại..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div className="publish-category-scroll">
              {filteredCategoryGroups.map(group => (
                <section className="publish-category-group" key={group.title}>
                  <h3><span>{group.icon}</span>{group.title}</h3>
                  <div className="publish-category-grid">
                    {group.items.map(item => (
                      <button
                        type="button"
                        key={item}
                        className={form.categories.includes(item) ? 'active' : ''}
                        onClick={() => toggleCategory(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {filteredCategories.length === 0 && <div className="publish-category-empty">Không tìm thấy thể loại phù hợp.</div>}
            </div>
          </section>
        </section>

        <aside className="publish-side">
          <section className="panel cover-panel">
            <h2>Ảnh bìa</h2>
            <div className="toggle-row">
              <button type="button" className="toggle active">Ảnh bìa</button>
              <button type="button" className="toggle">Video động</button>
            </div>
            <label>Tải lên ảnh bìa *</label>
            <label
              className="cover-drop"
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                handleCoverFile(event.dataTransfer.files?.[0]);
              }}
            >
              <img src={form.cover} alt="cover preview" />
              <span>Kéo thả hoặc nhập link để tải lên</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => handleCoverFile(event.target.files?.[0])} />
            </label>
            <input placeholder="/images/cover-1.jpg" value={form.cover} onChange={e => setForm({ ...form, cover: e.target.value })} />
            <div className="mini-panel">
              <strong>Auto tạo ảnh bìa (AI)</strong>
              <p>Ảnh chỉ hiển thị preview. Khi bấm Lưu truyện thì hệ thống mới lưu ảnh bìa.</p>
              <label>Model</label>
              <select value="Gemini 3.1 Flash Image Preview (Nano Banana 2)" readOnly>
                <option>Gemini 3.1 Flash Image Preview (Nano Banana 2)</option>
              </select>
              <div className="mini-actions">
                <button type="button" className="button small">Chọn tiêu chí &amp; tạo ảnh</button>
                <button type="button" className="ghost">Tạo lại</button>
              </div>
            </div>
            <div className="guide-box">
              <h3>Hướng dẫn ảnh bìa</h3>
              <ul>
                <li>Kích thước tối ưu: 600x900 pixels</li>
                <li>Định dạng: JPG, PNG, WEBP</li>
                <li>Kích thước tối đa: 2MB</li>
              </ul>
            </div>
          </section>

          <section className="panel">
            <h2>Thông tin bổ sung</h2>
            <div className="status-grid">
              {[
                ['ongoing', 'Đang ra', 'Truyện đang được cập nhật'],
                ['completed', 'Hoàn thành', 'Truyện đã hoàn thành'],
                ['paused', 'Tạm ngưng', 'Tạm thời ngưng cập nhật']
              ].map(([value, label, desc]) => (
                <button
                  type="button"
                  key={value}
                  className={form.status === value ? 'status-card active' : 'status-card'}
                  onClick={() => setForm({ ...form, status: value })}
                >
                  <strong>{label}</strong>
                  <span>{desc}</span>
                </button>
              ))}
            </div>

            <div className="two-cols">
              <div>
                <label>Ngôn ngữ gốc</label>
                <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}>
                  <option>Tiếng Việt</option>
                  <option>Tiếng Anh</option>
                  <option>Tiếng Trung</option>
                  <option>Tiếng Nhật</option>
                </select>
              </div>
              <div>
                <label>Giới hạn độ tuổi</label>
                <select value={form.age} onChange={e => setForm({ ...form, age: e.target.value })}>
                  <option value="all">Tất cả độ tuổi</option>
                  <option value="13">13+</option>
                  <option value="16">16+</option>
                  <option value="18">18+</option>
                </select>
              </div>
            </div>

            <label>Từ khóa</label>
            <input placeholder="Nhập từ khóa, cách nhau bởi dấu phẩy" value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} />

            <div className="switch-row">
              <label>
                <input type="checkbox" checked={form.hide} onChange={e => setForm({ ...form, hide: e.target.checked })} />
                Ẩn khỏi website
              </label>
              <p className="hint">Khi bật, truyện sẽ không hiển thị cho người đọc thường.</p>
            </div>
          </section>
        </aside>

        <div className="publish-footer panel">
          <div className="draft-note">Tự động lưu bản nháp</div>
          <div className="footer-actions">
            <button type="button" className="ghost" onClick={clearDraft}>Xóa nháp</button>
            <button type="submit" className="button" disabled={saving}>{saving ? 'Đang lưu...' : 'Đăng truyện'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function NotFound() {
  return <div className="center-card"><h1>404</h1><p>Trang không tồn tại.</p><Link className="button" to="/">Về trang chủ</Link></div>;
}

function formatNumber(value = 0) {
  return Number(value).toLocaleString('vi-VN');
}

function formatCompact(value = 0) {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
}

createRoot(document.getElementById('root')).render(<App />);
