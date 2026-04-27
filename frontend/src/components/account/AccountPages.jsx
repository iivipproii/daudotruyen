import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { mockStories } from '../../data/mockStories';

const coverFallback = '/images/cover-1.jpg';

const coinPackages = [
  { id: 'seed-10', seeds: 10, bonus: 0, price: 10000, label: 'Khởi đầu' },
  { id: 'seed-20', seeds: 20, bonus: 2, price: 20000, label: 'Cơ bản' },
  { id: 'seed-50', seeds: 50, bonus: 8, price: 50000, label: 'Phổ biến', featured: true },
  { id: 'seed-100', seeds: 100, bonus: 20, price: 100000, label: 'Tiết kiệm' },
  { id: 'seed-200', seeds: 200, bonus: 50, price: 200000, label: 'Giá trị nhất' },
  { id: 'seed-500', seeds: 500, bonus: 150, price: 500000, label: 'Cao cấp' }
];

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
    categories: Array.isArray(story.categories) ? story.categories.map(repairText) : []
  };
}

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function formatCurrency(value = 0) {
  return Number(value || 0).toLocaleString('vi-VN') + 'đ';
}

function formatDate(value) {
  if (!value) return 'Đang cập nhật';
  return new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getChapterCount(story = {}) {
  return story.chapterCount || story.chapterCountEstimate || story.latestChapter?.number || 0;
}

async function fetchSafe(apiClient, path, options) {
  if (!apiClient) return null;
  try {
    return await apiClient(path, options);
  } catch {
    return null;
  }
}

function emailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const usernamePattern = /^[a-z0-9._]{3,30}$/;

function gmailValid(email) {
  const value = String(email || '').trim().toLowerCase();
  return emailValid(value) && value.endsWith('@gmail.com');
}

function mockLibraryData() {
  const stories = mockStories.map(normalizeStory);
  return {
    bookmarks: stories.slice(0, 3),
    follows: stories.slice(4, 8),
    history: stories.slice(0, 6).map((story, index) => ({
      id: `history-${story.id}`,
      story,
      chapter: { number: index + 3, title: `Chương ${index + 3}: Đọc dở`, id: `chapter-${index}` },
      chapterNumber: index + 3,
      progress: 25 + index * 10,
      updatedAt: new Date(Date.now() - index * 86400000).toISOString()
    }))
  };
}

function normalizeLibrary(data) {
  const fallback = mockLibraryData();
  const bookmarks = (data?.bookmarks?.length ? data.bookmarks : fallback.bookmarks).map(normalizeStory);
  const follows = (data?.follows?.length ? data.follows : fallback.follows).map(normalizeStory);
  const history = (data?.history?.length ? data.history : fallback.history).map(item => ({
    ...item,
    story: normalizeStory(item.story || item),
    chapter: item.chapter || item.latestChapter || { number: item.chapterNumber || 1, title: 'Chương đang đọc' },
    progress: item.progress || Math.min(95, Math.max(12, Math.round(((item.chapterNumber || item.chapter?.number || 1) / Math.max(getChapterCount(item.story || item), 1)) * 100)))
  }));
  return { bookmarks, follows, history };
}

function chapterBookmarksFrom(library) {
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem('daudo_chapter_bookmarks') || '[]');
    } catch {
      return [];
    }
  })();
  const fromStoryBookmarks = library.bookmarks.map((story, index) => ({
    id: `story-bookmark-${story.id || story.slug}`,
    story,
    chapter: story.latestChapter || { number: Math.max(1, Math.min(getChapterCount(story), index + 1)), title: 'Chương đã lưu' },
    position: 35 + index * 12,
    savedAt: story.updatedAt || new Date().toISOString()
  }));
  return [...saved, ...fromStoryBookmarks].slice(0, 12);
}

