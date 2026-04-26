import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  authorGenres,
  authorTags,
  mockAuthorChapters,
  mockAuthorStories,
  mockAuthorTransactions,
  mockPromotionHistory,
  mockPromotionPackages,
  mockRevenueRows
} from '../../data/mockAuthorData';

const coverFallback = '/images/cover-1.jpg';

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function formatCurrency(value = 0) {
  return `${formatNumber(value)} xu`;
}

function formatDate(value) {
  if (!value) return 'Chưa đặt lịch';
  return new Date(value).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusText(status) {
  return { ongoing: 'Đang ra', completed: 'Hoàn thành', paused: 'Tạm dừng' }[status] || status || 'Chưa rõ';
}

function approvalText(status) {
  return { approved: 'Đã duyệt', pending: 'Chờ duyệt', rejected: 'Từ chối', draft: 'Nháp' }[status] || status || 'Nháp';
}

function chapterStatusText(status) {
  return {
    draft: 'Nháp',
    pending: 'Chờ duyệt',
    reviewing: 'Đang xử lý',
    approved: 'Đã duyệt',
    published: 'Đã xuất bản',
    rejected: 'Từ chối',
    scheduled: 'Đã lên lịch',
    hidden: 'Đang ẩn'
  }[status] || status || 'Nháp';
}

function getCurrentView(pathname) {
  if (pathname.includes('/stories/new') || pathname.includes('/stories/') && pathname.includes('/edit')) return 'story-form';
  if (pathname.includes('/stories')) return 'stories';
  if (pathname.includes('/chapters')) return 'chapters';
  if (pathname.includes('/revenue')) return 'revenue';
  if (pathname.includes('/promotions')) return 'promotions';
  return 'overview';
}

function generateSlug(title) {
  return String(title || 'truyen-moi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `truyen-${Date.now()}`;
}

function normalizeStoryForForm(story) {
  if (!story) {
    return {
      title: '',
      author: '',
      cover: '/images/cover-1.jpg',
      coverPosition: '50% 50%',
      shortDescription: '',
      description: '',
      genres: [],
      tags: [],
      status: 'ongoing',
      type: 'free',
      vipFromChapter: 1,
      chapterPrice: 3,
      comboPrice: 99
    };
  }

  return {
    ...story,
    author: story.author || '',
    cover: story.cover || '/images/cover-1.jpg',
    coverPosition: story.coverPosition || '50% 50%',
    shortDescription: story.shortDescription || String(story.description || '').slice(0, 180),
    genres: story.genres || story.categories || [],
    tags: story.tags || [],
    type: story.type || (story.premium ? 'vip' : 'free'),
    chapterPrice: story.chapterPrice ?? story.price ?? 0,
    vipFromChapter: story.vipFromChapter ?? (story.premium ? 1 : 0),
    comboPrice: story.comboPrice ?? 0
  };
}

function buildStoryPayload(form, approvalStatus) {
  const premium = form.type === 'vip' || form.type === 'mixed';
  return {
    title: form.title,
    author: form.author,
    cover: form.cover,
    coverPosition: form.coverPosition,
    shortDescription: form.shortDescription,
    description: form.description,
    categories: form.genres || [],
    tags: form.tags || [],
    status: form.status,
    type: form.type,
    premium,
    price: premium ? Number(form.chapterPrice || 0) : 0,
    chapterPrice: premium ? Number(form.chapterPrice || 0) : 0,
    vipFromChapter: premium ? Number(form.vipFromChapter || 1) : 0,
    comboPrice: premium ? Number(form.comboPrice || 0) : 0,
    approvalStatus
  };
}

function buildChapterPayload(form, status) {
  return {
    storyId: form.storyId,
    number: Number(form.number || 1),
    title: form.title,
    content: form.content,
    preview: form.preview,
    status,
    scheduledAt: form.scheduledAt,
    isPremium: form.access === 'vip',
    price: form.access === 'vip' ? Number(form.price || 0) : 0
  };
}

function buildFallbackRevenue() {
  const totalRevenue = mockAuthorStories.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const pendingWithdrawal = mockAuthorTransactions.filter(item => item.status === 'pending').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    totalRevenue,
    pendingWithdrawal,
    byStory: mockAuthorStories.map(story => ({ storyId: story.id, storyTitle: story.title, revenue: story.revenue || 0, purchases: 0 })),
    bestChapters: mockAuthorChapters.slice().sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0)).slice(0, 5),
    transactions: mockAuthorTransactions,
    chart: mockRevenueRows
  };
}

function fallbackState(message = 'Không thể kết nối author API.') {
  return {
    usingMock: true,
    stories: mockAuthorStories,
    chapters: mockAuthorChapters,
    promotions: mockPromotionHistory,
    packages: mockPromotionPackages,
    revenue: buildFallbackRevenue(),
    stats: null,
    loading: {},
    errors: {
      overview: message,
      stories: message,
      chapters: message,
      revenue: message,
      promotions: message
    }
  };
}

function statusTone(status) {
  return {
    approved: 'success',
    published: 'success',
    pending: 'warning',
    reviewing: 'warning',
    draft: 'muted',
    rejected: 'danger',
    hidden: 'dark',
    scheduled: 'info'
  }[status] || 'muted';
}

