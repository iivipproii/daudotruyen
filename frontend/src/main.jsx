import React, { Suspense, createContext, lazy, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import './styles.css';
import './publish.css';
import './home-experience.css';
import './search-ranking.css';
import './story-reader.css';
import './account.css';
import './author.css';
import './admin-cms.css';
import { ProductionFooter, ProductionHeader, ProductionHome } from './components/home/HomeExperience.jsx';
import { Majesticon } from './components/shared/Majesticon.jsx';
import { PageSeo } from './components/shared/Seo.jsx';
import { AUTHOR_CATEGORIES } from './data/storyCategories.js';
import { canPostStory, isAdmin, normalizeRole } from './lib/permissions.js';

const API_BASE = (() => {
  const configured = String(import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '').trim();
  if (configured) {
    if (configured.startsWith('/')) {
      const cleanPathBase = configured.replace(/\/+$/, '').replace(/\/api$/i, '');
      return `${cleanPathBase || ''}/api`;
    }
    const cleanBase = configured.replace(/\/+$/, '').replace(/\/api$/i, '');
    if (import.meta.env.PROD && /\/\/daudotruyen\.onrender\.com$/i.test(cleanBase)) {
      return '/api';
    }
    if (import.meta.env.PROD && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(cleanBase)) {
      throw new Error(`Invalid production API base URL: ${cleanBase}`);
    }
    return `${cleanBase}/api`;
  }
  return '/api';
})();
const AuthContext = createContext(null);
const ThemeContext = createContext(null);
const STORY_CATEGORIES = AUTHOR_CATEGORIES;
const PUBLISH_STORY_CATEGORIES = AUTHOR_CATEGORIES;
const inFlightGetRequests = new Map();
const publicGetCache = new Map();
const BROKEN_SUPABASE_HOSTS = new Set(['tqddgqwlamivptlddnlp.supabase.co']);
const IMAGE_FALLBACK = '/images/cover-1.jpg';
const AUTH_EXPIRED_EVENT = 'daudo:auth-expired';
const lazyNamed = (loader, exportName) => lazy(() => loader().then(module => ({ default: module[exportName] })));
const SearchPage = lazyNamed(() => import('./components/search/SearchPage.jsx'), 'SearchPage');
const RankingExperiencePage = lazyNamed(() => import('./components/ranking/RankingPage.jsx'), 'RankingPage');
const StoryDetailExperiencePage = lazyNamed(() => import('./components/story/StoryDetailPage.jsx'), 'StoryDetailPage');
const ReaderExperiencePage = lazyNamed(() => import('./components/reader/ReaderPage.jsx'), 'ReaderPage');
const LoginPage = lazyNamed(() => import('./components/account/AccountPages.jsx'), 'LoginPage');
const RegisterPage = lazyNamed(() => import('./components/account/AccountPages.jsx'), 'RegisterPage');
const ForgotPasswordPage = lazyNamed(() => import('./components/account/AccountPages.jsx'), 'ForgotPasswordPage');
const ReaderDashboard = lazyNamed(() => import('./components/account/AccountPages.jsx'), 'ReaderDashboard');
const AccountBookmarksPage = lazyNamed(() => import('./components/account/AccountPages.jsx'), 'BookmarksPage');
const ReadingHistoryPage = lazyNamed(() => import('./components/account/AccountPages.jsx'), 'ReadingHistoryPage');
const AccountWalletPage = lazyNamed(() => import('./components/account/AccountPages.jsx'), 'WalletPage');
const AccountSettings = lazyNamed(() => import('./components/account/AccountPages.jsx'), 'AccountSettings');
const AuthorDashboard = lazyNamed(() => import('./components/author/AuthorDashboard.jsx'), 'AuthorDashboard');
const AdminCMSDashboard = lazyNamed(() => import('./components/admin/AdminCMS.jsx'), 'AdminDashboard');
const CMSNotificationPage = lazyNamed(() => import('./components/admin/AdminCMS.jsx'), 'NotificationPage');

function normalizeSessionUser(user) {
  return user ? { ...user, role: normalizeRole(user.role) } : null;
}

function buildApiUrl(path) {
  const cleanPath = String(path || '').startsWith('/') ? String(path || '') : `/${path || ''}`;
  if (/^https?:\/\//i.test(cleanPath)) return cleanPath;
  return `${API_BASE}${cleanPath}`;
}

function normalizeRemoteImageUrl(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) return value;
  try {
    const parsed = new URL(text);
    if (BROKEN_SUPABASE_HOSTS.has(parsed.hostname)) return IMAGE_FALLBACK;
  } catch {
    return value;
  }
  return value;
}

function sanitizeApiImages(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitizeApiImages);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (['cover', 'coverUrl', 'bannerImage', 'bannerUrl', 'banner', 'avatar', 'avatarUrl', 'image'].includes(key)) {
      return [key, normalizeRemoteImageUrl(item)];
    }
    return [key, sanitizeApiImages(item)];
  }));
}

function isPrivateApiPath(path) {
  return /^(\/auth\/me|\/me\/|\/wallet(?:\/|$)|\/notifications(?:\/|$)|\/admin(?:\/|$))/i.test(String(path || ''));
}

function isPublicCacheableApiPath(path) {
  const value = String(path || '');
  return value === '/home'
    || value === '/categories'
    || value === '/rankings'
    || value === '/stories'
    || /^\/stories\/[^/]+$/.test(value)
    || /^\/stories\/[^/]+\/chapters$/.test(value)
    || /^\/stories\/[^/]+\/chapters\/\d+$/.test(value);
}

function publicGetCacheTtlMs(path, queryString = '') {
  const value = String(path || '');
  if (value === '/home') return 45_000;
  if (value === '/categories') return 10 * 60_000;
  if (value === '/rankings') return 45_000;
  if (value === '/stories') {
    if (/([?&](q|category|status|premium|ageRating|featured|hot|recommended|banner|homeTrending|sort)=)/i.test(queryString)) return 30_000;
    return 60_000;
  }
  if (/^\/stories\/[^/]+\/chapters\/\d+$/.test(value)) return 2 * 60_000;
  if (/^\/stories\/[^/]+\/chapters$/.test(value)) return 2 * 60_000;
  if (/^\/stories\/[^/]+$/.test(value)) return 90_000;
  return 0;
}

function clearPublicGetCache() {
  publicGetCache.clear();
}

async function api(path, options = {}) {
  const token = localStorage.getItem('daudo_token');
  const { headers: optionHeaders = {}, noStore = false, ...fetchOptions } = options;
  const isFormData = fetchOptions.body instanceof FormData;
  const headers = {
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...optionHeaders
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = buildApiUrl(path);
  const method = String(fetchOptions.method || 'GET').toUpperCase();
  const shouldUseNoStore = noStore || (method === 'GET' && isPrivateApiPath(path));
  const queryString = (() => {
    try {
      return new URL(url, window.location.origin).search;
    } catch {
      return '';
    }
  })();
  const publicCacheKey = method === 'GET' && !shouldUseNoStore && !token && isPublicCacheableApiPath(path)
    ? `${url}|${JSON.stringify(headers)}`
    : '';
  const requestKey = method === 'GET' ? `${url}|${JSON.stringify(headers)}` : '';
  if (publicCacheKey) {
    const cached = publicGetCache.get(publicCacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }
  if (method === 'GET' && !shouldUseNoStore && inFlightGetRequests.has(requestKey)) {
    return inFlightGetRequests.get(requestKey);
  }
  const execute = async () => {
  let response;
  let data = {};
  try {
    response = await fetch(url, {
      ...fetchOptions,
      ...(shouldUseNoStore ? { cache: 'no-store' } : {}),
      headers
    });
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = {
          message: response.ok
            ? 'Phản hồi API không hợp lệ.'
            : `Máy chủ API đang lỗi (${response.status}). Vui lòng thử lại sau.`
        };
      }
    }
    if (!response.ok) {
      const error = new Error(data.message || `API request failed: ${response.status} ${response.statusText} ${url}`);
      error.status = response.status;
      error.statusText = response.statusText;
      error.url = url;
      error.path = path;
      error.data = data;
      throw error;
    }
    const sanitized = sanitizeApiImages(data);
    if (!shouldUseNoStore && method === 'GET' && !token) {
      const ttl = publicGetCacheTtlMs(path, queryString);
      if (ttl > 0 && publicCacheKey) {
        publicGetCache.set(publicCacheKey, {
          data: sanitized,
          expiresAt: Date.now() + ttl
        });
      }
    }
    if (method !== 'GET') {
      clearPublicGetCache();
    }
    return sanitized;
  } catch (error) {
    const status = Number(error?.status || response?.status || 0);
    const isExpectedAuthFailure = status === 401 || status === 403;
    if (isExpectedAuthFailure) {
      localStorage.removeItem('daudo_token');
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { path, status } }));
    }
    if (!status || status >= 500) {
      console.error('[API_ERROR]', {
        path,
        url,
        status: response?.status,
        statusText: response?.statusText,
        error
      });
    }
    throw error;
  }
  };
  if (method === 'GET' && !shouldUseNoStore) {
    const promise = execute().finally(() => {
      inFlightGetRequests.delete(requestKey);
    });
    inFlightGetRequests.set(requestKey, promise);
    return promise;
  }
  return execute();
}