export function LoginPage({ login }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage(null);
    const identifier = form.identifier.trim().toLowerCase();
    if (!identifier) return setMessage({ type: 'error', text: 'Vui lòng nhập tên đăng nhập hoặc Gmail.' });
    if (form.password.length < 6) return setMessage({ type: 'error', text: 'Mật khẩu tối thiểu 6 ký tự.' });
    setLoading(true);
    try {
      const user = await login(identifier, form.password);
      navigate(user.role === 'admin' ? '/admin' : '/account');
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  function socialMessage() {
    setMessage({ type: 'warning', text: 'Tính năng đăng nhập bằng Google/Facebook/Zalo đang được cấu hình.' });
  }

  return (
    <AuthShell mode="login">
      <div className="acct-auth-card">
        <AuthHeader title="Đăng nhập" subtitle="Tiếp tục đọc truyện, đồng bộ lịch sử và quản lý Đậu của bạn." />
        <form className="acct-auth-form" onSubmit={submit}>
          <label>Tên đăng nhập hoặc Gmail<input name="identifier" value={form.identifier} onChange={event => setForm({ ...form, identifier: event.target.value })} placeholder="ten-dang-nhap hoặc tenban@gmail.com" autoComplete="username" /></label>
          <label>Mật khẩu<span><Link to="/forgot-password">Quên mật khẩu?</Link></span><input name="password" type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} placeholder="Nhập mật khẩu" autoComplete="current-password" /></label>
          <AuthMessage message={message} />
          <button type="submit" disabled={loading}>{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
        </form>
        <div className="acct-auth-social" aria-label="Đăng nhập bằng cách khác">
          <span>Đăng nhập bằng cách khác</span>
          <div>
            <button type="button" onClick={socialMessage}>Google/Gmail</button>
            <button type="button" onClick={socialMessage}>Facebook</button>
            <button type="button" onClick={socialMessage}>Zalo</button>
          </div>
        </div>
        <p className="acct-auth-foot">Chưa có tài khoản? <Link to="/register">Đăng ký</Link></p>
      </div>
    </AuthShell>
  );
}

export function RegisterPage({ register }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', confirmPassword: '', agree: false });
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  function validate() {
    if (form.name.trim().length < 2) return 'Tên hiển thị cần ít nhất 2 ký tự.';
    if (!usernamePattern.test(form.username.trim().toLowerCase())) return 'Tên đăng nhập chỉ gồm chữ thường, số, dấu chấm hoặc gạch dưới, từ 3-30 ký tự.';
    if (!gmailValid(form.email)) return 'Gmail không hợp lệ hoặc không kết thúc bằng @gmail.com.';
    if (form.password.length < 6) return 'Mật khẩu tối thiểu 6 ký tự.';
    if (form.password !== form.confirmPassword) return 'Xác nhận mật khẩu chưa khớp.';
    if (!form.agree) return 'Bạn cần đồng ý điều khoản sử dụng.';
    return '';
  }

  async function submit(event) {
    event.preventDefault();
    setMessage(null);
    const error = validate();
    if (error) return setMessage({ type: 'error', text: error });
    setLoading(true);
    try {
      const user = await register({
        name: form.name.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        password: form.password
      });
      setMessage({ type: 'success', text: 'Tạo tài khoản thành công.' });
      setTimeout(() => navigate('/account'), 600);
      return user;
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="register">
      <div className="acct-auth-card">
        <AuthHeader title="Đăng ký" subtitle="Tạo tài khoản để lưu tủ truyện, nhận thông báo và bắt đầu xuất bản nếu bạn là tác giả." />
        <form className="acct-auth-form" onSubmit={submit}>
          <label>Tên hiển thị<input name="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Tên của bạn" autoComplete="name" /></label>
          <label>Tên đăng nhập<input name="username" value={form.username} onChange={event => setForm({ ...form, username: event.target.value.toLowerCase() })} placeholder="ten_dang_nhap" autoComplete="username" /></label>
          <label>Gmail<input name="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="tenban@gmail.com" autoComplete="email" /></label>
          <label>Mật khẩu<input name="password" type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} placeholder="Tối thiểu 6 ký tự" autoComplete="new-password" /></label>
          <label>Xác nhận mật khẩu<input name="confirmPassword" type="password" value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })} placeholder="Nhập lại mật khẩu" autoComplete="new-password" /></label>
          <label className="acct-check"><input name="agree" type="checkbox" checked={form.agree} onChange={event => setForm({ ...form, agree: event.target.checked })} /> Tôi đồng ý với <Link to="/dieu-khoan">Điều khoản</Link> và <Link to="/bao-mat">Chính sách bảo mật</Link></label>
          <AuthMessage message={message} />
          <button type="submit" disabled={loading}>{loading ? 'Đang tạo...' : 'Tạo tài khoản'}</button>
        </form>
        <p className="acct-auth-foot">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
      </div>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  function submit(event) {
    event.preventDefault();
    setError('');
    if (!gmailValid(email)) return setError('Gmail không hợp lệ.');
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 700);
  }
  return (
    <AuthShell mode="forgot">
      <div className="acct-auth-card">
        <AuthHeader title="Quên mật khẩu" subtitle="Nhập email tài khoản. Hệ thống sẽ hiển thị màn hình xác nhận đã gửi hướng dẫn." />
        {sent ? (
          <div className="acct-sent-state">
            <h2>Đã gửi hướng dẫn</h2>
            <p>Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi tới {email}.</p>
            <Link to="/login">Quay lại đăng nhập</Link>
          </div>
        ) : (
          <form className="acct-auth-form" onSubmit={submit}>
            <label>Gmail<input value={email} onChange={event => setEmail(event.target.value)} placeholder="tenban@gmail.com" /></label>
            {error && <div className="acct-error">{error}</div>}
            <button type="submit" disabled={loading}>{loading ? 'Đang gửi...' : 'Gửi hướng dẫn'}</button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}

function AuthShell({ children, mode }) {
  return (
    <div className={`acct-auth-page ${mode}`}>
      <Link className="acct-auth-brand" to="/"><img src="/images/logo.png" alt="Đậu Đỏ Truyện" /><span>Đậu Đỏ Truyện</span></Link>
      <div className="acct-auth-layout">
        <aside className="acct-auth-art">
          <span>Reader platform</span>
          <h1>Đọc truyện mượt hơn với tài khoản cá nhân</h1>
          <p>Lưu chương, theo dõi lịch sử, nạp Đậu an toàn và nhận thông báo chương mới.</p>
        </aside>
        {children}
      </div>
    </div>
  );
}

function AuthHeader({ title, subtitle }) {
  return <div className="acct-auth-head"><h1>{title}</h1><p>{subtitle}</p></div>;
}

function AuthMessage({ message }) {
  if (!message?.text) return null;
  const className = message.type === 'success' ? 'acct-success' : message.type === 'warning' ? 'acct-warning' : 'acct-error';
  return <div className={className}>{message.text}</div>;
}

export function ReaderDashboard({ user, apiClient }) {
  const [library, setLibrary] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      const [libraryData, notificationData] = await Promise.all([fetchSafe(apiClient, '/me/library'), fetchSafe(apiClient, '/notifications')]);
      if (!alive) return;
      setLibrary(normalizeLibrary(libraryData));
      setNotifications(notificationData?.notifications || []);
      if (!libraryData) setError('Không kết nối được API thư viện, đang hiển thị dữ liệu dự phòng.');
    }
    load();
    return () => {
      alive = false;
    };
  }, [apiClient]);

  if (!library) return <AccountLoading />;

  const completed = library.history.filter(item => item.progress >= 90).length;
  const stats = [
    ['Đang đọc', library.history.length],
    ['Yêu thích', library.bookmarks.length],
    ['Đã hoàn thành', completed],
    ['Đậu hiện có', user?.seeds || 0],
    ['Thông báo mới', notifications.filter(item => !item.read).length]
  ];

  return (
    <div className="acct-page">
      {error && <div className="acct-warning">{error}</div>}
      <section className="acct-dashboard-hero">
        <img src={user?.avatar || '/images/logo.png'} alt={user?.name || 'avatar'} />
        <div>
          <span>Tài khoản độc giả</span>
          <h1>Chào, {user?.name || 'độc giả'}</h1>
          <p>{user?.email} · Vai trò {user?.role === 'admin' ? 'admin' : localStorage.getItem('daudo_role_choice') === 'author' ? 'tác giả' : 'độc giả'}</p>
        </div>
              <Link to="/wallet">Nạp Đậu nhanh</Link>
      </section>
      <div className="acct-stat-grid">{stats.map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatNumber(value)}</strong></div>)}</div>
      <LibraryTabs library={library} />
      <section className="acct-two-col">
        <MyActivityPanel />
        <DevicePanel />
      </section>
    </div>
  );
}

