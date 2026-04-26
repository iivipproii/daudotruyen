import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { mockStories } from '../../data/mockStories';
import { PageSeo, buildBreadcrumbSchema, buildStorySchema } from '../shared/Seo.jsx';

const coverFallback = '/images/cover-1.jpg';
const reportReasons = ['Sai chính tả', 'Thiếu chương', 'Lỗi hiển thị', 'Nội dung vi phạm'];

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

function normalizeChapter(chapter = {}) {
  return {
    ...chapter,
    title: repairText(chapter.title),
    content: repairText(chapter.content),
    preview: repairText(chapter.preview)
  };
}

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function formatDate(value) {
  if (!value) return 'Đang cập nhật';
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getChapterCount(story = {}) {
  return story.chapterCount || story.chapterCountEstimate || story.latestChapter?.number || 0;
}

function statusLabel(status) {
  return { ongoing: 'Đang ra', completed: 'Hoàn thành', paused: 'Tạm dừng' }[status] || 'Đang ra';
}

function generateMockChapters(story) {
  const count = Math.max(24, Math.min(getChapterCount(story) || 48, 120));
  return Array.from({ length: count }).map((_, index) => {
    const number = index + 1;
    const premium = Boolean(story.premium && number > 5);
    return {
      id: `${story.id || story.slug}-chapter-${number}`,
      storyId: story.id,
      number,
      title: `Chương ${number}: ${number % 5 === 0 ? 'Biến cố mới' : number % 3 === 0 ? 'Gió nổi trong thành' : 'Dấu hiệu đầu tiên'}`,
      isPremium: premium,
      price: premium ? story.price || 3 : 0,
      views: Math.max(120, Math.round(Number(story.views || 1000) / (number + 8))),
      updatedAt: story.updatedAt,
      content: `Đây là nội dung mẫu của chương ${number}. Câu chuyện tiếp tục mở ra những chi tiết mới, giữ nhịp đọc rõ ràng và dễ theo dõi.\n\nNhân vật chính phải đưa ra lựa chọn quan trọng, trong khi các tuyến phụ bắt đầu kết nối với bí mật lớn của tác phẩm.`
    };
  });
}

function mockComments(storyId) {
  return [
    { id: `${storyId}-c1`, userName: 'An Nhiên', userAvatar: '/images/logo.png', body: 'Mạch truyện cuốn, chương mới đọc rất đã.', likes: 18, createdAt: '2026-04-25T10:00:00.000Z', replies: [{ id: 'r1', userName: 'Minh', body: 'Mình cũng đang chờ đoạn cao trào tiếp theo.', likes: 4 }] },
    { id: `${storyId}-c2`, userName: 'Lam Độc Giả', userAvatar: '/images/logo.png', body: 'Bản dịch ổn, mong editor giữ lịch đều.', likes: 9, createdAt: '2026-04-24T12:00:00.000Z', replies: [] }
  ];
}

function mockReviews(story) {
  return [
    { id: `${story.id}-rv1`, userName: 'Hạ Vy', rating: 5, body: 'Bối cảnh tốt, nhân vật có động cơ rõ và nhịp chương hợp lý.', likes: 24, createdAt: '2026-04-22T08:00:00.000Z' },
    { id: `${story.id}-rv2`, userName: 'Reader 88', rating: 4, body: 'Đáng đọc, đặc biệt là các đoạn cao trào và cách xây dựng tuyến phụ.', likes: 11, createdAt: '2026-04-20T08:00:00.000Z' }
  ];
}

async function fetchSafe(apiClient, path, options) {
  if (!apiClient) return null;
  try {
    return await apiClient(path, options);
  } catch {
    return null;
  }
}

function findMockStory(slug) {
  return normalizeStory(mockStories.find(item => item.slug === slug || item.id === slug) || mockStories[0]);
}

function readContinueProgress(slug) {
  try {
    return JSON.parse(localStorage.getItem(`daudo_reader_progress:${slug}`) || 'null');
  } catch {
    return null;
  }
}

function useModalDismiss(onClose) {
  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return event => {
    if (event.target === event.currentTarget) onClose();
  };
}

export function StoryDetailPage({ apiClient, user, updateUser }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = useState(null);
  const [related, setRelated] = useState([]);
  const [authorStories, setAuthorStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [activeTab, setActiveTab] = useState('intro');
  const [purchaseTarget, setPurchaseTarget] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);

  async function loadDetail() {
    setLoading(true);
    setError('');
    const result = await fetchSafe(apiClient, `/stories/${slug}`);
    if (result?.story) {
      const story = normalizeStory(result.story);
      const chapters = (result.chapters || []).map(normalizeChapter);
      const comments = result.comments || [];
      setPayload({ story, chapters, comments: comments.length ? comments : mockComments(story.id || story.slug), reviews: mockReviews(story) });
      setLoading(false);
      return;
    }

    const story = findMockStory(slug);
    setPayload({ story, chapters: generateMockChapters(story), comments: mockComments(story.id || story.slug), reviews: mockReviews(story) });
        setError('Không kết nối được API, đang hiển thị dữ liệu dự phòng cho trang chi tiết.');
    setLoading(false);
  }

  useEffect(() => {
    loadDetail();
  }, [slug]);

  useEffect(() => {
    if (!payload?.story) return;
    let alive = true;
    async function loadRelated() {
      const category = payload.story.categories?.[0];
      const [categoryResult, authorResult] = await Promise.all([
        category ? fetchSafe(apiClient, `/stories?category=${encodeURIComponent(category)}&sort=views`) : null,
        payload.story.author ? fetchSafe(apiClient, `/stories?q=${encodeURIComponent(payload.story.author)}&sort=updated`) : null
      ]);
      if (!alive) return;
      const relatedStories = (categoryResult?.stories || mockStories)
        .map(normalizeStory)
        .filter(item => item.slug !== payload.story.slug && (!category || item.categories?.includes(category)))
        .slice(0, 6);
      const sameAuthor = (authorResult?.stories || mockStories)
        .map(normalizeStory)
        .filter(item => item.slug !== payload.story.slug && item.author === payload.story.author)
        .slice(0, 5);
      setRelated(relatedStories);
      setAuthorStories(sameAuthor);
    }
    loadRelated();
    return () => {
      alive = false;
    };
  }, [apiClient, payload?.story?.slug]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (loading) return <StoryDetailLoading />;
  if (!payload) return <div className="sd-empty">Không tìm thấy truyện.</div>;

  const { story, chapters } = payload;
  const continueProgress = readContinueProgress(story.slug);
  const firstChapter = chapters[0]?.number || 1;
  const seoDescription = story.description || `Đọc ${story.title} của ${story.author || 'tác giả đang cập nhật'} trên Đậu Đỏ Truyện.`;
  const seoSchema = [
    buildStorySchema(story),
    buildBreadcrumbSchema([
      { name: 'Trang chủ', item: '/' },
      { name: 'Danh sách truyện', item: '/danh-sach' },
      { name: story.title, item: `/truyen/${story.slug}` }
    ])
  ];

  async function toggleStory(type) {
    if (!user) {
      setToast('Bạn cần đăng nhập để dùng chức năng này.');
      return;
    }
    const result = await fetchSafe(apiClient, `/stories/${story.id}/${type}`, { method: 'POST' });
    if (!result) {
      setToast('Không thể cập nhật lúc này.');
      return;
    }
    setPayload(current => ({
      ...current,
      story: {
        ...current.story,
        bookmarked: result.bookmarked ?? current.story.bookmarked,
        followed: result.followed ?? current.story.followed,
        follows: result.follows ?? current.story.follows
      }
    }));
    setToast(type === 'follow' ? 'Đã cập nhật theo dõi.' : 'Đã cập nhật yêu thích.');
  }

  async function submitRating(value, reviewText = '') {
    if (!user) {
      setToast('Bạn cần đăng nhập để đánh giá.');
      return false;
    }
    const result = await fetchSafe(apiClient, `/stories/${story.id}/rating`, { method: 'POST', body: JSON.stringify({ value }) });
    if (!result) {
      setToast('Không thể lưu đánh giá.');
      return false;
    }
    setPayload(current => ({
      ...current,
      story: { ...current.story, rating: result.rating, ratingCount: result.ratingCount, myRating: result.myRating },
      reviews: reviewText
        ? [{ id: `local-${Date.now()}`, userName: user.name || 'Bạn', rating: value, body: reviewText, likes: 0, createdAt: new Date().toISOString() }, ...current.reviews]
        : current.reviews
    }));
    setToast('Đã lưu đánh giá của bạn.');
    return true;
  }

  async function submitComment(body, parentId) {
    if (!user) {
      setToast('Bạn cần đăng nhập để bình luận.');
      return false;
    }
    const result = await fetchSafe(apiClient, `/stories/${story.id}/comments`, { method: 'POST', body: JSON.stringify({ body, parentId }) });
    const savedComment = result?.comment || { id: parentId ? `reply-${Date.now()}` : `comment-${Date.now()}`, userName: user.name || 'Bạn', userAvatar: user.avatar, body, likes: 0, createdAt: new Date().toISOString(), replies: [] };
    if (parentId) {
      setPayload(current => ({
        ...current,
        comments: current.comments.map(comment => comment.id === parentId
          ? { ...comment, replies: [...(comment.replies || []), savedComment] }
          : comment)
      }));
      setToast('Đã gửi phản hồi.');
      return true;
    }
    setPayload(current => ({ ...current, comments: [savedComment, ...current.comments] }));
    setToast('Đã gửi bình luận.');
    return true;
  }

  async function submitReport(reason, note, target = reportTarget) {
    if (!user) {
      setToast('Bạn cần đăng nhập để báo lỗi.');
      return false;
    }
    const suffix = target?.type === 'chapter' ? `Chương ${target.chapter?.number}` : 'Truyện';
    const result = await fetchSafe(apiClient, `/stories/${story.id}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason: `${suffix}: ${reason}${note ? ` - ${note}` : ''}` })
    });
    if (!result) {
      setToast('Không thể gửi báo lỗi.');
      return false;
    }
    setToast('Đã gửi báo lỗi cho admin.');
    return true;
  }

  async function purchaseChapter(target) {
    if (!user) {
      setToast('Bạn cần đăng nhập để mua chương.');
      return false;
    }
    if (target?.mode === 'combo') {
      const result = await fetchSafe(apiClient, `/stories/${story.id}/unlock-combo`, { method: 'POST' });
      if (!result) {
        setToast('Không thể mua combo lúc này.');
        return false;
      }
      updateUser?.(result.user);
      setToast(result.price ? `Đã mua combo với ${result.price} Đậu.` : 'Combo đã được mở khóa.');
      return true;
    }
    const result = await fetchSafe(apiClient, `/chapters/${target.chapter.id}/unlock`, { method: 'POST' });
    if (!result) {
      setToast('Không thể mua chương lúc này.');
      return false;
    }
    updateUser?.(result.user);
    setToast('Đã mở khóa chương.');
    navigate(`/truyen/${story.slug}/chuong/${target.chapter.number}`);
    return true;
  }

  return (
    <div className="sd-page">
      <PageSeo
        title={`${story.title} - ${story.author || 'Đang cập nhật'}`}
        description={seoDescription}
        image={story.banner || story.cover || coverFallback}
        type="book"
        canonical={`/truyen/${story.slug}`}
        schema={seoSchema}
      />
      {error && <div className="sd-warning">{error}</div>}
      {toast && <div className="sd-toast">{toast}</div>}
      <StoryDetailHero
        story={story}
        chapters={chapters}
        continueProgress={continueProgress}
        firstChapter={firstChapter}
        onFollow={() => toggleStory('follow')}
        onFavorite={() => toggleStory('bookmark')}
        onReport={() => setReportTarget({ type: 'story' })}
        onCombo={() => setPurchaseTarget({ mode: 'combo' })}
      />
      <div className="sd-main-grid">
        <div className="sd-main-column">
          <StoryDetailTabs activeTab={activeTab} setActiveTab={setActiveTab} counts={{ chapters: chapters.length, reviews: payload.reviews.length, comments: payload.comments.length }} />
          {activeTab === 'intro' && <IntroTab story={story} chapters={chapters} />}
          {activeTab === 'chapters' && <ChapterList story={story} chapters={chapters} onPurchase={chapter => setPurchaseTarget({ mode: 'single', chapter })} onReport={chapter => setReportTarget({ type: 'chapter', chapter })} />}
          {activeTab === 'reviews' && <ReviewSection story={story} reviews={payload.reviews} onSubmit={submitRating} />}
          {activeTab === 'discussion' && <CommentSection comments={payload.comments} onSubmit={submitComment} onReport={comment => setReportTarget({ type: 'comment', comment })} />}
        </div>
        <RelatedStoriesSidebar story={story} related={related} authorStories={authorStories} />
      </div>
      {purchaseTarget && <PurchaseChapterModal story={story} chapters={chapters} target={purchaseTarget} onClose={() => setPurchaseTarget(null)} onConfirm={purchaseChapter} />}
      {reportTarget && <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} onSubmit={submitReport} />}
    </div>
  );
}

function StoryDetailLoading() {
  return (
    <div className="sd-page">
      <div className="sd-hero-skeleton" />
      <div className="sd-card-skeleton">{Array.from({ length: 4 }).map((_, index) => <span key={index} />)}</div>
    </div>
  );
}

export function StoryDetailHero({ story, chapters, continueProgress, firstChapter, onFollow, onFavorite, onReport, onCombo }) {
  const chapterCount = chapters.length || getChapterCount(story);
  const freeCount = chapters.filter(chapter => !chapter.isPremium).length;
  const comboPrice = Math.max(49, (story.price || 1) * Math.max(chapterCount, 1));
  return (
    <section className="sd-hero" style={{ '--sd-bg': `url("${story.banner || story.cover || coverFallback}")` }}>
      <div className="sd-cover-wrap">
        <img src={story.cover || coverFallback} alt={story.title} loading="lazy" onError={handleImageError} />
        {story.premium && <b>VIP</b>}
      </div>
      <div className="sd-hero-copy">
        <div className="sd-breadcrumb"><Link to="/">Trang chủ</Link><span>/</span><Link to="/danh-sach">Danh sách</Link><span>/</span><b>{story.title}</b></div>
        <div className="sd-tags">{story.categories?.map(category => <Link key={category} to={`/the-loai/${encodeURIComponent(category)}`}>{category}</Link>)}</div>
        <h1>{story.title}</h1>
        <p className="sd-author">Tác giả: <Link to={`/tac-gia/${encodeURIComponent(story.author || '')}`}>{story.author || 'Đang cập nhật'}</Link>{story.translator && <span> · Dịch giả: {story.translator}</span>}</p>
        <div className="sd-stats">
          <span>{statusLabel(story.status)}</span>
          <span>{formatNumber(chapterCount)} chương</span>
          <span>{formatNumber(story.views)} lượt đọc</span>
          <span>{formatNumber(story.follows)} lượt thích</span>
          <span>★ {story.rating || 4.5}</span>
        </div>
        <p className="sd-description">{story.description}</p>
        {story.ageRating === '18' && <div className="sd-content-warning">Cảnh báo nội dung: truyện có thể không phù hợp với độc giả nhỏ tuổi.</div>}
        <div className="sd-offer-strip">
          <span><b>{freeCount}</b> chương miễn phí</span>
                <span><b>{story.price || 1}</b> Đậu/chương VIP</span>
                <span><b>{comboPrice}</b> Đậu combo</span>
        </div>
        <div className="sd-actions">
          <Link className="sd-primary" to={`/truyen/${story.slug}/chuong/${firstChapter}`}>Đọc ngay</Link>
          {continueProgress && <Link className="sd-primary soft" to={`/truyen/${story.slug}/chuong/${continueProgress.chapterNumber}`}>Đọc tiếp chương {continueProgress.chapterNumber}</Link>}
          <button type="button" onClick={onFollow}>{story.followed ? 'Đang theo dõi' : 'Theo dõi'}</button>
          <button type="button" onClick={onFavorite}>{story.bookmarked ? 'Đã yêu thích' : 'Yêu thích'}</button>
          <button type="button" onClick={onCombo}>Mua combo</button>
          <button type="button" onClick={onReport}>Báo lỗi</button>
        </div>
      </div>
    </section>
  );
}

export function StoryDetailTabs({ activeTab, setActiveTab, counts }) {
  const tabs = [
    ['intro', 'Giới thiệu', null],
    ['chapters', 'Danh sách chương', counts.chapters],
    ['reviews', 'Đánh giá', counts.reviews],
    ['discussion', 'Thảo luận', counts.comments]
  ];
  return (
    <div className="sd-tabs">
      {tabs.map(([value, label, count]) => (
        <button key={value} type="button" className={activeTab === value ? 'active' : ''} onClick={() => setActiveTab(value)}>
          {label}{count !== null && <span>{count}</span>}
        </button>
      ))}
    </div>
  );
}

function IntroTab({ story, chapters }) {
  return (
    <section className="sd-panel">
      <h2>Giới thiệu truyện</h2>
      <p>{story.description}</p>
      <div className="sd-info-grid">
        <span><b>Trạng thái</b>{statusLabel(story.status)}</span>
        <span><b>Số chương</b>{formatNumber(chapters.length || getChapterCount(story))}</span>
        <span><b>Ngày cập nhật</b>{formatDate(story.updatedAt)}</span>
        <span><b>Ngôn ngữ</b>{story.language || 'Tiếng Việt'}</span>
      </div>
    </section>
  );
}

export function ChapterList({ story, chapters, onPurchase, onReport }) {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState('asc');
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return chapters
      .filter(chapter => !text || `${chapter.number} ${chapter.title}`.toLowerCase().includes(text))
      .sort((a, b) => order === 'asc' ? a.number - b.number : b.number - a.number);
  }, [chapters, query, order]);

  return (
    <section className="sd-panel">
      <div className="sd-chapter-tools">
        <label><span>Tìm chương</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Nhập số hoặc tên chương..." /></label>
        <button type="button" onClick={() => setOrder(value => value === 'asc' ? 'desc' : 'asc')}>{order === 'asc' ? 'Cũ trước' : 'Mới trước'}</button>
      </div>
      <div className="sd-chapter-list">
        {filtered.map(chapter => (
          <div key={chapter.id} className={chapter.isPremium ? 'vip' : ''}>
            <Link to={`/truyen/${story.slug}/chuong/${chapter.number}`}>
              <strong>{chapter.isPremium ? '🔒 ' : ''}Chương {chapter.number}: {chapter.title.replace(/^Chương\s*\d+[:：-]?\s*/i, '')}</strong>
                        <small>{chapter.isPremium ? `${chapter.price || story.price || 1} Đậu` : 'Miễn phí'} · {formatNumber(chapter.views)} lượt đọc</small>
            </Link>
            <span>
              {chapter.isPremium && <button type="button" onClick={() => onPurchase(chapter)}>Mua</button>}
              <button type="button" onClick={() => onReport(chapter)}>Báo lỗi</button>
            </span>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <div className="sd-empty">Không tìm thấy chương phù hợp.</div>}
    </section>
  );
}

export function ReviewSection({ story, reviews, onSubmit }) {
  const [rating, setRating] = useState(story.myRating || 5);
  const [text, setText] = useState('');
  async function submit(event) {
    event.preventDefault();
    const ok = await onSubmit(rating, text);
    if (ok) setText('');
  }
  return (
    <section className="sd-panel">
      <div className="sd-review-summary">
        <strong>{story.rating || 4.5}</strong>
        <span>{[1, 2, 3, 4, 5].map(value => <b key={value}>★</b>)}</span>
        <small>{story.ratingCount || reviews.length} lượt đánh giá</small>
      </div>
      <form className="sd-review-form" onSubmit={submit}>
        <label>Đánh giá sao</label>
        <div>{[1, 2, 3, 4, 5].map(value => <button type="button" key={value} className={value <= rating ? 'active' : ''} onClick={() => setRating(value)}>★</button>)}</div>
        <textarea value={text} onChange={event => setText(event.target.value)} placeholder="Viết review ngắn về truyện..." />
        <button type="submit">Gửi đánh giá</button>
      </form>
      <div className="sd-review-list">
        {reviews.map(review => (
          <article key={review.id}>
            <strong>{review.userName}<span>{'★'.repeat(review.rating)}</span></strong>
            <p>{review.body}</p>
            <small>{formatDate(review.createdAt)} · {review.likes} lượt thích</small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CommentSection({ comments, onSubmit, onReport }) {
  const [text, setText] = useState('');
  const [sort, setSort] = useState('latest');
  const [replying, setReplying] = useState('');
  const [replyText, setReplyText] = useState('');
  const sorted = comments.slice().sort((a, b) => sort === 'popular' ? (b.likes || 0) - (a.likes || 0) : new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  async function submitMain(event) {
    event.preventDefault();
    if (!text.trim()) return;
    const ok = await onSubmit(text.trim());
    if (ok) setText('');
  }

  async function submitReply(commentId) {
    if (!replyText.trim()) return;
    const ok = await onSubmit(replyText.trim(), commentId);
    if (ok) {
      setReplyText('');
      setReplying('');
    }
  }

  return (
    <section className="sd-panel">
      <div className="sd-comment-head">
        <h2>Thảo luận</h2>
        <select value={sort} onChange={event => setSort(event.target.value)}>
          <option value="latest">Mới nhất</option>
          <option value="popular">Nổi bật</option>
        </select>
      </div>
      <form className="sd-comment-form" onSubmit={submitMain}>
        <textarea value={text} onChange={event => setText(event.target.value)} placeholder="Chia sẻ cảm nhận hoặc đặt câu hỏi..." />
        <button type="submit">Gửi bình luận</button>
      </form>
      <div className="sd-comment-list">
        {sorted.map(comment => (
          <article key={comment.id}>
            <img src={comment.userAvatar || '/images/logo.png'} alt={comment.userName || 'avatar'} onError={handleImageError} />
            <div>
              <strong>{comment.userName || 'Độc giả'}</strong>
              <p>{comment.body}</p>
              <div className="sd-comment-actions">
                <button type="button">Thích ({comment.likes || 0})</button>
                <button type="button" onClick={() => setReplying(comment.id)}>Trả lời</button>
                <button type="button" onClick={() => onReport(comment)}>Báo cáo</button>
              </div>
              {(comment.replies || []).map(reply => <p key={reply.id} className="sd-reply"><b>{reply.userName}</b> {reply.body}</p>)}
              {replying === comment.id && (
                <div className="sd-reply-form">
                  <input value={replyText} onChange={event => setReplyText(event.target.value)} placeholder="Nhập phản hồi..." />
                  <button type="button" onClick={() => submitReply(comment.id)}>Gửi</button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function RelatedStoriesSidebar({ story, related, authorStories }) {
  return (
    <aside className="sd-sidebar">
      <SidebarBlock title="Cùng thể loại" to={story.categories?.[0] ? `/the-loai/${encodeURIComponent(story.categories[0])}` : '/danh-sach'} stories={related} />
      <SidebarBlock title="Cùng tác giả" to={`/tac-gia/${encodeURIComponent(story.author || '')}`} stories={authorStories} />
    </aside>
  );
}

function SidebarBlock({ title, to, stories }) {
  return (
    <section>
      <div><h3>{title}</h3><Link to={to}>Xem thêm</Link></div>
      {stories.length ? stories.map(story => (
        <Link key={story.id || story.slug} to={`/truyen/${story.slug}`} className="sd-side-story">
          <img src={story.cover || coverFallback} alt={story.title} loading="lazy" onError={handleImageError} />
          <span><strong>{story.title}</strong><small>{story.author} · ★ {story.rating}</small></span>
        </Link>
      )) : <p className="sd-side-empty">Chưa có gợi ý phù hợp.</p>}
    </section>
  );
}

export function PurchaseChapterModal({ story, chapters, target, onClose, onConfirm }) {
  const [submitting, setSubmitting] = useState(false);
  const closeByBackdrop = useModalDismiss(onClose);
  const premiumCount = chapters.filter(chapter => chapter.isPremium).length;
  const comboPrice = Math.max(49, (story.price || 1) * Math.max(chapters.length, 1));
  const isCombo = target.mode === 'combo';
  const price = isCombo ? comboPrice : target.chapter?.price || story.price || 1;
  async function confirm() {
    setSubmitting(true);
    const ok = await onConfirm(target);
    setSubmitting(false);
    if (ok) onClose();
  }
  return (
    <div className="sd-modal-backdrop" role="dialog" aria-modal="true" onMouseDown={closeByBackdrop}>
      <div className="sd-modal">
        <button className="sd-modal-close" type="button" onClick={onClose}>×</button>
        <h2>{isCombo ? 'Mua combo truyện' : 'Mua chương lẻ'}</h2>
        <p>{isCombo ? `Mở khóa ${premiumCount} chương VIP hiện có của ${story.title}.` : `Mở khóa chương ${target.chapter?.number}: ${target.chapter?.title}`}</p>
        <div className="sd-purchase-price"><strong>{formatNumber(price)} Đậu</strong><span>{isCombo ? 'Combo trọn bộ' : 'Thanh toán một lần'}</span></div>
        <div className="sd-modal-actions">
          <button type="button" onClick={onClose}>Hủy</button>
          <button type="button" disabled={submitting} onClick={confirm}>{submitting ? 'Đang xử lý...' : 'Xác nhận mua'}</button>
        </div>
      </div>
    </div>
  );
}

export function ReportModal({ target, onClose, onSubmit }) {
  const [reason, setReason] = useState(reportReasons[0]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const closeByBackdrop = useModalDismiss(onClose);
  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    const ok = await onSubmit(reason, note, target);
    setSubmitting(false);
    if (ok) onClose();
  }
  return (
    <div className="sd-modal-backdrop" role="dialog" aria-modal="true" onMouseDown={closeByBackdrop}>
      <form className="sd-modal" onSubmit={submit}>
        <button className="sd-modal-close" type="button" onClick={onClose}>×</button>
        <h2>Báo lỗi {target?.type === 'chapter' ? `chương ${target.chapter?.number}` : target?.type === 'comment' ? 'bình luận' : 'truyện'}</h2>
        <label>Lý do<select value={reason} onChange={event => setReason(event.target.value)}>{reportReasons.map(item => <option key={item}>{item}</option>)}</select></label>
        <label>Ghi chú<textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Mô tả ngắn vấn đề bạn gặp..." /></label>
        <div className="sd-modal-actions">
          <button type="button" onClick={onClose}>Hủy</button>
          <button type="submit" disabled={submitting}>{submitting ? 'Đang gửi...' : 'Gửi báo lỗi'}</button>
        </div>
      </form>
    </div>
  );
}

function handleImageError(event) {
  if (event.currentTarget.src.endsWith(coverFallback)) return;
  event.currentTarget.src = coverFallback;
}