function useAuth() {
  return useContext(AuthContext);
}

function useTheme() {
  return useContext(ThemeContext);
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('daudo_theme') || 'light');

  useEffect(() => {
    document.body.dataset.theme = theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
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
      .then(data => setUser(normalizeSessionUser(data.user)))
      .catch(() => {
        localStorage.removeItem('daudo_token');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    async login(identifier, password) {
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
      localStorage.setItem('daudo_token', data.token);
      const nextUser = normalizeSessionUser(data.user);
      setUser(nextUser);
      return nextUser;
    },
    async register(payloadOrName, username, email, password) {
      const payload = typeof payloadOrName === 'object'
        ? payloadOrName
        : { name: payloadOrName, username, email, password };
      const data = await api('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
      localStorage.setItem('daudo_token', data.token);
      const nextUser = normalizeSessionUser(data.user);
      setUser(nextUser);
      return nextUser;
    },
    logout() {
      localStorage.removeItem('daudo_token');
      setUser(null);
    },
    updateUser(nextUser) {
      setUser(normalizeSessionUser(nextUser));
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
            <Suspense fallback={<RouteLoader />}>
              <Routes>
                <Route path="/" element={<HomeRoute />} />
                <Route path="/danh-sach" element={<SearchRoute />} />
                <Route path="/the-loai/:category" element={<SearchRoute />} />
                <Route path="/truyen-ngan" element={<ShortStoriesPage />} />
                <Route path="/xep-hang" element={<RankingRoute />} />
                <Route path="/truyen-moi" element={<SearchRoute presetFilters={{ sort: 'created' }} />} />
                <Route path="/tac-gia/:name" element={<AuthorPage />} />
                <Route path="/truyen/:slug" element={<StoryDetailRoute />} />
                <Route path="/truyen/:slug/chuong/:number" element={<ReaderRoute />} />
                <Route path="/login" element={<LoginRoute />} />
                <Route path="/register" element={<RegisterRoute />} />
                <Route path="/forgot-password" element={<ForgotPasswordRoute />} />
                <Route path="/dang-nhap" element={<LoginRoute />} />
                <Route path="/dang-ky" element={<RegisterRoute />} />
                <Route path="/account" element={<Protected><ReaderDashboardRoute /></Protected>} />
                <Route path="/profile" element={<Protected><ReaderDashboardRoute /></Protected>} />
                <Route path="/ho-so" element={<Protected><ReaderDashboardRoute /></Protected>} />
                <Route path="/settings" element={<Protected><AccountSettingsRoute /></Protected>} />
                <Route path="/bookmarks" element={<Protected><BookmarksRoute /></Protected>} />
                <Route path="/theo-doi" element={<Protected><Library type="follows" /></Protected>} />
                <Route path="/history" element={<Protected><HistoryRoute /></Protected>} />
                <Route path="/lich-su" element={<Protected><HistoryRoute /></Protected>} />
                <Route path="/wallet" element={<Protected><WalletRoute /></Protected>} />
                <Route path="/nap-xu" element={<Protected><WalletRoute /></Protected>} />
                <Route path="/vi-hat" element={<Protected><WalletRoute /></Protected>} />
                <Route path="/notifications" element={<Protected><NotificationsRoute /></Protected>} />
                <Route path="/thong-bao" element={<Protected><NotificationsRoute /></Protected>} />
                <Route path="/ai-tools" element={<AiTools />} />
                <Route path="/author" element={<Protected author><AuthorRoute /></Protected>} />
                <Route path="/author/stories" element={<Protected author><AuthorRoute /></Protected>} />
                <Route path="/author/stories/new" element={<Protected author><AuthorRoute /></Protected>} />
                <Route path="/author/stories/:id/edit" element={<Protected author><AuthorRoute /></Protected>} />
                <Route path="/author/stories/:id/preview" element={<Protected author><AuthorRoute /></Protected>} />
                <Route path="/author/stories/:id/chapters" element={<Protected author><AuthorRoute /></Protected>} />
                <Route path="/author/stories/:id/chapters/new" element={<Protected author><AuthorRoute /></Protected>} />
                <Route path="/author/stories/:id/chapters/bulk" element={<Protected author><AuthorRoute /></Protected>} />
                <Route path="/author/chapters" element={<Protected author><AuthorRoute /></Protected>} />
                <Route path="/author/revenue" element={<Protected author><AuthorRoute /></Protected>} />
                <Route path="/author/promotions" element={<Protected author><AuthorRoute /></Protected>} />
                <Route path="/dang-truyen" element={<Protected author><Navigate to="/author/stories/new" replace /></Protected>} />
                <Route path="/dang-truyen/them-nhieu-chuong" element={<Protected author><AuthorRoute /></Protected>} />
                <Route path="/admin" element={<Protected admin><AdminRoute /></Protected>} />
                <Route path="/admin/home" element={<Protected admin><AdminRoute /></Protected>} />
                <Route path="/quan-tri-vien" element={<Protected admin><AdminRoute /></Protected>} />
                <Route path="/admin/users" element={<Protected admin><AdminRoute /></Protected>} />
                <Route path="/admin/stories" element={<Protected admin><AdminRoute /></Protected>} />
                <Route path="/admin/chapters" element={<Protected admin><AdminRoute /></Protected>} />
                <Route path="/admin/reports" element={<Protected admin><AdminRoute /></Protected>} />
                <Route path="/admin/comments" element={<Protected admin><AdminRoute /></Protected>} />
                <Route path="/admin/transactions" element={<Protected admin><AdminRoute /></Protected>} />
                <Route path="/admin/taxonomy" element={<Protected admin><AdminRoute /></Protected>} />
                <Route path="/admin/notifications" element={<Protected admin><AdminRoute /></Protected>} />
                <Route path="/admin/logs" element={<Protected admin><AdminRoute /></Protected>} />
                <Route path="/lien-he" element={<StaticPage type="contact" />} />
                <Route path="/dieu-khoan" element={<StaticPage type="terms" />} />
                <Route path="/bao-mat" element={<StaticPage type="privacy" />} />
                <Route path="/faq" element={<StaticPage type="faq" />} />
                <Route path="/dmca" element={<StaticPage type="dmca" />} />
                <Route path="/quy-dinh-noi-dung" element={<StaticPage type="contentRules" />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </Shell>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

function RouteLoader() {
  return <div className="center-card"><p>Đang tải trang...</p></div>;
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
  const publishing = false;

  if (publishing) {
    return <PublishShell>{children}</PublishShell>;
  }

  return (
    <div className="app-shell public-shell">
      <RouteScrollReset />
      <HeaderRoute />
      <main className="container">{children}</main>
      <ProductionFooter apiClient={api} />
    </div>
  );
}

function HeaderRoute() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return <ProductionHeader user={user} logout={logout} theme={theme} toggleTheme={toggleTheme} apiClient={api} />;
}

function HomeRoute() {
  const { user } = useAuth();
  return (
    <>
      <PageSeo
        title="Đậu Đỏ Truyện - Đọc truyện online"
        description="Khám phá truyện hot, truyện hoàn thành, bảng xếp hạng, tủ truyện và các đề xuất đọc cá nhân trên Đậu Đỏ Truyện."
        canonical="/"
        schema={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Đậu Đỏ Truyện',
          potentialAction: {
            '@type': 'SearchAction',
            target: '/danh-sach?q={search_term_string}',
            'query-input': 'required name=search_term_string'
          }
        }}
      />
      <ProductionHome apiClient={api} currentUser={user} />
    </>
  );
}

function SearchRoute({ presetFilters = {} }) {
  const { category } = useParams();
  const [searchParams] = useSearchParams();
  const keyword = searchParams.get('q') || '';
  const title = category ? `Thể loại ${decodeURIComponent(category)}` : keyword ? `Tìm kiếm ${keyword}` : 'Tìm kiếm truyện';
  return (
    <>
      <PageSeo
        title={title}
        description="Tìm truyện theo tên, tác giả, thể loại, tag, trạng thái, số chương, đánh giá, lượt xem và truyện VIP hoặc miễn phí."
        canonical={category ? `/the-loai/${category}` : `/danh-sach${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
      />
      <SearchPage
        apiClient={api}
        presetFilters={presetFilters}
        pageTitle={title}
        heroTitle={category ? `Thể loại ${decodeURIComponent(category)}` : ''}
      />
    </>
  );
}

function RankingRoute() {
  const [searchParams] = useSearchParams();
  return (
    <>
      <PageSeo
        title="Bảng xếp hạng truyện"
        description="Theo dõi top truyện theo ngày, tuần, tháng, năm và toàn thời gian với lượt xem, yêu thích, đánh giá, bình luận và doanh thu mock."
        canonical={`/xep-hang${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
      />
      <RankingExperiencePage apiClient={api} />
    </>
  );
}

function StoryDetailRoute() {
  const { user, updateUser } = useAuth();
  return <StoryDetailExperiencePage apiClient={api} user={user} updateUser={updateUser} />;
}

function ReaderRoute() {
  const { user, updateUser } = useAuth();
  return <ReaderExperiencePage apiClient={api} user={user} updateUser={updateUser} />;
}

function LoginRoute() {
  const { login } = useAuth();
  return (
    <>
      <PageSeo title="Đăng nhập" description="Đăng nhập Đậu Đỏ Truyện để đồng bộ lịch sử đọc, bookmark chương, ví Đậu và tủ truyện." canonical="/login" />
      <LoginPage login={login} />
    </>
  );
}

function RegisterRoute() {
  const { register } = useAuth();
  return (
    <>
      <PageSeo title="Đăng ký" description="Tạo tài khoản độc giả hoặc tác giả trên Đậu Đỏ Truyện để đọc, theo dõi và đăng truyện." canonical="/register" />
      <RegisterPage register={register} />
    </>
  );
}

function ForgotPasswordRoute() {
  return (
    <>
      <PageSeo title="Quên mật khẩu" description="Nhận hướng dẫn đặt lại mật khẩu tài khoản Đậu Đỏ Truyện qua email." canonical="/forgot-password" />
      <ForgotPasswordPage />
    </>
  );
}

function ReaderDashboardRoute() {
  const { user } = useAuth();
  return (
    <>
      <PageSeo title="Tài khoản độc giả" description="Dashboard độc giả, tủ truyện, số Đậu, thông báo mới và tiến trình đọc trên Đậu Đỏ Truyện." canonical="/account" />
      <ReaderDashboard user={user} apiClient={api} />
    </>
  );
}

function BookmarksRoute() {
  return (
    <>
      <PageSeo title="Bookmarks chương" description="Danh sách chương đã lưu, vị trí đọc và nút đọc tiếp nhanh trên Đậu Đỏ Truyện." canonical="/bookmarks" />
      <AccountBookmarksPage apiClient={api} />
    </>
  );
}

function HistoryRoute() {
  return (
    <>
      <PageSeo title="Lịch sử đọc" description="Xem lịch sử đọc, tiến trình từng truyện và thống kê thời gian đọc gần đây." canonical="/history" />
      <ReadingHistoryPage apiClient={api} />
    </>
  );
}

function WalletRoute() {
  const { user, updateUser } = useAuth();
  return (
    <>
      <PageSeo title="Ví Đậu và nạp Đậu" description="Chọn gói nạp Đậu, phương thức thanh toán demo và xem lịch sử giao dịch trên Đậu Đỏ Truyện." canonical="/wallet" />
      <AccountWalletPage user={user} updateUser={updateUser} apiClient={api} />
    </>
  );
}

function AccountSettingsRoute() {
  const { user, updateUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return (
    <>
      <PageSeo title="Cài đặt tài khoản" description="Cập nhật hồ sơ, mật khẩu, thông báo, giao diện, ngôn ngữ và quyền riêng tư." canonical="/settings" />
      <AccountSettings user={user} updateUser={updateUser} logout={logout} theme={theme} toggleTheme={toggleTheme} apiClient={api} />
    </>
  );
}

function AuthorRoute() {
  const { user } = useAuth();
  return (
    <>
      <PageSeo title="Dashboard tác giả" description="Quản lý truyện, chương, doanh thu, thống kê và gói quảng bá dành cho tác giả." canonical="/author" />
      <AuthorDashboard user={user} apiClient={api} />
    </>
  );
}

function AdminRoute() {
  const { user } = useAuth();
  const location = useLocation();
  return (
    <>
      <PageSeo title="Admin CMS" description="Quản trị người dùng, truyện, chương, báo cáo, giao dịch và hệ thống thông báo." canonical={location.pathname} />
      <AdminCMSDashboard user={user} apiClient={api} />
    </>
  );
}

function NotificationsRoute() {
  const { user } = useAuth();
  return (
    <>
      <PageSeo title="Thông báo" description="Trung tâm thông báo chương mới, bình luận trả lời, giao dịch và kiểm duyệt truyện/chương." canonical="/notifications" />
      <CMSNotificationPage user={user} apiClient={api} />
    </>
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
    api('/categories?limit=30')
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

      <button className="menu" onClick={() => setOpen(!open)}><Majesticon name="menu" size={22} /></button>

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
            {canPostStory(user.role) && <Link to="/dang-truyen" className="pill admin-pill">Đăng truyện</Link>}
            {isAdmin(user.role) && <Link to="/admin" className="pill admin-pill">Admin</Link>}
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
  const authorLinks = [
    ['Khu vực tác giả', '/author'],
    ['Đăng truyện mới', '/author/stories/new'],
    ['Quản lý truyện', '/author/stories'],
    ['Thống kê doanh thu', '/author/revenue'],
    ['Quảng bá', '/author/promotions']
  ];
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
            {authorLinks.map(([label, to]) => <Link key={label} to={to}>{label}</Link>)}
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
    Promise.all([api('/categories?limit=30'), api('/stories?sort=updated&limit=60')])
      .then(([categoryData, storyData]) => {
        setCategories(categoryData.categories || []);
        setAllStories(storyData.stories || storyData || []);
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
    { icon: 'user', label: 'Hồ sơ cá nhân', to: '/settings#profile' },
    { icon: 'bookmark', label: 'Tủ truyện', to: '/bookmarks' },
    { icon: 'edit', label: 'Đăng truyện mới', to: '/dang-truyen', authorOnly: true },
    { icon: 'book', label: 'Quản lý truyện', to: '/author/stories', authorOnly: true },
    { icon: 'shield', label: 'Quản lý Mod', to: '/admin/users', adminOnly: true },
    { icon: 'coins', label: 'Ví của tôi', to: '/vi-hat' },
    { icon: 'ranking', label: 'Bảng xếp hạng', to: '/xep-hang' },
    { icon: 'users', label: 'Mời bạn bè', to: '/ho-so' }
  ].filter(item => (!item.adminOnly || isAdmin(user?.role)) && (!item.authorOnly || canPostStory(user?.role)));

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
          <Majesticon name="search" size={18} />
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
      <button className="menu dd-menu" type="button" onClick={() => setOpen(!open)}><Majesticon name="menu" size={22} /></button>

      <nav className={open ? 'dd-header-nav rounded-pill px-3 py-2 open' : 'dd-header-nav rounded-pill px-3 py-2'}>
        <div className="dd-nav-container">
          <div className="dd-nav-section dd-nav-left">
            <NavLink end to="/" className="dd-nav-link" onClick={closeMenu}><Majesticon name="home" size={18} /> Trang chủ</NavLink>
            <NavLink
              to="/danh-sach?status=completed"
              className={location.search.includes('status=completed') ? 'dd-nav-link active' : 'dd-nav-link'}
              onClick={closeMenu}
            >
              <Majesticon name="check" size={18} /> Hoàn thành
            </NavLink>
            <NavLink to="/truyen-ngan" className="dd-nav-link" onClick={closeMenu}><Majesticon name="bookOpen" size={18} /> Truyện ngắn</NavLink>
          </div>

          <Link to="/" className="dd-brand-title" onClick={closeMenu}>Đậu Đỏ Truyện</Link>

          <div className="dd-nav-section dd-nav-right">
            <div className="nav-category-wrap dd-category-wrap">
              <button
                type="button"
                className={categoryOpen || location.pathname.startsWith('/the-loai') ? 'dd-nav-link nav-category-trigger active' : 'dd-nav-link nav-category-trigger'}
                onClick={() => setCategoryOpen(value => !value)}
              >
                <Majesticon name="category" size={18} /> Thể loại <Majesticon name="chevronDown" size={16} />
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

            <NavLink to="/xep-hang" className="dd-nav-link" onClick={closeMenu}><Majesticon name="ranking" size={18} /> Xếp hạng</NavLink>
            <button className="dd-icon-btn" type="button" title="Giao diện" aria-label="Giao diện" onClick={toggleTheme}><span className={theme === 'dark' ? 'theme-sun-icon' : 'theme-moon-icon'} aria-hidden="true" /></button>
            <button className="dd-icon-btn" type="button" onClick={() => setSearchOpen(true)} aria-label="Tìm kiếm"><Majesticon name="search" size={20} /></button>
            <Link to="/thong-bao" className="dd-icon-btn" title="Thông báo" aria-label="Thông báo" onClick={closeMenu}><Majesticon name="bell" size={20} /></Link>

            {user ? (
              <>
                <Link to="/bookmarks" className="dd-icon-btn" onClick={closeMenu}><Majesticon name="heart" size={20} /></Link>
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
                            <Majesticon name={icon} size={18} />
                            <strong>{label}</strong>
                          </Link>
                        ))}
                      </div>
                      <div className="dd-profile-list dd-profile-footer-list">
                        <Link to="/settings#profile" onClick={closeMenu}><Majesticon name="settings" size={18} /><strong>Cài đặt</strong></Link>
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
                <Majesticon name="login" className="dd-login-icon" size={20} />
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

function Protected({ children, admin = false, author = false }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/dang-nhap" replace />;
  if (admin && !isAdmin(user.role)) return <Navigate to="/" replace />;
  if (author && !canPostStory(user.role)) return <Navigate to="/" replace />;
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

const BULK_CHAPTER_HEADING = /^\s*((?:Quy[eể]n\s+\d+\s*[-–—]\s*)?Ch[uư][oơ]ng\s+\d+(?:\s*[:：\-–—]\s*.*)?|Th[eế]\s*gi[oớ]i\s+\d+(?:\s*[:：\-–—]\s*.*)?|Ph[oó]\s*b[aả]n\s+\d+(?:\s*[:：\-–—]\s*.*)?)\s*$/i;

function parseBulkChapters(input = '') {
  const lines = String(input || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const chapters = [];
  let current = null;

  lines.forEach(line => {
    const heading = line.match(BULK_CHAPTER_HEADING);
    if (heading) {
      if (current) chapters.push(current);
      current = { title: heading[1].trim(), contentLines: [] };
      return;
    }
    if (current) current.contentLines.push(line);
  });

  if (current) chapters.push(current);

  return chapters.map((chapter, index) => {
    const content = chapter.contentLines.join('\n').trim();
    return {
      index: index + 1,
      title: chapter.title,
      content,
      charCount: content.length,
      valid: content.length > 0,
      error: content.length > 0 ? '' : 'Chương chưa có nội dung.'
    };
  });
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
      <img src={story.cover} alt={story.title} loading="lazy" />
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
        <img src={story.cover} alt={story.title} loading="lazy" />
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
        api('/stories?sort=updated&limit=20'),
      api('/stories?featured=true&sort=rating'),
        api('/stories?sort=views&limit=20'),
      api('/stories?status=completed&sort=updated'),
        api('/categories?limit=30')
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
      <div className="premium-benefits"><span><Majesticon name="bookOpen" size={20} /> Đọc miễn phí chương đầu</span><span><Majesticon name="money" size={20} /> Mua từng chương</span><span><Majesticon name="combo" size={20} /> Combo trọn bộ</span></div>
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
  const bannerImage = [story.bannerImage, story.bannerUrl, story.coverImage, story.cover, story.banner]
    .find(value => typeof value === 'string' && value.trim() && value !== 'true' && value !== 'false') || '/images/hero.jpg';

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
          <Link to={`/truyen/${story.slug}`} className="button banner-read"><Majesticon name="bookOpen" size={18} /> Đọc ngay</Link>
          <Link to={`/truyen/${story.slug}`} className="ghost banner-like"><Majesticon name="heart" size={18} /> Lưu ở trang chi tiết</Link>
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
  useEffect(() => { api('/categories?limit=30').then(data => setCategories(data.categories)).catch(() => {}); }, []);
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

  useEffect(() => { api('/categories?limit=30').then(data => setCategories(data.categories || [])).catch(() => {}); }, []);

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
  return (
    <>
      <PageSeo title="Truyện ngắn" description="Tuyển tập truyện ngắn dễ đọc, gọn nhịp và phù hợp để đọc nhanh trong một buổi." canonical="/truyen-ngan" />
      <SearchPage
        apiClient={api}
        presetFilters={{ sort: 'chapters' }}
        pageTitle="Truyện Ngắn"
        heroTitle="Truyện Ngắn"
        shortOnly
        basePath="/truyen-ngan"
      />
    </>
  );
}

function RankingPage() {
  const [stories, setStories] = useState([]);
  useEffect(() => { api('/stories?sort=views&limit=20').then(data => setStories(data.stories || [])).catch(() => {}); }, []);
  const topThree = stories.slice(0, 3);
  const list = stories.slice(0, 12);
  const totalViews = stories.reduce((sum, story) => sum + Number(story.views || 0), 0);
  const topStory = stories[0];

  return (
    <div className="ranking-page">
      <section className="catalog-hero-readdy ranking-hero"><div className="catalog-breadcrumb">Trang chủ › Xếp hạng</div><span className="catalog-hero-pill gold">Bảng xếp hạng</span><h1>Top Truyện Hay</h1><p>Những tác phẩm được đọc nhiều nhất, đánh giá cao nhất từ cộng đồng độc giả.</p></section>
      <section className="ranking-page-header">
        <div className="ranking-page-heading">
          <span className="ranking-page-kicker">Bảng xếp hạng</span>
          <h2>Theo dõi những truyện đang dẫn đầu cộng đồng</h2>
          <p>Cập nhật nhanh các tác phẩm có lượt đọc cao, điểm đánh giá nổi bật và tốc độ tăng trưởng tốt nhất.</p>
        </div>
        <div className="ranking-header-stats" aria-label="Thống kê bảng xếp hạng">
          <div>
            <span>Tổng truyện</span>
            <strong>{formatNumber(stories.length)}</strong>
          </div>
          <div>
            <span>Lượt đọc</span>
            <strong>{formatNumber(totalViews)}</strong>
          </div>
          <div>
            <span>Top hiện tại</span>
            <strong>{topStory?.title || 'Đang cập nhật'}</strong>
          </div>
        </div>
        <div className="ranking-header-actions">
          <Link to="/danh-sach?sort=views" className="button">Khám phá thêm</Link>
          <Link to="/truyen-moi" className="ghost">Truyện mới</Link>
        </div>
      </section>
      <div className="ranking-tabs"><button>Hôm nay</button><button className="active">Tuần này</button><button>Tháng này</button><button>Năm nay</button><button>Tất cả</button><span></span><button className="active orange">Tất cả</button><button>Đang Hot</button><button>Truyện Mới</button><button>Hoàn Thành</button></div>
      <h2 className="ranking-title"><Majesticon name="award" size={24} /> Top 3 Nổi Bật</h2>
      <div className="podium-row">
        {topThree.map((story, index) => <Link key={story.id} to={`/truyen/${story.slug}`} className={`podium-card rank-${index + 1}`}><span className="podium-rank">{index + 1}</span><img src={story.cover} alt={story.title} /><strong>{story.title}</strong><small>{formatNumber(story.views)} lượt đọc</small><b>★ {story.rating}</b></Link>)}
      </div>
      <h2 className="ranking-title"><Majesticon name="checklist" size={24} /> Bảng Xếp Hạng Đầy Đủ</h2>
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
      api('/categories?limit=30')
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
          <div className="story-inline-stats"><span><Majesticon name="star" size={18} /> {story.rating}/5</span><span><Majesticon name="eye" size={18} /> {formatNumber(story.views)} lượt đọc</span><span><Majesticon name="bookOpen" size={18} /> {chapters.length} chương</span><span className="green"><Majesticon name="check" size={18} /> {statusLabel(story.status)}</span></div>
          <p className="story-description">{story.description}</p>
          <div className="purchase-strip"><span><Majesticon name="bookOpen" size={20} /> Miễn phí<br /><b>{freeCount} chương đầu</b></span><span><Majesticon name="money" size={20} /> Mua lẻ<br /><b>{story.price || 1} Đậu/chương</b></span><span><Majesticon name="combo" size={20} /> Combo trọn bộ<br /><b>{Math.max(49, (story.price || 1) * chapters.length)} Đậu</b></span></div>
          <div className="hero-actions"><Link className="button" to={`/truyen/${story.slug}/chuong/1`}><Majesticon name="play" size={18} /> Đọc từ đầu</Link><button className="button gold" onClick={buyCombo}><Majesticon name="money" size={18} /> Mua combo {Math.max(49, (story.price || 1) * chapters.length)} Đậu</button><button className="ghost light" onClick={() => toggle('follow')}>{story.followed ? <><Majesticon name="check" size={18} /> Đang theo dõi</> : <><Majesticon name="heart" size={18} /> Theo dõi</>}</button><button className="ghost light" onClick={() => toggle('bookmark')}>{story.bookmarked ? <><Majesticon name="check" size={18} /> Đã lưu</> : <><Majesticon name="bookmark" size={18} /> Lưu</>}</button><button className="ghost light" onClick={reportStory}><Majesticon name="alert" size={18} /> Báo cáo</button></div>
          {notice && <div className="success-box">{notice}</div>}
        </div>
      </section>

      <section className="story-section chapter-section-readdy">
        <div className="story-section-head"><h2><Majesticon name="playlist" size={22} /> Danh sách chương <small>({chapters.length} chương)</small></h2><div className="chapter-tabs"><button className="active">Tất cả</button><button>Miễn phí</button><button>Trả phí</button><button>Mới nhất</button></div></div>
            <div className="free-note">📚 {freeCount} chương đầu miễn phí — Từ chương {freeCount + 1} trở đi cần <b>{story.price || 1} Đậu/chương</b></div>
        <div className="chapter-grid-readdy">
          {orderedChapters.map(chapter => (
            <Link key={chapter.id} to={`/truyen/${story.slug}/chuong/${chapter.number}`}>
              <span><Majesticon name={chapter.isPremium ? 'lock' : 'bookOpen'} size={18} /> Chương {chapter.number}: {chapter.title.replace(/^Chương\s*\d+[:?]?\s*/i, '')}</span>
              <small>{chapter.isPremium ? <><Majesticon name="money" size={14} /> {chapter.price || story.price || 1}</> : 'Free'} ? {formatNumber(chapter.views)} lượt</small>
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
    const names = {
      'chevron-right': 'chevronRight',
      'chevron-left': 'chevronLeft',
      'chevron-down': 'chevronDown',
      'line-tight': 'text',
      'font-size': 'fontSize',
      'panel-wide': 'panelWide',
      message: 'chatText',
      spacing: 'text',
      type: 'text'
    };
    return <Majesticon name={names[name] || name} size={20} />;
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
    if (!user) return setError('Bạn cần đăng nhập để mở khóa chương.');
    try {
      const result = await api(`/chapters/${data.chapter.id}/unlock`, { method: 'POST' });
      updateUser(result.user);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveStory(storyId) {
    if (!user) return setError('Bạn cần đăng nhập để lưu truyện.');
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
        {prevLink ? <Link className="reader-switch ghost" to={prevLink}><ReaderIcon name="chevron-left" /><span>Chương trước</span></Link> : <span className="reader-switch ghost disabled"><ReaderIcon name="chevron-left" /><span>Chương trước</span></span>}
        <button type="button" className="reader-current-chip"><span>{chapter.title}</span><span className="reader-current-arrow"><ReaderIcon name="chevron-down" /></span></button>
        {nextLink ? <Link className="reader-switch next" to={nextLink}><span>Chương sau</span><ReaderIcon name="chevron-right" /></Link> : <span className="reader-switch ghost disabled"><span>Đã hết chương</span></span>}
      </div>

      <div className="reader-toolbar">
        <div className="reader-toolbar-group">
          <button type="button" className={lineHeight === 'tight' ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => cycleValue('lineHeight', ['tight', 'normal', 'relaxed'], 'normal')} title="Gi?n d?ng"><ReaderIcon name="line-tight" /></button>
          <button type="button" className={fontSize !== 'md' ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => cycleValue('fontSize', ['sm', 'md', 'lg'], 'md')} title="C? ch?"><ReaderIcon name="font-size" /></button>
          <button type="button" className={fontFamily === 'serif' ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => cycleValue('fontFamily', ['sans', 'serif'], 'sans')} title="Ki?u ch?"><ReaderIcon name="type" /></button>
          <button type="button" className={wide ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => updateReaderPref('wide', !wide)} title="Khung r?ng"><ReaderIcon name={wide ? 'panel-wide' : 'panel'} /></button>
          <button type="button" className={saved ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => saveStory(story.id)} title="Lưu truyện"><ReaderIcon name="heart" /></button>
          <button type="button" className="reader-tool-btn" onClick={() => shareChapter(story, chapter)} title="Chia s?"><ReaderIcon name="share" /></button>
        </div>
        <div className="reader-toolbar-group">
          <button type="button" className={readerTone === 'dark' ? 'reader-tool-btn active' : 'reader-tool-btn'} onClick={() => cycleValue('readerTone', ['dark', 'light', 'sepia'], theme === 'light' ? 'light' : 'dark')} title="Nền đọc"><ReaderIcon name={readerTone === 'dark' ? 'moon' : readerTone === 'light' ? 'sun' : 'droplet'} /></button>
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
            <span><ReaderIcon name="eye" /> Lượt đọc: {formatNumber(chapter.views)}</span>
            <span><ReaderIcon name="message" /> B?nh lu?n: 0</span>
          </p>
        </div>
        <ErrorBox message={error} />
        {!unlocked && <div className="paywall"><h3>Chương trả phí</h3><p>Bạn đang xem bản preview. Mở khóa để đọc đầy đủ chương này.</p><button className="button" onClick={unlock}>Mở khóa {chapter.price} Hạt</button></div>}
        <div className="chapter-content">{chapter.content.split('\n').map((line, index) => line ? <p key={index}>{line}</p> : <br key={index} />)}</div>
        <div className="reader-nav">
          {prevLink ? <Link className="ghost" to={prevLink}>Chương trước</Link> : <span className="ghost disabled">Chương trước</span>}
          {nextLink ? <Link className="ghost" to={nextLink}>Chương sau</Link> : <span className="ghost disabled">Đã hết chương</span>}
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
    <>
      <PageSeo title={`Tác giả ${authorName}`} description={`Danh sách truyện của ${authorName || 'tác giả'} trên Đậu Đỏ Truyện.`} canonical={`/tac-gia/${encodeURIComponent(authorName)}`} />
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
    </>
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
    contact: {
      title: 'Liên hệ',
      canonical: '/lien-he',
      body: 'Gửi phản hồi, báo lỗi hoặc yêu cầu gỡ nội dung qua email support@daudotruyen.vn. Đội ngũ quản trị sẽ phản hồi trong thời gian sớm nhất.'
    },
    terms: {
      title: 'Điều khoản sử dụng',
      canonical: '/dieu-khoan',
      body: 'Người dùng chịu trách nhiệm với nội dung đăng tải, không đăng nội dung vi phạm bản quyền, pháp luật hoặc gây hại cho cộng đồng. Admin có quyền ẩn hoặc gỡ nội dung khi cần.'
    },
    privacy: {
      title: 'Chính sách bảo mật',
      canonical: '/bao-mat',
    body: 'Đậu Đỏ Truyện lưu thông tin tài khoản, lịch sử đọc, newsletter và giao dịch Đậu để vận hành dịch vụ. Không chia sẻ dữ liệu cá nhân cho bên thứ ba ngoài các đơn vị xử lý cần thiết cho thanh toán, bảo mật và hỗ trợ người dùng.'
    },
    faq: {
      title: 'FAQ',
      canonical: '/faq',
    body: 'Các câu hỏi thường gặp: cách tạo tài khoản, lưu chương yêu thích, nạp Đậu, mở khóa chương VIP, đăng truyện và liên hệ hỗ trợ khi gặp lỗi thanh toán hoặc lỗi hiển thị.'
    },
    dmca: {
      title: 'DMCA',
      canonical: '/dmca',
      body: 'Nếu bạn là chủ sở hữu bản quyền và phát hiện nội dung vi phạm, hãy gửi yêu cầu gỡ bỏ kèm bằng chứng quyền sở hữu, URL nội dung và thông tin liên hệ tới support@daudotruyen.vn.'
    },
    contentRules: {
      title: 'Quy định nội dung',
      canonical: '/quy-dinh-noi-dung',
      body: 'Nội dung đăng tải không được vi phạm pháp luật, kích động thù ghét, xâm phạm bản quyền, lừa đảo thanh toán hoặc phát tán thông tin cá nhân. Nội dung nhạy cảm cần gắn cảnh báo phù hợp.'
    }
  };
  const page = pages[type] || pages.contact;
  return (
    <>
      <PageSeo title={page.title} description={page.body} canonical={page.canonical} />
      <div className="auth-card wide static-page">
        <h1>{page.title}</h1>
        <p className="muted">{page.body}</p>
        <Link className="button" to="/">Về trang chủ</Link>
      </div>
    </>
  );
}

function Profile() {
  const { user } = useAuth();
  return (
    <div className="dashboard-grid">
        <div className="panel profile-panel"><img src={user.avatar} alt="avatar" /><h1>{user.name}</h1><p>{user.email}</p><span className="pill">Vai trò: {user.role}</span><span className="pill">Số dư: {user.seeds} Đậu</span></div>
        <div className="panel"><h2>Lối tắt</h2><div className="quick-links"><Link to="/bookmarks">Bookmarks</Link><Link to="/theo-doi">Theo dõi</Link><Link to="/lich-su">Lịch sử đọc</Link><Link to="/vi-hat">Ví Đậu</Link></div></div>
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
      <div className="library-head"><div><span className="library-icon"><Majesticon name="bookmark" size={22} /></span><h1>{titles[type]}</h1><p>{items.length} {type === 'history' ? 'mục lịch sử' : 'chương đã lưu'}</p></div><button className="dd-icon-btn" onClick={() => setView(view === 'grid' ? 'list' : 'grid')}><Majesticon name={view === 'grid' ? 'list' : 'grid'} size={18} /></button></div>
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

function Wallet() {
  const { user, updateUser } = useAuth();
  const [data, setData] = useState({ packages: [], transactions: [] });
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('seed-50');
  const [method, setMethod] = useState('MoMo');

  const load = async () => {
    const [packs, txns] = await Promise.all([api('/wallet/packages'), api('/wallet/transactions')]);
    setData({ packages: packs.packages || [], transactions: txns.transactions || [], balance: txns.balance });
  };
  useEffect(() => { load().catch(err => setError(err.message)); }, []);

  async function topup(packageId) {
    try {
      const result = await api('/wallet/topup', { method: 'POST', body: JSON.stringify({ packageId }) });
      updateUser(result.user);
      await load();
    } catch (err) { setError(err.message); }
  }

  const selectedPack = DEFAULT_WALLET_PACKAGES.find(pack => pack.id === selected) || DEFAULT_WALLET_PACKAGES[2];

  return (
    <div className="wallet-page">
      <div className="catalog-breadcrumb">Trang chủ › Ví Đậu</div>
      <div className="wallet-title"><span>🪙</span><div><h1>Ví Đậu</h1><p>Nạp Đậu để mua chương truyện yêu thích</p></div></div>
      <ErrorBox message={error} />
      <section className="wallet-balance-panel"><p>Số dư hiện tại</p><h2>🪙 {user.seeds} <span>Đậu</span></h2><div><span>🛒 Đã dùng: 106 Đậu</span><span>💵 Đã nạp: 170 Đậu</span><span>🎁 Thưởng: 23 Đậu</span></div></section>
      <div className="wallet-feature-row"><span>🪙 <b>1 Đậu</b><small>= 1.000đ</small></span><span>📖 <b>Mua lẻ</b><small>1-2 Đậu/chương</small></span><span>📦 <b>Combo</b><small>Tiết kiệm hơn 50%</small></span></div>
      <h2 className="wallet-section-title"><Majesticon name="moneyPlus" size={22} /> Chọn gói nạp</h2>
      <div className="wallet-packages">{DEFAULT_WALLET_PACKAGES.map(pack => <button key={pack.id} type="button" className={selected === pack.id ? 'active' : ''} onClick={() => setSelected(pack.id)}>{pack.featured && <b>Phổ biến nhất</b>}<strong>{pack.seeds}<small>{pack.bonus ? ` +${pack.bonus} Đậu` : ' Đậu'}</small></strong><em>{pack.bonus ? `Tặng thêm ${pack.bonus} Đậu` : 'Không bonus'}</em><span>{pack.price.toLocaleString('vi-VN')}đ</span><small>{pack.label}</small></button>)}</div>
      <h2 className="wallet-section-title"><Majesticon name="creditcard" size={22} /> Phương thức thanh toán</h2>
      <div className="payment-methods">{['MoMo', 'VNPay', 'ZaloPay', 'Chuyển khoản'].map(item => <button key={item} className={method === item ? 'active' : ''} onClick={() => setMethod(item)}>{item}</button>)}</div>
      <button className="button wallet-pay" onClick={() => topup(selected)}><Majesticon name="moneyPlus" size={18} /> Nạp {selectedPack.price.toLocaleString('vi-VN')}? - nhận {selectedPack.seeds + (selectedPack.bonus || 0)} Đậu</button>
      <small className="wallet-safe">🛡 Thanh toán an toàn, được mã hóa SSL</small>
      <HomeSection title="Lịch sử giao dịch" subtitle="Các giao dịch gần đây" kicker="History"><div className="wallet-txn-list">{data.transactions.map(txn => <div key={txn.id}><span>{txn.type === 'purchase' ? '🛒' : '💵'}</span><strong>{txn.note}</strong><small>{formatDateShort(txn.createdAt)}</small><b className={txn.amount > 0 ? 'plus' : 'minus'}>{txn.amount > 0 ? '+' : ''}{txn.amount}</b></div>)}</div></HomeSection>
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
  return <div className="auth-card wide"><h1>AI Tools</h1><p className="muted">Nhập gu đọc, hệ thống sẽ gợi ý truyện theo keyword.</p><textarea rows="6" value={text} onChange={e => setText(e.target.value)} /><div className="ai-result">{result}</div></div>;
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
  return (
    <>
      <div className="page-title"><h1>Admin Dashboard</h1><p>Quản trị truyện, người dùng và giao dịch Đậu.</p></div>
      <ErrorBox message={error} />
      <div className="stats-grid">{Object.entries(stats).map(([key, value]) => <div className="panel stat" key={key}><span>{key}</span><strong>{formatNumber(value)}</strong></div>)}</div>
      <div className="admin-grid">
        <form className="panel stack-form" onSubmit={createStory}><h2>Thêm truyện</h2><input placeholder="Tên truyện" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /><input placeholder="Tác giả" value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} /><input placeholder="Thể loại, cách nhau bằng dấu phẩy" value={form.categories} onChange={e => setForm({ ...form, categories: e.target.value })} /><textarea placeholder="Mô tả" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /><label><input type="checkbox" checked={form.premium} onChange={e => setForm({ ...form, premium: e.target.checked })} /> Truyện trả phí</label><label><input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} /> Ghim nổi bật</label><button className="button">Tạo truyện</button></form>
        <div className="panel"><h2>Người dùng</h2><div className="list-panel compact">{users.map(user => <div key={user.id}><span>{user.name}</span><small>{user.email} · {user.role} · {user.seeds} Đậu</small></div>)}</div></div>
      </div>
      <Section title="Quản lý truyện" subtitle="Duyệt, ẩn/hiện, sửa tên và chọn truyện để quản lý chương."><div className="list-panel">{stories.map(story => <div key={story.id} className={selectedStory?.id === story.id ? 'active-admin-row' : ''}><span><button className="small-link" onClick={() => selectStory(story)}>{story.title}</button><small>{story.author} · {story.chapterCount} chương · {statusLabel(story.status)} · {approvalLabel(story.approvalStatus)} · {story.hidden ? 'Đang ẩn' : 'Đang hiện'}</small></span><button className="ghost" onClick={() => updateStory(story, { approvalStatus: story.approvalStatus === 'approved' ? 'pending' : 'approved' })}>{story.approvalStatus === 'approved' ? 'Đưa chờ duyệt' : 'Duyệt'}</button><button className="ghost" onClick={() => updateStory(story, { hidden: !story.hidden })}>{story.hidden ? 'Hiện' : 'Ẩn'}</button><button className="ghost" onClick={() => renameStory(story)}>Sửa</button><button className="ghost danger" onClick={() => deleteStory(story.id)}>Xóa</button></div>)}</div></Section>
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
  const location = useLocation();
  const groups = [
    ['TÀI KHOẢN', ['Hồ sơ cá nhân', 'Bảo mật', 'Thông báo', 'Quyền riêng tư', 'Giao diện', 'Ví của tôi']],
    ['SÁNG TÁC', ['Quản lý truyện', 'Đăng truyện mới', 'Kiểm tra chương lỗi']],
    ['NỘI DUNG', ['Thư viện', 'Đã đọc', 'Yêu thích']],
    ['THỐNG KÊ', ['Quảng bá', 'Độc giả', 'Doanh thu']]
  ];
  const sidebarLinks = {
    'Hồ sơ cá nhân': '/settings#profile',
    'Bảo mật': '/settings#security',
    'Thông báo': '/settings#notifications',
    'Quyền riêng tư': '/settings#privacy',
    'Giao diện': '/settings#appearance',
    'Ví của tôi': '/wallet'
  };
  const currentPath = `${location.pathname}${location.hash || ''}`;

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
          {items.map(item => {
            const to = sidebarLinks[item];
            const className = to && currentPath === to ? 'active' : item === 'Đăng truyện mới' && location.pathname === '/dang-truyen' ? 'active' : '';
            return to ? <Link className={className} to={to} key={item}>{item}</Link> : <span className={className} key={item}>{item}</span>;
          })}
        </div>
      ))}
      <div className="sidebar-group">
        <strong>THAO TÁC</strong>
        <Link className={location.pathname === '/dang-truyen/them-nhieu-chuong' ? 'active' : ''} to="/dang-truyen/them-nhieu-chuong">Thêm nhiều chương</Link>
      </div>
    </aside>
  );
}

function BulkChapterPublish() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const queryStoryId = searchParams.get('storyId') || '';
  const [stories, setStories] = useState([]);
  const [storyDetail, setStoryDetail] = useState(null);
  const [selectedStoryId, setSelectedStoryId] = useState(queryStoryId);
  const [activeTab, setActiveTab] = useState('paste');
  const [rawText, setRawText] = useState('');
  const [isPremium, setIsPremium] = useState(false);
  const [price, setPrice] = useState(0);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [postedStory, setPostedStory] = useState(null);
  const [draftLoadedKey, setDraftLoadedKey] = useState('');

  const selectedStory = stories.find(story => story.id === selectedStoryId) || null;
  const parsedChapters = useMemo(() => parseBulkChapters(rawText), [rawText]);
  const validChapters = parsedChapters.filter(chapter => chapter.valid);
  const invalidChapters = parsedChapters.filter(chapter => !chapter.valid);
  const chapterNumbers = storyDetail?.chapters?.map(chapter => Number(chapter.number) || 0) || [];
  const nextChapterNumber = Math.max(0, ...chapterNumbers, Number(selectedStory?.chapterCount || 0)) + 1;
  const draftKey = `daudo_bulk_chapters_${selectedStoryId || 'unselected'}`;

  useEffect(() => {
    api('/admin/stories')
      .then(data => setStories(data.stories || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (queryStoryId) setSelectedStoryId(queryStoryId);
  }, [queryStoryId]);

  useEffect(() => {
    setStoryDetail(null);
    if (!selectedStoryId) return;
    api(`/stories/${selectedStoryId}`)
      .then(data => setStoryDetail(data))
      .catch(() => setStoryDetail(null));
  }, [selectedStoryId]);

  useEffect(() => {
    setDraftLoadedKey('');
    const rawDraft = localStorage.getItem(draftKey);
    if (rawDraft) {
      try {
        const draft = JSON.parse(rawDraft);
        setRawText(draft.rawText || '');
        setActiveTab(draft.activeTab || 'paste');
        setIsPremium(Boolean(draft.isPremium));
        setPrice(Number(draft.price || 0));
        setPasswordEnabled(Boolean(draft.passwordEnabled));
        setPassword(draft.password || '');
      } catch {
        localStorage.removeItem(draftKey);
      }
    } else {
      setRawText('');
      setActiveTab('paste');
      setIsPremium(false);
      setPrice(0);
      setPasswordEnabled(false);
      setPassword('');
    }
    setChecked(false);
    setSuccess('');
    setPostedStory(null);
    setDraftLoadedKey(draftKey);
  }, [draftKey]);

  useEffect(() => {
    if (draftLoadedKey !== draftKey) return;
    localStorage.setItem(draftKey, JSON.stringify({ rawText, activeTab, isPremium, price, passwordEnabled, password }));
  }, [draftKey, draftLoadedKey, rawText, activeTab, isPremium, price, passwordEnabled, password]);

  function clearDraft() {
    localStorage.removeItem(draftKey);
    setRawText('');
    setActiveTab('paste');
    setIsPremium(false);
    setPrice(0);
    setPasswordEnabled(false);
    setPassword('');
    setChecked(false);
    setSuccess('Đã xóa bản nháp.');
  }

  function checkChapters() {
    setChecked(true);
    setSuccess('');
    if (!rawText.trim()) {
      setError('Vui lòng dán nội dung hoặc tải file .txt.');
      return;
    }
    if (parsedChapters.length === 0) {
      setError('Chưa tìm thấy tiêu đề chương hợp lệ.');
      return;
    }
    if (invalidChapters.length > 0) {
      setError(`Có ${invalidChapters.length} chương chưa có nội dung.`);
      return;
    }
    setError('');
  }

  function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError('Hiện tại chỉ hỗ trợ file .txt.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRawText(String(reader.result || ''));
      setActiveTab('paste');
      setChecked(false);
      setError('');
      setSuccess(`Đã tải file ${file.name}.`);
    };
    reader.onerror = () => setError('Không thể đọc file. Vui lòng thử lại.');
    reader.readAsText(file);
  }

  async function submitChapters() {
    setChecked(true);
    setError('');
    setSuccess('');
    if (!selectedStoryId) return setError('Vui lòng chọn truyện trước khi đăng chương.');
    if (parsedChapters.length === 0) return setError('Chưa parse được chương nào.');
    if (invalidChapters.length > 0) return setError('Không thể đăng chương rỗng. Vui lòng kiểm tra lại nội dung.');
    if (isPremium && Number(price) < 0) return setError('Giá chương không hợp lệ.');
    if (passwordEnabled && !password.trim()) return setError('Vui lòng nhập mật khẩu chương.');

    setSubmitting(true);
    try {
      for (const chapter of validChapters) {
        await api(`/admin/stories/${selectedStoryId}/chapters`, {
          method: 'POST',
          body: JSON.stringify({
            title: chapter.title,
            content: chapter.content,
            isPremium,
            price: isPremium ? Number(price || 0) : 0,
            preview: chapter.content.slice(0, 300),
            password: passwordEnabled ? password.trim() : ''
          })
        });
      }
      localStorage.removeItem(draftKey);
      setPostedStory(selectedStory);
      setSuccess(`Đã đăng ${validChapters.length} chương.`);
      setRawText('');
      setChecked(false);
      const detail = await api(`/stories/${selectedStoryId}`).catch(() => null);
      if (detail) setStoryDetail(detail);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Loader />;

  return (
    <div className="publish-page bulk-chapter-page">
      <PublishSidebar user={user} />
      <section className="bulk-chapter-card">
        <header className="bulk-chapter-header">
          <div className="bulk-chapter-header-main">
            <Link className="bulk-back" to="/dang-truyen">‹</Link>
            <div>
              <h1>Thêm nhiều chương</h1>
              <p>Sau khi {selectedStory?.title || 'chọn truyện'}</p>
            </div>
          </div>
          <div className="bulk-next-badge">Chương tiếp: {selectedStoryId ? nextChapterNumber : '-'}</div>
        </header>

        <ErrorBox message={error} />
        {success && <div className="success-box">{success}</div>}

        {!queryStoryId && (
          <div className="bulk-story-select">
            <label>Chọn truyện</label>
            <select value={selectedStoryId} onChange={event => setSelectedStoryId(event.target.value)}>
              <option value="">Chọn truyện cần đăng chương</option>
              {stories.map(story => <option key={story.id} value={story.id}>{story.title} - {story.chapterCount || 0} chương</option>)}
            </select>
          </div>
        )}

        <div className="bulk-tabs">
          <button type="button" className={activeTab === 'paste' ? 'active' : ''} onClick={() => setActiveTab('paste')}>Dán nội dung</button>
          <button type="button" className={activeTab === 'file' ? 'active' : ''} onClick={() => setActiveTab('file')}>Tải file</button>
        </div>

        {activeTab === 'file' && (
          <label className="bulk-file-drop">
            <strong>Tải file .txt</strong>
            <span>Chọn file văn bản chứa nhiều chương, hệ thống sẽ đọc và đưa vào ô dán nội dung.</span>
            <input type="file" accept=".txt,text/plain" onChange={event => handleFile(event.target.files?.[0])} />
          </label>
        )}

        <textarea
          className="bulk-chapter-textarea"
          value={rawText}
          onChange={event => {
            setRawText(event.target.value);
            setChecked(false);
          }}
          placeholder={`Chương 1: Tên chương 1
Nội dung chương 1...

Chương 2: Tên chương 2
Nội dung chương 2...

Hỗ trợ: Chương N, Quyển N - Chương N, Thế giới N, Phó bản N...`}
        />

        <div className="bulk-counter">
          <span>{formatNumber(rawText.length)} ký tự</span>
          <span>{parsedChapters.length} chương parse được</span>
          {invalidChapters.length > 0 && <span className="danger">{invalidChapters.length} lỗi</span>}
        </div>

        <section className="bulk-options">
          <h2>Tùy chọn chương</h2>
          <div className="bulk-radio-row">
            <label><input type="radio" checked={!isPremium} onChange={() => setIsPremium(false)} /> Miễn phí</label>
            <label><input type="radio" checked={isPremium} onChange={() => setIsPremium(true)} /> Có phí</label>
          </div>
          {isPremium && (
            <div className="bulk-price-row">
                  <label>Giá Đậu mỗi chương</label>
              <input type="number" min="0" value={price} onChange={event => setPrice(event.target.value)} />
            </div>
          )}
          <div className="bulk-password-row">
            <label><input type="checkbox" checked={passwordEnabled} onChange={event => setPasswordEnabled(event.target.checked)} /> Mật khẩu chương</label>
            {passwordEnabled && <input placeholder="Nhập mật khẩu" value={password} onChange={event => setPassword(event.target.value)} />}
          </div>
        </section>

        {checked && (
          <section className="bulk-preview">
            <h2>Preview chương</h2>
            {parsedChapters.length === 0 && <div className="bulk-empty">Chưa có chương nào được parse.</div>}
            {parsedChapters.map(chapter => (
              <div key={`${chapter.index}-${chapter.title}`} className={chapter.valid ? 'bulk-preview-row valid' : 'bulk-preview-row invalid'}>
                <span>#{chapter.index}</span>
                <strong>{chapter.title}</strong>
                <small>{formatNumber(chapter.charCount)} ký tự</small>
                <em>{chapter.valid ? 'Hợp lệ' : chapter.error}</em>
              </div>
            ))}
          </section>
        )}

        {postedStory && (
          <div className="bulk-success-actions">
            <Link className="button small" to={`/truyen/${postedStory.slug}`}>Xem truyện</Link>
            <Link className="ghost" to="/admin">Quay lại admin</Link>
          </div>
        )}
      </section>

      <footer className="bulk-chapter-footer">
        <button type="button" className="ghost" onClick={clearDraft}>Xóa nháp</button>
        <div>
          <button type="button" className="ghost" onClick={checkChapters}>Kiểm tra</button>
          <button type="button" className="button" disabled={submitting || validChapters.length === 0 || invalidChapters.length > 0} onClick={submitChapters}>{submitting ? 'Đang đăng...' : 'Đăng chương'}</button>
        </div>
      </footer>
    </div>
  );
}

function StoryPublish() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const draftKey = 'daudo_story_publish_draft';
  const [categories] = useState(PUBLISH_STORY_CATEGORIES);
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
      const draft = JSON.parse(raw);
      const draftCategories = Array.isArray(draft.categories)
        ? draft.categories.filter(item => PUBLISH_STORY_CATEGORIES.includes(item))
        : [];
      setForm(prev => ({ ...prev, ...draft, categories: draftCategories.length ? draftCategories : prev.categories }));
    } catch {
      localStorage.removeItem(draftKey);
    }
  }, []);

  useEffect(() => {
    if (!draftEnabled) return;
    localStorage.setItem(draftKey, JSON.stringify(form));
  }, [form, draftEnabled]);

  const filteredCategories = categories.filter(item => item.toLowerCase().includes(search.toLowerCase()));

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
          <Link to="/dang-truyen/them-nhieu-chuong" className="button small">Thêm nhiều chương</Link>
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

          <section className="category-block publish-category-block">
            <h2>Thể loại</h2>
            <label>Chọn thể loại *</label>
            <input placeholder="Tìm kiếm thể loại..." value={search} onChange={e => setSearch(e.target.value)} />
            <div className="category-title">Đang chọn: {form.categories.length}/5</div>
            <div className="chip-wrap">
              {filteredCategories.map(item => (
                <button
                  type="button"
                  key={item}
                  className={form.categories.includes(item) ? 'chip active' : 'chip'}
                  onClick={() => toggleCategory(item)}
                >
                  {item}
                </button>
              ))}
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
  return (
    <>
      <PageSeo title="404 - Trang không tồn tại" description="Trang bạn đang tìm không tồn tại hoặc đã được chuyển sang địa chỉ khác." canonical="/404" />
      <div className="center-card"><h1>404</h1><p>Trang không tồn tại.</p><Link className="button" to="/">Về trang chủ</Link></div>
    </>
  );
}

function formatNumber(value = 0) {
  return Number(value).toLocaleString('vi-VN');
}

createRoot(document.getElementById('root')).render(<App />);
