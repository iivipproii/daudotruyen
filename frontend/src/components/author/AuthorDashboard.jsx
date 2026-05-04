import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  authorTags,
  mockAuthorChapters,
  mockAuthorStories,
  mockAuthorTransactions,
  mockPromotionHistory,
  mockPromotionPackages,
  mockRevenueRows
} from '../../data/mockAuthorData';
import { ADULT_CATEGORY_ITEMS, AUTHOR_CATEGORY_GROUPS } from '../../data/storyCategories';
import { Majesticon } from '../shared/Majesticon.jsx';

const coverFallback = '/images/cover-1.jpg';

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function formatCurrency(value = 0) {
  return `${formatNumber(value)} Đậu`;
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
  if (pathname.includes('/chapters/bulk') || pathname.includes('/dang-truyen/them-nhieu-chuong')) return 'chapter-bulk';
  if (pathname.includes('/chapters/new')) return 'chapter-new';
  if (pathname.match(/\/author\/stories\/[^/]+\/chapters$/)) return 'chapter-choice';
  if (pathname.includes('/preview')) return 'story-preview';
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
      coverPath: '',
      coverPosition: '50% 50%',
      description: '',
      translator: '',
      mainCharacters: '',
      genres: [],
      tags: [],
      status: 'ongoing',
      language: 'Tiếng Việt',
      ageRating: 'all',
      chapterCountEstimate: '',
      hidden: false,
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
    coverPath: story.coverPath || '',
    coverPosition: story.coverPosition || '50% 50%',
    description: story.description || story.shortDescription || '',
    translator: story.translator || '',
    mainCharacters: story.mainCharacters || '',
    genres: story.genres || story.categories || [],
    tags: story.tags || [],
    language: story.language || 'Tiếng Việt',
    ageRating: story.ageRating || 'all',
    chapterCountEstimate: story.chapterCountEstimate || '',
    hidden: Boolean(story.hidden),
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
    coverPath: form.coverPath || '',
    coverPosition: form.coverPosition,
    shortDescription: String(form.description || '').trim().slice(0, 180),
    description: form.description,
    translator: form.translator,
    mainCharacters: form.mainCharacters,
    categories: form.genres || [],
    tags: form.tags || [],
    status: form.status,
    language: form.language,
    ageRating: form.ageRating,
    chapterCountEstimate: form.chapterCountEstimate,
    hidden: Boolean(form.hidden),
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

function textWordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function romanToNumber(value) {
  const input = String(value || '').toUpperCase();
  if (!/^[IVXLCDM]+$/.test(input)) return Number(value) || 0;
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  return input.split('').reduce((sum, char, index, chars) => {
    const current = map[char] || 0;
    const next = map[chars[index + 1]] || 0;
    return sum + (current < next ? -current : current);
  }, 0);
}

function parseChapterHeading(line) {
  const match = String(line || '').match(/^\s*(?:(?:quyển|quyen)\s+([0-9ivxlcdm]+)\s*[-:–—]\s*)?(chương|chuong|chapter|hồi|hoi|quyển|quyen|phó\s*bản|pho\s*ban)\s+([0-9ivxlcdm]+)(?:\s*[:\-–—]\s*(.+))?\s*$/i);
  if (!match) return null;
  const number = romanToNumber(match[3]);
  const suffix = String(match[4] || '').trim();
  const heading = String(line || '').trim();
  return { number, title: suffix || heading, heading };
}

function parseBulkChapterText(text, startNumber = 1) {
  const source = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!source) return [];
  const lines = source.split('\n');
  const sections = [];
  let current = null;
  lines.forEach(line => {
    const heading = parseChapterHeading(line);
    if (heading) {
      if (current) sections.push(current);
      current = { ...heading, body: [] };
      return;
    }
    if (current) current.body.push(line);
  });
  if (current) sections.push(current);

  if (!sections.length) {
    return [{
      localId: `chapter-${Date.now()}-0`,
      number: startNumber,
      title: `Chương ${startNumber}`,
      content: source,
      wordCount: textWordCount(source),
      warnings: ['Không phát hiện heading chương, hệ thống tạo một chương duy nhất.']
    }];
  }

  return sections.map((section, index) => {
    const content = section.body.join('\n').trim();
    const number = section.number || startNumber + index;
    const warnings = [];
    if (!content) warnings.push('Nội dung chương rỗng.');
    if (textWordCount(content) > 0 && textWordCount(content) < 80) warnings.push('Chương hơi ngắn.');
    return {
      localId: `chapter-${Date.now()}-${index}`,
      number,
      title: section.title || `Chương ${number}`,
      content,
      wordCount: textWordCount(content),
      warnings
    };
  });
}

