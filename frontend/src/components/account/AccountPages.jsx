import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const [form, setForm] = useState({ email: 'user@example.com', password: '123456' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!emailValid(form.email)) return setError('Email không hợp lệ.');
    if (form.password.length < 6) return setError('Mật khẩu tối thiểu 6 ký tự.');
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      navigate(user.role === 'admin' ? '/admin' : '/account');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="login">
      <div className="acct-auth-card">
        <AuthHeader title="Đăng nhập" subtitle="Tiếp tục đọc truyện, đồng bộ lịch sử và quản lý xu của bạn." />
        <form className="acct-auth-form" onSubmit={submit}>
          <label>Email<input value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
          <label>Mật khẩu<span><Link to="/forgot-password">Quên mật khẩu?</Link></span><input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} placeholder="Nhập mật khẩu" /></label>
          {error && <div className="acct-error">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
        </form>
        <SocialLoginMock />
        <p className="acct-auth-foot">Chưa có tài khoản? <Link to="/register">Đăng ký</Link></p>
      </div>
    </AuthShell>
  );
}

export function RegisterPage({ register }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', role: 'reader', agree: false });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function validateStepOne() {
    if (form.name.trim().length < 2) return 'Tên hiển thị cần ít nhất 2 ký tự.';
    if (!emailValid(form.email)) return 'Email không hợp lệ.';
    if (form.password.length < 6) return 'Mật khẩu tối thiểu 6 ký tự.';
    if (form.password !== form.confirm) return 'Xác nhận mật khẩu chưa khớp.';
    if (!form.agree) return 'Bạn cần đồng ý điều khoản sử dụng.';
    return '';
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (step === 1) {
      const message = validateStepOne();
      if (message) return setError(message);
      setStep(2);
      return;
    }
    setLoading(true);
    try {
      const user = await register(form.name, form.email, form.password);
      localStorage.setItem('daudo_role_choice', form.role);
      setSuccess(`Tạo tài khoản thành công với vai trò ${form.role === 'author' ? 'tác giả' : 'độc giả'}.`);
      setTimeout(() => navigate('/account'), 600);
      return user;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell mode="register">
      <div className="acct-auth-card">
        <AuthHeader title="Đăng ký" subtitle="Tạo tài khoản để lưu tủ truyện, nhận thông báo và bắt đầu xuất bản nếu bạn là tác giả." />
        <div className="acct-stepper"><span className={step === 1 ? 'active' : ''}>1. Thông tin</span><span className={step === 2 ? 'active' : ''}>2. Vai trò</span></div>
        <form className="acct-auth-form" onSubmit={submit}>
          {step === 1 ? (
            <>
              <label>Tên hiển thị<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Tên của bạn" /></label>
              <label>Email<input value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
              <label>Mật khẩu<input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} placeholder="Tối thiểu 6 ký tự" /></label>
              <label>Xác nhận mật khẩu<input type="password" value={form.confirm} onChange={event => setForm({ ...form, confirm: event.target.value })} placeholder="Nhập lại mật khẩu" /></label>
              <label className="acct-check"><input type="checkbox" checked={form.agree} onChange={event => setForm({ ...form, agree: event.target.checked })} /> Tôi đồng ý với <Link to="/dieu-khoan">Điều khoản</Link> và <Link to="/bao-mat">Chính sách bảo mật</Link></label>
            </>
          ) : (
            <div className="acct-role-grid">
              <button type="button" className={form.role === 'reader' ? 'active' : ''} onClick={() => setForm({ ...form, role: 'reader' })}><b>Độc giả</b><span>Đọc, lưu truyện, bình luận và nạp xu.</span></button>
              <button type="button" className={form.role === 'author' ? 'active' : ''} onClick={() => setForm({ ...form, role: 'author' })}><b>Tác giả</b><span>Chuẩn bị hồ sơ tác giả. Quyền xuất bản thật cần admin duyệt.</span></button>
            </div>
          )}
          {error && <div className="acct-error">{error}</div>}
          {success && <div className="acct-success">{success}</div>}
          <div className="acct-form-actions">
            {step === 2 && <button type="button" onClick={() => setStep(1)}>Quay lại</button>}
            <button type="submit" disabled={loading}>{step === 1 ? 'Tiếp tục' : loading ? 'Đang tạo...' : 'Tạo tài khoản'}</button>
          </div>
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
    if (!emailValid(email)) return setError('Email không hợp lệ.');
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 700);
  }
  return (
    <AuthShell mode="forgot">
      <div className="acct-auth-card">
        <AuthHeader title="Quên mật khẩu" subtitle="Nhập email tài khoản. Bản demo sẽ hiển thị màn hình đã gửi hướng dẫn." />
        {sent ? (
          <div className="acct-sent-state">
            <h2>Đã gửi hướng dẫn</h2>
            <p>Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi tới {email}.</p>
            <Link to="/login">Quay lại đăng nhập</Link>
          </div>
        ) : (
          <form className="acct-auth-form" onSubmit={submit}>
            <label>Email<input value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></label>
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
          <p>Lưu chương, theo dõi lịch sử, nạp xu an toàn và nhận thông báo chương mới.</p>
        </aside>
        {children}
      </div>
    </div>
  );
}

function AuthHeader({ title, subtitle }) {
  return <div className="acct-auth-head"><h1>{title}</h1><p>{subtitle}</p></div>;
}

function SocialLoginMock() {
  return (
    <div className="acct-social">
      <span>Hoặc đăng nhập nhanh</span>
      <div>
        <button type="button">Google <small>UI mock</small></button>
        <button type="button">Facebook <small>UI mock</small></button>
      </div>
    </div>
  );
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
      if (!libraryData) setError('Không kết nối được API thư viện, đang hiển thị dữ liệu mẫu.');
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
    ['Xu hiện có', user?.seeds || 0],
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
          <p>{user?.email} · Vai trò {user?.role === 'admin' ? 'admin' : localStorage.getItem('daudo_role_choice') === 'author' ? 'tác giả demo' : 'độc giả'}</p>
        </div>
        <Link to="/wallet">Nạp xu nhanh</Link>
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
      setNotice('Nạp xu thành công. Số dư đã được cập nhật.');
      await load();
    } else {
      setNotice('Thanh toán demo đã được tạo ở trạng thái chờ thanh toán.');
      setTransactions(current => [{
        id: `mock-${Date.now()}`,
        code: `DD${Date.now().toString().slice(-6)}`,
        type: 'topup',
        amount: selectedPack.seeds + selectedPack.bonus,
        money: selectedPack.price - discount,
        status: 'pending',
        note: `Nạp ${selectedPack.seeds + selectedPack.bonus} xu qua ${method}`,
        createdAt: new Date().toISOString()
      }, ...current]);
    }
    setLoading(false);
  }

  return (
    <div className="acct-page">
      {notice && <div className="acct-success">{notice}</div>}
      <PageHead title="Ví xu của tôi" subtitle="Nạp xu để mở khóa chương VIP và mua combo truyện." action={<strong className="acct-balance">{formatNumber(balance)} xu</strong>} />
      <div className="acct-coin-grid">{coinPackages.map(pack => <CoinPackageCard key={pack.id} pack={pack} active={selected === pack.id} onSelect={() => setSelected(pack.id)} />)}</div>
      <section className="acct-panel acct-payment-panel">
        <h2>Thanh toán an toàn</h2>
        <div className="acct-methods">{[['momo', 'MoMo'], ['vnpay', 'VNPay'], ['zalopay', 'ZaloPay'], ['bank', 'Chuyển khoản']].map(([value, label]) => <button key={value} type="button" className={method === value ? 'active' : ''} onClick={() => setMethod(value)}>{label}</button>)}</div>
        <label>Mã giảm giá<input value={voucher} onChange={event => setVoucher(event.target.value)} placeholder="Thử DAUDO10" /></label>
        <div className="acct-payment-summary"><span>Gói nạp</span><b>{selectedPack.seeds + selectedPack.bonus} xu</b><span>Giảm giá</span><b>{formatCurrency(discount)}</b><span>Cần thanh toán</span><strong>{formatCurrency(selectedPack.price - discount)}</strong></div>
        <button type="button" disabled={loading} onClick={topup}>{loading ? 'Đang xử lý...' : 'Nạp xu ngay'}</button>
        <p>Thanh toán thật chưa được tích hợp. Nếu backend chạy, thao tác này dùng endpoint demo `/wallet/topup`.</p>
      </section>
      <PaymentHistory transactions={transactions} />
    </div>
  );
}