export function LibraryTabs({ library }) {
  const [tab, setTab] = useState('reading');
  const tabs = [
    ['reading', 'Đang đọc', library.history.map(item => ({ story: item.story, chapter: item.chapter, progress: item.progress }))],
    ['bookmarks', 'Yêu thích', library.bookmarks.map(story => ({ story, chapter: story.latestChapter || { number: 1, title: 'Chương mới nhất' }, progress: 100 }))],
    ['completed', 'Hoàn thành', library.history.filter(item => item.progress >= 90).map(item => ({ story: item.story, chapter: item.chapter, progress: item.progress }))],
    ['follows', 'Theo dõi', library.follows.map(story => ({ story, chapter: story.latestChapter || { number: 1, title: 'Chương mới nhất' }, progress: 0 }))]
  ];
  const active = tabs.find(item => item[0] === tab) || tabs[0];
  return (
    <section className="acct-panel">
      <div className="acct-tabs">{tabs.map(([value, label, items]) => <button key={value} type="button" className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}<span>{items.length}</span></button>)}</div>
      <div className="acct-library-list">
        {active[2].length ? active[2].slice(0, 6).map(item => <LibraryMiniRow key={`${active[0]}-${item.story.id || item.story.slug}`} item={item} />) : <EmptyState title="Chưa có dữ liệu" text="Khi bạn đọc hoặc lưu truyện, dữ liệu sẽ xuất hiện tại đây." />}
      </div>
    </section>
  );
}

function LibraryMiniRow({ item }) {
  return (
    <Link className="acct-library-mini" to={`/truyen/${item.story.slug}/chuong/${item.chapter?.number || 1}`}>
      <img src={item.story.cover || coverFallback} alt={item.story.title} loading="lazy" onError={handleImageError} />
      <span><strong>{item.story.title}</strong><small>{item.chapter?.title || 'Chương đang đọc'}</small><em><i style={{ width: `${Math.min(100, item.progress || 8)}%` }} /></em></span>
      <b>Đọc tiếp</b>
    </Link>
  );
}

function MyActivityPanel() {
  return (
    <section className="acct-panel">
      <h2>Đánh giá & bình luận của tôi</h2>
      <div className="acct-activity-list">
        <p><b>Review mới nhất</b><span>Bạn chưa có review công khai trong phiên này.</span></p>
        <p><b>Bình luận</b><span>Quản lý bình luận sẽ đồng bộ khi backend có endpoint riêng.</span></p>
      </div>
    </section>
  );
}

function DevicePanel() {
  return (
    <section className="acct-panel">
      <h2>Thiết bị đăng nhập</h2>
      <div className="acct-device-list">
        <p><b>Windows · Chrome</b><span>Thiết bị hiện tại · UI mock</span></p>
        <p><b>Mobile browser</b><span>Đã đăng nhập gần đây · UI mock</span></p>
      </div>
    </section>
  );
}

export function BookmarksPage({ apiClient }) {
  const [items, setItems] = useState(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let alive = true;
    fetchSafe(apiClient, '/me/library').then(data => {
      if (!alive) return;
      setItems(chapterBookmarksFrom(normalizeLibrary(data)));
    });
    return () => {
      alive = false;
    };
  }, [apiClient]);
  if (!items) return <AccountLoading />;
  function remove(id) {
    setItems(current => current.filter(item => item.id !== id));
    setNotice('Đã xóa bookmark khỏi phiên hiện tại.');
  }
  return (
    <div className="acct-page">
      {notice && <div className="acct-success">{notice}</div>}
      <PageHead title="Bookmarks chương" subtitle="Danh sách chương đã lưu, vị trí đọc và ngày lưu." />
      {items.length ? <div className="acct-bookmark-list">{items.map(item => <BookmarkRow key={item.id} item={item} onRemove={() => remove(item.id)} />)}</div> : <EmptyState title="Chưa có bookmark" text="Khi bạn bookmark chương trong trang đọc, chương đó sẽ xuất hiện tại đây." />}
    </div>
  );
}

function BookmarkRow({ item, onRemove }) {
  return (
    <article className="acct-bookmark-row">
      <img src={item.story.cover || coverFallback} alt={item.story.title} loading="lazy" onError={handleImageError} />
      <div>
        <h3>{item.story.title}</h3>
        <p>{item.chapter?.title || `Chương ${item.chapter?.number || 1}`} · Vị trí đọc {item.position || 20}%</p>
        <em>Lưu lúc {formatDate(item.savedAt)}</em>
        <span><i style={{ width: `${Math.min(100, item.position || 20)}%` }} /></span>
      </div>
      <Link to={`/truyen/${item.story.slug}/chuong/${item.chapter?.number || 1}`}>Đọc tiếp</Link>
      <button type="button" onClick={onRemove}>Xóa</button>
    </article>
  );
}

export function ReadingHistoryPage({ apiClient }) {
  const [items, setItems] = useState(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let alive = true;
    fetchSafe(apiClient, '/me/library').then(data => {
      if (!alive) return;
      setItems(normalizeLibrary(data).history);
    });
    return () => {
      alive = false;
    };
  }, [apiClient]);
  if (!items) return <AccountLoading />;
  function remove(id) {
    setItems(current => current.filter(item => item.id !== id));
    setNotice('Đã xóa lịch sử khỏi phiên hiện tại.');
  }
  return (
    <div className="acct-page">
      {notice && <div className="acct-success">{notice}</div>}
      <PageHead title="Reading history" subtitle="Theo dõi truyện/chương đã đọc và tiến trình đọc gần đây." />
      <ReadingStatsChart items={items} />
      {items.length ? <div className="acct-history-list">{items.map(item => <HistoryRow key={item.id} item={item} onRemove={() => remove(item.id)} />)}</div> : <EmptyState title="Chưa có lịch sử đọc" text="Lịch sử sẽ được lưu tự động khi bạn đọc chương." />}
    </div>
  );
}

function HistoryRow({ item, onRemove }) {
  return (
    <article className="acct-history-row">
      <img src={item.story.cover || coverFallback} alt={item.story.title} loading="lazy" onError={handleImageError} />
      <div>
        <h3>{item.story.title}</h3>
        <p>{item.chapter?.title || `Chương ${item.chapterNumber || 1}`}</p>
        <span><i style={{ width: `${Math.min(100, item.progress || 12)}%` }} /></span>
        <small>{item.progress || 12}% · {formatDate(item.updatedAt)}</small>
      </div>
      <Link to={`/truyen/${item.story.slug}/chuong/${item.chapter?.number || item.chapterNumber || 1}`}>Tiếp tục đọc</Link>
      <button type="button" onClick={onRemove}>Xóa</button>
    </article>
  );
}

