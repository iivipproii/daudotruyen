import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { mockStories } from '../../data/mockStories';
import { ReportModal } from '../story/StoryDetailPage.jsx';
import { PageSeo, buildBreadcrumbSchema } from '../shared/Seo.jsx';

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

const defaultSettings = {
  fontSize: 18,
  fontFamily: 'system',
  lineHeight: 1.9,
  width: 760,
  tone: 'white',
  autoScrollSpeed: 1.2
};

const toneOptions = [
  ['white', 'Trắng'],
  ['cream', 'Kem'],
  ['dark', 'Tối'],
  ['green', 'Xanh dịu']
];

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

function generateMockChapters(story) {
  const count = Math.max(24, Math.min(getChapterCount(story) || 48, 120));
  return Array.from({ length: count }).map((_, index) => {
    const number = index + 1;
    const premium = Boolean(story.premium && number > 5);
    return {
      id: `${story.id || story.slug}-chapter-${number}`,
      storyId: story.id,
      number,
      title: `Chương ${number}: ${number % 4 === 0 ? 'Dư âm trong đêm' : number % 3 === 0 ? 'Lời hẹn cũ' : 'Bước ngoặt mới'}`,
      isPremium: premium,
      price: premium ? story.price || 3 : 0,
      views: Math.max(100, Math.round(Number(story.views || 8000) / (number + 10))),
      updatedAt: story.updatedAt,
      content: [
        `Đây là nội dung mẫu của chương ${number} trong ${story.title}. Bố cục được chia thành các đoạn ngắn để dễ đọc trên cả máy tính và điện thoại.`,
        'Nhân vật chính tiếp tục đi qua một biến cố mới. Mỗi chi tiết đều được giữ ở nhịp vừa phải, giúp người đọc tập trung vào mạch truyện.',
        'Gió ngoài hiên thổi nhẹ. Những lời chưa nói hết ở chương trước trở thành chìa khóa cho lựa chọn tiếp theo.',
        'Khi màn đêm buông xuống, câu chuyện mở ra một lớp bí mật khác và để lại lời hẹn cho chương sau.'
      ].join('\n\n')
    };
  });
}

function findMockStory(slug) {
  return normalizeStory(mockStories.find(item => item.slug === slug || item.id === slug) || mockStories[0]);
}

async function fetchSafe(apiClient, path, options) {
  if (!apiClient) return null;
  try {
    return await apiClient(path, options);
  } catch {
    return null;
  }
}

function loadSettings() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem('daudo_reader_settings') || '{}') };
  } catch {
    return defaultSettings;
  }
}

function mockChapterComments(chapterId) {
  return [
    { id: `${chapterId}-cc1`, userName: 'Bạn đọc ẩn danh', body: 'Đoạn này mở nút khá tốt.', likes: 7, replies: [] },
    { id: `${chapterId}-cc2`, userName: 'Minh An', body: 'Mong chương sau giải thích thêm về nhân vật phụ.', likes: 3, replies: [] }
  ];
}

