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
  return { ongoing: 'Đang ra', completed: 'Hoàn thành', paused: 'Tạm dừng' }[status] || status;
}

function approvalText(status) {
  return { approved: 'Đã duyệt', pending: 'Chờ duyệt', rejected: 'Từ chối', draft: 'Nháp' }[status] || status;
}

function chapterStatusText(status) {
  return { draft: 'Nháp', pending: 'Chờ duyệt', published: 'Đã xuất bản', scheduled: 'Đã lên lịch' }[status] || status;
}

function loadLocalList(key, fallback) {
  try {
    const local = JSON.parse(localStorage.getItem(key) || '[]');
    return local.length ? local : fallback;
  } catch {
    return fallback;
  }
}

function saveLocalList(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function generateSlug(title) {
  return String(title || 'truyen-moi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `truyen-${Date.now()}`;
}

export function AuthorDashboard({ user }) {
  const location = useLocation();
  const params = useParams();
  const [stories, setStories] = useState(() => loadLocalList('daudo_author_stories', mockAuthorStories));
  const [chapters, setChapters] = useState(() => loadLocalList('daudo_author_chapters', mockAuthorChapters));
  const [promotions, setPromotions] = useState(() => loadLocalList('daudo_author_promotions', mockPromotionHistory));
  const [toast, setToast] = useState('');

  useEffect(() => saveLocalList('daudo_author_stories', stories), [stories]);
  useEffect(() => saveLocalList('daudo_author_chapters', chapters), [chapters]);
  useEffect(() => saveLocalList('daudo_author_promotions', promotions), [promotions]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentView = getCurrentView(location.pathname);
  const editingStory = params.id ? stories.find(story => story.id === params.id) : null;

  function upsertStory(story, mode = 'draft') {
    const now = new Date().toISOString();
    const normalized = {
      ...story,
      id: story.id || `author-story-${Date.now()}`,
      slug: story.slug || generateSlug(story.title),
      approvalStatus: mode === 'submit' ? 'pending' : story.approvalStatus || 'draft',
      publishStatus: mode === 'submit' ? 'pending' : story.publishStatus || 'draft',
      views: story.views || 0,
      follows: story.follows || 0,
      revenue: story.revenue || 0,
      comments: story.comments || 0,
      chapters: story.chapters || 0,
      updatedAt: now
    };
    setStories(current => {
      const exists = current.some(item => item.id === normalized.id);
      return exists ? current.map(item => item.id === normalized.id ? normalized : item) : [normalized, ...current];
    });
    setToast(mode === 'submit' ? 'Đã gửi truyện chờ duyệt.' : 'Đã lưu nháp truyện.');
    return normalized;
  }

  function updateStory(id, patch) {
    setStories(current => current.map(story => story.id === id ? { ...story, ...patch, updatedAt: new Date().toISOString() } : story));
  }

  function deleteStory(id) {
    setStories(current => current.filter(story => story.id !== id));
    setChapters(current => current.filter(chapter => chapter.storyId !== id));
    setToast('Đã xóa truyện khỏi dashboard mock.');
  }

  function upsertChapter(chapter) {
    setChapters(current => {
      const exists = current.some(item => item.id === chapter.id);
      const next = exists ? current.map(item => item.id === chapter.id ? chapter : item) : [chapter, ...current];
      return next.sort((a, b) => b.number - a.number);
    });
    setStories(current => current.map(story => story.id === chapter.storyId ? { ...story, chapters: Math.max(story.chapters || 0, chapter.number), updatedAt: new Date().toISOString() } : story));
    setToast(chapter.status === 'published' ? 'Chương đã được xuất bản.' : chapter.status === 'scheduled' ? 'Đã lên lịch xuất bản.' : 'Đã lưu chương.');
  }

  function deleteChapter(id) {
    setChapters(current => current.filter(chapter => chapter.id !== id));
    setToast('Đã xóa chương khỏi dashboard mock.');
  }

  function buyPromotion(pkg, storyId) {
    const story = stories.find(item => item.id === storyId) || stories[0];
    setPromotions(current => [{
      id: `promo-history-${Date.now()}`,
      packageName: pkg.title,
      storyTitle: story?.title || 'Truyện chưa chọn',
      cost: pkg.price,
      status: 'active',
      createdAt: new Date().toISOString()
    }, ...current]);
    setToast(`Đã kích hoạt gói ${pkg.title} bằng xu mock.`);
  }

  return (
    <div className="ad-page">
      {toast && <div className="ad-toast">{toast}</div>}
      <section className="ad-hero">
        <div>
          <span>Khu vực tác giả</span>
          <h1>Dashboard tác giả</h1>
          <p>Quản lý truyện, chương, doanh thu và quảng bá. Dữ liệu dùng localStorage/mock cho các phần backend chưa hỗ trợ author API.</p>
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

      {currentView === 'overview' && <OverviewTab stories={stories} chapters={chapters} promotions={promotions} />}
      {currentView === 'stories' && <AuthorStoryTable stories={stories} onUpdate={updateStory} onDelete={deleteStory} />}
      {currentView === 'story-form' && <StoryEditorForm story={editingStory} onSave={upsertStory} />}
      {currentView === 'chapters' && <ChapterManager stories={stories} chapters={chapters} onSave={upsertChapter} onDelete={deleteChapter} />}
      {currentView === 'revenue' && <RevenueTab stories={stories} chapters={chapters} />}
      {currentView === 'promotions' && <PromotionPackages stories={stories} promotions={promotions} onBuy={buyPromotion} />}
    </div>
  );
}

function getCurrentView(pathname) {
  if (pathname.includes('/stories/new') || pathname.includes('/stories/') && pathname.includes('/edit')) return 'story-form';
  if (pathname.includes('/stories')) return 'stories';
  if (pathname.includes('/chapters')) return 'chapters';
  if (pathname.includes('/revenue')) return 'revenue';
  if (pathname.includes('/promotions')) return 'promotions';
  return 'overview';
}

function OverviewTab({ stories, chapters, promotions }) {
  const totals = useMemo(() => ({
    stories: stories.length,
    views: stories.reduce((sum, item) => sum + Number(item.views || 0), 0),
    follows: stories.reduce((sum, item) => sum + Number(item.follows || 0), 0),
    revenue: stories.reduce((sum, item) => sum + Number(item.revenue || 0), 0),
    comments: stories.reduce((sum, item) => sum + Number(item.comments || 0), 0)
  }), [stories]);

  return (
    <div className="ad-stack">
      <AuthorStatsCards totals={totals} />
      <section className="ad-grid-two">
        <RevenueChart title="Hiệu suất 7 ngày" rows={mockRevenueRows} />
        <section className="ad-panel">
          <h2>Hoạt động gần đây</h2>
          <div className="ad-activity-list">
            {chapters.slice(0, 4).map(chapter => <p key={chapter.id}><b>{chapterStatusText(chapter.status)}</b><span>{chapter.title} · {formatDate(chapter.updatedAt)}</span></p>)}
            {promotions.slice(0, 2).map(item => <p key={item.id}><b>Quảng bá</b><span>{item.packageName} cho {item.storyTitle}</span></p>)}
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
    const matchQuery = !query || `${story.title} ${story.genres?.join(' ')}`.toLowerCase().includes(query.toLowerCase());
    const matchFilter = !filter || story.approvalStatus === filter || story.publishStatus === filter || story.status === filter;
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
          <option value="draft">Nháp</option>
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
            <span>{approvalText(story.approvalStatus)}</span>
            <span>{statusText(story.status)} · {story.publishStatus}</span>
            <span>{formatNumber(story.chapters)}</span>
            <span>{formatNumber(story.views)}</span>
            <span>{formatCurrency(story.revenue)}</span>
            <span className="ad-row-actions">
              <Link to={`/author/stories/${story.id}/edit`}>Sửa</Link>
              <Link to={`/truyen/${story.slug}`}>Xem</Link>
              <button type="button" onClick={() => onUpdate(story.id, { publishStatus: story.publishStatus === 'hidden' ? 'published' : 'hidden' })}>{story.publishStatus === 'hidden' ? 'Hiện' : 'Ẩn'}</button>
              <button type="button" onClick={() => onDelete(story.id)}>Xóa</button>
            </span>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <div className="ad-empty">Không có truyện phù hợp.</div>}
    </section>
  );
}

export function StoryEditorForm({ story, onSave }) {
  const navigate = useNavigate();
  const draftKey = story?.id ? `daudo_author_story_draft:${story.id}` : 'daudo_author_story_draft:new';
  const [form, setForm] = useState(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (draft) return draft;
    } catch {}
    return story || {
      title: '',
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
  });
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify(form));
  }, [draftKey, form]);

  function validate() {
    if (!form.title.trim()) return 'Vui lòng nhập tên truyện.';
    if (form.shortDescription.trim().length < 20) return 'Mô tả ngắn cần ít nhất 20 ký tự.';
    if (form.description.trim().length < 80) return 'Mô tả dài cần ít nhất 80 ký tự.';
    if (!form.genres.length) return 'Vui lòng chọn ít nhất một thể loại.';
    if ((form.type === 'vip' || form.type === 'mixed') && Number(form.chapterPrice) <= 0) return 'Giá chương VIP phải lớn hơn 0.';
    return '';
  }

  function save(mode) {
    const message = mode === 'submit' ? validate() : '';
    if (message) {
      setError(message);
      return;
    }
    const saved = onSave(form, mode);
    localStorage.removeItem(draftKey);
    navigate(mode === 'submit' ? '/author/stories' : `/author/stories/${saved.id}/edit`);
  }

  return (
    <section className="ad-panel">
      <div className="ad-panel-head">
        <div><h2>{story ? 'Sửa truyện' : 'Đăng truyện mới'}</h2><p>Hoàn thiện thông tin, lưu nháp hoặc gửi admin duyệt.</p></div>
        <button type="button" onClick={() => setPreviewOpen(value => !value)}>{previewOpen ? 'Ẩn preview' : 'Preview'}</button>
      </div>
      {error && <div className="ad-error">{error}</div>}
      <div className="ad-editor-grid">
        <div className="ad-form-stack">
          <CoverUploader value={form.cover} position={form.coverPosition} onChange={(cover, coverPosition = form.coverPosition) => setForm({ ...form, cover, coverPosition })} />
          <label>Tên truyện<input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Nhập tên truyện" /></label>
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
            <p>Không đăng nội dung vi phạm bản quyền, kích động thù ghét hoặc trái pháp luật. Ảnh bìa nên rõ nhân vật/chủ đề, kích thước dọc 3:4.</p>
            <p>Truyện gửi duyệt sẽ vào trạng thái chờ duyệt. Bản nháp tự lưu trên trình duyệt.</p>
          </section>
          <div className="ad-form-actions">
            <button type="button" onClick={() => save('draft')}>Lưu nháp</button>
            <button type="button" onClick={() => save('submit')}>Gửi duyệt</button>
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
          <select value={filter} onChange={event => setFilter(event.target.value)}><option value="">Tất cả</option><option value="draft">Nháp</option><option value="pending">Chờ duyệt</option><option value="published">Đã xuất bản</option><option value="scheduled">Đã lên lịch</option><option value="vip">VIP</option><option value="free">Miễn phí</option></select>
        </div>
        <ChapterStats chapters={storyChapters} />
        <div className="ad-chapter-list">
          {filtered.map(chapter => (
            <article key={chapter.id}>
              <span><b>#{chapter.number} {chapter.title}</b><small>{chapterStatusText(chapter.status)} · {chapter.access === 'vip' ? 'VIP' : 'Miễn phí'} · {formatDate(chapter.updatedAt)}</small></span>
              <em>{formatNumber(chapter.views)} đọc · {formatNumber(chapter.comments)} bình luận · {formatCurrency(chapter.revenue)}</em>
              <div><button type="button" onClick={() => setEditing(chapter)}>Sửa</button><button type="button" onClick={() => onDelete(chapter.id)}>Xóa</button></div>
            </article>
          ))}
        </div>
      </section>
      {editing && <ChapterEditor key={editing.id || 'new'} chapter={editing} stories={stories} selectedStoryId={selectedStoryId} onCancel={() => setEditing(null)} onSave={chapter => { onSave(chapter); setEditing(null); }} />}
    </div>
  );
}