function StatusBadge({ status, hidden = false, children }) {
  const normalized = hidden ? 'hidden' : status;
  return <span className={`ad-badge ${statusTone(normalized)}`}>{children || (hidden ? 'Đang ẩn' : approvalText(normalized) || chapterStatusText(normalized))}</span>;
}

function LoadingBlock({ text = 'Đang tải dữ liệu...' }) {
  return <div className="ad-loading">{text}</div>;
}

function ErrorNotice({ message }) {
  if (!message) return null;
  return <div className="ad-error">{message}</div>;
}

function EmptyState({ children }) {
  return <div className="ad-empty">{children}</div>;
}

export function AuthorDashboard({ user, apiClient }) {
  const location = useLocation();
  const params = useParams();
  const [state, setState] = useState(() => ({
    usingMock: false,
    stories: [],
    chapters: [],
    promotions: [],
    packages: mockPromotionPackages,
    revenue: buildFallbackRevenue(),
    stats: null,
    loading: { overview: true, stories: true, chapters: true, revenue: true, promotions: true },
    errors: {}
  }));
  const [toast, setToast] = useState('');

  const currentView = getCurrentView(location.pathname);
  const editingStory = params.id ? state.stories.find(story => story.id === params.id) : null;

  async function loadAuthorData() {
    if (!apiClient) {
      setState(fallbackState('API chưa sẵn sàng.'));
      return;
    }

    setState(current => ({
      ...current,
      loading: { overview: true, stories: true, chapters: true, revenue: true, promotions: true },
      errors: {}
    }));

    try {
      const [statsRes, storiesRes, chaptersRes, revenueRes, promotionsRes] = await Promise.all([
        apiClient('/author/stats'),
        apiClient('/author/stories'),
        apiClient('/author/chapters'),
        apiClient('/author/revenue'),
        apiClient('/author/promotions')
      ]);
      setState({
        usingMock: false,
        stats: statsRes.stats || null,
        stories: storiesRes.stories || [],
        chapters: chaptersRes.chapters || [],
        revenue: revenueRes.revenue || buildFallbackRevenue(),
        promotions: promotionsRes.promotions || [],
        packages: promotionsRes.packages?.length ? promotionsRes.packages : mockPromotionPackages,
        loading: {},
        errors: {}
      });
    } catch (err) {
      setState(fallbackState(err.message || 'Không thể tải dữ liệu tác giả.'));
    }
  }

  useEffect(() => {
    loadAuthorData();
  }, [apiClient]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function updateDemoStory(form, mode) {
    const timestamp = new Date().toISOString();
    const approvalStatus = mode === 'submit' ? 'pending' : 'draft';
    const payload = buildStoryPayload(form, approvalStatus);
    const nextStory = {
      ...normalizeStoryForForm(form),
      ...payload,
      id: form.id || `demo-story-${Date.now()}`,
      slug: form.slug || generateSlug(form.title),
      approvalStatus,
      hidden: true,
      publishStatus: approvalStatus,
      views: form.views || 0,
      follows: form.follows || 0,
      revenue: form.revenue || 0,
      comments: form.comments || 0,
      chapters: form.chapters || 0,
      updatedAt: timestamp
    };
    setState(current => ({
      ...current,
      stories: current.stories.some(item => item.id === nextStory.id)
        ? current.stories.map(item => item.id === nextStory.id ? nextStory : item)
        : [nextStory, ...current.stories]
    }));
    return nextStory;
  }

  async function saveStory(form, mode) {
    const approvalStatus = mode === 'submit' ? 'pending' : 'draft';
    if (state.usingMock || !apiClient) {
      const story = updateDemoStory(form, mode);
      setToast(mode === 'submit' ? 'Đã gửi truyện chờ duyệt trong dữ liệu mẫu.' : 'Đã lưu nháp trong dữ liệu mẫu.');
      return story;
    }

    const payload = buildStoryPayload(form, approvalStatus);
    const result = form.id
      ? await apiClient(`/author/stories/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await apiClient('/author/stories', { method: 'POST', body: JSON.stringify(payload) });
    await loadAuthorData();
    setToast(mode === 'submit' ? 'Đã gửi truyện chờ admin duyệt.' : 'Đã lưu nháp truyện.');
    return result.story;
  }

  async function updateStory(id, patch) {
    const story = state.stories.find(item => item.id === id);
    if (!story) return;
    if (state.usingMock || !apiClient) {
      setState(current => ({ ...current, stories: current.stories.map(item => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item) }));
      setToast('Đã cập nhật trong dữ liệu mẫu.');
      return;
    }
    await apiClient(`/author/stories/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...buildStoryPayload(normalizeStoryForForm(story), story.approvalStatus || 'draft'), ...patch })
    });
    await loadAuthorData();
    setToast('Đã cập nhật truyện.');
  }

  async function deleteStory(id) {
    if (!window.confirm('Xóa truyện này? Toàn bộ chương liên quan cũng sẽ bị xóa.')) return;
    if (state.usingMock || !apiClient) {
      setState(current => ({
        ...current,
        stories: current.stories.filter(story => story.id !== id),
        chapters: current.chapters.filter(chapter => chapter.storyId !== id)
      }));
      setToast('Đã xóa truyện khỏi dữ liệu mẫu.');
      return;
    }
    await apiClient(`/author/stories/${id}`, { method: 'DELETE' });
    await loadAuthorData();
    setToast('Đã xóa truyện.');
  }

  async function saveChapter(form, status) {
    const payload = buildChapterPayload(form, status);
    if (state.usingMock || !apiClient) {
      const next = {
        ...form,
        ...payload,
        id: form.id || `demo-chapter-${Date.now()}`,
        status,
        access: payload.isPremium ? 'vip' : 'free',
        words: form.content.trim().split(/\s+/).filter(Boolean).length,
        updatedAt: new Date().toISOString()
      };
      setState(current => ({
        ...current,
        chapters: current.chapters.some(item => item.id === next.id)
          ? current.chapters.map(item => item.id === next.id ? next : item)
          : [next, ...current.chapters]
      }));
      setToast(status === 'pending' ? 'Đã gửi chương chờ duyệt trong dữ liệu mẫu.' : 'Đã lưu chương trong dữ liệu mẫu.');
      return next;
    }

    const result = form.id
      ? await apiClient(`/author/chapters/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await apiClient(`/author/stories/${payload.storyId}/chapters`, { method: 'POST', body: JSON.stringify(payload) });
    await loadAuthorData();
    setToast(status === 'pending' ? 'Đã gửi chương chờ duyệt.' : status === 'scheduled' ? 'Đã lên lịch chương.' : 'Đã lưu nháp chương.');
    return result.chapter;
  }

  async function deleteChapter(id) {
    if (!window.confirm('Xóa chương này?')) return;
    if (state.usingMock || !apiClient) {
      setState(current => ({ ...current, chapters: current.chapters.filter(chapter => chapter.id !== id) }));
      setToast('Đã xóa chương khỏi dữ liệu mẫu.');
      return;
    }
    await apiClient(`/author/chapters/${id}`, { method: 'DELETE' });
    await loadAuthorData();
    setToast('Đã xóa chương.');
  }

  async function buyPromotion(pkg, storyId) {
    if (!storyId) {
      setToast('Vui lòng chọn truyện để quảng bá.');
      return;
    }
    if (state.usingMock || !apiClient) {
      const story = state.stories.find(item => item.id === storyId);
      setState(current => ({
        ...current,
        promotions: [{
          id: `demo-promo-${Date.now()}`,
          packageId: pkg.id,
          packageName: pkg.title,
          storyId,
          storyTitle: story?.title || 'Truyện đã chọn',
          cost: pkg.price,
          status: 'active',
          createdAt: new Date().toISOString()
        }, ...current.promotions]
      }));
      setToast('Đã kích hoạt gói quảng bá trong dữ liệu mẫu.');
      return;
    }
    await apiClient('/author/promotions', { method: 'POST', body: JSON.stringify({ storyId, packageId: pkg.id }) });
    await loadAuthorData();
    setToast(`Đã mua gói ${pkg.title}.`);
  }

  const currentError = state.errors[currentView === 'story-form' ? 'stories' : currentView];
  const currentLoading = state.loading[currentView === 'story-form' ? 'stories' : currentView];

  return (
    <div className="ad-page">
      {toast && <div className="ad-toast">{toast}</div>}
      {state.usingMock && <div className="ad-warning"><strong>Đang dùng dữ liệu mẫu</strong><span>{currentError}</span></div>}

      <section className="ad-hero">
        <div>
          <span>Khu vực tác giả</span>
          <h1>Dashboard tác giả</h1>
          <p>Quản lý truyện, chương, doanh thu và quảng bá bằng dữ liệu backend thật, đồng bộ với admin CMS và public catalog.</p>
        </div>
        <div className="ad-author-card">
          <img src={user?.avatar || '/images/logo.png'} alt={user?.name || 'avatar'} />
          <span><strong>{user?.name || 'Tác giả'}</strong><small>{user?.email || 'author@example.com'}</small></span>
        </div>
      </section>

      <nav className="ad-tabs">
        <NavLink end to="/author">Tổng quan</NavLink>
        <NavLink to="/author/stories">Truyện của tôi</NavLink>
        <NavLink to="/author/chapters">Quản lý chương truyện</NavLink>
        <NavLink to="/author/revenue">Kinh doanh / doanh thu</NavLink>
        <NavLink to="/author/promotions">Quảng bá / gói dịch vụ</NavLink>
      </nav>

      {!state.usingMock && <ErrorNotice message={currentError} />}
      {currentLoading && <LoadingBlock />}

      {!currentLoading && currentView === 'overview' && <OverviewTab stories={state.stories} chapters={state.chapters} promotions={state.promotions} stats={state.stats} revenue={state.revenue} />}
      {!currentLoading && currentView === 'stories' && <AuthorStoryTable stories={state.stories} onUpdate={updateStory} onDelete={deleteStory} />}
      {!currentLoading && currentView === 'story-form' && <StoryEditorForm story={editingStory} loading={Boolean(params.id && !editingStory)} onSave={saveStory} />}
      {!currentLoading && currentView === 'chapters' && <ChapterManager stories={state.stories} chapters={state.chapters} onSave={saveChapter} onDelete={deleteChapter} />}
      {!currentLoading && currentView === 'revenue' && <RevenueTab revenue={state.revenue} />}
      {!currentLoading && currentView === 'promotions' && <PromotionPackages stories={state.stories} promotions={state.promotions} packages={state.packages} onBuy={buyPromotion} />}
    </div>
  );
}

function OverviewTab({ stories, chapters, promotions, stats, revenue }) {
  const totals = useMemo(() => ({
    stories: stats?.stories ?? stories.length,
    views: stats?.views ?? stories.reduce((sum, item) => sum + Number(item.views || 0), 0),
    follows: stats?.follows ?? stories.reduce((sum, item) => sum + Number(item.follows || 0), 0),
    revenue: stats?.revenue ?? revenue.totalRevenue ?? 0,
    comments: stats?.comments ?? stories.reduce((sum, item) => sum + Number(item.comments || 0), 0)
  }), [stories, stats, revenue]);
  const rows = revenue.chart?.length ? revenue.chart : mockRevenueRows;

  return (
    <div className="ad-stack">
      <AuthorStatsCards totals={totals} />
      <section className="ad-grid-two">
        <RevenueChart title="Hiệu suất 7 ngày" rows={rows} />
        <section className="ad-panel">
          <h2>Hoạt động gần đây</h2>
          <div className="ad-activity-list">
            {chapters.slice(0, 4).map(chapter => <p key={chapter.id}><b>{chapterStatusText(chapter.status)}</b><span>{chapter.title} · {formatDate(chapter.updatedAt)}</span></p>)}
            {promotions.slice(0, 2).map(item => <p key={item.id}><b>Quảng bá</b><span>{item.packageName} cho {item.storyTitle}</span></p>)}
            {!chapters.length && !promotions.length && <EmptyState>Chưa có hoạt động nào.</EmptyState>}
          </div>
        </section>
      </section>
    </div>
  );
}

export function AuthorStatsCards({ totals }) {
  const cards = [
    ['Số truyện', totals.stories],
    ['Lượt đọc', totals.views],
    ['Theo dõi', totals.follows],
    ['Doanh thu', `${formatNumber(totals.revenue)} xu`],
    ['Bình luận mới', totals.comments]
  ];
  return <div className="ad-stat-grid">{cards.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

export function AuthorStoryTable({ stories, onUpdate, onDelete }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const filtered = stories.filter(story => {
    const matchQuery = !query || `${story.title} ${(story.genres || story.categories || []).join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const matchFilter = !filter || story.approvalStatus === filter || story.publishStatus === filter || story.status === filter || (filter === 'hidden' && story.hidden);
    return matchQuery && matchFilter;
  });

  return (
    <section className="ad-panel">
      <div className="ad-panel-head">
        <div><h2>Truyện của tôi</h2><p>{filtered.length} truyện phù hợp</p></div>
        <Link className="ad-primary" to="/author/stories/new">Thêm truyện mới</Link>
      </div>
      <div className="ad-toolbar">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm truyện..." />
        <select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="approved">Đã duyệt</option>
          <option value="pending">Chờ duyệt</option>
          <option value="rejected">Từ chối</option>
          <option value="draft">Nháp</option>
          <option value="hidden">Đang ẩn</option>
          <option value="ongoing">Đang ra</option>
          <option value="completed">Hoàn thành</option>
          <option value="paused">Tạm dừng</option>
        </select>
      </div>
      <div className="ad-story-table">
        <div className="header"><span>Truyện</span><span>Duyệt</span><span>Xuất bản</span><span>Chương</span><span>Lượt đọc</span><span>Doanh thu</span><span>Thao tác</span></div>
        {filtered.map(story => (
          <div key={story.id}>
            <span className="ad-story-cell"><img src={story.cover || coverFallback} alt={story.title} onError={handleImageError} /><b>{story.title}</b></span>
            <span className="ad-badge-stack"><StatusBadge status={story.approvalStatus} />{story.hidden && <StatusBadge hidden />}</span>
            <span>{statusText(story.status)} · {story.hidden ? 'Đang ẩn' : story.approvalStatus === 'approved' ? 'Đã xuất bản' : 'Chưa public'}</span>
            <span>{formatNumber(story.chapters ?? story.chapterCount)}</span>
            <span>{formatNumber(story.views)}</span>
            <span>{formatCurrency(story.revenue)}</span>
            <span className="ad-row-actions">
              <Link to={`/author/stories/${story.id}/edit`}>Sửa</Link>
              {story.approvalStatus === 'approved' && !story.hidden && <Link to={`/truyen/${story.slug}`}>Xem</Link>}
              {story.approvalStatus === 'approved' && <button type="button" onClick={() => onUpdate(story.id, { hidden: !story.hidden })}>{story.hidden ? 'Hiện' : 'Ẩn'}</button>}
              {story.approvalStatus === 'rejected' && <button type="button" onClick={() => window.alert(story.rejectionReason || 'Admin chưa ghi lý do cụ thể.')}>Xem lý do từ chối</button>}
              <button type="button" onClick={() => onDelete(story.id)}>Xóa</button>
            </span>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <EmptyState>Bạn chưa có truyện nào, bắt đầu đăng truyện đầu tiên.</EmptyState>}
    </section>
  );
}

export function StoryEditorForm({ story, loading, onSave }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => normalizeStoryForForm(story));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setForm(normalizeStoryForForm(story));
  }, [story?.id]);

  function validate(mode) {
    if (!form.title.trim()) return 'Vui lòng nhập tên truyện.';
    if (mode === 'draft') return '';
    if (form.shortDescription.trim().length < 20) return 'Mô tả ngắn cần ít nhất 20 ký tự.';
    if (form.description.trim().length < 80) return 'Mô tả dài cần ít nhất 80 ký tự.';
    if (!form.genres.length) return 'Vui lòng chọn ít nhất một thể loại.';
    if ((form.type === 'vip' || form.type === 'mixed') && Number(form.chapterPrice) <= 0) return 'Giá chương VIP phải lớn hơn 0.';
    return '';
  }

  async function save(mode) {
    const message = validate(mode);
    if (message) {
      setError(message);
      return;
    }
    setSaving(mode);
    setError('');
    try {
      const saved = await onSave(form, mode === 'submit' ? 'submit' : 'draft');
      navigate(mode === 'submit' ? '/author/stories' : `/author/stories/${saved.id}/edit`);
    } catch (err) {
      setError(err.message || 'Không thể lưu truyện.');
    } finally {
      setSaving('');
    }
  }

  if (loading) return <LoadingBlock text="Đang tải truyện..." />;

  return (
    <section className="ad-panel">
      <div className="ad-panel-head">
        <div><h2>{story ? 'Sửa truyện' : 'Đăng truyện mới'}</h2><p>Hoàn thiện thông tin, lưu nháp hoặc gửi admin duyệt.</p></div>
        <button type="button" onClick={() => setPreviewOpen(value => !value)}>{previewOpen ? 'Ẩn preview' : 'Preview'}</button>
      </div>
      {error && <ErrorNotice message={error} />}
      <div className="ad-editor-grid">
        <div className="ad-form-stack">
          <CoverUploader value={form.cover} position={form.coverPosition} onChange={(cover, coverPosition = form.coverPosition) => setForm({ ...form, cover, coverPosition })} />
          <label>Tên truyện<input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Nhập tên truyện" /></label>
          <label>Bút danh / tác giả<input value={form.author} onChange={event => setForm({ ...form, author: event.target.value })} placeholder="Để trống nếu dùng tên tài khoản" /></label>
          <label>Mô tả ngắn<textarea rows="3" value={form.shortDescription} onChange={event => setForm({ ...form, shortDescription: event.target.value })} placeholder="Tóm tắt ngắn hiển thị ở card truyện" /></label>
          <label>Mô tả dài<textarea rows="8" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Giới thiệu nội dung, nhân vật, điểm hấp dẫn..." /></label>
          <GenreMultiSelect label="Thể loại" options={authorGenres} selected={form.genres} onChange={genres => setForm({ ...form, genres })} max={5} />
          <GenreMultiSelect label="Tag" options={authorTags} selected={form.tags} onChange={tags => setForm({ ...form, tags })} max={8} />
        </div>
        <aside className="ad-form-side">
          <section>
            <h3>Thiết lập xuất bản</h3>
            <label>Trạng thái<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="ongoing">Đang ra</option><option value="completed">Hoàn thành</option><option value="paused">Tạm dừng</option></select></label>
            <label>Loại truyện<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option value="free">Miễn phí</option><option value="vip">VIP</option><option value="mixed">Kết hợp</option></select></label>
            {(form.type === 'vip' || form.type === 'mixed') && (
              <>
                <label>VIP từ chương<input type="number" min="1" value={form.vipFromChapter} onChange={event => setForm({ ...form, vipFromChapter: event.target.value })} /></label>
                <label>Giá chương<input type="number" min="1" value={form.chapterPrice} onChange={event => setForm({ ...form, chapterPrice: event.target.value })} /></label>
                <label>Giá combo<input type="number" min="1" value={form.comboPrice} onChange={event => setForm({ ...form, comboPrice: event.target.value })} /></label>
              </>
            )}
          </section>
          <section className="ad-guide">
            <h3>Quy định đăng truyện</h3>
            <p>Không đăng nội dung vi phạm bản quyền, kích động thù ghét hoặc trái pháp luật. Truyện gửi duyệt sẽ chưa xuất hiện ngoài public catalog.</p>
          </section>
          <div className="ad-form-actions">
            <button type="button" disabled={Boolean(saving)} onClick={() => save('draft')}>{saving === 'draft' ? 'Đang lưu...' : 'Lưu nháp'}</button>
            <button type="button" disabled={Boolean(saving)} onClick={() => save('submit')}>{saving === 'submit' ? 'Đang gửi...' : 'Gửi duyệt'}</button>
          </div>
        </aside>
      </div>
      {previewOpen && <StoryPreview story={form} />}
    </section>
  );
}