export function ReaderPage({ apiClient, user, updateUser }) {
  const { slug, number } = useParams();
  const navigate = useNavigate();
  const articleRef = useRef(null);
  const touchStartRef = useRef(null);
  const autoScrollRef = useRef(null);
  const [payload, setPayload] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [settings, setSettings] = useState(loadSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [progress, setProgress] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chapterListOpen, setChapterListOpen] = useState(false);
  const [toolbarHidden, setToolbarHidden] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [comments, setComments] = useState([]);
  const [reportTarget, setReportTarget] = useState(null);
  const [unlocked, setUnlocked] = useState(true);

  async function loadReader() {
    setLoading(true);
    setError('');
    const [chapterResult, detailResult] = await Promise.all([
      fetchSafe(apiClient, `/stories/${slug}/chapters/${number}`),
      fetchSafe(apiClient, `/stories/${slug}`)
    ]);

    if (chapterResult?.story && chapterResult?.chapter) {
      const story = normalizeStory(chapterResult.story);
      const chapter = normalizeChapter(chapterResult.chapter);
      setPayload({ story, chapter });
      setUnlocked(Boolean(chapterResult.unlocked));
      setChapters((detailResult?.chapters || []).map(normalizeChapter));
      setComments(mockChapterComments(chapter.id));
      setLoading(false);
      return;
    }

    const story = findMockStory(slug);
    const mockChapters = generateMockChapters(story);
    const chapter = mockChapters.find(item => item.number === Number(number)) || mockChapters[0];
    setPayload({ story, chapter });
    setUnlocked(!chapter.isPremium);
    setChapters(mockChapters);
    setComments(mockChapterComments(chapter.id));
        setError('Không kết nối được API, đang hiển thị dữ liệu dự phòng cho trang đọc.');
    setLoading(false);
  }

  useEffect(() => {
    loadReader();
    setProgress(0);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [slug, number]);

  useEffect(() => {
    if (!payload?.story || !payload?.chapter) return;
    try {
      const saved = JSON.parse(localStorage.getItem('daudo_chapter_bookmarks') || '[]');
      setBookmarked(saved.some(item => item.id === `${payload.story.slug}-${payload.chapter.number}`));
    } catch {
      setBookmarked(false);
    }
  }, [payload?.story?.slug, payload?.chapter?.number]);

  useEffect(() => {
    localStorage.setItem('daudo_reader_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const nextProgress = Math.min(100, Math.max(0, Math.round((window.scrollY / max) * 100)));
      setProgress(nextProgress);
      setToolbarHidden(window.scrollY > lastY && window.scrollY > 140);
      lastY = window.scrollY;
      if (payload?.story && payload?.chapter) {
        localStorage.setItem(`daudo_reader_progress:${payload.story.slug}`, JSON.stringify({
          chapterNumber: payload.chapter.number,
          progress: nextProgress,
          updatedAt: new Date().toISOString()
        }));
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [payload?.story?.slug, payload?.chapter?.number]);

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setSettingsOpen(false);
        setChapterListOpen(false);
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === 'ArrowLeft') goChapter('prev');
      if (event.key === 'ArrowRight') goChapter('next');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [payload, chapters]);

  useEffect(() => {
    if (!autoScroll) {
      if (autoScrollRef.current) window.clearInterval(autoScrollRef.current);
      return undefined;
    }
    autoScrollRef.current = window.setInterval(() => {
      window.scrollBy({ top: settings.autoScrollSpeed, behavior: 'auto' });
    }, 24);
    return () => window.clearInterval(autoScrollRef.current);
  }, [autoScroll, settings.autoScrollSpeed]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const currentIndex = chapters.findIndex(chapter => chapter.number === Number(number));
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  function goChapter(direction) {
    const target = direction === 'prev' ? prevChapter : nextChapter;
    if (target && payload?.story) navigate(`/truyen/${payload.story.slug}/chuong/${target.number}`);
  }

  async function unlockChapter() {
    if (!user) {
      setToast('Bạn cần đăng nhập để mở khóa chương.');
      return;
    }
    const result = await fetchSafe(apiClient, `/chapters/${payload.chapter.id}/unlock`, { method: 'POST' });
    if (!result) {
      setToast('Không thể mở khóa chương.');
      return;
    }
    updateUser?.(result.user);
    setToast('Đã mở khóa chương.');
    await loadReader();
  }

  async function bookmarkChapter() {
    if (!payload?.story || !payload?.chapter) return;
    const key = 'daudo_chapter_bookmarks';
    let current = [];
    try {
      current = JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      current = [];
    }
    const bookmarkId = `${payload.story.slug}-${payload.chapter.number}`;
    if (bookmarked) {
      localStorage.setItem(key, JSON.stringify(current.filter(item => item.id !== bookmarkId)));
      setBookmarked(false);
      setToast('Đã bỏ bookmark chương.');
      return;
    }
    const next = [{
      id: bookmarkId,
      story: payload.story,
      chapter: payload.chapter,
      position: progress,
      savedAt: new Date().toISOString()
    }, ...current.filter(item => item.id !== bookmarkId)].slice(0, 30);
    localStorage.setItem(key, JSON.stringify(next));
    setBookmarked(true);
    setToast('Đã bookmark chương.');
  }

  async function submitReport(reason, note) {
    if (!user) {
      setToast('Bạn cần đăng nhập để báo lỗi.');
      return false;
    }
    const result = await fetchSafe(apiClient, `/stories/${payload.story.id}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason: `Chương ${payload.chapter.number}: ${reason}${note ? ` - ${note}` : ''}` })
    });
    if (!result) {
      setToast('Không thể gửi báo lỗi.');
      return false;
    }
    setToast('Đã gửi báo lỗi chương.');
    return true;
  }

  function submitComment(body, parentId) {
    if (!body.trim()) return;
    if (parentId) {
      setComments(current => current.map(comment => comment.id === parentId ? {
        ...comment,
        replies: [...(comment.replies || []), { id: `reply-${Date.now()}`, userName: user?.name || 'Bạn', body, likes: 0 }]
      } : comment));
    } else {
      setComments(current => [{ id: `cc-${Date.now()}`, userName: user?.name || 'Bạn', body, likes: 0, replies: [] }, ...current]);
    }
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  function handleTouchStart(event) {
    touchStartRef.current = event.touches[0].clientX;
  }

  function handleTouchEnd(event) {
    const start = touchStartRef.current;
    if (start === null) return;
    const diff = event.changedTouches[0].clientX - start;
    if (Math.abs(diff) > 80) {
      goChapter(diff > 0 ? 'prev' : 'next');
    }
    touchStartRef.current = null;
  }

  if (loading) return <ReaderLoading />;
  if (!payload) return <div className="rp-empty">Không tìm thấy chương.</div>;

  const { story, chapter } = payload;
  const contentLines = String(chapter.content || '').split('\n');
  const readerDescription = `Đọc ${chapter.title} của ${story.title} trên Đậu Đỏ Truyện. Tùy chỉnh cỡ chữ, nền đọc, bookmark và chuyển chương nhanh.`;
  const readerSchema = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: `${story.title} - ${chapter.title}`,
      author: story.author ? { '@type': 'Person', name: story.author } : undefined,
      image: story.cover || coverFallback,
      isPartOf: { '@type': 'Book', name: story.title }
    },
    buildBreadcrumbSchema([
      { name: 'Trang chủ', item: '/' },
      { name: story.title, item: `/truyen/${story.slug}` },
      { name: `Chương ${chapter.number}`, item: `/truyen/${story.slug}/chuong/${chapter.number}` }
    ])
  ];

  return (
    <div className={`rp-page tone-${settings.tone}`} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PageSeo
        title={`${story.title} - ${chapter.title}`}
        description={readerDescription}
        image={story.cover || coverFallback}
        type="article"
        canonical={`/truyen/${story.slug}/chuong/${chapter.number}`}
        schema={readerSchema}
      />
      <ReaderProgressBar progress={progress} />
      {toast && <div className="rp-toast">{toast}</div>}
      <ReaderToolbar
        story={story}
        chapter={chapter}
        hidden={toolbarHidden}
        prevChapter={prevChapter}
        nextChapter={nextChapter}
        onPrev={() => goChapter('prev')}
        onNext={() => goChapter('next')}
        onSettings={() => setSettingsOpen(value => !value)}
        onChapterList={() => setChapterListOpen(value => !value)}
        onBookmark={bookmarkChapter}
        onReport={() => setReportTarget({ type: 'chapter', chapter })}
        onFullscreen={toggleFullscreen}
        bookmarked={bookmarked}
      />

      {settingsOpen && <ReaderSettings settings={settings} setSettings={setSettings} autoScroll={autoScroll} setAutoScroll={setAutoScroll} />}
      {chapterListOpen && <QuickChapterList story={story} chapters={chapters} currentNumber={chapter.number} onClose={() => setChapterListOpen(false)} />}

      <main className="rp-reader-wrap">
        {error && <div className="rp-warning">{error}</div>}
        <article
          ref={articleRef}
          className="rp-article"
          style={{
            '--rp-font-size': `${settings.fontSize}px`,
            '--rp-line-height': settings.lineHeight,
            '--rp-width': `${settings.width}px`,
            '--rp-font-family': settings.fontFamily === 'serif' ? 'Georgia, Times New Roman, serif' : settings.fontFamily === 'mono' ? 'ui-monospace, SFMono-Regular, Consolas, monospace' : 'Inter, system-ui, sans-serif'
          }}
        >
          <header>
            <nav className="rp-breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Trang chủ</Link>
              <span>/</span>
              <Link to={`/truyen/${story.slug}`}>{story.title}</Link>
              <span>/</span>
              <b>Chương {chapter.number}</b>
            </nav>
            <h1>{chapter.title}</h1>
            <p>{story.author} · {formatDate(chapter.updatedAt || story.updatedAt)} · {formatNumber(chapter.views)} lượt đọc</p>
          </header>

          {!unlocked && (
            <div className="rp-paywall">
              <h2>Chương VIP</h2>
              <p>Bạn đang xem bản preview. Mở khóa chương để đọc đầy đủ nội dung.</p>
              <button type="button" onClick={unlockChapter}>Mở khóa {chapter.price || story.price || 1} xu</button>
            </div>
          )}

          <div className="rp-content">
            {contentLines.map((line, index) => line.trim() ? <p key={index}>{line}</p> : <br key={index} />)}
          </div>

          <nav className="rp-bottom-nav">
            <button type="button" disabled={!prevChapter} onClick={() => goChapter('prev')}>Chương trước</button>
            <Link to={`/truyen/${story.slug}`}>Chi tiết truyện</Link>
            <button type="button" disabled={!nextChapter} onClick={() => goChapter('next')}>Chương sau</button>
          </nav>
        </article>

        <ChapterCommentSection comments={comments} onSubmit={submitComment} onReport={comment => setReportTarget({ type: 'comment', comment })} />
      </main>

      {reportTarget && <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} onSubmit={submitReport} />}
    </div>
  );
}

function ReaderLoading() {
  return (
    <div className="rp-page tone-white">
      <div className="rp-loading">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function ReaderProgressBar({ progress }) {
  return <div className="rp-progress"><span style={{ width: `${progress}%` }} /></div>;
}

export function ReaderToolbar({ story, chapter, hidden, prevChapter, nextChapter, onPrev, onNext, onSettings, onChapterList, onBookmark, onReport, onFullscreen, bookmarked }) {
  return (
    <header className={hidden ? 'rp-toolbar hidden' : 'rp-toolbar'}>
      <div className="rp-toolbar-left">
        <Link to={`/truyen/${story.slug}`}>←</Link>
        <span><strong>{story.title}</strong><small>Chương {chapter.number}</small></span>
      </div>
      <div className="rp-toolbar-actions">
        <button type="button" disabled={!prevChapter} onClick={onPrev} title="Chương trước">‹</button>
        <button type="button" onClick={onChapterList} title="Danh sách chương">☷</button>
        <button type="button" disabled={!nextChapter} onClick={onNext} title="Chương sau">›</button>
        <button type="button" onClick={onSettings} title="Cài đặt đọc">Aa</button>
        <button type="button" className={bookmarked ? 'active' : ''} onClick={onBookmark} title="Bookmark chương">★</button>
        <button type="button" onClick={onReport} title="Báo lỗi chương">!</button>
        <button type="button" onClick={onFullscreen} title="Toàn màn hình">⛶</button>
      </div>
    </header>
  );
}

export function ReaderSettings({ settings, setSettings, autoScroll, setAutoScroll }) {
  function patch(next) {
    setSettings(current => ({ ...current, ...next }));
  }
  return (
    <aside className="rp-settings">
      <h2>Cài đặt đọc</h2>
      <label>Cỡ chữ <input type="range" min="14" max="28" value={settings.fontSize} onChange={event => patch({ fontSize: Number(event.target.value) })} /><span>{settings.fontSize}px</span></label>
      <label>Font chữ <select value={settings.fontFamily} onChange={event => patch({ fontFamily: event.target.value })}><option value="system">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select></label>
      <label>Khoảng dòng <input type="range" min="1.5" max="2.4" step="0.1" value={settings.lineHeight} onChange={event => patch({ lineHeight: Number(event.target.value) })} /><span>{settings.lineHeight}</span></label>
      <label>Chiều rộng <input type="range" min="620" max="1060" step="20" value={settings.width} onChange={event => patch({ width: Number(event.target.value) })} /><span>{settings.width}px</span></label>
      <div className="rp-tone-row">
        {toneOptions.map(([value, label]) => <button type="button" key={value} className={settings.tone === value ? 'active' : ''} onClick={() => patch({ tone: value })}>{label}</button>)}
      </div>
      <label className="rp-toggle"><input type="checkbox" checked={autoScroll} onChange={event => setAutoScroll(event.target.checked)} /> Tự động cuộn</label>
      <label>Tốc độ cuộn <input type="range" min="0.4" max="4" step="0.2" value={settings.autoScrollSpeed} onChange={event => patch({ autoScrollSpeed: Number(event.target.value) })} /></label>
    </aside>
  );
}

function QuickChapterList({ story, chapters, currentNumber, onClose }) {
  return (
    <aside className="rp-chapter-drawer">
      <div><h2>Danh sách chương</h2><button type="button" onClick={onClose}>×</button></div>
      <div>
        {chapters.map(chapter => (
          <Link key={chapter.id} className={chapter.number === currentNumber ? 'active' : ''} to={`/truyen/${story.slug}/chuong/${chapter.number}`} onClick={onClose}>
            {chapter.isPremium ? '🔒 ' : ''}Chương {chapter.number}
            <small>{chapter.title.replace(/^Chương\s*\d+[:：-]?\s*/i, '')}</small>
          </Link>
        ))}
      </div>
    </aside>
  );
}

function ChapterCommentSection({ comments, onSubmit, onReport }) {
  const [text, setText] = useState('');
  const [replying, setReplying] = useState('');
  const [replyText, setReplyText] = useState('');
  function submit(event) {
    event.preventDefault();
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText('');
  }
  function submitReply(commentId) {
    if (!replyText.trim()) return;
    onSubmit(replyText.trim(), commentId);
    setReplyText('');
    setReplying('');
  }
  return (
    <section className="rp-comments">
      <div><h2>Bình luận chương</h2><span>{comments.length} bình luận</span></div>
      <form onSubmit={submit}>
        <textarea value={text} onChange={event => setText(event.target.value)} placeholder="Bình luận về chương này..." />
        <button type="submit">Gửi bình luận</button>
      </form>
      {comments.map(comment => (
        <article key={comment.id}>
          <strong>{comment.userName}</strong>
          <p>{comment.body}</p>
          <div>
            <button type="button">Thích ({comment.likes || 0})</button>
            <button type="button" onClick={() => setReplying(comment.id)}>Trả lời</button>
            <button type="button" onClick={() => onReport(comment)}>Báo cáo</button>
          </div>
          {(comment.replies || []).map(reply => <p key={reply.id} className="rp-reply"><b>{reply.userName}</b> {reply.body}</p>)}
          {replying === comment.id && (
            <div className="rp-reply-form">
              <input value={replyText} onChange={event => setReplyText(event.target.value)} placeholder="Nhập phản hồi..." />
              <button type="button" onClick={() => submitReply(comment.id)}>Gửi</button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