export function ReadingStatsChart({ items }) {
  const bars = useMemo(() => {
    return Array.from({ length: 7 }).map((_, index) => {
      const value = Math.max(1, items.filter((_, itemIndex) => itemIndex % 7 === index).length + index % 3);
      return { label: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][index], value };
    });
  }, [items]);
  const max = Math.max(...bars.map(item => item.value), 1);
  return (
    <section className="acct-panel">
      <div className="acct-chart-head"><h2>Thống kê đọc tuần này</h2><p>{items.length} chương/truyện trong lịch sử</p></div>
      <div className="acct-chart">{bars.map(item => <span key={item.label}><i style={{ height: `${Math.max(18, item.value / max * 100)}%` }} /><b>{item.label}</b></span>)}</div>
    </section>
  );
}

export function WalletPage({ user, updateUser, apiClient }) {
  const [selected, setSelected] = useState('seed-50');
  const [method, setMethod] = useState('momo');
  const [voucher, setVoucher] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(user?.seeds || 0);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    const data = await fetchSafe(apiClient, '/wallet/transactions');
    setTransactions(data?.transactions || mockTransactions());
    setBalance(data?.balance ?? user?.seeds ?? 0);
  }

  useEffect(() => {
    load();
  }, [apiClient, user?.seeds]);

  const selectedPack = coinPackages.find(pack => pack.id === selected) || coinPackages[2];
  const discount = voucher.trim().toUpperCase() === 'DAUDO10' ? Math.round(selectedPack.price * .1) : 0;

  async function topup() {
    setLoading(true);
    setNotice('');
    const result = await fetchSafe(apiClient, '/wallet/topup', { method: 'POST', body: JSON.stringify({ packageId: selected }) });
    if (result?.user) {
      updateUser?.(result.user);
      setBalance(result.user.seeds);
      setNotice('Nạp Đậu thành công. Số dư đã được cập nhật.');
      await load();
    } else {
      setNotice('Yêu cầu thanh toán đã được tạo ở trạng thái chờ thanh toán.');
      setTransactions(current => [{
        id: `mock-${Date.now()}`,
        code: `DD${Date.now().toString().slice(-6)}`,
        type: 'topup',
        amount: selectedPack.seeds + selectedPack.bonus,
        money: selectedPack.price - discount,
        status: 'pending',
        note: `Nạp ${selectedPack.seeds + selectedPack.bonus} Đậu qua ${method}`,
        createdAt: new Date().toISOString()
      }, ...current]);
    }
    setLoading(false);
  }

  return (
    <div className="acct-page">
      {notice && <div className="acct-success">{notice}</div>}
      <PageHead title="Ví Đậu của tôi" subtitle="Nạp Đậu để mở khóa chương VIP và mua combo truyện." action={<strong className="acct-balance">{formatNumber(balance)} Đậu</strong>} />
      <div className="acct-coin-grid">{coinPackages.map(pack => <CoinPackageCard key={pack.id} pack={pack} active={selected === pack.id} onSelect={() => setSelected(pack.id)} />)}</div>
      <section className="acct-panel acct-payment-panel">
        <h2>Thanh toán an toàn</h2>
        <div className="acct-methods">{[['momo', 'MoMo'], ['vnpay', 'VNPay'], ['zalopay', 'ZaloPay'], ['bank', 'Chuyển khoản']].map(([value, label]) => <button key={value} type="button" className={method === value ? 'active' : ''} onClick={() => setMethod(value)}>{label}</button>)}</div>
        <label>Mã giảm giá<input value={voucher} onChange={event => setVoucher(event.target.value)} placeholder="Thử DAUDO10" /></label>
        <div className="acct-payment-summary"><span>Gói nạp</span><b>{selectedPack.seeds + selectedPack.bonus} Đậu</b><span>Giảm giá</span><b>{formatCurrency(discount)}</b><span>Cần thanh toán</span><strong>{formatCurrency(selectedPack.price - discount)}</strong></div>
        <button type="button" disabled={loading} onClick={topup}>{loading ? 'Đang xử lý...' : 'Nạp Đậu ngay'}</button>
        <p>Khi backend thanh toán sẵn sàng, thao tác này sẽ đồng bộ qua endpoint `/wallet/topup`.</p>
      </section>
      <PaymentHistory transactions={transactions} />
    </div>
  );
}

export function CoinPackageCard({ pack, active, onSelect }) {
  return (
    <button type="button" className={active ? 'acct-coin-card active' : 'acct-coin-card'} onClick={onSelect}>
      {pack.featured && <em>Phổ biến</em>}
              <strong>{pack.seeds + pack.bonus}<span>Đậu</span></strong>
              <p>{pack.bonus ? `Bao gồm ${pack.bonus} Đậu bonus` : 'Không bonus'}</p>
      <b>{formatCurrency(pack.price)}</b>
      <small>{pack.label}</small>
    </button>
  );
}

