import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { mockStories } from '../../data/mockStories';
import { repairText, repairTextArray, repairTextFields } from '../../lib/textRepair.js';
import { ReportModal } from '../story/StoryDetailPage.jsx';
import { Majesticon } from '../shared/Majesticon.jsx';
import { PageSeo, buildBreadcrumbSchema } from '../shared/Seo.jsx';

const coverFallback = '/images/cover-1.jpg';


const defaultSettings = {
  fontSize: 18,
  lineHeight: 1.9,
  width: 680,
  paragraphSpacing: 'normal',
  tone: 'white',
  fontFamily: 'Palatino',
  autoScrollSpeed: 1.2
};

const toneOptions = [
  ['white', 'Trắng'],
  ['cream', 'Kem'],
  ['green', 'Xanh lá'],
  ['dark', 'Tối'],
  ['black', 'Đen']
];

const fontOptions = ['Palatino', 'Arial', 'Tahoma'];
const spacingOptions = [['compact', 'Hẹp'], ['normal', 'Vừa'], ['wide', 'Rộng']];

function normalizeStory(story = {}) {
  return {
    ...repairTextFields(story, ['title', 'author', 'description', 'language', 'translator', 'shortDescription']),
    price: Number(story.price ?? 0),
    chapterPrice: Number(story.chapterPrice ?? story.price ?? 0),
    categories: repairTextArray(story.categories)
  };
}