function nextChapterNumberForStory(chapters, storyId) {
  return Math.max(0, ...chapters.filter(chapter => chapter.storyId === storyId).map(chapter => Number(chapter.number || 0))) + 1;
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
    setState(current => ({
      ...current,
      stories: current.stories.some(item => item.id === result.story.id)
        ? current.stories.map(item => item.id === result.story.id ? result.story : item)
        : [result.story, ...current.stories]
    }));
    setToast(mode === 'submit' ? 'Đã gửi truyện chờ admin duyệt.' : 'Đã lưu nháp truyện.');
    return result.story;
  }

  async function updateStory(id, patch) {
    const story = state.stories.find(item => item.id === id);
    if (!story) return;
    const patchKeys = Object.keys(patch || {});
    const comboOnlyPatch = patchKeys.length > 0 && patchKeys.every(key => key === 'comboPrice');
    if (state.usingMock || !apiClient) {
      if (patch.comboPrice !== undefined && Number(story.comboPrice || 0) !== Number(patch.comboPrice || 0) && story.comboPriceLocked) {
        throw new Error('Giá combo chỉ được đổi 1 lần sau khi tạo. Vui lòng liên hệ admin.');
      }
      const nextPatch = { ...patch, updatedAt: new Date().toISOString() };
      if (patch.comboPrice !== undefined && Number(story.comboPrice || 0) !== Number(patch.comboPrice || 0) && Number(story.comboPrice || 0) > 0) {
        nextPatch.comboPriceLocked = true;
        nextPatch.comboPriceChangedAt = new Date().toISOString();
      }
      let updatedStory = story;
      setState(current => ({
        ...current,
        stories: current.stories.map(item => {
          if (item.id !== id) return item;
          updatedStory = { ...item, ...nextPatch };
          return updatedStory;
        })
      }));
      setToast('Đã cập nhật trong dữ liệu mẫu.');
      return updatedStory;
    }
    const body = comboOnlyPatch
      ? patch
      : { ...buildStoryPayload(normalizeStoryForForm(story), story.approvalStatus || 'draft'), ...patch };
    const result = await apiClient(`/author/stories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    setState(current => ({ ...current, stories: current.stories.map(item => item.id === id ? result.story : item) }));
    setToast('Đã cập nhật truyện.');
    return result.story;
  }

  async function deleteStory(id) {
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
      setToast(status === 'published' ? 'Đã đăng chương trong dữ liệu mẫu.' : status === 'pending' ? 'Đã gửi chương chờ duyệt trong dữ liệu mẫu.' : 'Đã lưu chương trong dữ liệu mẫu.');
      return next;
    }

    const result = form.id
      ? await apiClient(`/author/chapters/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      : await apiClient(`/author/stories/${payload.storyId}/chapters`, { method: 'POST', body: JSON.stringify(payload) });
    setState(current => ({
      ...current,
      chapters: current.chapters.some(item => item.id === result.chapter.id)
        ? current.chapters.map(item => item.id === result.chapter.id ? result.chapter : item)
        : [result.chapter, ...current.chapters],
      stories: result.story
        ? current.stories.map(item => item.id === result.story.id ? result.story : item)
        : current.stories
    }));
    setToast(status === 'published' ? 'Đã đăng chương.' : status === 'pending' ? 'Đã gửi chương chờ duyệt.' : status === 'scheduled' ? 'Đã lên lịch chương.' : 'Đã lưu nháp chương.');
    return result.chapter;
  }

  async function saveBulkChapters(storyId, payload) {
    if (state.usingMock || !apiClient) {
      const story = state.stories.find(item => item.id === storyId);
      const created = (payload.chapters || []).map((chapter, index) => ({
        ...chapter,
        id: `demo-bulk-${Date.now()}-${index}`,
        storyId,
        storyTitle: story?.title || '',
        status: payload.mode === 'published' ? 'approved' : payload.mode || 'draft',
        access: payload.access === 'vip' ? 'vip' : 'free',
        isPremium: payload.access === 'vip',
        price: payload.access === 'vip' ? Number(payload.price || 0) : 0,
        words: textWordCount(chapter.content),
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }));
      setState(current => ({
        ...current,
        chapters: [...created, ...current.chapters],
        stories: current.stories.map(item => item.id === storyId ? { ...item, chapters: Number(item.chapters || item.chapterCount || 0) + created.length, updatedAt: new Date().toISOString() } : item)
      }));
      setToast(`Đã lưu ${created.length} chương trong dữ liệu mẫu.`);
      return { created: created.length, skipped: 0, errors: [], chapters: created };
    }

    const result = await apiClient(`/author/stories/${storyId}/chapters/bulk`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setState(current => ({
      ...current,
      chapters: [...(result.chapters || []), ...current.chapters],
      stories: result.story
        ? current.stories.map(item => item.id === result.story.id ? result.story : item)
        : current.stories
    }));
    setToast(`Đã lưu ${result.created || 0} chương.`);
    return result;
  }

  async function deleteChapter(id) {
    if (state.usingMock || !apiClient) {
      setState(current => ({ ...current, chapters: current.chapters.filter(chapter => chapter.id !== id) }));
      setToast('Đã xóa chương khỏi dữ liệu mẫu.');
      return;
    }
    await apiClient(`/author/chapters/${id}`, { method: 'DELETE' });
    await loadAuthorData();
    setToast('Đã xóa chương.');
  }

  async function deleteChapters(ids) {
    const uniqueIds = Array.from(new Set(ids || []));
    if (!uniqueIds.length) return;
    if (state.usingMock || !apiClient) {
      const idSet = new Set(uniqueIds);
      setState(current => ({ ...current, chapters: current.chapters.filter(chapter => !idSet.has(chapter.id)) }));
      setToast(`Đã xóa ${uniqueIds.length} chương khỏi dữ liệu mẫu.`);
      return;
    }
    await apiClient('/author/chapters/bulk', { method: 'DELETE', body: JSON.stringify({ ids: uniqueIds }) });
    await loadAuthorData();
    setToast(`Đã xóa ${uniqueIds.length} chương.`);
  }

  async function reorderChapters(storyId, orderedChapters) {
    if (!storyId || !orderedChapters?.length) return;
    const updates = orderedChapters.map((chapter, index) => ({ id: chapter.id, number: index + 1 }));
    const updatedChapters = orderedChapters.map((chapter, index) => ({ ...chapter, number: index + 1, updatedAt: new Date().toISOString() }));
    if (state.usingMock || !apiClient) {
      setState(current => ({
        ...current,
        chapters: current.chapters.map(chapter => {
          const update = updatedChapters.find(item => item.id === chapter.id);
          return update || chapter;
        })
      }));
      setToast('Đã cập nhật thứ tự chương trong dữ liệu mẫu.');
      return { chapters: updatedChapters };
    }
    const result = await apiClient(`/author/stories/${storyId}/chapters/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({ chapters: updates })
    });
    setState(current => ({
      ...current,
      chapters: current.chapters.map(chapter => result.chapters?.find(item => item.id === chapter.id) || chapter),
      stories: result.story ? current.stories.map(story => story.id === result.story.id ? result.story : story) : current.stories
    }));
    setToast('Đã cập nhật thứ tự chương.');
    return result;
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

  const storiesBackedViews = ['story-form', 'story-preview', 'chapter-choice', 'chapter-new', 'chapter-bulk'];
  const currentError = state.errors[storiesBackedViews.includes(currentView) ? 'stories' : currentView];
  const currentLoading = storiesBackedViews.includes(currentView)
    ? state.loading.stories || state.loading.chapters
    : state.loading[currentView];

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
        <NavLink to="/author/chapters">Quản lý truyện</NavLink>
        <NavLink to="/author/revenue">Kinh doanh / doanh thu</NavLink>
        <NavLink to="/author/promotions">Quảng bá / gói dịch vụ</NavLink>
      </nav>

      {!state.usingMock && <ErrorNotice message={currentError} />}
      {currentLoading && <LoadingBlock />}

      {!currentLoading && currentView === 'overview' && <OverviewTab stories={state.stories} chapters={state.chapters} promotions={state.promotions} stats={state.stats} revenue={state.revenue} />}
      {!currentLoading && currentView === 'stories' && <AuthorStoryTable stories={state.stories} onUpdate={updateStory} onDelete={deleteStory} />}
      {!currentLoading && currentView === 'story-form' && <StoryEditorForm story={editingStory} loading={Boolean(params.id && !editingStory)} apiClient={apiClient} usingMock={state.usingMock} onSave={saveStory} />}
      {!currentLoading && currentView === 'story-preview' && <AuthorPrivatePreview story={editingStory} chapters={state.chapters.filter(chapter => chapter.storyId === params.id)} loading={Boolean(params.id && !editingStory)} />}
      {!currentLoading && currentView === 'chapter-choice' && <ChapterMethodChooser story={editingStory} loading={Boolean(params.id && !editingStory)} />}
      {!currentLoading && currentView === 'chapter-new' && <SingleChapterPage story={editingStory} stories={state.stories} chapters={state.chapters} loading={Boolean(params.id && !editingStory)} onSave={saveChapter} />}
      {!currentLoading && currentView === 'chapter-bulk' && <BulkChapterPage story={editingStory} stories={state.stories} chapters={state.chapters} loading={Boolean(params.id && !editingStory)} apiClient={apiClient} usingMock={state.usingMock} onSaveBulk={saveBulkChapters} />}
      {!currentLoading && currentView === 'chapters' && <ChapterManager stories={state.stories} chapters={state.chapters} apiClient={apiClient} usingMock={state.usingMock} onSave={saveChapter} onDelete={deleteChapter} onBulkDelete={deleteChapters} onReorder={reorderChapters} onUpdateStory={updateStory} />}
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
    ['Doanh thu', `${formatNumber(totals.revenue)} Đậu`],
    ['Bình luận mới', totals.comments]
  ];
  return <div className="ad-stat-grid">{cards.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

export function AuthorStoryTable({ stories, onUpdate, onDelete }) {
  return <AuthorStoryDashboardView stories={stories} onUpdate={onUpdate} onDelete={onDelete} />;
}

/*
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
            <span className="ad-story-cell"><img src={story.cover || coverFallback} alt={story.title} loading="lazy" decoding="async" onError={handleImageError} /><b>{story.title}</b></span>
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
*/

function AuthorStoryDashboardView({ stories, onUpdate, onDelete }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState('updated');
  const [viewMode, setViewMode] = useState('grid');
  const genres = useMemo(() => Array.from(new Set(stories.flatMap(story => story.genres || story.categories || []))).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi')), [stories]);
  const stats = useMemo(() => ({
    total: stories.length,
    pending: stories.filter(story => story.approvalStatus === 'pending').length,
    public: stories.filter(story => story.approvalStatus === 'approved' && !story.hidden).length,
    draftRejected: stories.filter(story => ['draft', 'rejected'].includes(story.approvalStatus)).length,
    chapters: stories.reduce((sum, story) => sum + Number(story.chapters ?? story.chapterCount ?? 0), 0),
    views: stories.reduce((sum, story) => sum + Number(story.views || 0), 0)
  }), [stories]);
  const filtered = stories.filter(story => {
    const haystack = `${story.title} ${story.author} ${(story.genres || story.categories || []).join(' ')} ${(story.tags || []).join(' ')}`.toLowerCase();
    const matchQuery = !query || haystack.includes(query.toLowerCase());
    const matchFilter = !filter || story.approvalStatus === filter || story.publishStatus === filter || story.status === filter || (filter === 'hidden' && story.hidden);
    const matchGenre = !genre || (story.genres || story.categories || []).includes(genre);
    return matchQuery && matchFilter && matchGenre;
  }).sort((a, b) => {
    if (sort === 'chapters') return Number(b.chapters ?? b.chapterCount ?? 0) - Number(a.chapters ?? a.chapterCount ?? 0);
    if (sort === 'views') return Number(b.views || 0) - Number(a.views || 0);
    if (sort === 'revenue') return Number(b.revenue || 0) - Number(a.revenue || 0);
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });
  const firstStory = stories[0];

  return (
    <div className="ad-story-dashboard">
      <section className="ad-panel ad-story-head">
        <div>
          <h2>Quản lý truyện</h2>
          <p>Quản lý kho truyện, trạng thái duyệt và chương đã đăng</p>
        </div>
        <div className="ad-head-actions">
          <Link className="ad-primary" to="/author/stories/new">+ Đăng truyện mới</Link>
          <Link className="ad-secondary" to={firstStory ? `/author/stories/${firstStory.id}/chapters/bulk` : '/author/stories/new'}>+ Thêm nhiều chương</Link>
        </div>
      </section>

      <div className="ad-story-stats">
        {[
          ['Truyện của tôi', stats.total],
          ['Đang chờ duyệt', stats.pending],
          ['Đã public', stats.public],
          ['Nháp / từ chối', stats.draftRejected],
          ['Tổng chương', stats.chapters],
          ['Lượt đọc', formatNumber(stats.views)]
        ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>

      <section className="ad-panel">
        <div className="ad-story-toolbar">
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm theo tên truyện, tác giả, tag..." />
          <select value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="">Tất cả</option>
            <option value="draft">Nháp</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
            <option value="hidden">Đang ẩn</option>
            <option value="ongoing">Đang ra</option>
            <option value="completed">Hoàn thành</option>
            <option value="paused">Tạm dừng</option>
          </select>
          <select value={genre} onChange={event => setGenre(event.target.value)}>
            <option value="">Tất cả thể loại</option>
            {genres.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={sort} onChange={event => setSort(event.target.value)}>
            <option value="updated">Mới nhất</option>
            <option value="chapters">Nhiều chương</option>
            <option value="views">Nhiều lượt đọc</option>
            <option value="revenue">Doanh thu cao</option>
          </select>
          <div className="ad-view-toggle">
            <button type="button" className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>Lưới</button>
            <button type="button" className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>Bảng</button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="ad-story-grid">
            {filtered.map(story => <StoryManagementCard key={story.id} story={story} onUpdate={onUpdate} onDelete={onDelete} />)}
          </div>
        ) : (
          <div className="ad-story-table">
            <div className="header"><span>Truyện</span><span>Duyệt</span><span>Xuất bản</span><span>Chương</span><span>Lượt đọc</span><span>Doanh thu</span><span>Thao tác</span></div>
            {filtered.map(story => <StoryManagementRow key={story.id} story={story} onUpdate={onUpdate} onDelete={onDelete} />)}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="ad-empty-state">
            <h3>Bạn chưa có truyện nào.</h3>
            <p>Đăng truyện đầu tiên để bắt đầu thêm chương trong khu tác giả.</p>
            <Link className="ad-primary" to="/author/stories/new">Đăng truyện đầu tiên</Link>
          </div>
        )}
      </section>
    </div>
  );
}

function StoryManagementRow({ story, onUpdate, onDelete }) {
  return (
    <div>
            <span className="ad-story-cell"><img src={story.cover || coverFallback} alt={story.title} loading="lazy" decoding="async" onError={handleImageError} /><b>{story.title}</b></span>
      <span className="ad-badge-stack"><StatusBadge status={story.approvalStatus} />{story.hidden && <StatusBadge hidden />}</span>
      <span>{statusText(story.status)} · {story.hidden ? 'Đang ẩn' : story.approvalStatus === 'approved' ? 'Đã public' : 'Chưa public'}</span>
      <span>{formatNumber(story.chapters ?? story.chapterCount)}</span>
      <span>{formatNumber(story.views)}</span>
      <span>{formatCurrency(story.revenue)}</span>
      <StoryActions story={story} onUpdate={onUpdate} onDelete={onDelete} />
    </div>
  );
}

function StoryManagementCard({ story, onUpdate, onDelete }) {
  const categories = story.genres || story.categories || [];
  return (
    <article className="ad-story-card">
      <div className="ad-story-cover">
                <img src={story.cover || coverFallback} alt={story.title} loading="lazy" decoding="async" onError={handleImageError} />
        <span className="ad-cover-badges"><StatusBadge status={story.approvalStatus} />{story.hidden && <StatusBadge hidden />}</span>
      </div>
      <div className="ad-story-card-body">
        <h3>{story.title}</h3>
        <p>{story.author || 'Tác giả'}</p>
        <div className="ad-chip-row">{categories.slice(0, 3).map(item => <span key={item}>{item}</span>)}</div>
        <div className="ad-story-metrics">
          <span><b>{formatNumber(story.chapters ?? story.chapterCount)}</b> chương</span>
          <span><b>{formatNumber(story.views)}</b> đọc</span>
          <span><b>{formatCurrency(story.revenue)}</b></span>
        </div>
        <small>Cập nhật {formatDate(story.updatedAt)}</small>
        {story.approvalStatus === 'rejected' && <button type="button" className="ad-reason" onClick={() => window.alert(story.rejectionReason || 'Admin chưa ghi lý do cụ thể.')}>Xem lý do từ chối</button>}
      </div>
      <StoryActions story={story} onUpdate={onUpdate} onDelete={onDelete} />
    </article>
  );
}

function StoryActions({ story, onUpdate, onDelete }) {
  return (
    <span className="ad-row-actions">
      <Link to={`/author/stories/${story.id}/edit`}>Sửa</Link>
      <Link to={`/author/stories/${story.id}/chapters/new`}>Thêm chương</Link>
      <Link to={`/author/stories/${story.id}/chapters/bulk`}>Thêm nhiều</Link>
      <Link to={`/author/stories/${story.id}/preview`}>Bản nháp</Link>
      {story.approvalStatus === 'approved' && !story.hidden && <Link to={`/truyen/${story.slug}`}>Public</Link>}
      {story.approvalStatus === 'approved' && <button type="button" onClick={() => onUpdate(story.id, { hidden: !story.hidden })}>{story.hidden ? 'Hiện' : 'Ẩn'}</button>}
      {story.approvalStatus === 'rejected' && <button type="button" onClick={() => onUpdate(story.id, { approvalStatus: 'pending' })}>Gửi duyệt lại</button>}
      <button type="button" onClick={() => onDelete(story.id)}>Xóa</button>
    </span>
  );
}

export function StoryEditorForm({ story, loading, apiClient, usingMock, onSave }) {
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
    if (form.description.trim().length < 80) return 'Mô tả cần ít nhất 80 ký tự.';
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
      navigate(mode === 'submit' ? `/author/stories/${saved.id}/chapters/new` : `/author/stories/${saved.id}/edit`);
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
          <CoverUploader value={form.cover} position={form.coverPosition} storyId={form.id} apiClient={apiClient} usingMock={usingMock} onChange={(cover, coverPosition = form.coverPosition, coverPath = form.coverPath) => setForm({ ...form, cover, coverPosition, coverPath })} />
          <div className="ad-two-inputs">
            <label>Người dịch<input value={form.translator} onChange={event => setForm({ ...form, translator: event.target.value })} placeholder="Nếu có" /></label>
            <label>Nhân vật chính<input value={form.mainCharacters} onChange={event => setForm({ ...form, mainCharacters: event.target.value })} placeholder="VD: Minh An, Lục Dao" /></label>
          </div>
          <label>Tên truyện<input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Nhập tên truyện" /></label>
          <label>Bút danh / tác giả<input value={form.author} onChange={event => setForm({ ...form, author: event.target.value })} placeholder="Để trống nếu dùng tên tài khoản" /></label>
          <label>Mô tả<textarea rows="9" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Giới thiệu nội dung, nhân vật, điểm hấp dẫn..." /></label>
          <GroupedCategorySelect selected={form.genres} onChange={genres => setForm({ ...form, genres, ageRating: genres.some(item => ADULT_CATEGORY_ITEMS.includes(item)) ? '18' : form.ageRating })} max={5} />
          {form.genres.some(item => ADULT_CATEGORY_ITEMS.includes(item)) && <div className="ad-adult-warning">Nội dung 18+ cần tuân thủ quy định và có thể cần duyệt kỹ hơn.</div>}
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
          <section>
            <h3>Thông tin bổ sung</h3>
            <div className="ad-two-inputs">
              <label>Ngôn ngữ gốc<select value={form.language} onChange={event => setForm({ ...form, language: event.target.value })}><option>Tiếng Việt</option><option>Tiếng Trung</option><option>Tiếng Anh</option><option>Tiếng Nhật</option></select></label>
              <label>Độ tuổi<select value={form.ageRating} onChange={event => setForm({ ...form, ageRating: event.target.value })}><option value="all">Tất cả</option><option value="13">13+</option><option value="16">16+</option><option value="18">18+</option></select></label>
            </div>
            <label>Số chương dự kiến<input type="number" min="0" value={form.chapterCountEstimate} onChange={event => setForm({ ...form, chapterCountEstimate: event.target.value })} /></label>
            <label className="ad-switch"><input type="checkbox" checked={form.hidden} onChange={event => setForm({ ...form, hidden: event.target.checked })} /><span>Ẩn khỏi website</span></label>
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

const coverFileTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const coverMaxOriginalBytes = 10 * 1024 * 1024;
const coverMaxCompressedBytes = 500 * 1024;

async function compressCoverImage(file) {
  if (!file) return null;
  if (!coverFileTypes.has(file.type)) throw new Error('Chi chap nhan anh JPG, PNG hoac WEBP.');
  if (file.size > coverMaxOriginalBytes) throw new Error('Anh goc toi da 10MB.');
  const objectUrl = URL.createObjectURL(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Khong doc duoc anh bia.'));
    img.src = objectUrl;
  });
  const scale = Math.min(1, 1100 / image.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(objectUrl);
  for (const quality of [0.82, 0.72, 0.62, 0.52]) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    if (blob && blob.size <= coverMaxCompressedBytes) return new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' });
  }
  throw new Error('Anh sau nen van lon hon 500KB. Vui long chon anh nho hon.');
}

export function CoverUploader({ value, position = '50% 50%', storyId, apiClient, usingMock, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file) {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const compressed = await compressCoverImage(file);
      if (usingMock || !apiClient) {
        onChange(URL.createObjectURL(compressed), position);
        return;
      }
      const body = new FormData();
      body.append('file', compressed);
      if (storyId) body.append('storyId', storyId);
      const result = await apiClient('/uploads/cover', { method: 'POST', body });
      onChange(result.url || result.cover || result.path, position, result.path || '');
    } catch (err) {
      setError(err.message || 'Khong the upload anh bia.');
    } finally {
      setUploading(false);
    }
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

export function GroupedCategorySelect({ selected, onChange, max = 5 }) {
  const [search, setSearch] = useState('');
  const keyword = search.trim().toLowerCase();
  const filteredGroups = AUTHOR_CATEGORY_GROUPS.map(group => ({
    ...group,
    items: keyword ? group.items.filter(item => item.toLowerCase().includes(keyword)) : group.items
  })).filter(group => group.items.length);

  function toggle(item) {
    const exists = selected.includes(item);
    const next = exists ? selected.filter(value => value !== item) : [...selected, item].slice(0, max);
    onChange(next);
  }

  return (
    <section className="ad-category-picker">
      <div className="ad-category-top">
        <div><strong>Thể loại</strong><span>{selected.length}/{max}</span></div>
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm kiếm thể loại..." />
      </div>
      <div className="ad-selected-categories">
        {selected.length ? selected.map(item => <span key={item}>{item}</span>) : <span>Chưa chọn thể loại</span>}
      </div>
      <div className="ad-category-groups">
        {filteredGroups.map(group => (
          <div key={group.title} className="ad-category-group">
            <div className="ad-category-group-head"><span><Majesticon name={group.icon} size={18} /></span><strong>{group.title}</strong></div>
            <div className="ad-category-chip-grid">
              {group.items.map(item => (
                <button type="button" key={item} className={selected.includes(item) ? 'active' : ''} onClick={() => toggle(item)}>
                  {item}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!filteredGroups.length && <EmptyState>Không tìm thấy thể loại phù hợp.</EmptyState>}
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
          <img src={story.cover || coverFallback} alt={story.title || 'preview'} loading="lazy" decoding="async" onError={handleImageError} />
      <div>
        <span>{story.genres?.join(' · ') || 'Chưa chọn thể loại'}</span>
        <h3>{story.title || 'Tên truyện preview'}</h3>
        <p>{String(story.description || story.shortDescription || 'Mô tả sẽ hiển thị tại đây.').slice(0, 220)}</p>
      </div>
    </article>
  );
}

function StorySearchPicker({ stories, selectedStoryId, onSelect, placeholder = 'Gõ tên truyện, tác giả hoặc thể loại...' }) {
  const selectedStory = stories.find(story => story.id === selectedStoryId);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const suggestions = stories.filter(story => {
    if (!normalizedQuery) return true;
    return `${story.title} ${story.author} ${(story.genres || story.categories || []).join(' ')}`.toLowerCase().includes(normalizedQuery);
  }).slice(0, 8);

  function choose(story) {
    onSelect(story.id);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="ad-story-search" onBlur={() => window.setTimeout(() => setOpen(false), 120)}>
      <label>Chọn truyện</label>
      <input
        value={query}
        onFocus={() => setOpen(true)}
        onChange={event => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        placeholder={selectedStory ? selectedStory.title : placeholder}
      />
      {selectedStory && (
        <div className="ad-selected-story">
          <strong>{selectedStory.title}</strong>
          <span>{selectedStory.author || 'Tác giả'} · {(selectedStory.genres || selectedStory.categories || []).slice(0, 3).join(' · ') || 'Chưa có thể loại'}</span>
        </div>
      )}
      {open && (
        <div className="ad-story-suggestions">
          {suggestions.map(story => (
            <button type="button" key={story.id} onMouseDown={event => event.preventDefault()} onClick={() => choose(story)}>
          <img src={story.cover || coverFallback} alt="" loading="lazy" decoding="async" onError={handleImageError} />
              <span><strong>{story.title}</strong><small>{story.author || 'Tác giả'} · {(story.genres || story.categories || []).slice(0, 2).join(' · ')}</small></span>
            </button>
          ))}
          {!suggestions.length && <div className="ad-story-suggestion-empty">Không tìm thấy truyện phù hợp.</div>}
        </div>
      )}
    </div>
  );
}

export function ChapterManager({ stories, chapters, apiClient, usingMock, onSave, onDelete, onBulkDelete, onReorder, onUpdateStory }) {
  const [selectedStoryId, setSelectedStoryId] = useState(stories[0]?.id || '');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);

  return (
    <ChapterManagerDashboard
      stories={stories}
      chapters={chapters}
      apiClient={apiClient}
      usingMock={usingMock}
      onSave={onSave}
      onDelete={onDelete}
      onBulkDelete={onBulkDelete}
      onReorder={onReorder}
      onUpdateStory={onUpdateStory}
      initialStoryId={selectedStoryId}
    />
  );

  useEffect(() => {
    if (!selectedStoryId && stories[0]?.id) setSelectedStoryId(stories[0].id);
    if (selectedStoryId && !stories.some(story => story.id === selectedStoryId)) setSelectedStoryId(stories[0]?.id || '');
  }, [stories, selectedStoryId]);

  if (!stories.length) {
    return (
      <section className="ad-panel">
        <div className="ad-panel-head"><div><h2>Quản lý truyện</h2><p>Chưa có truyện để đăng chương.</p></div><Link className="ad-primary" to="/author/stories/new">Đăng truyện đầu tiên</Link></div>
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
          <div><h2>Quản lý truyện</h2><p>{selectedStoryId ? `${filtered.length} chương phù hợp` : 'Chọn truyện để quản lý chương'}</p></div>
          <div className="ad-head-actions">
            <Link className="ad-primary" to={`/author/stories/${selectedStoryId}/chapters/new`}>Thêm chương</Link>
            <Link className="ad-secondary" to={`/author/stories/${selectedStoryId}/chapters/bulk`}>Thêm nhiều chương</Link>
          </div>
        </div>
        <div className="ad-toolbar">
          <StorySearchPicker stories={stories} selectedStoryId={selectedStoryId} onSelect={setSelectedStoryId} />
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

function ChapterManagerDashboard({ stories, chapters, apiClient, usingMock, onSave, onDelete, onBulkDelete, onReorder, onUpdateStory, initialStoryId }) {
  const [selectedStoryId, setSelectedStoryId] = useState(initialStoryId || stories[0]?.id || '');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [comboOpen, setComboOpen] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState(null);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [remoteData, setRemoteData] = useState(null);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const [dragId, setDragId] = useState('');

  useEffect(() => {
    if (!selectedStoryId && stories[0]?.id) setSelectedStoryId(stories[0].id);
    if (selectedStoryId && !stories.some(story => story.id === selectedStoryId)) setSelectedStoryId(stories[0]?.id || '');
  }, [stories, selectedStoryId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [selectedStoryId, debouncedQuery, filter]);

  useEffect(() => {
    if (usingMock || !apiClient || !selectedStoryId) {
      setRemoteData(null);
      return undefined;
    }
    const controller = new AbortController();
    async function loadRemoteChapters() {
      setLoadingRemote(true);
      setRemoteError('');
      try {
        const params = new URLSearchParams({ storyId: selectedStoryId, page: '1', limit: '500' });
        if (debouncedQuery) params.set('q', debouncedQuery);
        if (filter === 'free' || filter === 'vip') params.set('access', filter);
        else if (filter) params.set('status', filter);
        const result = await apiClient(`/author/chapters?${params.toString()}`, { noStore: true, signal: controller.signal });
        setRemoteData(result);
      } catch (err) {
        if (err.name !== 'AbortError') setRemoteError(err.message || 'Không thể tải danh sách chương.');
      } finally {
        setLoadingRemote(false);
      }
    }
    loadRemoteChapters();
    return () => controller.abort();
  }, [apiClient, usingMock, selectedStoryId, debouncedQuery, filter]);

  const selectedStory = stories.find(story => story.id === selectedStoryId);
  const sourceChapters = remoteData?.chapters || chapters;
  const allStoryChapters = chapters
    .filter(chapter => !selectedStoryId || chapter.storyId === selectedStoryId)
    .sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
  const storyChapters = sourceChapters
    .filter(chapter => !selectedStoryId || chapter.storyId === selectedStoryId)
    .sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
  const filtered = remoteData?.chapters ? storyChapters : storyChapters.filter(chapter => {
    const haystack = `${chapter.number} ${chapter.title} ${chapter.preview || ''}`.toLowerCase();
    const matchQuery = !debouncedQuery || haystack.includes(debouncedQuery.toLowerCase());
    const matchFilter = !filter || chapter.status === filter || chapter.access === filter;
    return matchQuery && matchFilter;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = filtered.length ? (currentPage - 1) * pageSize : 0;
  const visibleChapters = filtered.slice(pageStart, pageStart + pageSize);
  const allVisibleSelected = visibleChapters.length > 0 && visibleChapters.every(chapter => selectedIds.has(chapter.id));
  const stats = remoteData?.stats || {
    total: storyChapters.length,
    free: storyChapters.filter(chapter => chapter.access !== 'vip').length,
    vip: storyChapters.filter(chapter => chapter.access === 'vip').length,
    views: storyChapters.reduce((sum, chapter) => sum + Number(chapter.views || 0), 0)
  };

  if (!stories.length) {
    return (
      <section className="ad-panel">
        <div className="ad-panel-head"><div><h2>Quản lý truyện</h2><p>Chưa có truyện để đăng chương.</p></div><Link className="ad-primary" to="/author/stories/new">Đăng truyện đầu tiên</Link></div>
        <EmptyState>Bạn chưa có truyện nào, bắt đầu đăng truyện đầu tiên.</EmptyState>
      </section>
    );
  }

  function toggleSelected(id) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds(current => {
      const next = new Set(current);
      if (allVisibleSelected) visibleChapters.forEach(chapter => next.delete(chapter.id));
      else visibleChapters.forEach(chapter => next.add(chapter.id));
      return next;
    });
  }

  async function deleteSelected() {
    setDeleteRequest(storyChapters.filter(chapter => selectedIds.has(chapter.id)));
  }

  async function confirmDeleteChapters(targetChapters) {
    const targets = Array.isArray(targetChapters) ? targetChapters : [targetChapters].filter(Boolean);
    if (!targets.length) return;
    if (targets.length === 1) await onDelete(targets[0].id);
    else await onBulkDelete(targets.map(chapter => chapter.id));
    setSelectedIds(new Set());
    setDeleteRequest(null);
  }

  async function publishSelected() {
    const selectedChapters = storyChapters.filter(chapter => selectedIds.has(chapter.id));
    if (!selectedChapters.length) return;
    await Promise.all(selectedChapters.map(chapter => onSave({ ...chapter }, 'published')));
    if (selectedStory?.hidden && selectedStory?.approvalStatus === 'approved' && onUpdateStory) {
      await onUpdateStory(selectedStory.id, { hidden: false });
    }
    setSelectedIds(new Set());
  }

  async function moveDragged(targetId) {
    if (!dragEnabled || !dragId || dragId === targetId) return;
    const current = (allStoryChapters.length >= storyChapters.length ? allStoryChapters : storyChapters).slice();
    const from = current.findIndex(chapter => chapter.id === dragId);
    const to = current.findIndex(chapter => chapter.id === targetId);
    if (from < 0 || to < 0) {
      setDragId('');
      return;
    }
    const [moved] = current.splice(from, 1);
    current.splice(to, 0, moved);
    const optimisticChapters = current.map((chapter, index) => ({ ...chapter, number: index + 1 }));
    try {
      const result = await onReorder(selectedStoryId, optimisticChapters);
      const reordered = result?.chapters || optimisticChapters;
      setRemoteData(data => data ? {
        ...data,
        chapters: data.chapters
          .map(chapter => reordered.find(item => item.id === chapter.id) || chapter)
          .sort((a, b) => Number(a.number || 0) - Number(b.number || 0))
      } : data);
    } catch (err) {
      setRemoteError(err.message || 'Không thể cập nhật thứ tự chương.');
    } finally {
      setDragId('');
    }
  }

  return (
    <div className="ad-stack">
      <section className="ad-panel ad-chapter-manager-panel">
        <div className="ad-chapter-manager-head">
          <div className="ad-chapter-titlebar">
            <Link className="ad-square-button" to="/author/stories" aria-label="Quay lại truyện">
              <Majesticon name="arrowLeft" size={20} />
            </Link>
            <div>
              <h2>Danh sách chương</h2>
              <p>{selectedStory?.title || 'Chọn truyện'} · {filtered.length} chương phù hợp</p>
            </div>
          </div>
          <div className="ad-chapter-head-actions">
            <button type="button" className="ad-gold-action" onClick={() => setComboOpen(true)}><Majesticon name="combo" size={17} /> Gói Combo</button>
            <button type="button" className={dragEnabled ? 'active' : ''} title="Kéo thả để sắp xếp" onClick={() => setDragEnabled(value => !value)}><Majesticon name="playlist" size={17} /> Kéo thả: {dragEnabled ? 'Bật' : 'Tắt'}</button>
            <button type="button" onClick={toggleAllVisible}><Majesticon name="checklist" size={17} /> Chọn nhiều</button>
            <button type="button" className="danger" disabled={!storyChapters.length} onClick={() => setDeleteRequest(storyChapters)}><Majesticon name="trash" size={17} /> Xóa tất cả</button>
            <Link className="ad-primary" to={`/author/stories/${selectedStoryId}/chapters/new`}><Majesticon name="bookOpen" size={17} /> Thêm chương</Link>
          </div>
        </div>

        <div className="ad-chapter-dashboard-toolbar">
          <StorySearchPicker stories={stories} selectedStoryId={selectedStoryId} onSelect={setSelectedStoryId} />
          <label className="ad-search-field"><Majesticon name="search" size={18} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm kiếm chương..." /></label>
          <select value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="">Tất cả</option>
            <option value="free">Miễn phí</option>
            <option value="vip">VIP</option>
            <option value="draft">Nháp</option>
            <option value="pending">Chờ duyệt</option>
            <option value="published">Đã đăng</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
            <option value="scheduled">Đã lên lịch</option>
          </select>
        </div>

        <div className="ad-chapter-summary-grid">
          <div><span><Majesticon name="list" size={18} /></span><strong>{formatNumber(stats.total)}</strong><small>Tổng chương</small></div>
          <div><span><Majesticon name="bookOpen" size={18} /></span><strong>{formatNumber(stats.free)}</strong><small>Miễn phí</small></div>
          <div><span><Majesticon name="crown" size={18} /></span><strong>{formatNumber(stats.vip)}</strong><small>VIP</small></div>
          <div><span><Majesticon name="eye" size={18} /></span><strong>{formatNumber(stats.views)}</strong><small>Tổng lượt xem</small></div>
        </div>

        {remoteError && <ErrorNotice message={remoteError} />}
        <div className={`ad-bulk-bar ${selectedIds.size ? 'active' : ''}`}>
          <strong><span>{selectedIds.size}</span> đã chọn</strong>
          <div>
            <button type="button" disabled={!visibleChapters.length} onClick={toggleAllVisible}><Majesticon name="check" size={16} /> {allVisibleSelected ? 'Bỏ chọn trang' : 'Chọn tất cả'}</button>
            <button type="button" disabled={!selectedIds.size} onClick={() => setSelectedIds(new Set())}><Majesticon name="close" size={16} /> Bỏ chọn</button>
            <button type="button" disabled={!selectedIds.size} onClick={publishSelected}><Majesticon name="send" size={16} /> Xuất bản</button>
            <button type="button" className="danger" disabled={!selectedIds.size} onClick={deleteSelected}><Majesticon name="trash" size={16} /> Xóa</button>
          </div>
        </div>

        <div className="ad-chapter-pager">
          <div>
            <strong>Hiển thị {filtered.length ? pageStart + 1 : 0} - {Math.min(pageStart + pageSize, filtered.length)} của {formatNumber(filtered.length)} chương</strong>
            <label>Hiển thị
              <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
                {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
              </select>
              / trang
            </label>
          </div>
          <PaginationControl page={currentPage} totalPages={totalPages} onPage={setPage} />
        </div>

        <div className="ad-chapter-table">
          <div className="ad-chapter-table-head">
            <label><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /></label>
            <span>STT</span><span>Tên chương</span><span>Loại</span><span>Số chữ</span><span>Lượt xem</span><span>Ngày đăng</span><span>Hành động</span>
          </div>
          {visibleChapters.map(chapter => (
            <div
              key={chapter.id}
              className={`ad-chapter-table-row ${dragEnabled ? 'drag-enabled' : ''} ${dragId === chapter.id ? 'dragging' : ''}`}
              draggable={dragEnabled}
              onDragStart={event => {
                if (!dragEnabled) return;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', chapter.id);
                setDragId(chapter.id);
              }}
              onDragOver={event => dragEnabled && event.preventDefault()}
              onDrop={() => moveDragged(chapter.id)}
              onDragEnd={() => setDragId('')}
            >
              <label><input type="checkbox" checked={selectedIds.has(chapter.id)} onChange={() => toggleSelected(chapter.id)} /></label>
              <span className="ad-chapter-number"><button type="button" disabled={!dragEnabled} title="Kéo thả để đổi thứ tự" draggable={dragEnabled} onDragStart={event => {
                if (!dragEnabled) return;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', chapter.id);
                setDragId(chapter.id);
              }}><Majesticon name="playlist" size={16} /></button>{chapter.number}</span>
              <span className="ad-chapter-title"><b>Chương {chapter.number}: {chapter.title}</b><small>{chapter.preview || chapterStatusText(chapter.status)}</small></span>
              <span><AccessBadge access={chapter.access} /></span>
              <span>{formatNumber(chapter.words || chapter.wordCount || textWordCount(chapter.content))}</span>
              <span>{formatNumber(chapter.views)}</span>
              <span>{formatDate(chapter.updatedAt || chapter.createdAt)}</span>
              <span className="ad-icon-actions">
                <button type="button" title="Xem trước" onClick={() => setPreviewing(chapter)}><Majesticon name="eye" size={16} /></button>
                <button type="button" title="Sửa" onClick={() => setEditing(chapter)}><Majesticon name="edit" size={16} /></button>
                <button type="button" title="Xóa" onClick={() => setDeleteRequest([chapter])}><Majesticon name="trash" size={16} /></button>
              </span>
            </div>
          ))}
        </div>
        {loadingRemote && <LoadingBlock text="Đang tải danh sách chương..." />}
        {filtered.length === 0 && !loadingRemote && <EmptyState>Chưa có chương phù hợp.</EmptyState>}
      </section>

      {previewing && (
        <ChapterPreviewModal
          chapter={previewing}
          story={selectedStory}
          onClose={() => setPreviewing(null)}
          onEdit={() => {
            setEditing(previewing);
            setPreviewing(null);
          }}
        />
      )}
      {comboOpen && selectedStory && (
        <ComboModal
          story={selectedStory}
          chapters={storyChapters}
          onClose={() => setComboOpen(false)}
          onSave={async price => {
            await onUpdateStory?.(selectedStory.id, { comboPrice: price });
            setComboOpen(false);
          }}
        />
      )}
      {deleteRequest && (
        <DeleteChapterModal
          chapters={deleteRequest}
          onClose={() => setDeleteRequest(null)}
          onConfirm={() => confirmDeleteChapters(deleteRequest)}
        />
      )}
      {editing && (
        <div className="ad-preview-overlay" role="dialog" aria-modal="true" aria-label="Sửa chương">
          <div className="ad-editor-modal">
            <ChapterEditor key={editing.id || 'new'} chapter={editing} stories={stories} selectedStoryId={selectedStoryId} onCancel={() => setEditing(null)} onSave={async (chapter, status) => {
              await onSave(chapter, status);
              if (status === 'published' && selectedStory?.hidden && selectedStory?.approvalStatus === 'approved' && onUpdateStory) {
                await onUpdateStory(selectedStory.id, { hidden: false });
              }
              setEditing(null);
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

function PaginationControl({ page, totalPages, onPage }) {
  const pages = [];
  for (let index = 1; index <= totalPages; index += 1) {
    if (index === 1 || index === totalPages || Math.abs(index - page) <= 2) pages.push(index);
    else if (pages[pages.length - 1] !== '...') pages.push('...');
  }
  return (
    <nav className="ad-pagination" aria-label="Phân trang chương">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}><Majesticon name="chevronLeft" size={18} /></button>
      {pages.map((item, index) => item === '...'
        ? <span key={`dots-${index}`}>...</span>
        : <button type="button" key={item} className={item === page ? 'active' : ''} onClick={() => onPage(item)}>{item}</button>)}
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}><Majesticon name="chevronRight" size={18} /></button>
    </nav>
  );
}

function ComboModal({ story, chapters, onClose, onSave }) {
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const vipChapters = chapters.filter(chapter => chapter.access === 'vip' || chapter.isPremium);
  const currentPrice = Number(story.comboPrice || 0);
  const totalSeeds = currentPrice || vipChapters.reduce((sum, chapter) => sum + Number(chapter.price || 0), 0);
  const locked = Boolean(story.comboPriceLocked);

  async function submit() {
    const nextPrice = Number(price || 0);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      setError('Vui lòng nhập giá combo hợp lệ.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(nextPrice);
    } catch (err) {
      setError(err.message || 'Không thể cập nhật giá combo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ad-preview-overlay" role="dialog" aria-modal="true" aria-label="Gói Combo VIP">
      <article className="ad-combo-modal">
        <header><h2><Majesticon name="combo" size={20} /> Gói Combo VIP</h2><button type="button" onClick={onClose} aria-label="Đóng"><Majesticon name="close" size={20} /></button></header>
        <div className="ad-combo-body">
          <p><Majesticon name="check" size={17} /> Mở khóa tất cả chương VIP hiện tại và tương lai</p>
          <p><Majesticon name="check" size={17} /> Điều kiện: Hoàn thành hoặc từ 100 chương</p>
          <p><Majesticon name="alert" size={17} /> Chỉ được đổi giá 1 lần sau khi tạo</p>
          <div className="ad-combo-stats">
            <div><strong>{formatNumber(vipChapters.length)}</strong><span>VIP</span></div>
            <div><strong>{formatNumber(totalSeeds)}</strong><span>Tổng Hạt</span></div>
            <div><strong>{formatNumber(story.comboPurchases || story.comboSold || 0)}</strong><span>Đã mua</span></div>
          </div>
          <div className="ad-combo-current">Giá hiện tại <strong>{formatNumber(currentPrice)}</strong><Majesticon name="coins" size={22} /> <span>{currentPrice ? 'Đang bán' : 'Chưa bán'}</span></div>
          <label>Giá mới (Hạt)
            <div><input value={price} disabled={locked} onChange={event => setPrice(event.target.value)} placeholder={locked ? 'Giá đã khóa sau lần đổi đầu tiên' : 'Nhập giá mới...'} /><Majesticon name="coins" size={20} /></div>
          </label>
          {error && <p className="ad-combo-error">{error}</p>}
          <button type="button" disabled={saving || locked} onClick={submit}><Majesticon name="edit" size={18} /> {saving ? 'Đang cập nhật...' : 'Cập nhật giá'}</button>
          <footer><div><strong>Tạm ngưng bán</strong><span>Người đã mua vẫn giữ quyền đọc</span></div><button type="button"><Majesticon name="panel" size={18} /></button></footer>
        </div>
      </article>
    </div>
  );
}

function DeleteChapterModal({ chapters, onClose, onConfirm }) {
  const [checked, setChecked] = useState(false);
  const list = chapters || [];
  const title = list.length === 1 ? `Chương ${list[0].number}: ${list[0].title}` : `${list.length} chương đã chọn`;
  return (
    <div className="ad-preview-overlay" role="dialog" aria-modal="true" aria-label="Xác nhận xóa chương">
      <article className="ad-delete-modal">
        <header><h2><Majesticon name="alert" size={24} /> Xác nhận xóa chương</h2><button type="button" onClick={onClose} aria-label="Đóng"><Majesticon name="close" size={20} /></button></header>
        <section>
          <div className="ad-delete-warning"><Majesticon name="alert" size={28} /><div><strong>Cảnh báo quan trọng!</strong><p>Hành động này sẽ xóa vĩnh viễn chương và không thể hoàn tác.</p></div></div>
          <div className="ad-delete-target"><strong><Majesticon name="receipt" size={18} /> Chương sẽ bị xóa:</strong><p>{title}</p></div>
          <label className="ad-delete-check"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} /><span>Tôi hiểu rằng hành động này không thể hoàn tác</span></label>
        </section>
        <footer><button type="button" onClick={onClose}><Majesticon name="close" size={17} /> Hủy bỏ</button><button type="button" className="danger" disabled={!checked} onClick={onConfirm}><Majesticon name="trash" size={17} /> Xóa chương</button></footer>
      </article>
    </div>
  );
}

function AccessBadge({ access }) {
  const vip = access === 'vip';
  return <span className={`ad-access-badge ${vip ? 'vip' : 'free'}`}>{vip ? 'VIP' : 'Miễn phí'}</span>;
}

function ChapterPreviewModal({ chapter, story, onClose, onEdit }) {
  const content = String(chapter.content || chapter.preview || '');
  const words = chapter.words || chapter.wordCount || textWordCount(content);
  const title = `Chương ${chapter.number || ''}: ${chapter.title || 'Chưa có tiêu đề'}`.trim();

  function copyContent() {
    navigator.clipboard?.writeText(content);
  }

  function downloadContent() {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${generateSlug(title)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ad-preview-overlay" role="dialog" aria-modal="true" aria-label="Xem trước chương">
      <article className="ad-preview-modal">
        <header>
          <strong>Xem chương</strong>
          <button type="button" onClick={onClose} aria-label="Đóng"><Majesticon name="close" size={18} /></button>
        </header>
        <section className="ad-preview-body">
          <h2>{title}</h2>
          <div className="ad-preview-meta">
            <span className={`status-${chapter.status || 'draft'}`}><Majesticon name="check" size={15} /> {chapterStatusText(chapter.status)}</span>
            <span><Majesticon name="coins" size={15} /> {chapter.access === 'vip' ? `${formatNumber(chapter.price || 0)} Hạt` : 'Miễn phí'}</span>
            <span><Majesticon name="calendar" size={15} /> {formatDate(chapter.updatedAt || chapter.createdAt || chapter.scheduledAt)}</span>
            <span><Majesticon name="user" size={15} /> {story?.author || 'Tác giả'}</span>
            <span><Majesticon name="text" size={15} /> {formatNumber(words)} từ</span>
            <span><Majesticon name="eye" size={15} /> {formatNumber(chapter.views)} lượt đọc</span>
          </div>
          <div className="ad-preview-reader">
            {content.split('\n').map((line, index) => line.trim() ? <p key={index}>{line}</p> : <br key={index} />)}
          </div>
        </section>
        <footer>
          <button type="button" onClick={onClose}>Đóng</button>
          <button type="button" aria-label="Copy nội dung" onClick={copyContent}><Majesticon name="receipt" size={17} /></button>
          <button type="button" aria-label="Tải xuống" onClick={downloadContent}><Majesticon name="arrowUp" size={17} /></button>
          <button type="button" className="primary" onClick={onEdit}><Majesticon name="edit" size={17} /> Sửa</button>
        </footer>
      </article>
    </div>
  );
}

export function ChapterEditorOld({ chapter, stories, selectedStoryId, onSave, onCancel }) {
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
  const wordTotal = textWordCount(form.content);
  const valid = Boolean(form.storyId && form.title.trim() && form.content.trim() && (form.access !== 'vip' || Number(form.price || 0) > 0));
  const selectedStory = stories.find(story => story.id === form.storyId);

  function validate(status) {
    if (!form.storyId) return 'Vui lòng chọn truyện.';
    if (!form.title.trim()) return 'Vui lòng nhập tiêu đề chương.';
    if (!form.content.trim()) return 'Vui lòng nhập nội dung chương.';
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
      <StorySearchPicker stories={stories} selectedStoryId={form.storyId} onSelect={storyId => setForm({ ...form, storyId })} />
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
        <button type="button" disabled={Boolean(saving)} onClick={() => submit('published')}>{saving === 'published' ? 'Đang đăng...' : 'Đăng chương'}</button>
      </div>
      {preview && <article className="ad-chapter-preview"><h3>{form.title || 'Tiêu đề chương'}</h3>{form.content.split('\n').map((line, index) => line ? <p key={index}>{line}</p> : <br key={index} />)}</article>}
    </section>
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
  const wordTotal = textWordCount(form.content);
  const valid = Boolean(form.storyId && form.title.trim() && form.content.trim() && (form.access !== 'vip' || Number(form.price || 0) > 0));
  const selectedStory = stories.find(story => story.id === form.storyId);

  function validate(status) {
    if (!form.storyId) return 'Vui lòng chọn truyện.';
    if (!form.title.trim()) return 'Vui lòng nhập tiêu đề chương.';
    if (!form.content.trim()) return 'Vui lòng nhập nội dung chương.';
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
    <section className="ad-panel ad-chapter-editor ad-chapter-editor-pro">
      <div className="ad-chapter-edit-head">
        <div><h2>{chapter.id ? 'Sửa chương' : 'Tạo chương mới'}</h2><p>{selectedStory?.title || 'Chọn truyện'} · Chương gửi duyệt sẽ chưa hiển thị ngoài public reader.</p></div>
        <button type="button" onClick={onCancel} aria-label="Đóng"><Majesticon name="close" size={18} /></button>
      </div>
      {error && <ErrorNotice message={error} />}
      <StorySearchPicker stories={stories} selectedStoryId={form.storyId} onSelect={storyId => setForm({ ...form, storyId })} />
      <div className="ad-chapter-edit-grid">
        <label className="wide">Tiêu đề chương *<input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="VD: Chương 252: Bị bắt" /></label>
        <label>Số thứ tự<input type="number" min="1" value={form.number} onChange={event => setForm({ ...form, number: Number(event.target.value) })} /></label>
      </div>
      <div className={`ad-valid-pill ${valid ? 'ok' : ''}`}><Majesticon name={valid ? 'check' : 'alert'} size={15} /> {valid ? 'Định dạng hợp lệ' : 'Cần bổ sung thông tin'}</div>
      <label className="ad-content-label"><span>Nội dung chương *</span><small>{formatNumber(wordTotal)} từ</small></label>
      <div className="ad-editor-shell">
        <div className="ad-editor-toolbar" aria-label="Công cụ soạn thảo">
          {['Normal', 'B', 'I', 'U'].map(item => <button type="button" key={item}>{item}</button>)}
          <button type="button"><Majesticon name="text" size={15} /></button>
          <button type="button"><Majesticon name="chatText" size={15} /></button>
          <button type="button"><Majesticon name="list" size={15} /></button>
          <button type="button"><Majesticon name="share" size={15} /></button>
          <button type="button"><Majesticon name="fontSize" size={15} /></button>
        </div>
        <textarea rows="15" value={form.content} onChange={event => setForm({ ...form, content: event.target.value })} placeholder="Nhập nội dung chương..." />
      </div>
      <div className="ad-chapter-settings-grid">
        <label>Trạng thái xuất bản<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="draft">Nháp</option><option value="pending">Chờ duyệt</option><option value="published">Đã xuất bản</option><option value="scheduled">Đã lên lịch</option><option value="hidden">Ẩn</option></select></label>
        <label>Thời gian xuất bản *<input type="datetime-local" value={form.scheduledAt} onChange={event => setForm({ ...form, scheduledAt: event.target.value })} /></label>
        <label>Chương trả phí<select value={form.access} onChange={event => setForm({ ...form, access: event.target.value })}><option value="free">Miễn phí</option><option value="vip">Trả phí</option></select></label>
        <label>Giá (Hạt)<input type="number" min="0" value={form.price} onChange={event => setForm({ ...form, price: event.target.value })} disabled={form.access !== 'vip'} />{form.access === 'vip' && <small>Giá tối thiểu: 3 Hạt</small>}</label>
        <label>Hiển thị<select value={form.status === 'hidden' ? 'hidden' : 'visible'} onChange={event => setForm({ ...form, status: event.target.value === 'hidden' ? 'hidden' : 'published' })}><option value="visible">Hiển thị</option><option value="hidden">Ẩn</option></select></label>
        <label>Bảo vệ mật khẩu<select disabled><option>Không</option></select></label>
        <label className="wide">Preview chương<textarea rows="3" value={form.preview} onChange={event => setForm({ ...form, preview: event.target.value })} placeholder="Đoạn xem trước cho chương VIP" /></label>
      </div>
      <div className="ad-form-actions ad-chapter-edit-actions">
        <button type="button" onClick={onCancel}><Majesticon name="close" size={16} /> Hủy</button>
        <button type="button" onClick={() => setPreview(value => !value)}><Majesticon name="eye" size={16} /> {preview ? 'Ẩn xem trước' : 'Xem trước'}</button>
        <button type="button" disabled={Boolean(saving)} onClick={() => submit('draft')}><Majesticon name="receipt" size={16} /> {saving === 'draft' ? 'Đang lưu...' : 'Lưu nháp'}</button>
        <button type="button" disabled={Boolean(saving)} onClick={() => submit(form.status || 'published')}><Majesticon name="send" size={16} /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
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

function AuthorPrivatePreview({ story, chapters, loading }) {
  if (loading) return <LoadingBlock text="Đang tải bản nháp..." />;
  if (!story) return <EmptyState>Không tìm thấy truyện cần preview.</EmptyState>;
  const sorted = chapters.slice().sort((a, b) => Number(a.number) - Number(b.number));
  return (
    <section className="ad-panel">
      <div className="ad-panel-head">
        <div><h2>Preview riêng tư</h2><p>Chỉ chủ truyện hoặc admin xem được trong khu tác giả.</p></div>
        <Link className="ad-secondary" to={`/author/stories/${story.id}/edit`}>Sửa truyện</Link>
      </div>
      <article className="ad-private-preview">
        <img src={story.cover || coverFallback} alt={story.title} loading="lazy" decoding="async" onError={handleImageError} />
        <div>
          <div className="ad-badge-stack"><StatusBadge status={story.approvalStatus} />{story.hidden && <StatusBadge hidden />}</div>
          <h3>{story.title}</h3>
          <p>{story.description || story.shortDescription}</p>
          <div className="ad-chip-row">{(story.genres || story.categories || []).slice(0, 5).map(item => <span key={item}>{item}</span>)}</div>
        </div>
      </article>
      <div className="ad-chapter-list">
        {sorted.map(chapter => (
          <article key={chapter.id}>
            <span><b>#{chapter.number} {chapter.title}</b><small>{chapterStatusText(chapter.status)} · {formatNumber(chapter.words || chapter.wordCount || textWordCount(chapter.content))} từ</small></span>
            <em>{chapter.access === 'vip' ? 'VIP' : 'Miễn phí'}</em>
            <div><Link to="/author/chapters">Quản lý</Link></div>
          </article>
        ))}
      </div>
      {!sorted.length && <EmptyState>Truyện này chưa có chương.</EmptyState>}
    </section>
  );
}

function ChapterMethodChooser({ story, loading }) {
  if (loading) return <LoadingBlock text="Đang tải truyện..." />;
  if (!story) return <EmptyState>Không tìm thấy truyện cần thêm chương.</EmptyState>;
  return (
    <section className="ad-panel">
      <div className="ad-panel-head">
        <div><h2>Chọn cách thêm chương</h2><p>{story.title}</p></div>
        <Link className="ad-secondary" to="/author/stories">Quay lại</Link>
      </div>
      <div className="ad-method-grid">
        <Link to={`/author/stories/${story.id}/chapters/new`}>
          <strong>Thêm 1 chương</strong>
          <span>Tạo một chương mới với trình soạn thảo đầy đủ.</span>
          <small>Trình soạn thảo đầy đủ · Lên lịch xuất bản · Cài giá chương</small>
        </Link>
        <Link to={`/author/stories/${story.id}/chapters/bulk`}>
          <strong>Thêm nhiều chương</strong>
          <span>Dán nội dung hoặc tải file để tự động tách chương.</span>
          <small>Tự động phát hiện chương · Upload Word/TXT · Preview trước khi đăng</small>
        </Link>
      </div>
    </section>
  );
}

function SingleChapterPage({ story, stories, chapters, loading, onSave }) {
  const navigate = useNavigate();
  if (loading) return <LoadingBlock text="Đang tải form chương..." />;
  if (!story) return <EmptyState>Không tìm thấy truyện cần thêm chương.</EmptyState>;
  const nextNumber = nextChapterNumberForStory(chapters, story.id);
  return (
    <div className="ad-stack">
      <section className="ad-panel ad-story-head">
        <div><h2>Thêm 1 chương</h2><p>{story.title} · Chương tiếp theo dự kiến #{nextNumber}</p></div>
        <Link className="ad-secondary" to={`/author/stories/${story.id}/chapters/bulk`}>Thêm nhiều chương</Link>
      </section>
      <ChapterEditor
        key={`${story.id}-${nextNumber}`}
        chapter={{ storyId: story.id, number: nextNumber, status: 'draft' }}
        stories={stories}
        selectedStoryId={story.id}
        onCancel={() => navigate('/author/stories')}
        onSave={async (chapter, status) => {
          await onSave(chapter, status);
          navigate('/author/chapters');
        }}
      />
    </div>
  );
}

function BulkChapterPage({ story, stories, chapters, loading, apiClient, usingMock, onSaveBulk }) {
  const navigate = useNavigate();
  const params = useParams();
  const [selectedStoryId, setSelectedStoryId] = useState(story?.id || stories[0]?.id || '');
  const [activeTab, setActiveTab] = useState('paste');
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [startNumber, setStartNumber] = useState(1);
  const [renumber, setRenumber] = useState(true);
  const [access, setAccess] = useState('free');
  const [price, setPrice] = useState(0);
  const [mode, setMode] = useState('published');
  const [scheduledAt, setScheduledAt] = useState('');
  const [fileInfo, setFileInfo] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const selectedStory = story || stories.find(item => item.id === selectedStoryId);
  const storyChapters = chapters.filter(chapter => chapter.storyId === selectedStory?.id);
  const nextNumber = selectedStory ? nextChapterNumberForStory(chapters, selectedStory.id) : 1;

  useEffect(() => {
    if (story?.id) setSelectedStoryId(story.id);
    else if (!selectedStoryId && stories[0]?.id) setSelectedStoryId(stories[0].id);
  }, [story?.id, stories, selectedStoryId]);

  useEffect(() => {
    setStartNumber(nextNumber);
  }, [nextNumber, selectedStory?.id]);

  const previewChapters = useMemo(() => {
    const seen = new Set();
    const existing = new Set(storyChapters.map(chapter => Number(chapter.number)));
    const start = Number(startNumber || nextNumber || 1);
    return parsed.map((chapter, index) => {
      const number = renumber ? start + index : Number(chapter.number || start + index);
      const warnings = [...(chapter.warnings || [])];
      if (!String(chapter.title || '').trim()) warnings.push('Tên chương rỗng.');
      if (!String(chapter.content || '').trim()) warnings.push('Nội dung chương rỗng.');
      if (existing.has(Number(number)) || seen.has(Number(number))) warnings.push('Trùng số chương.');
      seen.add(Number(number));
      const wordTotal = textWordCount(chapter.content);
      if (wordTotal > 0 && wordTotal < 80 && !warnings.some(item => item.includes('ngắn'))) warnings.push('Chương hơi ngắn.');
      const blocked = warnings.some(item => item.includes('rỗng') || item.includes('Trùng'));
      return { ...chapter, number, wordCount: wordTotal, warnings, blocked };
    });
  }, [parsed, renumber, startNumber, nextNumber, storyChapters]);

  function setParsedChapters(chaptersToSet) {
    const normalized = chaptersToSet.map((chapter, index) => ({
      localId: chapter.localId || `bulk-${Date.now()}-${index}`,
      number: chapter.number || Number(startNumber || nextNumber) + index,
      title: chapter.title || '',
      content: chapter.content || '',
      wordCount: chapter.wordCount || textWordCount(chapter.content),
      warnings: chapter.warnings || []
    }));
    setParsed(normalized);
    setSelectedIds(new Set(normalized.map(chapter => chapter.localId)));
  }

  function checkChapters() {
    if (!rawText.trim()) {
      setError('Vui lòng dán nội dung cần tách chương.');
      return;
    }
    setError('');
    setParsedChapters(parseBulkChapterText(rawText, Number(startNumber || nextNumber)));
  }

  function updateChapter(localId, patch) {
    setParsed(current => current.map(chapter => chapter.localId === localId ? { ...chapter, ...patch } : chapter));
  }

  function toggleChapter(localId) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
  }

  async function handleFile(file) {
    if (!file || !selectedStory) return;
    setProcessing(true);
    setError('');
    setFileInfo({ name: file.name, size: file.size, status: 'Đang xử lý...' });
    try {
      const extension = file.name.split('.').pop().toLowerCase();
      if ((usingMock || !apiClient) && extension === 'txt') {
        const text = await file.text();
        setRawText(text);
        const parsedText = parseBulkChapterText(text, Number(startNumber || nextNumber));
        setParsedChapters(parsedText);
        setFileInfo({ name: file.name, size: file.size, status: 'Đã tách chương', count: parsedText.length });
        return;
      }
      if (usingMock || !apiClient) throw new Error('Upload DOCX cần backend API.');
      const body = new FormData();
      body.append('file', file);
      const result = await apiClient(`/author/stories/${selectedStory.id}/chapters/import`, { method: 'POST', body });
      setParsedChapters(result.chapters || []);
      setFileInfo({ name: file.name, size: file.size, status: 'Đã tách chương', count: result.chapters?.length || 0 });
    } catch (err) {
      setError(err.message || 'Không thể đọc file.');
      setFileInfo(current => current ? { ...current, status: 'Lỗi xử lý' } : null);
    } finally {
      setProcessing(false);
    }
  }

  async function submitBatch(modeOverride) {
    if (!selectedStory) {
      setError('Vui lòng chọn truyện.');
      return;
    }
    const selected = previewChapters.filter(chapter => selectedIds.has(chapter.localId));
    if (!selected.length) {
      setError('Vui lòng chọn ít nhất một chương hợp lệ.');
      return;
    }
    if (selected.some(chapter => chapter.blocked)) {
      setError('Vui lòng sửa các chương đang lỗi trước khi lưu.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await onSaveBulk(selectedStory.id, {
        chapters: selected.map(chapter => ({ number: chapter.number, title: chapter.title, content: chapter.content, wordCount: chapter.wordCount })),
        mode: modeOverride || mode,
        access,
        price: Number(price || 0),
        renumber: false,
        scheduledAt
      });
      if (result.errors?.length) {
        setError(`${result.skipped || result.errors.length} chương bị bỏ qua: ${result.errors.map(item => `#${item.number || item.index}: ${item.reason}`).join(', ')}`);
      } else {
        navigate('/author/chapters');
      }
    } catch (err) {
      setError(err.message || 'Không thể lưu batch chương.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingBlock text="Đang tải form thêm nhiều chương..." />;
  if (!stories.length) return <EmptyState>Bạn cần đăng truyện trước khi thêm chương.</EmptyState>;

  return (
    <div className="ad-stack">
      <section className="ad-panel ad-story-head">
        <div>
          <Link className="ad-back-link" to="/author/stories">Quay lại</Link>
          <h2>Thêm nhiều chương</h2>
          <p>{selectedStory?.title || 'Chọn truyện'} · Chương tiếp theo dự kiến #{nextNumber}</p>
        </div>
        {!params.id && (
          <StorySearchPicker stories={stories} selectedStoryId={selectedStoryId} onSelect={setSelectedStoryId} />
        )}
      </section>

      {error && <ErrorNotice message={error} />}

      <section className="ad-panel">
        <div className="ad-bulk-tabs">
          <button type="button" className={activeTab === 'paste' ? 'active' : ''} onClick={() => setActiveTab('paste')}>Dán nội dung</button>
          <button type="button" className={activeTab === 'file' ? 'active' : ''} onClick={() => setActiveTab('file')}>Tải file</button>
        </div>

        {activeTab === 'paste' ? (
          <textarea className="ad-bulk-textarea" rows="16" value={rawText} onChange={event => setRawText(event.target.value)} placeholder={`Chương 1: Tên chương 1\nNội dung chương 1...\n\nChương 2 - Tên chương 2\nNội dung chương 2...\n\nHỗ trợ: Chương N, Chuong N, Chapter N, Hồi N, Quyển N - Chương N, Phó bản N`} />
        ) : (
          <label className="ad-file-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); handleFile(event.dataTransfer.files?.[0]); }}>
            <strong>Kéo thả hoặc chọn file</strong>
            <span>Hỗ trợ .txt và .docx. PDF sẽ báo rõ nếu backend chưa hỗ trợ.</span>
            <input type="file" accept=".txt,.docx,.pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" onChange={event => handleFile(event.target.files?.[0])} />
          </label>
        )}

        {fileInfo && <div className="ad-file-info"><span>{fileInfo.name}</span><span>{formatNumber(fileInfo.size)} bytes</span><b>{fileInfo.status}</b>{fileInfo.count !== undefined && <span>{fileInfo.count} chương phát hiện</span>}</div>}

        <div className="ad-bulk-options">
          <label>Bắt đầu từ chương<input type="number" min="1" value={startNumber} onChange={event => setStartNumber(event.target.value)} /></label>
          <label className="ad-check"><input type="checkbox" checked={renumber} onChange={event => setRenumber(event.target.checked)} /> Tự đánh số lại</label>
          <label>Áp dụng giá<select value={access} onChange={event => setAccess(event.target.value)}><option value="free">Miễn phí tất cả</option><option value="vip">Có phí tất cả</option><option value="inherit">Kế thừa cấu hình truyện</option></select></label>
          {access === 'vip' && <label>Giá chương<input type="number" min="1" value={price} onChange={event => setPrice(event.target.value)} /></label>}
          <label>Trạng thái khi lưu<select value={mode} onChange={event => setMode(event.target.value)}><option value="published">Published</option><option value="draft">Nháp</option><option value="scheduled">Scheduled</option></select></label>
          {mode === 'scheduled' && <label>Lịch đăng<input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} /></label>}
        </div>

        <div className="ad-form-actions">
          <button type="button" onClick={checkChapters} disabled={processing}>Kiểm tra / Tách chương</button>
          <button type="button" onClick={() => submitBatch('draft')} disabled={submitting || !previewChapters.length}>Lưu tất cả thành nháp</button>
          <button type="button" onClick={() => submitBatch(mode)} disabled={submitting || !previewChapters.length}>{submitting ? 'Đang lưu...' : 'Đăng tất cả chương hợp lệ'}</button>
        </div>
      </section>

      {previewChapters.length > 0 && (
        <section className="ad-panel">
          <div className="ad-panel-head"><div><h2>Preview trước khi đăng</h2><p>{previewChapters.filter(chapter => selectedIds.has(chapter.localId) && !chapter.blocked).length} chương hợp lệ đang được chọn</p></div></div>
          <div className="ad-bulk-preview">
            {previewChapters.map(chapter => (
              <article key={chapter.localId} className={chapter.blocked ? 'invalid' : ''}>
                <label className="ad-check"><input type="checkbox" checked={selectedIds.has(chapter.localId)} onChange={() => toggleChapter(chapter.localId)} /> Chọn</label>
                <input type="number" min="1" value={chapter.number} disabled={renumber} onChange={event => updateChapter(chapter.localId, { number: Number(event.target.value) })} />
                <input value={chapter.title} onChange={event => updateChapter(chapter.localId, { title: event.target.value })} placeholder="Tên chương" />
                <span>{formatNumber(chapter.wordCount)} từ</span>
                <button type="button" onClick={() => setParsed(current => current.filter(item => item.localId !== chapter.localId))}>Xóa</button>
                <textarea rows="5" value={chapter.content} onChange={event => updateChapter(chapter.localId, { content: event.target.value })} />
                <div className="ad-warning-list">{chapter.warnings.length ? chapter.warnings.map(item => <small key={item}>{item}</small>) : <small>Hợp lệ</small>}</div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
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
        <div className="ad-panel-head"><div><h2>Gói quảng bá truyện</h2><p>Thanh toán bằng Đậu trong ví, giao dịch được lưu backend.</p></div><select value={selectedStoryId} onChange={event => setSelectedStoryId(event.target.value)}>{stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select></div>
        <div className="ad-promo-grid">{packages.map(pkg => <article key={pkg.id} className={pkg.featured ? 'featured' : ''}><h3>{pkg.title}</h3><p>{pkg.reach} · {pkg.days} ngày</p><strong>{pkg.price} Đậu</strong><ul>{(pkg.features || []).map(item => <li key={item}>{item}</li>)}</ul><button type="button" onClick={() => onBuy(pkg, selectedStoryId)}>Chọn gói</button></article>)}</div>
      </section>
      <section className="ad-panel"><h2>Lịch sử quảng bá</h2><div className="ad-activity-list">{promotions.map(item => <p key={item.id}><b>{item.packageName}</b><span>{item.storyTitle} · {item.cost} Đậu · {item.status} · {formatDate(item.createdAt)}</span></p>)}{!promotions.length && <EmptyState>Chưa có chiến dịch quảng bá nào.</EmptyState>}</div></section>
    </div>
  );
}

function handleImageError(event) {
  if (event.currentTarget.src.endsWith(coverFallback)) return;
  event.currentTarget.src = coverFallback;
}