export function CoverUploader({ value, position = '50% 50%', onChange }) {
  function handleFile(file) {
    if (!file) return;
    if (!file.type?.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result, position);
    reader.readAsDataURL(file);
  }
  return (
    <section className="ad-cover-uploader">
      <div className="ad-cover-preview"><img src={value || coverFallback} alt="cover preview" style={{ objectPosition: position }} onError={handleImageError} /></div>
      <div>
        <label>Upload ảnh bìa<input type="file" accept="image/*" onChange={event => handleFile(event.target.files?.[0])} /></label>
        <label>Hoặc nhập URL<input value={value} onChange={event => onChange(event.target.value, position)} placeholder="/images/cover-1.jpg" /></label>
        <label>Crop/position<select value={position} onChange={event => onChange(value, event.target.value)}><option value="50% 50%">Giữa</option><option value="50% 0%">Trên</option><option value="50% 100%">Dưới</option><option value="0% 50%">Trái</option><option value="100% 50%">Phải</option></select></label>
      </div>
    </section>
  );
}

export function GenreMultiSelect({ label, options, selected, onChange, max }) {
  function toggle(item) {
    const exists = selected.includes(item);
    const next = exists ? selected.filter(value => value !== item) : [...selected, item].slice(0, max);
    onChange(next);
  }
  return (
    <section className="ad-multi-select">
      <div><strong>{label}</strong><span>{selected.length}/{max}</span></div>
      <div>{options.map(item => <button type="button" key={item} className={selected.includes(item) ? 'active' : ''} onClick={() => toggle(item)}>{item}</button>)}</div>
    </section>
  );
}