function normalizeChapter(chapter = {}) {
  return repairTextFields(chapter, ['title', 'content', 'preview']);
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

function cleanChapterTitle(title = '', number = '') {
  return repairText(String(title || `Chương ${number}`)).replace(/^Chương\s*\d+[:：-]?\s*/i, '').trim() || `Chương ${number}`;
}

function generateMockChapters(story) {
  const count = Math.max(24, Math.min(getChapterCount(story) || 48, 120));
  const names = ['Xuyên Không', 'Thân Phận Mới', 'Gặp Gỡ Vương Gia', 'Y Thuật Thần Kỳ', 'Bí Ẩn Thân Thế', 'Vương Gia Nổi Giận', 'Âm Mưu Hậu Cung', 'Cứu Người'];
  return Array.from({ length: count }).map((_, index) => {
    const number = index + 1;
    const premium = Boolean(story.premium && number > 4);
    return {
      id: `${story.id || story.slug}-chapter-${number}`,
      storyId: story.id,
      number,
      title: `Chương ${number}: ${names[index % names.length]}`,
      isPremium: premium,
      price: premium ? story.chapterPrice || story.price || 3 : 0,
      views: Math.max(100, Math.round(Number(story.views || 8000) / (number + 10))),
      updatedAt: story.updatedAt,
      content: [
        `Ánh nắng ban mai chiếu qua khung cửa sổ, rọi lên khuôn mặt trắng ngần của người thiếu nữ đang nằm trên chiếc giường gỗ cổ kính. Nàng từ từ mở mắt, đôi mắt đen láy nhìn lên trần nhà xa lạ với vẻ bối rối.`,
        `"Đây... là đâu?" Giọng nàng khàn khàn, như chưa được dùng đến từ lâu.`,
        `Ký ức ùa về như thác lũ. Nàng nhớ rõ mình là một bác sĩ phẫu thuật, vậy mà khi tỉnh lại đã ở trong thân xác của một cô nương yếu ớt trong phủ thừa tướng.`,
        `Nàng ngồi dậy, nhìn xuống đôi tay mảnh khảnh, trắng mịn. Trong đầu nàng nhanh chóng xâu chuỗi mọi thông tin và tự nhủ phải bình tĩnh nếu muốn sống sót trong thế giới này.`,
        `Tiếng bước chân vang lên ngoài hành lang. Một giọng nói lạnh lùng truyền tới: "Nghe nói tiểu thư Lâm đã tỉnh? Bổn vương muốn vào thăm."`,
        `Nàng khẽ nhắm mắt rồi mở ra. Từ hôm nay, nàng sẽ không còn là tiểu thư yếu đuối bị người khác định đoạt nữa.`
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
    const saved = { ...defaultSettings, ...JSON.parse(localStorage.getItem('daudo_reader_settings') || '{}') };
    return {
      ...saved,
      fontFamily: fontOptions.includes(saved.fontFamily) ? saved.fontFamily : defaultSettings.fontFamily
    };
  } catch {
    return defaultSettings;
  }
}

function hasHtmlContent(value = '') {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ''));
}

function sanitizeReaderHtml(value = '') {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return '';
  try {
    const document = new DOMParser().parseFromString(String(value || ''), 'text/html');
    document.querySelectorAll('script, style, iframe, object, embed, form, input, button, textarea, select, meta, link').forEach(node => node.remove());
    document.querySelectorAll('*').forEach(node => {
      [...node.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const rawValue = String(attribute.value || '').trim();
        if (name.startsWith('on') || name === 'style' || rawValue.toLowerCase().startsWith('javascript:')) {
          node.removeAttribute(attribute.name);
        }
      });
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
      if (node.tagName === 'IMG') {
        node.setAttribute('loading', 'lazy');
        node.setAttribute('decoding', 'async');
      }
    });
    return document.body.innerHTML;
  } catch {
    return '';
  }
}

function readerProgressKeys(story, chapter) {
  const storyKey = story?.slug || story?.id || 'unknown';
  const chapterKey = chapter?.id || chapter?.number || 'unknown';
  return {
    story: `daudo_reader_progress:${storyKey}`,
    chapter: `daudo_reader_progress:${storyKey}:${chapterKey}`
  };
}

function storageList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function mockChapterComments(chapterId) {
  return [
    { id: `${chapterId}-cc1`, userName: 'Hoa_Đọc_Truyện', body: 'Truyện hay quá! Đọc không thể dừng được, tác giả viết quá đỉnh!', likes: 234, replies: [] },
    { id: `${chapterId}-cc2`, userName: 'NamDoc2024', body: 'Nhân vật nữ chính rất mạnh mẽ và thông minh, không bị yếu đuối như nhiều truyện khác.', likes: 189, replies: [] },
    { id: `${chapterId}-cc3`, userName: 'TruyenFan_VN', body: 'Chương này hay lắm! Cảnh gặp gỡ được viết rất tinh tế.', likes: 156, replies: [] }
  ];
}

export function ReaderPage({ apiClient, user, updateUser }) {
  const { slug, number } = useParams();
  const navigate = useNavigate();
  const touchStartRef = useRef(null);
  const autoScrollRef = useRef(null);
  const saveProgressRef = useRef(null);
  const progressRef = useRef(0);
  const restoredRef = useRef('');
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
  const [liked, setLiked] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [comments, setComments] = useState([]);
  const [reportTarget, setReportTarget] = useState(null);
  const [unlocked, setUnlocked] = useState(true);

  useEffect(() => {
    document.body.classList.add('reader-route-active');
    return () => document.body.classList.remove('reader-route-active');
  }, []);

  async function loadReader() {
    setLoading(true);
    setError('');
    const [chapterResult, chapterIndexResult] = await Promise.all([
      fetchSafe(apiClient, `/stories/${slug}/chapters/${number}`),
      fetchSafe(apiClient, `/stories/${slug}/chapters?limit=200`)
    ]);

    if (chapterResult?.story && chapterResult?.chapter) {
      const story = normalizeStory(chapterResult.story);
      const chapter = normalizeChapter(chapterResult.chapter);
      const detailChapters = (chapterIndexResult?.chapters || []).map(item => normalizeChapter({
        id: `${story.id || story.slug}-chapter-${item.chapterNumber || item.number}`,
        number: item.chapterNumber || item.number,
        title: item.title,
        content: '',
        preview: '',
        isPremium: false,
        price: 0,
        views: 0
      }));
      setPayload({ story, chapter });
      setUnlocked(Boolean(chapterResult.unlocked ?? !chapter.isPremium));
      setChapters(detailChapters.length ? detailChapters : [chapter]);
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
    progressRef.current = 0;
    restoredRef.current = '';
  }, [slug, number]);

  useEffect(() => {
    if (!payload?.story || !payload?.chapter) return;
    const id = `${payload.story.slug}-${payload.chapter.number}`;
    setBookmarked(storageList('daudo_chapter_bookmarks').some(item => item.id === id));
    setLiked(storageList('daudo_chapter_likes').includes(id));
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
      const currentY = window.scrollY;
      if (Math.abs(nextProgress - progressRef.current) >= 1) {
        progressRef.current = nextProgress;
        setProgress(nextProgress);
      }
      setToolbarHidden(currentY > lastY && currentY > 120);
      lastY = currentY;
      if (payload?.story && payload?.chapter) {
        if (saveProgressRef.current) window.clearTimeout(saveProgressRef.current);
        saveProgressRef.current = window.setTimeout(() => {
          const keys = readerProgressKeys(payload.story, payload.chapter);
          const progressPayload = {
            storyId: payload.story.id,
            chapterId: payload.chapter.id,
            chapterNumber: payload.chapter.number,
            scrollY: Math.max(0, Math.round(window.scrollY)),
            percent: nextProgress,
            progress: nextProgress,
            updatedAt: new Date().toISOString()
          };
          localStorage.setItem(keys.story, JSON.stringify(progressPayload));
          localStorage.setItem(keys.chapter, JSON.stringify(progressPayload));
        }, 180);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (saveProgressRef.current) window.clearTimeout(saveProgressRef.current);
    };
  }, [payload?.story?.slug, payload?.chapter?.number]);

  useEffect(() => {
    if (!payload?.story || !payload?.chapter || loading) return;
    const keys = readerProgressKeys(payload.story, payload.chapter);
    if (restoredRef.current === keys.chapter) return;
    restoredRef.current = keys.chapter;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        let saved = null;
        try {
          saved = JSON.parse(localStorage.getItem(keys.chapter) || localStorage.getItem(keys.story) || 'null');
        } catch {
          saved = null;
        }
        const sameChapter = saved && Number(saved.chapterNumber) === Number(payload.chapter.number);
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const targetY = sameChapter ? Math.min(max, Math.max(0, Number(saved.scrollY || 0))) : 0;
        window.scrollTo({ top: targetY, behavior: 'auto' });
      });
    });
  }, [payload?.story?.slug, payload?.chapter?.number, loading]);

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

  const currentNumber = Number(payload?.chapter?.number || number);
  const currentIndex = chapters.findIndex(chapter => Number(chapter.number) === currentNumber);
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

  function bookmarkChapter() {
    if (!payload?.story || !payload?.chapter) return;
    const key = 'daudo_chapter_bookmarks';
    const bookmarkId = `${payload.story.slug}-${payload.chapter.number}`;
    const current = storageList(key);
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

  function likeChapter() {
    if (!payload?.story || !payload?.chapter) return;
    const key = 'daudo_chapter_likes';
    const id = `${payload.story.slug}-${payload.chapter.number}`;
    const current = storageList(key);
    const next = liked ? current.filter(item => item !== id) : [id, ...current.filter(item => item !== id)];
    localStorage.setItem(key, JSON.stringify(next));
    setLiked(!liked);
    setToast(liked ? 'Đã bỏ thích chương.' : 'Đã thích chương.');
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
    const clean = body.trim().slice(0, 500);
    if (!clean) return;
    if (parentId) {
      setComments(current => current.map(comment => comment.id === parentId ? {
        ...comment,
        replies: [...(comment.replies || []), { id: `reply-${Date.now()}`, userName: user?.name || 'Bạn', body: clean, likes: 0 }]
      } : comment));
    } else {
      setComments(current => [{ id: `cc-${Date.now()}`, userName: user?.name || 'Bạn', userAvatar: user?.avatar, body: clean, likes: 0, replies: [] }, ...current]);
    }
    setToast('Đã gửi bình luận.');
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  function handleTouchStart(event) {
    touchStartRef.current = event.touches[0].clientX;
  }

  function handleTouchEnd(event) {
    const start = touchStartRef.current;
    if (start === null) return;
    const diff = event.changedTouches[0].clientX - start;
    if (Math.abs(diff) > 80) goChapter(diff > 0 ? 'prev' : 'next');
    touchStartRef.current = null;
  }

  if (loading) return <ReaderLoading />;
  if (!payload) return <div className="rp-empty">Không tìm thấy chương.</div>;

  const story = payload.story;
  const chapter = payload.chapter;
  const rawContent = String(unlocked ? chapter.content || '' : chapter.preview || chapter.content || '');
  const isHtmlContent = hasHtmlContent(rawContent);
  const sanitizedHtml = isHtmlContent ? sanitizeReaderHtml(rawContent) : '';
  const contentLines = isHtmlContent ? [] : rawContent.split('\n');
  const chapterTitle = cleanChapterTitle(chapter.title, chapter.number);
  const fullTitle = `Chương ${chapter.number}: ${chapterTitle}`;
  const chapterTotal = chapters.length || getChapterCount(story) || chapter.number;
  const readerSchema = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: `${story.title} - ${fullTitle}`,
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
    <div className={`rp-page rp-v2 tone-${settings.tone}`} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <PageSeo
        title={`${story.title} - ${fullTitle}`}
        description={`Đọc ${fullTitle} của ${story.title} trên Đậu Đỏ Truyện.`}
        image={story.cover || coverFallback}
        type="article"
        canonical={`/truyen/${story.slug}/chuong/${chapter.number}`}
        schema={readerSchema}
      />
      {toast && <div className="rp-toast">{toast}</div>}
      <ReaderToolbar
        story={story}
        chapter={chapter}
        chapterTitle={chapterTitle}
        progress={progress}
        hidden={toolbarHidden}
        prevChapter={prevChapter}
        nextChapter={nextChapter}
        onPrev={() => goChapter('prev')}
        onNext={() => goChapter('next')}
        onSettings={() => setSettingsOpen(value => !value)}
        onChapterList={() => setChapterListOpen(value => !value)}
        onBookmark={bookmarkChapter}
        onFullscreen={toggleFullscreen}
        bookmarked={bookmarked}
      />

      {settingsOpen && <ReaderSettings settings={settings} setSettings={setSettings} autoScroll={autoScroll} setAutoScroll={setAutoScroll} onClose={() => setSettingsOpen(false)} />}
      {chapterListOpen && <QuickChapterList story={story} chapters={chapters} currentNumber={chapter.number} onClose={() => setChapterListOpen(false)} />}

      <main className="rp-reader-wrap">
        {error && <div className="rp-warning">{error}</div>}
        <article
          className="rp-article"
          style={{
            '--rp-font-size': `${settings.fontSize}px`,
            '--rp-line-height': settings.lineHeight,
            '--rp-width': `${settings.width}px`,
            '--rp-paragraph-gap': settings.paragraphSpacing === 'compact' ? '.8em' : settings.paragraphSpacing === 'wide' ? '1.55em' : '1.15em',
            '--rp-font-family': `${settings.fontFamily}, ${['Arial', 'Tahoma'].includes(settings.fontFamily) ? 'Inter, system-ui, sans-serif' : 'Georgia, Times New Roman, serif'}`
          }}
        >
          <header className="rp-article-head">
            <Link className="rp-story-link" to={`/truyen/${story.slug}`}><Majesticon name="bookOpen" size={14} /> {story.title}</Link>
            <h1>{fullTitle}</h1>
            <p>
              <span><Majesticon name="eye" size={14} /> {formatNumber(chapter.views || story.views)} lượt đọc</span>
              <span><Majesticon name="book" size={14} /> {formatNumber(chapterTotal)} chương</span>
              <span><Majesticon name="clock" size={14} /> {formatDate(chapter.updatedAt || story.updatedAt)}</span>
              <span><Majesticon name="chatText" size={14} /> {comments.length} bình luận</span>
            </p>
          </header>
          <div className="rp-title-divider" aria-hidden="true"><span><Majesticon name="bookOpen" size={16} /></span></div>

          {!unlocked && (
          <div className="rp-paywall">
              <h2>Chương VIP</h2>
              <p>Bạn đang xem bản preview. Mở khóa chương để đọc đầy đủ nội dung.</p>
              <button type="button" onClick={unlockChapter}>Mở khóa {chapter.price || story.chapterPrice || story.price || 1} Đậu</button>
            </div>
          )}

          <div className="rp-content">
            {sanitizedHtml
              ? <div className="rp-html-content" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
              : contentLines.map((line, index) => line.trim() ? <p key={index}>{line}</p> : <br key={index} />)}
            {!rawContent.trim() && <div className="rp-empty">Chương này chưa có nội dung để hiển thị.</div>}
          </div>
        </article>

        <ReaderChapterActions
          story={story}
          chapter={chapter}
          prevChapter={prevChapter}
          nextChapter={nextChapter}
          liked={liked}
          bookmarked={bookmarked}
          onPrev={() => goChapter('prev')}
          onNext={() => goChapter('next')}
          onChapterList={() => setChapterListOpen(true)}
          onLike={likeChapter}
          onBookmark={bookmarkChapter}
          onReport={() => setReportTarget({ type: 'chapter', chapter })}
        />

        <ChapterCommentSection comments={comments} onSubmit={submitComment} onReport={comment => setReportTarget({ type: 'comment', comment })} user={user} />
      </main>

      {reportTarget && <ReportModal target={reportTarget} onClose={() => setReportTarget(null)} onSubmit={submitReport} />}
    </div>
  );
}