export function ChapterEditor({ chapter, stories, selectedStoryId, onSave, onCancel }) {
  const draftKey = `daudo_author_chapter_draft:${chapter.id || selectedStoryId || 'new'}`;
  const [form, setForm] = useState(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (draft) return draft;
    } catch {}
    return {
      id: chapter.id || '',
      storyId: chapter.storyId || selectedStoryId || stories[0]?.id,
      number: chapter.number || 1,
      title: chapter.title || '',
      content: chapter.content || '',
      status: chapter.status || 'draft',
      access: chapter.access || 'free',
      scheduledAt: chapter.scheduledAt || '',
      words: chapter.words || 0,
      views: chapter.views || 0,
      comments: chapter.comments || 0,
      revenue: chapter.revenue || 0
    };
  });
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify(form));
  }, [draftKey, form]);

  function submit(status) {
    if (!form.title.trim()) return setError('Vui lòng nhập tiêu đề chương.');
    if (form.content.trim().length < 80) return setError('Nội dung chương cần ít nhất 80 ký tự.');
    if (status === 'scheduled' && !form.scheduledAt) return setError('Vui lòng chọn thời gian lên lịch.');
    const saved = {
      ...form,
      id: form.id || `chapter-${Date.now()}`,
      status,
      words: form.content.trim().split(/\s+/).filter(Boolean).length,
      updatedAt: new Date().toISOString()
    };
    localStorage.removeItem(draftKey);
    onSave(saved);
  }

  return (
    <section className="ad-panel ad-chapter-editor">
      <div className="ad-panel-head"><div><h2>{chapter.id ? 'Sửa chương' : 'Tạo chương mới'}</h2><p>Bản nháp tự động lưu trên trình duyệt.</p></div><button type="button" onClick={onCancel}>Đóng</button></div>
      {error && <div className="ad-error">{error}</div>}
      <label>Truyện<select value={form.storyId} onChange={event => setForm({ ...form, storyId: event.target.value })}>{stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select></label>
      <div className="ad-two-inputs"><label>Số chương<input type="number" min="1" value={form.number} onChange={event => setForm({ ...form, number: Number(event.target.value) })} /></label><label>Trạng thái truy cập<select value={form.access} onChange={event => setForm({ ...form, access: event.target.value })}><option value="free">Miễn phí</option><option value="vip">VIP</option></select></label></div>
      <label>Tiêu đề chương<input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="VD: Chương 1: Gió nổi trong thành" /></label>
      <label>Nội dung chương<textarea rows="14" value={form.content} onChange={event => setForm({ ...form, content: event.target.value })} placeholder="Nhập nội dung chương..." /></label>
      <label>Lên lịch xuất bản<input type="datetime-local" value={form.scheduledAt} onChange={event => setForm({ ...form, scheduledAt: event.target.value })} /></label>
      <div className="ad-form-actions">
        <button type="button" onClick={() => setPreview(value => !value)}>{preview ? 'Ẩn preview' : 'Preview'}</button>
        <button type="button" onClick={() => submit('draft')}>Lưu nháp</button>
        <button type="button" onClick={() => submit('scheduled')}>Lên lịch</button>
        <button type="button" onClick={() => submit('published')}>Xuất bản ngay</button>
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

function RevenueTab({ stories, chapters }) {
  const totalRevenue = stories.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const pending = mockAuthorTransactions.filter(item => item.status === 'pending').reduce((sum, item) => sum + item.amount, 0);
  const bestChapters = chapters.slice().sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0)).slice(0, 5);
  return (
    <div className="ad-stack">
      <div className="ad-stat-grid"><div><span>Tổng doanh thu</span><strong>{formatCurrency(totalRevenue)}</strong></div><div><span>Chờ thanh toán</span><strong>{formatCurrency(pending)}</strong></div><div><span>Chương VIP bán chạy</span><strong>{bestChapters.length}</strong></div></div>
      <section className="ad-grid-two">
        <RevenueChart title="Doanh thu theo ngày" rows={mockRevenueRows} />
        <section className="ad-panel"><h2>Chương VIP bán chạy</h2><div className="ad-activity-list">{bestChapters.map(chapter => <p key={chapter.id}><b>{chapter.title}</b><span>{formatCurrency(chapter.revenue)} · {formatNumber(chapter.views)} lượt đọc</span></p>)}</div></section>
      </section>
      <section className="ad-panel"><h2>Giao dịch liên quan</h2><div className="ad-transaction-table">{mockAuthorTransactions.map(item => <div key={item.id}><span>{item.id}</span><span>{item.storyTitle}</span><span>{item.chapterTitle}</span><b>{formatCurrency(item.amount)}</b><em>{item.status === 'pending' ? 'Chờ thanh toán' : 'Thành công'}</em><span>{formatDate(item.createdAt)}</span></div>)}</div></section>
    </div>
  );
}