function StoryPreview({ story }) {
  return (
    <article className="ad-story-preview">
      <img src={story.cover || coverFallback} alt={story.title || 'preview'} onError={handleImageError} />
      <div>
        <span>{story.genres?.join(' · ') || 'Chưa chọn thể loại'}</span>
        <h3>{story.title || 'Tên truyện preview'}</h3>
        <p>{story.shortDescription || 'Mô tả ngắn sẽ hiển thị tại đây.'}</p>
      </div>
    </article>
  );
}

export function ChapterManager({ stories, chapters, onSave, onDelete }) {
  const [selectedStoryId, setSelectedStoryId] = useState(stories[0]?.id || '');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (!selectedStoryId && stories[0]?.id) setSelectedStoryId(stories[0].id);
    if (selectedStoryId && !stories.some(story => story.id === selectedStoryId)) setSelectedStoryId(stories[0]?.id || '');
  }, [stories, selectedStoryId]);

  if (!stories.length) {
    return (
      <section className="ad-panel">
        <div className="ad-panel-head"><div><h2>Quản lý chương</h2><p>Chưa có truyện để đăng chương.</p></div><Link className="ad-primary" to="/author/stories/new">Đăng truyện đầu tiên</Link></div>
        <EmptyState>Bạn chưa có truyện nào, bắt đầu đăng truyện đầu tiên.</EmptyState>
      </section>
    );
  }

  const storyChapters = chapters.filter(chapter => !selectedStoryId || chapter.storyId === selectedStoryId);
  const filtered = storyChapters.filter(chapter => {
    const matchQuery = !query || `${chapter.number} ${chapter.title}`.toLowerCase().includes(query.toLowerCase());
    const matchFilter = !filter || chapter.status === filter || chapter.access === filter;
    return matchQuery && matchFilter;
  });

  return (
    <div className="ad-chapter-layout">
      <section className="ad-panel">
        <div className="ad-panel-head">
          <div><h2>Quản lý chương</h2><p>{filtered.length} chương phù hợp</p></div>
          <button type="button" onClick={() => setEditing({ storyId: selectedStoryId })}>Tạo chương mới</button>
        </div>
        <div className="ad-toolbar">
          <select value={selectedStoryId} onChange={event => setSelectedStoryId(event.target.value)}>{stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm chương..." />
          <select value={filter} onChange={event => setFilter(event.target.value)}><option value="">Tất cả</option><option value="draft">Nháp</option><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="rejected">Từ chối</option><option value="scheduled">Đã lên lịch</option><option value="vip">VIP</option><option value="free">Miễn phí</option></select>
        </div>
        <ChapterStats chapters={storyChapters} />
        <div className="ad-chapter-list">
          {filtered.map(chapter => (
            <article key={chapter.id}>
              <span>
                <b>#{chapter.number} {chapter.title}</b>
                <small><StatusBadge status={chapter.status}>{chapterStatusText(chapter.status)}</StatusBadge> · {chapter.access === 'vip' ? 'VIP' : 'Miễn phí'} · {formatDate(chapter.updatedAt)}</small>
              </span>
              <em>{formatNumber(chapter.views)} đọc · {formatNumber(chapter.comments)} bình luận · {formatCurrency(chapter.revenue)}</em>
              <div>
                {chapter.status === 'rejected' && <button type="button" onClick={() => window.alert(chapter.rejectionReason || 'Admin chưa ghi lý do cụ thể.')}>Lý do</button>}
                <button type="button" onClick={() => setEditing(chapter)}>Sửa</button>
                <button type="button" onClick={() => onDelete(chapter.id)}>Xóa</button>
              </div>
            </article>
          ))}
        </div>
        {filtered.length === 0 && <EmptyState>Chưa có chương phù hợp.</EmptyState>}
      </section>
      {editing && <ChapterEditor key={editing.id || 'new'} chapter={editing} stories={stories} selectedStoryId={selectedStoryId} onCancel={() => setEditing(null)} onSave={async (chapter, status) => { await onSave(chapter, status); setEditing(null); }} />}
    </div>
  );
}