function ReaderLoading() {
  return (
    <div className="rp-page rp-v2 tone-white">
      <div className="rp-loading"><span /><span /><span /></div>
    </div>
  );
}

export function ReaderToolbar({ story, chapter, chapterTitle, progress, hidden, prevChapter, nextChapter, onPrev, onNext, onSettings, onChapterList, onBookmark, onFullscreen, bookmarked }) {
  return (
    <header className={hidden ? 'rp-toolbar hidden' : 'rp-toolbar'}>
      <div className="rp-toolbar-left">
        <Link to={`/truyen/${story.slug}`} aria-label="Quay lại truyện"><Majesticon name="arrowLeft" size={18} /></Link>
        <span><strong>{story.title}</strong><small>Chương {chapter.number}: {chapterTitle}</small></span>
      </div>
      <div className="rp-toolbar-actions">
        <div className="rp-progress-pill"><span><i style={{ width: `${progress}%` }} /></span><b>{progress}%</b></div>
        <button type="button" className="rp-soft-active" onClick={onChapterList} title="Danh sách chương"><Majesticon name="list" size={19} /></button>
        <button type="button" className={bookmarked ? 'active' : ''} onClick={onBookmark} title="Bookmark"><Majesticon name="bookmark" size={19} /></button>
        <button type="button" onClick={onFullscreen} title="Toàn màn hình"><Majesticon name="panelWide" size={19} /></button>
        <button type="button" onClick={onSettings} title="Cài đặt đọc"><Majesticon name="settings" size={19} /></button>
      </div>
      <div className="rp-toolbar-chapter-row">
        <button type="button" disabled={!prevChapter} onClick={onPrev}><Majesticon name="chevronLeft" size={16} /> Chương trước</button>
        <button type="button" onClick={onChapterList}>Chương {chapter.number}: {chapterTitle}</button>
        <button type="button" disabled={!nextChapter} onClick={onNext}>Chương sau <Majesticon name="chevronRight" size={16} /></button>
      </div>
    </header>
  );
}