export function RevenueChart({ title, rows }) {
  const max = Math.max(...rows.map(item => item.revenue), 1);
  return (
    <section className="ad-panel">
      <div className="ad-panel-head"><div><h2>{title}</h2><p>Doanh thu và lượt đọc trong kỳ.</p></div></div>
      <div className="ad-revenue-chart">{rows.map(item => <span key={item.label}><i style={{ height: `${Math.max(14, item.revenue / max * 100)}%` }} /><b>{item.label}</b><small>{formatNumber(item.revenue)}</small></span>)}</div>
    </section>
  );
}

export function PromotionPackages({ stories, promotions, onBuy }) {
  const [selectedStoryId, setSelectedStoryId] = useState(stories[0]?.id || '');
  return (
    <div className="ad-stack">
      <section className="ad-panel">
        <div className="ad-panel-head"><div><h2>Gói quảng bá truyện</h2><p>Thanh toán bằng xu mock, lịch sử lưu trên trình duyệt.</p></div><select value={selectedStoryId} onChange={event => setSelectedStoryId(event.target.value)}>{stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select></div>
        <div className="ad-promo-grid">{mockPromotionPackages.map(pkg => <article key={pkg.id} className={pkg.featured ? 'featured' : ''}><h3>{pkg.title}</h3><p>{pkg.reach} · {pkg.days} ngày</p><strong>{pkg.price} xu</strong><ul>{pkg.features.map(item => <li key={item}>{item}</li>)}</ul><button type="button" onClick={() => onBuy(pkg, selectedStoryId)}>Chọn gói</button></article>)}</div>
      </section>
      <section className="ad-panel"><h2>Lịch sử quảng bá</h2><div className="ad-activity-list">{promotions.map(item => <p key={item.id}><b>{item.packageName}</b><span>{item.storyTitle} · {item.cost} xu · {item.status} · {formatDate(item.createdAt)}</span></p>)}</div></section>
    </div>
  );
}

function handleImageError(event) {
  if (event.currentTarget.src.endsWith(coverFallback)) return;
  event.currentTarget.src = coverFallback;
}