export function ChapterEditor({ chapter, stories, selectedStoryId, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({
    id: chapter.id || '',
    storyId: chapter.storyId || selectedStoryId || stories[0]?.id,
    number: chapter.number || 1,
    title: chapter.title || '',
    content: chapter.content || '',
    preview: chapter.preview || '',
    status: chapter.status || 'draft',
    access: chapter.access || (chapter.isPremium ? 'vip' : 'free'),
    price: chapter.price || 0,
    scheduledAt: chapter.scheduledAt || '',
    words: chapter.words || 0,
    views: chapter.views || 0,
    comments: chapter.comments || 0,
    revenue: chapter.revenue || 0
  }));
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState('');

  function validate(status) {
    if (!form.storyId) return 'Vui lòng chọn truyện.';
    if (!form.title.trim()) return 'Vui lòng nhập tiêu đề chương.';
    if (form.content.trim().length < 80) return 'Nội dung chương cần ít nhất 80 ký tự.';
    if (status === 'scheduled' && !form.scheduledAt) return 'Vui lòng chọn thời gian lên lịch.';
    if (form.access === 'vip' && Number(form.price || 0) <= 0) return 'Giá chương VIP phải lớn hơn 0.';
    return '';
  }

  async function submit(status) {
    const message = validate(status);
    if (message) {
      setError(message);
      return;
    }
    setSaving(status);
    setError('');
    try {
      await onSave(form, status);
    } catch (err) {
      setError(err.message || 'Không thể lưu chương.');
    } finally {
      setSaving('');
    }
  }

  return (
    <section className="ad-panel ad-chapter-editor">
      <div className="ad-panel-head"><div><h2>{chapter.id ? 'Sửa chương' : 'Tạo chương mới'}</h2><p>Chương gửi duyệt sẽ chưa hiển thị ngoài public reader.</p></div><button type="button" onClick={onCancel}>Đóng</button></div>
      {error && <ErrorNotice message={error} />}
      <label>Truyện<select value={form.storyId} onChange={event => setForm({ ...form, storyId: event.target.value })}>{stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select></label>
      <div className="ad-two-inputs"><label>Số chương<input type="number" min="1" value={form.number} onChange={event => setForm({ ...form, number: Number(event.target.value) })} /></label><label>Trạng thái truy cập<select value={form.access} onChange={event => setForm({ ...form, access: event.target.value })}><option value="free">Miễn phí</option><option value="vip">VIP</option></select></label></div>
      {form.access === 'vip' && <label>Giá chương<input type="number" min="1" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} /></label>}
      <label>Tiêu đề chương<input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="VD: Chương 1: Gió nổi trong thành" /></label>
      <label>Nội dung chương<textarea rows="14" value={form.content} onChange={event => setForm({ ...form, content: event.target.value })} placeholder="Nhập nội dung chương..." /></label>
      <label>Preview chương<textarea rows="3" value={form.preview} onChange={event => setForm({ ...form, preview: event.target.value })} placeholder="Đoạn xem trước cho chương VIP" /></label>
      <label>Lên lịch xuất bản<input type="datetime-local" value={form.scheduledAt} onChange={event => setForm({ ...form, scheduledAt: event.target.value })} /></label>
      <div className="ad-form-actions">
        <button type="button" onClick={() => setPreview(value => !value)}>{preview ? 'Ẩn preview' : 'Preview'}</button>
        <button type="button" disabled={Boolean(saving)} onClick={() => submit('draft')}>{saving === 'draft' ? 'Đang lưu...' : 'Lưu nháp'}</button>
        <button type="button" disabled={Boolean(saving)} onClick={() => submit('scheduled')}>{saving === 'scheduled' ? 'Đang lưu...' : 'Lên lịch'}</button>
        <button type="button" disabled={Boolean(saving)} onClick={() => submit('pending')}>{saving === 'pending' ? 'Đang gửi...' : 'Gửi duyệt'}</button>
      </div>
      {preview && <article className="ad-chapter-preview"><h3>{form.title || 'Tiêu đề chương'}</h3>{form.content.split('\n').map((line, index) => line ? <p key={index}>{line}</p> : <br key={index} />)}</article>}
    </section>
  );
}