export function ReaderSettings({ settings, setSettings, autoScroll, setAutoScroll, onClose }) {
  function patch(next) {
    setSettings(current => ({ ...current, ...next }));
  }
  const updateFont = delta => patch({ fontSize: Math.min(28, Math.max(14, Number(settings.fontSize) + delta)) });
  return (
    <aside className="rp-settings rp-drawer">
      <div className="rp-drawer-head"><h2>Cài Đặt Đọc</h2><button type="button" className="rp-close-button" onClick={onClose} aria-label="Đóng"><Majesticon name="close" size={18} /></button></div>
      <SettingRange label="Cỡ chữ" value={`${settings.fontSize}px`}>
        <div className="rp-font-range"><button type="button" onClick={() => updateFont(-1)}>A-</button><input type="range" min="14" max="28" value={settings.fontSize} onChange={event => patch({ fontSize: Number(event.target.value) })} /><button type="button" onClick={() => updateFont(1)}>A+</button></div>
      </SettingRange>
      <SettingRange label="Khoảng dòng" value={`${settings.lineHeight}x`}>
        <input type="range" min="1.5" max="2.4" step="0.1" value={settings.lineHeight} onChange={event => patch({ lineHeight: Number(event.target.value) })} />
      </SettingRange>
      <SettingRange label="Độ rộng nội dung" value={`${settings.width}px`}>
        <input type="range" min="560" max="980" step="20" value={settings.width} onChange={event => patch({ width: Number(event.target.value) })} />
      </SettingRange>
      <div className="rp-setting-block">
        <p>Khoảng đoạn văn</p>
        <div className="rp-segmented">{spacingOptions.map(([value, label]) => <button type="button" key={value} className={settings.paragraphSpacing === value ? 'active' : ''} onClick={() => patch({ paragraphSpacing: value })}>{label}</button>)}</div>
      </div>
      <div className="rp-setting-block">
        <p>Màu nền</p>
        <div className="rp-tone-row">{toneOptions.map(([value, label]) => <button type="button" key={value} className={`${value} ${settings.tone === value ? 'active' : ''}`} onClick={() => patch({ tone: value })}>{label}</button>)}</div>
      </div>
      <div className="rp-setting-block">
        <p>Font chữ</p>
        <div className="rp-font-grid">{fontOptions.map(font => <button type="button" key={font} className={settings.fontFamily === font ? 'active' : ''} onClick={() => patch({ fontFamily: font })} style={{ fontFamily: font }}>{font}</button>)}</div>
      </div>
      <label className="rp-toggle"><input type="checkbox" checked={autoScroll} onChange={event => setAutoScroll(event.target.checked)} /> Tự động cuộn</label>
      <SettingRange label="Tốc độ cuộn" value={`${settings.autoScrollSpeed}x`}>
        <input type="range" min="0.4" max="4" step="0.2" value={settings.autoScrollSpeed} onChange={event => patch({ autoScrollSpeed: Number(event.target.value) })} />
      </SettingRange>
    </aside>
  );
}