export function CoinPackageCard({ pack, active, onSelect }) {
  return (
    <button type="button" className={active ? 'acct-coin-card active' : 'acct-coin-card'} onClick={onSelect}>
      {pack.featured && <em>Phổ biến</em>}
      <strong>{pack.seeds + pack.bonus}<span>xu</span></strong>
      <p>{pack.bonus ? `Bao gồm ${pack.bonus} xu bonus` : 'Không bonus'}</p>
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
        <div className="header"><span>Mã</span><span>Thời gian</span><span>Số tiền</span><span>Xu</span><span>Trạng thái</span></div>
        {transactions.map(txn => {
          const code = txn.code || txn.id || `TXN-${Date.now()}`;
          const status = txn.status || (txn.amount > 0 ? 'success' : 'success');
          return (
            <div key={code}>
              <span>{code}</span>
              <span>{formatDate(txn.createdAt)}</span>
              <span>{txn.money ? formatCurrency(txn.money) : txn.amount < 0 ? '-' : formatCurrency(Math.abs(txn.amount || 0) * 1000)}</span>
              <span>{txn.amount > 0 ? '+' : ''}{formatNumber(txn.amount)} xu</span>
              <b className={status}>{status === 'pending' ? 'Chờ thanh toán' : status === 'failed' ? 'Thất bại' : 'Thành công'}</b>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function AccountSettings({ user, updateUser, theme, toggleTheme }) {
  const [profile, setProfile] = useState({ name: user?.name || '', email: user?.email || '', phone: '', avatar: user?.avatar || '/images/logo.png' });
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [prefs, setPrefs] = useState({ email: true, web: true, chapters: true, comments: true, transactions: true, privacy: 'public', language: 'vi' });
  const [notice, setNotice] = useState('');

  function saveProfile(event) {
    event.preventDefault();
    updateUser?.({ ...user, name: profile.name, avatar: profile.avatar });
    setNotice('Đã lưu thông tin cá nhân trong phiên hiện tại.');
  }

  function savePassword(event) {
    event.preventDefault();
    if (password.next.length < 6) return setNotice('Mật khẩu mới tối thiểu 6 ký tự.');
    if (password.next !== password.confirm) return setNotice('Xác nhận mật khẩu chưa khớp.');
    setPassword({ current: '', next: '', confirm: '' });
    setNotice('Đổi mật khẩu là UI mock vì backend chưa có endpoint.');
  }

  return (
    <div className="acct-page">
      {notice && <div className="acct-success">{notice}</div>}
      <PageHead title="Cài đặt tài khoản" subtitle="Quản lý hồ sơ, bảo mật, thông báo và quyền riêng tư." />
      <div className="acct-settings-grid">
        <form className="acct-panel acct-settings-form" onSubmit={saveProfile}>
          <h2>Thông tin cá nhân</h2>
          <img src={profile.avatar || coverFallback} alt="avatar" onError={handleImageError} />
          <label>Avatar URL<input value={profile.avatar} onChange={event => setProfile({ ...profile, avatar: event.target.value })} /></label>
          <label>Tên hiển thị<input value={profile.name} onChange={event => setProfile({ ...profile, name: event.target.value })} /></label>
          <label>Email<input value={profile.email} disabled /></label>
          <label>Số điện thoại<input value={profile.phone} onChange={event => setProfile({ ...profile, phone: event.target.value })} placeholder="Chưa cập nhật" /></label>
          <button type="submit">Lưu hồ sơ</button>
        </form>
        <form className="acct-panel acct-settings-form" onSubmit={savePassword}>
          <h2>Đổi mật khẩu</h2>
          <label>Mật khẩu hiện tại<input type="password" value={password.current} onChange={event => setPassword({ ...password, current: event.target.value })} /></label>
          <label>Mật khẩu mới<input type="password" value={password.next} onChange={event => setPassword({ ...password, next: event.target.value })} /></label>
          <label>Xác nhận mật khẩu<input type="password" value={password.confirm} onChange={event => setPassword({ ...password, confirm: event.target.value })} /></label>
          <button type="submit">Đổi mật khẩu</button>
        </form>
        <section className="acct-panel acct-settings-form">
          <h2>Thông báo</h2>
          {[
            ['email', 'Email'],
            ['web', 'Web realtime'],
            ['chapters', 'Chương mới'],
            ['comments', 'Bình luận'],
            ['transactions', 'Giao dịch']
          ].map(([key, label]) => <label className="acct-switch" key={key}><input type="checkbox" checked={prefs[key]} onChange={event => setPrefs({ ...prefs, [key]: event.target.checked })} /> {label}</label>)}
        </section>
        <section className="acct-panel acct-settings-form">
          <h2>Giao diện & riêng tư</h2>
          <label>Chủ đề<button type="button" onClick={toggleTheme}>{theme === 'dark' ? 'Tối' : 'Sáng'} · bấm để đổi</button></label>
          <label>Ngôn ngữ<select value={prefs.language} onChange={event => setPrefs({ ...prefs, language: event.target.value })}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label>
          <label>Quyền riêng tư<select value={prefs.privacy} onChange={event => setPrefs({ ...prefs, privacy: event.target.value })}><option value="public">Công khai hoạt động</option><option value="private">Riêng tư</option></select></label>
          <button type="button" className="danger" onClick={() => setNotice('Yêu cầu xóa dữ liệu là UI mock, cần endpoint backend để xử lý thật.')}>Yêu cầu xóa dữ liệu</button>
        </section>
      </div>
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
    { id: 'TXN-DEMO-1', code: 'DD102938', type: 'topup', amount: 58, money: 50000, status: 'success', note: 'Nạp gói phổ biến', createdAt: new Date().toISOString() },
    { id: 'TXN-DEMO-2', code: 'DD102120', type: 'purchase', amount: -8, money: 8000, status: 'success', note: 'Mua chương VIP', createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 'TXN-DEMO-3', code: 'DD100001', type: 'topup', amount: 22, money: 20000, status: 'failed', note: 'Thanh toán lỗi', createdAt: new Date(Date.now() - 172800000).toISOString() }
  ];
}

function handleImageError(event) {
  if (event.currentTarget.src.endsWith(coverFallback)) return;
  event.currentTarget.src = coverFallback;
}