export function PaymentHistory({ transactions }) {
  return (
    <section className="acct-panel">
      <h2>Lịch sử giao dịch</h2>
      <div className="acct-payment-history">
            <div className="header"><span>Mã</span><span>Thời gian</span><span>Số tiền</span><span>Đậu</span><span>Trạng thái</span></div>
        {transactions.map(txn => {
          const code = txn.code || txn.id || `TXN-${Date.now()}`;
          const status = txn.status || (txn.amount > 0 ? 'success' : 'success');
          return (
            <div key={code}>
              <span>{code}</span>
              <span>{formatDate(txn.createdAt)}</span>
              <span>{txn.money ? formatCurrency(txn.money) : txn.amount < 0 ? '-' : formatCurrency(Math.abs(txn.amount || 0) * 1000)}</span>
                <span>{txn.amount > 0 ? '+' : ''}{formatNumber(txn.amount)} Đậu</span>
              <b className={status}>{status === 'pending' ? 'Chờ thanh toán' : status === 'failed' ? 'Thất bại' : 'Thành công'}</b>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const settingsNav = [
  ['profile', 'Hồ sơ'],
  ['security', 'Bảo mật'],
  ['notifications', 'Thông báo'],
  ['privacy', 'Quyền riêng tư'],
  ['appearance', 'Giao diện'],
  ['danger', 'Vùng nguy hiểm']
];

const notificationPreferenceFields = [
  ['emailNotifications', 'Email thông báo'],
  ['chapterNotifications', 'Chương mới từ truyện đang theo dõi'],
  ['commentNotifications', 'Bình luận và trả lời'],
  ['followNotifications', 'Người theo dõi mới'],
  ['promoNotifications', 'Khuyến mãi và ưu đãi'],
  ['systemNotifications', 'Thông báo hệ thống']
];

const privacyPreferenceFields = [
  ['publicReading', 'Công khai truyện đang đọc'],
  ['publicProfile', 'Công khai hồ sơ cá nhân'],
  ['publicBookmarks', 'Công khai truyện đã lưu'],
  ['publicFollows', 'Công khai danh sách theo dõi'],
  ['publicComments', 'Công khai bình luận']
];

const profilePatchFields = ['name', 'email', 'phone', 'birthday', 'gender', 'address', 'bio'];
const avatarFileTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const avatarAccept = 'image/png,image/jpeg,image/webp';
const avatarMaxBytes = 2 * 1024 * 1024;

function isAvatarValue(value) {
  return Boolean(value) && /^https?:\/\//i.test(value);
}

function validateAvatarFile(file) {
  if (!file) return 'Vui lòng chọn ảnh đại diện.';
  if (!avatarFileTypes.has(file.type)) return 'File không hợp lệ. Chỉ chấp nhận PNG, JPG hoặc WEBP.';
  if (file.size > avatarMaxBytes) return 'Ảnh quá lớn. Vui lòng chọn ảnh tối đa 2MB.';
  return '';
}

function defaultSettingsProfile(user = {}) {
  return {
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    birthday: user?.birthday || '',
    gender: user?.gender || '',
    address: user?.address || '',
    bio: user?.bio || '',
    avatar: isAvatarValue(user?.avatar) ? user.avatar : ''
  };
}

function normalizeSettingsProfile(data, user) {
  const profile = data?.profile || {};
  return {
    ...defaultSettingsProfile(user),
    name: profile.name ?? user?.name ?? '',
    email: profile.email ?? user?.email ?? '',
    phone: profile.phone ?? user?.phone ?? '',
    birthday: profile.birthday ?? user?.birthday ?? '',
    gender: profile.gender ?? user?.gender ?? '',
    address: profile.address ?? user?.address ?? '',
    bio: profile.bio ?? user?.bio ?? '',
    avatar: isAvatarValue(profile.avatar) ? profile.avatar : ''
  };
}

function defaultSettingsPreferences(theme = 'light') {
  return {
    emailNotifications: true,
    chapterNotifications: true,
    commentNotifications: true,
    followNotifications: true,
    promoNotifications: true,
    systemNotifications: true,
    publicReading: false,
    publicProfile: true,
    publicBookmarks: false,
    publicFollows: true,
    publicComments: true,
    theme: theme === 'dark' ? 'dark' : 'light',
    language: 'vi',
    readerFontSize: 18,
    readerLineHeight: 1.8,
    readerBackground: 'default'
  };
}

function SettingsMessage({ state }) {
  if (!state?.text) return null;
  const className = state.type === 'error' ? 'acct-error' : state.type === 'warning' ? 'acct-warning' : 'acct-success';
  return <div className={className}>{state.text}</div>;
}

function EyeIcon({ visible }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.4 12s3.4-6 9.6-6 9.6 6 9.6 6-3.4 6-9.6 6-9.6-6-9.6-6Z" />
      <circle cx="12" cy="12" r="3" />
      {visible ? null : <path d="M4 4l16 16" />}
    </svg>
  );
}

function PasswordField({ label, value, onChange, autoComplete, visible, onToggle }) {
  return (
    <label className="acct-password-field">
      <span>{label}</span>
      <div className="acct-password-wrap">
        <input
          required
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
        <button type="button" className="acct-password-toggle" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={onToggle}>
          <EyeIcon visible={visible} />
        </button>
      </div>
    </label>
  );
}

export function AccountSettings({ user, updateUser, logout, theme, toggleTheme, apiClient }) {
  const navigate = useNavigate();
  const location = useLocation();
  const syncedThemeRef = useRef(false);
  const avatarInputRef = useRef(null);
  const [profile, setProfile] = useState(() => defaultSettingsProfile(user));
  const [savedProfile, setSavedProfile] = useState(() => defaultSettingsProfile(user));
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordVisible, setPasswordVisible] = useState({ currentPassword: false, newPassword: false, confirmPassword: false });
  const [prefs, setPrefs] = useState(() => defaultSettingsPreferences(theme));
  const [danger, setDanger] = useState({ password: '', phrase: '' });
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState({});
  const [savingDanger, setSavingDanger] = useState(false);
  const [savingLogoutAll, setSavingLogoutAll] = useState(false);
  const [avatarReading, setAvatarReading] = useState(false);
  const [draggingAvatar, setDraggingAvatar] = useState(false);
  const [messages, setMessages] = useState({});

  function setMessage(section, type, text) {
    setMessages(current => ({ ...current, [section]: { type, text } }));
  }

  async function loadSettings() {
    if (!apiClient) {
      setLoadError('Không có API client để tải cài đặt.');
      setInitialLoading(false);
      return;
    }
    setInitialLoading(true);
    setLoadError('');
    try {
      const [profileData, preferenceData] = await Promise.all([
        apiClient('/me/profile'),
        apiClient('/me/preferences')
      ]);
      const normalizedProfile = normalizeSettingsProfile(profileData, user);
      setProfile(normalizedProfile);
      setSavedProfile(normalizedProfile);
      const nextPrefs = { ...defaultSettingsPreferences(theme), ...(preferenceData.preferences || {}) };
      setPrefs(nextPrefs);
      if (!syncedThemeRef.current && ['light', 'dark'].includes(nextPrefs.theme) && nextPrefs.theme !== theme) {
        syncedThemeRef.current = true;
        toggleTheme?.();
      }
      if (profileData.user) updateUser?.(profileData.user);
    } catch (err) {
      setLoadError(err.message || 'Không tải được cài đặt tài khoản.');
    } finally {
      setInitialLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, [apiClient]);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const timer = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => clearTimeout(timer);
  }, [location.hash, initialLoading]);

  function patchProfile(next) {
    setProfile(current => ({ ...current, ...next }));
  }

  function profilePatchPayload() {
    return profilePatchFields.reduce((payload, key) => {
      const value = profile[key] ?? '';
      if (value !== (savedProfile[key] ?? '')) payload[key] = value;
      return payload;
    }, {});
  }

  function togglePasswordField(key) {
    setPasswordVisible(current => ({ ...current, [key]: !current[key] }));
  }

  async function handleAvatarFile(file) {
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setMessage('avatar', 'error', validationError);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }
    setMessage('avatar', 'warning', 'Đang tải ảnh lên storage...');
    setAvatarReading(true);
    setSavingAvatar(true);
    try {
      const body = new FormData();
      body.append('avatar', file);
      const result = await apiClient('/me/avatar', {
        method: 'POST',
        body
      });
      const normalizedProfile = normalizeSettingsProfile(result, result.user || user);
      setProfile(normalizedProfile);
      setSavedProfile(normalizedProfile);
      if (result.user) updateUser?.(result.user);
      setMessage('avatar', 'success', 'Đã tải lên và lưu ảnh đại diện.');
    } catch (err) {
      setMessage('avatar', 'error', err.message || 'Không tải được ảnh.');
    } finally {
      setAvatarReading(false);
      setSavingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  }

  function handleAvatarInput(event) {
    handleAvatarFile(event.target.files?.[0]);
  }

  function handleAvatarDrop(event) {
    event.preventDefault();
    setDraggingAvatar(false);
    handleAvatarFile(event.dataTransfer.files?.[0]);
  }

  function clearAvatar() {
    patchProfile({ avatar: '' });
    setMessage('avatar', 'warning', 'Ảnh đại diện đã được đặt về mặc định. Bấm lưu để cập nhật.');
  }

  async function saveProfile(event) {
    event.preventDefault();
    const payload = profilePatchPayload();
    if (!Object.keys(payload).length) {
      setMessage('profile', 'success', 'Hồ sơ đã được cập nhật.');
      return;
    }
    setSavingProfile(true);
    setMessage('profile', '', '');
    try {
      const result = await apiClient('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      const normalizedProfile = normalizeSettingsProfile(result, result.user || user);
      setProfile(normalizedProfile);
      setSavedProfile(normalizedProfile);
      if (result.user) updateUser?.(result.user);
      setMessage('profile', 'success', 'Đã lưu hồ sơ. Dữ liệu sẽ được giữ sau khi tải lại trang.');
    } catch (err) {
      setMessage('profile', 'error', err.message || 'Không lưu được hồ sơ.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveAvatar(event) {
    event.preventDefault();
    setSavingAvatar(true);
    setMessage('avatar', '', '');
    try {
      const result = await apiClient('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ avatar: profile.avatar || '' })
      });
      const normalizedProfile = normalizeSettingsProfile(result, result.user || user);
      setProfile(normalizedProfile);
      setSavedProfile(normalizedProfile);
      if (result.user) updateUser?.(result.user);
      setMessage('avatar', 'success', 'Đã lưu ảnh đại diện.');
    } catch (err) {
      setMessage('avatar', 'error', err.message || 'Không lưu được ảnh đại diện.');
    } finally {
      setSavingAvatar(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setSavingPassword(true);
    setMessage('password', '', '');
    try {
      await apiClient('/me/password', {
        method: 'POST',
        body: JSON.stringify(password)
      });
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('password', 'success', 'Đã đổi mật khẩu và ghi nhận thông báo bảo mật.');
    } catch (err) {
      setMessage('password', 'error', err.message || 'Không đổi được mật khẩu.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function updatePreference(key, value) {
    const previous = prefs[key];
    setPrefs(current => ({ ...current, [key]: value }));
    setSavingPreferences(current => ({ ...current, [key]: true }));
    setMessage('preferences', '', '');
    try {
      const result = await apiClient('/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ [key]: value })
      });
      setPrefs(current => ({ ...current, ...(result.preferences || {}) }));
      if (result.user) updateUser?.(result.user);
      setMessage('preferences', 'success', 'Đã lưu cài đặt.');
    } catch (err) {
      setPrefs(current => ({ ...current, [key]: previous }));
      setMessage('preferences', 'error', err.message || 'Không lưu được cài đặt. Thay đổi đã được hoàn tác.');
    } finally {
      setSavingPreferences(current => ({ ...current, [key]: false }));
    }
  }

  async function updateThemePreference(value) {
    const previous = prefs.theme;
    setPrefs(current => ({ ...current, theme: value }));
    setSavingPreferences(current => ({ ...current, theme: true }));
    setMessage('preferences', '', '');
    try {
      const result = await apiClient('/me/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ theme: value })
      });
      setPrefs(current => ({ ...current, ...(result.preferences || {}) }));
      if (value !== theme) toggleTheme?.();
      if (result.user) updateUser?.(result.user);
      setMessage('preferences', 'success', 'Đã lưu giao diện.');
    } catch (err) {
      setPrefs(current => ({ ...current, theme: previous }));
      setMessage('preferences', 'error', err.message || 'Không lưu được giao diện. Thay đổi đã được hoàn tác.');
    } finally {
      setSavingPreferences(current => ({ ...current, theme: false }));
    }
  }

  async function logoutEverywhere() {
    setSavingLogoutAll(true);
    setMessage('danger', '', '');
    try {
      await apiClient('/me/logout-all', { method: 'POST' });
      logout?.();
      navigate('/dang-nhap', { replace: true });
    } catch (err) {
      setMessage('danger', 'error', err.message || 'Không đăng xuất được các thiết bị.');
      setSavingLogoutAll(false);
    }
  }

  async function deactivateAccount(event) {
    event.preventDefault();
    setSavingDanger(true);
    setMessage('danger', '', '');
    try {
      await apiClient('/me/deactivate', {
        method: 'POST',
        body: JSON.stringify({ password: danger.password })
      });
      logout?.();
      navigate('/dang-nhap', { replace: true });
    } catch (err) {
      setMessage('danger', 'error', err.message || 'Không vô hiệu hóa được tài khoản.');
      setSavingDanger(false);
    }
  }

  if (initialLoading) {
    return (
      <div className="acct-page">
        <PageHead title="Cài đặt tài khoản" subtitle="Đang tải hồ sơ, bảo mật, thông báo và quyền riêng tư." />
        <AccountLoading />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="acct-page">
        <PageHead title="Cài đặt tài khoản" subtitle="Không thể tải dữ liệu cài đặt từ backend." />
        <div className="acct-panel acct-settings-error">
          <h2>Không tải được cài đặt</h2>
          <p>{loadError}</p>
          <button type="button" onClick={loadSettings}>Thử lại</button>
        </div>
      </div>
    );
  }

  return (
    <div className="acct-page acct-settings-page">
      <PageHead title="Cài đặt tài khoản" subtitle="Quản lý hồ sơ, bảo mật, thông báo, quyền riêng tư và trải nghiệm đọc." />
      <nav className="acct-settings-nav" aria-label="Điều hướng cài đặt">
        {settingsNav.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
      </nav>

      <section id="profile" className="acct-settings-profile-grid">
        <form className="acct-panel acct-settings-section acct-settings-form acct-avatar-card" onSubmit={saveAvatar}>
          <div className="acct-settings-section-head">
            <span>Ảnh đại diện</span>
            <h2>Avatar tài khoản</h2>
          </div>
          <SettingsMessage state={messages.avatar} />
          <div
            className={`acct-avatar-uploader${draggingAvatar ? ' dragging' : ''}`}
            role="button"
            tabIndex="0"
            aria-label="Chọn hoặc kéo thả ảnh đại diện"
            onClick={() => avatarInputRef.current?.click()}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                avatarInputRef.current?.click();
              }
            }}
            onDragEnter={event => {
              event.preventDefault();
              setDraggingAvatar(true);
            }}
            onDragOver={event => {
              event.preventDefault();
              setDraggingAvatar(true);
            }}
            onDragLeave={() => setDraggingAvatar(false)}
            onDrop={handleAvatarDrop}
          >
            <img
              src={profile.avatar || '/images/logo.png'}
              alt="Ảnh đại diện hiện tại"
              onError={event => { event.currentTarget.src = '/images/logo.png'; }}
            />
            <input ref={avatarInputRef} hidden type="file" accept={avatarAccept} onChange={handleAvatarInput} />
            <div>
              <strong>{avatarReading ? 'Đang tải ảnh...' : 'Kéo thả ảnh vào đây'}</strong>
              <small>PNG, JPG hoặc WEBP, tối đa 2MB.</small>
            </div>
          </div>
          <div className="acct-avatar-actions">
            <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarReading || savingAvatar}>Đổi ảnh</button>
            <button type="button" className="ghost" onClick={clearAvatar} disabled={avatarReading || savingAvatar}>Xóa ảnh</button>
          </div>
          <button type="submit" disabled={avatarReading || savingAvatar}>{savingAvatar ? 'Đang lưu...' : 'Lưu ảnh đại diện'}</button>
        </form>

        <form className="acct-panel acct-settings-section acct-settings-form" onSubmit={saveProfile}>
          <div className="acct-settings-section-head">
            <span>Hồ sơ cá nhân</span>
            <h2>Thông tin công khai và liên hệ</h2>
          </div>
          <SettingsMessage state={messages.profile} />
          <div className="acct-settings-fields two">
            <label>Tên hiển thị<input required maxLength="80" value={profile.name} onChange={event => patchProfile({ name: event.target.value })} /></label>
            <label>Email<input required type="email" value={profile.email} onChange={event => patchProfile({ email: event.target.value })} /></label>
            <label>Số điện thoại<input value={profile.phone} onChange={event => patchProfile({ phone: event.target.value })} placeholder="+84..." /></label>
            <label>Ngày sinh<input type="date" value={profile.birthday} onChange={event => patchProfile({ birthday: event.target.value })} /></label>
            <label>Giới tính<select value={profile.gender} onChange={event => patchProfile({ gender: event.target.value })}><option value="">Chưa chọn</option><option value="female">Nữ</option><option value="male">Nam</option><option value="other">Khác</option><option value="prefer-not">Không công khai</option></select></label>
          </div>
          <label>Địa chỉ<input maxLength="200" value={profile.address} onChange={event => patchProfile({ address: event.target.value })} placeholder="Tỉnh/thành phố hoặc địa chỉ liên hệ" /></label>
          <label>Giới thiệu<textarea maxLength="500" rows="5" value={profile.bio} onChange={event => patchProfile({ bio: event.target.value })} placeholder="Viết ngắn gọn về bạn" /></label>
          <button type="submit" disabled={savingProfile}>{savingProfile ? 'Đang lưu...' : 'Lưu hồ sơ'}</button>
        </form>
      </section>

      <form id="security" className="acct-panel acct-settings-section acct-settings-form" onSubmit={savePassword}>
        <div className="acct-settings-section-head">
          <span>Bảo mật</span>
          <h2>Đổi mật khẩu</h2>
        </div>
        <SettingsMessage state={messages.password} />
        <div className="acct-password-policy" aria-live="polite">
          <strong>Chính sách mật khẩu</strong>
          <p>Mật khẩu mới cần tối thiểu 6 ký tự. Mật khẩu mới không được trùng mật khẩu hiện tại.</p>
        </div>
        <div className="acct-settings-fields three">
          <PasswordField
            label="Mật khẩu hiện tại"
            autoComplete="current-password"
            value={password.currentPassword}
            visible={passwordVisible.currentPassword}
            onToggle={() => togglePasswordField('currentPassword')}
            onChange={value => setPassword(current => ({ ...current, currentPassword: value }))}
          />
          <PasswordField
            label="Mật khẩu mới"
            autoComplete="new-password"
            value={password.newPassword}
            visible={passwordVisible.newPassword}
            onToggle={() => togglePasswordField('newPassword')}
            onChange={value => setPassword(current => ({ ...current, newPassword: value }))}
          />
          <PasswordField
            label="Nhập lại mật khẩu mới"
            autoComplete="new-password"
            value={password.confirmPassword}
            visible={passwordVisible.confirmPassword}
            onToggle={() => togglePasswordField('confirmPassword')}
            onChange={value => setPassword(current => ({ ...current, confirmPassword: value }))}
          />
        </div>
        <button type="submit" disabled={savingPassword}>{savingPassword ? 'Đang đổi...' : 'Đổi mật khẩu'}</button>
      </form>

      <section id="notifications" className="acct-panel acct-settings-section acct-settings-form">
        <div className="acct-settings-section-head">
          <span>Thông báo</span>
          <h2>Kênh và loại thông báo</h2>
        </div>
        <SettingsMessage state={messages.preferences} />
        <div className="acct-toggle-list">
          {notificationPreferenceFields.map(([key, label]) => (
            <label className="acct-switch acct-toggle-row" key={key}>
              <input type="checkbox" checked={Boolean(prefs[key])} disabled={Boolean(savingPreferences[key])} aria-label={label} onChange={event => updatePreference(key, event.target.checked)} />
              <span><b>{label}</b><small>{savingPreferences[key] ? 'Đang lưu...' : prefs[key] ? 'Đang bật' : 'Đang tắt'}</small></span>
            </label>
          ))}
        </div>
      </section>

      <section id="privacy" className="acct-panel acct-settings-section acct-settings-form">
        <div className="acct-settings-section-head">
          <span>Quyền riêng tư</span>
          <h2>Kiểm soát dữ liệu hiển thị công khai</h2>
        </div>
        <SettingsMessage state={messages.preferences} />
        <div className="acct-toggle-list">
          {privacyPreferenceFields.map(([key, label]) => (
            <label className="acct-switch acct-toggle-row" key={key}>
              <input type="checkbox" checked={Boolean(prefs[key])} disabled={Boolean(savingPreferences[key])} aria-label={label} onChange={event => updatePreference(key, event.target.checked)} />
              <span><b>{label}</b><small>{savingPreferences[key] ? 'Đang lưu...' : prefs[key] ? 'Công khai' : 'Riêng tư'}</small></span>
            </label>
          ))}
        </div>
      </section>

      <section id="appearance" className="acct-panel acct-settings-section acct-settings-form">
        <div className="acct-settings-section-head">
          <span>Giao diện/đọc truyện</span>
          <h2>Trải nghiệm hiển thị</h2>
        </div>
        <SettingsMessage state={messages.preferences} />
        <div className="acct-settings-fields two">
          <label>Chủ đề<select value={theme === 'dark' ? 'dark' : 'light'} disabled={Boolean(savingPreferences.theme)} onChange={event => updateThemePreference(event.target.value)}><option value="light">Sáng</option><option value="dark">Tối</option></select></label>
          <label>Ngôn ngữ<select value={prefs.language} disabled={Boolean(savingPreferences.language)} onChange={event => updatePreference('language', event.target.value)}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>
          <label>Cỡ chữ đọc truyện<input type="range" min="14" max="28" value={prefs.readerFontSize} disabled={Boolean(savingPreferences.readerFontSize)} onChange={event => updatePreference('readerFontSize', Number(event.target.value))} /><small>{prefs.readerFontSize}px</small></label>
          <label>Khoảng dòng<input type="range" min="1.4" max="2.4" step="0.1" value={prefs.readerLineHeight} disabled={Boolean(savingPreferences.readerLineHeight)} onChange={event => updatePreference('readerLineHeight', Number(event.target.value))} /><small>{prefs.readerLineHeight}</small></label>
          <label>Nền đọc<select value={prefs.readerBackground} disabled={Boolean(savingPreferences.readerBackground)} onChange={event => updatePreference('readerBackground', event.target.value)}><option value="default">Mặc định</option><option value="paper">Giấy</option><option value="sepia">Sepia</option><option value="night">Đêm</option></select></label>
        </div>
      </section>

      <section id="danger" className="acct-panel acct-settings-section acct-settings-form acct-danger-zone">
        <div className="acct-settings-section-head">
          <span>Vùng nguy hiểm</span>
          <h2>Phiên đăng nhập và trạng thái tài khoản</h2>
        </div>
        <SettingsMessage state={messages.danger} />
        <div className="acct-danger-actions">
          <div>
            <h3>Đăng xuất mọi thiết bị</h3>
            <p>Thu hồi token hiện tại và các phiên cũ bằng cách tăng phiên bản đăng nhập của tài khoản.</p>
            <button type="button" className="danger" disabled={savingLogoutAll} onClick={logoutEverywhere}>{savingLogoutAll ? 'Đang đăng xuất...' : 'Đăng xuất mọi thiết bị'}</button>
          </div>
          <form onSubmit={deactivateAccount}>
            <h3>Vô hiệu hóa tài khoản</h3>
            <p>Tài khoản sẽ bị khóa đăng nhập. Dữ liệu nội dung không bị xóa cứng trong thao tác này.</p>
            <label>Mật khẩu xác nhận<input type="password" value={danger.password} onChange={event => setDanger({ ...danger, password: event.target.value })} /></label>
            <label>Nhập VO HIEU HOA<input value={danger.phrase} onChange={event => setDanger({ ...danger, phrase: event.target.value })} /></label>
            <button type="submit" className="danger" disabled={savingDanger || danger.phrase !== 'VO HIEU HOA' || !danger.password}>{savingDanger ? 'Đang xử lý...' : 'Vô hiệu hóa tài khoản'}</button>
          </form>
        </div>
      </section>
    </div>
  );
}

function PageHead({ title, subtitle, action }) {
  return (
    <section className="acct-page-head">
      <div><span>Account</span><h1>{title}</h1><p>{subtitle}</p></div>
      {action}
    </section>
  );
}

function EmptyState({ title, text }) {
  return <div className="acct-empty"><h3>{title}</h3><p>{text}</p></div>;
}

function AccountLoading() {
  return <div className="acct-loading">{Array.from({ length: 4 }).map((_, index) => <span key={index} />)}</div>;
}

function mockTransactions() {
  return [
    { id: 'TXN-LOCAL-1', code: 'DD102938', type: 'topup', amount: 58, money: 50000, status: 'success', note: 'Nạp gói phổ biến', createdAt: new Date().toISOString() },
    { id: 'TXN-LOCAL-2', code: 'DD102120', type: 'purchase', amount: -8, money: 8000, status: 'success', note: 'Mua chương VIP', createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 'TXN-LOCAL-3', code: 'DD100001', type: 'topup', amount: 22, money: 20000, status: 'failed', note: 'Thanh toán lỗi', createdAt: new Date(Date.now() - 172800000).toISOString() }
  ];
}

function handleImageError(event) {
  if (event.currentTarget.src.endsWith(coverFallback)) return;
  event.currentTarget.src = coverFallback;
}