function SettingRange({ label, value, children }) {
  return <label className="rp-setting-range"><span><b>{label}</b><em>{value}</em></span>{children}</label>;
}

function QuickChapterList({ story, chapters, currentNumber, onClose }) {
  return (
    <aside className="rp-chapter-drawer rp-drawer">
      <div className="rp-drawer-head"><h2>Danh Sách Chương</h2><button type="button" className="rp-close-button" onClick={onClose} aria-label="Đóng"><Majesticon name="close" size={18} /></button></div>
      <div className="rp-chapter-list">
        {chapters.map(chapter => {
          const active = Number(chapter.number) === Number(currentNumber);
          return (
            <Link key={chapter.id || chapter.number} className={active ? 'active' : ''} to={`/truyen/${story.slug}/chuong/${chapter.number}`} onClick={onClose}>
              <span>#{chapter.number}</span>
              <strong>Chương {chapter.number}: {cleanChapterTitle(chapter.title, chapter.number)}</strong>
              {chapter.isPremium ? <b>VIP</b> : active ? <Majesticon name="play" size={16} /> : null}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

function ReaderChapterActions({ story, chapter, prevChapter, nextChapter, liked, bookmarked, onPrev, onNext, onChapterList, onLike, onBookmark, onReport }) {
  return (
    <section className="rp-chapter-actions">
      <div className="rp-endline"><span>Hết chương {chapter.number}</span></div>
      <div className="rp-nav-buttons">
        <button type="button" disabled={!prevChapter} onClick={onPrev}><Majesticon name="arrowLeft" size={18} /> Chương Trước</button>
        <button type="button" className="icon-only" onClick={onChapterList}><Majesticon name="list" size={20} /></button>
        <button type="button" className="next" disabled={!nextChapter} onClick={onNext}>Chương Sau <Majesticon name="arrowRight" size={18} /></button>
      </div>
      <div className="rp-action-buttons">
        <button type="button" className={liked ? 'active' : ''} onClick={onLike}><Majesticon name="heart" size={17} /> Thích</button>
        <button type="button" className={bookmarked ? 'active' : ''} onClick={onBookmark}><Majesticon name="bookmark" size={17} /> Bookmark</button>
        <button type="button" onClick={onReport}><Majesticon name="alert" size={17} /> Báo Lỗi</button>
        <Link to={`/truyen/${story.slug}`}><Majesticon name="alert" size={17} /> Chi Tiết</Link>
      </div>
    </section>
  );
}

function ChapterCommentSection({ comments, onSubmit, onReport, user }) {
  const [text, setText] = useState('');
  const [replying, setReplying] = useState('');
  const [replyText, setReplyText] = useState('');
  const remaining = 500 - text.length;
  function submit(event) {
    event.preventDefault();
    if (!text.trim()) return;
    onSubmit(text);
    setText('');
  }
  function submitReply(commentId) {
    if (!replyText.trim()) return;
    onSubmit(replyText, commentId);
    setReplyText('');
    setReplying('');
  }
  return (
    <section className="rp-comments">
      <div className="rp-comments-head"><h2>Bình Luận Chương</h2><span>{comments.length}</span></div>
      <form className="rp-comment-form" onSubmit={submit}>
        <img src={user?.avatar || '/images/logo.png'} alt={user?.name || 'avatar'} />
        <div>
          <textarea maxLength={500} value={text} onChange={event => setText(event.target.value)} placeholder="Bình luận về chương này..." />
          <footer><span>{Math.max(0, 500 - remaining)}/500</span><button type="submit" disabled={!text.trim()}>Gửi</button></footer>
        </div>
      </form>
      <div className="rp-comment-list">
        {comments.map(comment => (
          <article key={comment.id}>
            <img src={comment.userAvatar || '/images/logo.png'} alt={comment.userName || 'avatar'} />
            <div>
              <strong>{comment.userName || 'Độc giả'} <small>2 giờ trước</small></strong>
              <p>{comment.body}</p>
              <div className="rp-comment-actions">
                <button type="button"><Majesticon name="heart" size={13} /> {comment.likes || 0}</button>
                <button type="button" onClick={() => setReplying(comment.id)}>Trả lời</button>
                <button type="button" onClick={() => onReport(comment)}>Báo cáo</button>
              </div>
              {(comment.replies || []).map(reply => <p key={reply.id} className="rp-reply"><b>{reply.userName}</b> {reply.body}</p>)}
              {replying === comment.id && (
                <div className="rp-reply-form">
                  <input maxLength={500} value={replyText} onChange={event => setReplyText(event.target.value)} placeholder="Nhập phản hồi..." />
                  <button type="button" disabled={!replyText.trim()} onClick={() => submitReply(comment.id)}>Gửi</button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