export function ChapterStats({ chapters }) {
  const totals = {
    reads: chapters.reduce((sum, item) => sum + Number(item.views || 0), 0),
    comments: chapters.reduce((sum, item) => sum + Number(item.comments || 0), 0),
    revenue: chapters.reduce((sum, item) => sum + Number(item.revenue || 0), 0),
    vip: chapters.filter(item => item.access === 'vip').length
  };
  return <div className="ad-chapter-stats"><span>{formatNumber(totals.reads)} lượt đọc</span><span>{formatNumber(totals.comments)} bình luận</span><span>{formatCurrency(totals.revenue)}</span><span>{totals.vip} chương VIP</span></div>;
}

function RevenueTab({ revenue }) {
  const bestChapters = revenue.bestChapters || [];
  const rows = revenue.chart?.length ? revenue.chart : mockRevenueRows;
  return (
    <div className="ad-stack">
      <div className="ad-stat-grid"><div><span>Tổng doanh thu</span><strong>{formatCurrency(revenue.totalRevenue)}</strong></div><div><span>Chờ rút</span><strong>{formatCurrency(revenue.pendingWithdrawal)}</strong></div><div><span>Chương bán chạy</span><strong>{bestChapters.length}</strong></div></div>
      <section className="ad-grid-two">
        <RevenueChart title="Doanh thu theo ngày" rows={rows} />
        <section className="ad-panel"><h2>Chương bán chạy</h2><div className="ad-activity-list">{bestChapters.map(chapter => <p key={chapter.chapterId || chapter.id}><b>{chapter.title}</b><span>{chapter.storyTitle ? `${chapter.storyTitle} · ` : ''}{formatCurrency(chapter.revenue)} · {formatNumber(chapter.views)} lượt đọc</span></p>)}{!bestChapters.length && <EmptyState>Chưa có chương phát sinh doanh thu.</EmptyState>}</div></section>
      </section>
      <section className="ad-panel"><h2>Doanh thu theo truyện</h2><div className="ad-transaction-table">{(revenue.byStory || []).map(item => <div key={item.storyId}><span>{item.storyTitle}</span><b>{formatCurrency(item.revenue)}</b><span>{formatNumber(item.purchases)} lượt mua</span></div>)}</div>{!revenue.byStory?.length && <EmptyState>Chưa có doanh thu theo truyện.</EmptyState>}</section>
      <section className="ad-panel"><h2>Giao dịch liên quan</h2><div className="ad-transaction-table">{(revenue.transactions || []).map(item => <div key={item.id}><span>{item.transactionId || item.id}</span><span>{item.storyTitle}</span><span>{item.chapterTitle}</span><b>{formatCurrency(item.amount)}</b><em>{item.status === 'pending' ? 'Chờ xử lý' : 'Thành công'}</em><span>{formatDate(item.createdAt)}</span></div>)}</div>{!revenue.transactions?.length && <EmptyState>Chưa có giao dịch doanh thu.</EmptyState>}</section>
    </div>
  );
}

export function RevenueChart({ title, rows }) {
  const safeRows = rows?.length ? rows : mockRevenueRows;
  const max = Math.max(...safeRows.map(item => Number(item.revenue || 0)), 1);
  return (
    <section className="ad-panel">
      <div className="ad-panel-head"><div><h2>{title}</h2><p>Doanh thu và lượt đọc trong kỳ.</p></div></div>
      <div className="ad-revenue-chart">{safeRows.map(item => <span key={item.label}><i style={{ height: `${Math.max(14, Number(item.revenue || 0) / max * 100)}%` }} /><b>{item.label}</b><small>{formatNumber(item.revenue)}</small></span>)}</div>
    </section>
  );
}

export function PromotionPackages({ stories, promotions, packages, onBuy }) {
  const [selectedStoryId, setSelectedStoryId] = useState(stories[0]?.id || '');

  useEffect(() => {
    if (!selectedStoryId && stories[0]?.id) setSelectedStoryId(stories[0].id);
  }, [stories, selectedStoryId]);

  if (!stories.length) {
    return (
      <section className="ad-panel">
        <div className="ad-panel-head"><div><h2>Gói quảng bá truyện</h2><p>Cần có truyện trước khi mua quảng bá.</p></div><Link className="ad-primary" to="/author/stories/new">Đăng truyện đầu tiên</Link></div>
        <EmptyState>Bạn chưa có truyện nào, bắt đầu đăng truyện đầu tiên.</EmptyState>
      </section>
    );
  }

  return (
    <div className="ad-stack">
      <section className="ad-panel">
        <div className="ad-panel-head"><div><h2>Gói quảng bá truyện</h2><p>Thanh toán bằng xu/Đậu trong ví, giao dịch được lưu backend.</p></div><select value={selectedStoryId} onChange={event => setSelectedStoryId(event.target.value)}>{stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select></div>
        <div className="ad-promo-grid">{packages.map(pkg => <article key={pkg.id} className={pkg.featured ? 'featured' : ''}><h3>{pkg.title}</h3><p>{pkg.reach} · {pkg.days} ngày</p><strong>{pkg.price} xu</strong><ul>{(pkg.features || []).map(item => <li key={item}>{item}</li>)}</ul><button type="button" onClick={() => onBuy(pkg, selectedStoryId)}>Chọn gói</button></article>)}</div>
      </section>
      <section className="ad-panel"><h2>Lịch sử quảng bá</h2><div className="ad-activity-list">{promotions.map(item => <p key={item.id}><b>{item.packageName}</b><span>{item.storyTitle} · {item.cost} xu · {item.status} · {formatDate(item.createdAt)}</span></p>)}{!promotions.length && <EmptyState>Chưa có chiến dịch quảng bá nào.</EmptyState>}</div></section>
    </div>
  );
}

function handleImageError(event) {
  if (event.currentTarget.src.endsWith(coverFallback)) return;
  event.currentTarget.src = coverFallback;
}
