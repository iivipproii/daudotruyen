import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { normalizeRole } from '../../lib/permissions.js';

const ADMIN_PAGE_LIMIT = 100;

function queryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'all') search.set(key, value);
  });
  const value = search.toString();
  return value ? `?${value}` : '';
}

export function loadDashboard(apiClient) {
  return apiClient('/admin/dashboard');
}

export function loadUsers(apiClient, params = {}) {
  return apiClient(`/admin/users${queryString({ limit: ADMIN_PAGE_LIMIT, ...params })}`);
}

export function loadStories(apiClient, params = {}) {
  return apiClient(`/admin/stories${queryString({ limit: ADMIN_PAGE_LIMIT, ...params })}`);
}

export function loadChapters(apiClient, params = {}) {
  return apiClient(`/admin/chapters${queryString({ limit: ADMIN_PAGE_LIMIT, ...params })}`);
}

export function loadReports(apiClient, params = {}) {
  return apiClient(`/admin/reports${queryString({ limit: ADMIN_PAGE_LIMIT, ...params })}`);
}

export function loadTransactions(apiClient, params = {}) {
  return apiClient(`/admin/transactions${queryString({ limit: ADMIN_PAGE_LIMIT, ...params })}`);
}

export function loadComments(apiClient, params = {}) {
  return apiClient(`/admin/comments${queryString({ limit: ADMIN_PAGE_LIMIT, ...params })}`);
}

export function loadTaxonomy(apiClient) {
  return apiClient('/admin/taxonomy');
}

export function loadNotifications(apiClient, params = {}) {
  return apiClient(`/admin/notifications${queryString({ limit: ADMIN_PAGE_LIMIT, ...params })}`);
}

export function loadAdminLogs(apiClient, params = {}) {
  return apiClient(`/admin/logs${queryString({ limit: ADMIN_PAGE_LIMIT, ...params })}`);
}

function emptyAdminState() {
  return {
    stats: {},
    users: [],
    stories: [],
    chapters: [],
    reports: [],
    transactions: [],
    comments: [],
    taxonomy: { categories: [], tags: [] },
    notifications: [],
    logs: []
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeUser(user = {}) {
  return {
    ...user,
    role: normalizeRole(user.role),
    status: user.status || 'active',
    coins: Number(user.coins ?? user.seeds ?? 0),
    joinedAt: user.joinedAt || user.createdAt || '',
    lastActiveAt: user.lastActiveAt || user.updatedAt || user.createdAt || '',
    stories: Number(user.stories ?? user.storyCount ?? 0),
    reports: Number(user.reports ?? user.reportCount ?? 0)
  };
}

function normalizeStory(story = {}) {
  return {
    ...story,
    approvalStatus: story.approvalStatus || 'approved',
    publishStatus: story.publishStatus || (story.hidden ? 'hidden' : story.status || 'published'),
    chapterCount: Number(story.chapterCount ?? story.totalChapters ?? story.chapterCountEstimate ?? 0),
    hidden: Boolean(story.hidden),
    featured: Boolean(story.featured),
    hot: Boolean(story.hot),
    recommended: Boolean(story.recommended),
    banner: Boolean(story.banner),
    categories: asArray(story.categories),
    tags: asArray(story.tags)
  };
}

function normalizeChapter(chapter = {}) {
  return {
    ...chapter,
    status: chapter.status || 'approved',
    storyTitle: chapter.storyTitle || chapter.story?.title || 'Truyện đã xóa',
    author: chapter.author || chapter.story?.author || '',
    vip: Boolean(chapter.vip ?? chapter.isPremium),
    price: Number(chapter.price || 0),
    wordCount: Number(chapter.wordCount ?? chapter.words ?? 0),
    reads: Number(chapter.reads ?? chapter.views ?? 0),
    comments: Number(chapter.comments || 0),
    preview: chapter.preview || String(chapter.content || '').slice(0, 500)
  };
}

function normalizeReport(report = {}) {
  return {
    ...report,
    type: report.type || report.targetType || 'story',
    targetTitle: report.targetTitle || report.story?.title || 'Nội dung bị báo cáo',
    storyTitle: report.storyTitle || report.story?.title || '',
    userName: report.userName || report.reporter?.name || report.user?.name || '',
    status: report.status || 'open',
    severity: report.severity || 'medium',
    detail: report.detail || report.reason || ''
  };
}

function normalizeComment(comment = {}) {
  return {
    ...comment,
    status: comment.status || 'visible',
    userName: comment.userName || comment.user?.name || '',
    storyTitle: comment.storyTitle || '',
    reports: Number(comment.reports || 0)
  };
}

function normalizeTransaction(transaction = {}) {
  const amount = Number(transaction.amount || 0);
  const seeds = Number(transaction.seeds ?? transaction.coins ?? Math.abs(amount));
  return {
    ...transaction,
    type: transaction.type || 'bonus',
    status: transaction.status || 'success',
    method: transaction.method || 'internal',
    amount,
    seeds,
    coins: seeds,
    amountVnd: Number(transaction.amountVnd ?? transaction.vndAmount ?? transaction.money ?? 0),
    userName: transaction.userName || transaction.user?.name || transaction.userId || '',
    userEmail: transaction.userEmail || transaction.user?.email || ''
  };
}

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function formatDate(value) {
  if (!value) return 'Chưa cập nhật';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa cập nhật';
  return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatVnd(value = 0) {
  return `${formatNumber(value)} đ`;
}

function roleLabel(role) {
  return {
    user: 'Độc giả',
    mod: 'Mod',
    admin: 'Admin'
  }[role] || role || 'Độc giả';
}

function statusLabel(status) {
  return {
    active: 'Hoạt động',
    locked: 'Đã khóa',
    draft: 'Nháp',
    pending: 'Chờ duyệt',
    reviewing: 'Đang xử lý',
    approved: 'Đã duyệt',
    published: 'Đã xuất bản',
    rejected: 'Từ chối',
    hidden: 'Đã ẩn',
    scheduled: 'Đã lên lịch',
    open: 'Chờ xử lý',
    resolved: 'Đã xử lý',
    success: 'Thành công',
    failed: 'Thất bại',
    visible: 'Đang hiện',
    deleted: 'Đã xóa',
    completed: 'Hoàn thành',
    ongoing: 'Đang ra',
    paused: 'Tạm dừng'
  }[status] || status || 'Chưa rõ';
}

function typeLabel(type) {
  return {
    topup: 'Nạp Đậu',
    purchase: 'Mua chương',
    bonus: 'Thưởng',
    admin_adjustment: 'Admin chỉnh số dư',
    refund: 'Hoàn Đậu',
    promotion: 'Quảng bá',
    story: 'Truyện',
    chapter: 'Chương',
    comment: 'Bình luận',
    user: 'Người dùng',
    category: 'Thể loại',
    tag: 'Tag',
    notification: 'Thông báo',
    report: 'Báo cáo'
  }[type] || type || 'Khác';
}

function toneForStatus(status) {
  if (['approved', 'published', 'resolved', 'success', 'active', 'visible'].includes(status)) return 'success';
  if (['rejected', 'failed', 'locked', 'deleted'].includes(status)) return 'danger';
  if (['hidden'].includes(status)) return 'dark';
  return 'warning';
}

function includesText(values, query) {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return values.filter(Boolean).join(' ').toLowerCase().includes(text);
}

function usePaged(items, pageSize = 10) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    setPage(current => Math.min(current, totalPages));
  }, [totalPages]);
  const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
  return { page, setPage, totalPages, pageItems };
}

function getAdminView(pathname) {
  if (pathname.includes('/users')) return 'users';
  if (pathname.includes('/stories')) return 'stories';
  if (pathname.includes('/chapters')) return 'chapters';
  if (pathname.includes('/reports')) return 'reports';
  if (pathname.includes('/comments')) return 'comments';
  if (pathname.includes('/transactions')) return 'transactions';
  if (pathname.includes('/taxonomy')) return 'taxonomy';
  if (pathname.includes('/notifications')) return 'notifications';
  if (pathname.includes('/logs')) return 'logs';
  return 'overview';
}

const adminTabs = [
  { to: '/admin', view: 'overview', label: 'Tổng quan' },
  { to: '/admin/users', view: 'users', label: 'Người dùng' },
  { to: '/admin/stories', view: 'stories', label: 'Truyện' },
  { to: '/admin/chapters', view: 'chapters', label: 'Chương' },
  { to: '/admin/reports', view: 'reports', label: 'Báo cáo' },
  { to: '/admin/comments', view: 'comments', label: 'Bình luận' },
  { to: '/admin/transactions', view: 'transactions', label: 'Giao dịch' },
  { to: '/admin/taxonomy', view: 'taxonomy', label: 'Thể loại/Tag' },
  { to: '/admin/notifications', view: 'notifications', label: 'Thông báo' },
  { to: '/admin/logs', view: 'logs', label: 'Lịch sử MOD' }
];

export function AdminDashboard({ apiClient, user }) {
  const location = useLocation();
  const activeView = getAdminView(location.pathname);
  const [state, setState] = useState(emptyAdminState);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [userDetail, setUserDetail] = useState(null);

  async function loadAll({ silent = false } = {}) {
    if (!apiClient) {
      setError('Không có API client cho Admin CMS.');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    const tasks = await Promise.allSettled([
      loadDashboard(apiClient),
      loadUsers(apiClient),
      loadStories(apiClient),
      loadChapters(apiClient),
      loadReports(apiClient),
      loadTransactions(apiClient),
      loadComments(apiClient),
      loadTaxonomy(apiClient),
      loadNotifications(apiClient),
      loadAdminLogs(apiClient)
    ]);
    const failed = tasks.filter(item => item.status === 'rejected');
    const value = index => tasks[index].status === 'fulfilled' ? tasks[index].value : {};
    setState({
      stats: value(0).stats || value(0) || {},
      users: asArray(value(1).users).map(normalizeUser),
      stories: asArray(value(2).stories).map(normalizeStory),
      chapters: asArray(value(3).chapters).map(normalizeChapter),
      reports: asArray(value(4).reports).map(normalizeReport),
      transactions: asArray(value(5).transactions).map(normalizeTransaction),
      comments: asArray(value(6).comments).map(normalizeComment),
      taxonomy: value(7).taxonomy || { categories: [], tags: [] },
      notifications: asArray(value(8).notifications),
      logs: asArray(value(9).logs)
    });
    setError(failed.length ? `Không tải được ${failed.length} endpoint admin. Dữ liệu lỗi sẽ để trống, bấm Tải lại để thử lại.` : '');
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    loadAll().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function runMutation(task, successMessage) {
    setActionBusy(true);
    try {
      await task();
      await loadAll({ silent: true });
      setError('');
      setToast(successMessage);
    } catch (err) {
      setError(err.message || 'Thao tác admin không thành công.');
    } finally {
      setActionBusy(false);
    }
  }

  const badges = useMemo(() => ({
    stories: state.stories.filter(item => item.approvalStatus === 'pending').length,
    chapters: state.chapters.filter(item => ['pending', 'reviewing'].includes(item.status)).length,
    reports: state.reports.filter(item => ['open', 'reviewing'].includes(item.status)).length,
    comments: state.comments.filter(item => item.status === 'hidden' || item.reports > 0).length,
    logs: state.logs.length
  }), [state]);

  const actions = {
    updateUser: (id, patch) => runMutation(
      () => apiClient(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
      'Đã cập nhật người dùng.'
    ),
    updateUserRole: (id, role) => runMutation(
      () => apiClient(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
      role === 'mod' ? 'Đã set Mod.' : 'Đã gỡ Mod.'
    ),
    adjustBalance: (id, payload) => runMutation(
      () => apiClient(`/admin/users/${id}/adjust-balance`, { method: 'POST', body: JSON.stringify(payload) }),
      'Đã điều chỉnh số dư Đậu.'
    ),
    saveStory: (story, payload) => runMutation(
      () => story?.id
        ? apiClient(`/admin/stories/${story.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : apiClient('/admin/stories', { method: 'POST', body: JSON.stringify(payload) }),
      story?.id ? 'Đã lưu truyện.' : 'Đã tạo truyện.'
    ),
    updateStoryStatus: (story, patch) => runMutation(
      () => apiClient(`/admin/stories/${story.id}/status`, { method: 'PATCH', body: JSON.stringify(patch) }),
      'Đã cập nhật trạng thái truyện.'
    ),
    updateStoryFlags: (story, patch) => runMutation(
      () => apiClient(`/admin/stories/${story.id}/flags`, { method: 'PATCH', body: JSON.stringify(patch) }),
      'Đã cập nhật nhãn truyện.'
    ),
    deleteStory: story => runMutation(
      () => apiClient(`/admin/stories/${story.id}`, { method: 'DELETE' }),
      'Đã xóa truyện.'
    ),
    saveChapter: (chapter, payload) => runMutation(
      () => apiClient(`/admin/chapters/${chapter.id}`, { method: 'PUT', body: JSON.stringify(payload) }),
      'Đã lưu chương.'
    ),
    updateChapterStatus: (chapter, payload) => runMutation(
      () => apiClient(`/admin/chapters/${chapter.id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
      'Đã cập nhật trạng thái chương.'
    ),
    deleteChapter: chapter => runMutation(
      () => apiClient(`/admin/chapters/${chapter.id}`, { method: 'DELETE' }),
      'Đã xóa chương.'
    ),
    resolveReport: (report, payload) => runMutation(
      () => apiClient(`/admin/reports/${report.id}/actions`, { method: 'POST', body: JSON.stringify(payload) }),
      'Đã xử lý báo cáo.'
    ),
    updateComment: (comment, payload) => runMutation(
      () => apiClient(`/admin/comments/${comment.id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
      'Đã cập nhật bình luận.'
    ),
    deleteComment: comment => runMutation(
      () => apiClient(`/admin/comments/${comment.id}`, { method: 'DELETE' }),
      'Đã xóa bình luận.'
    ),
    createTaxonomy: (kind, payload) => runMutation(
      () => apiClient(`/admin/taxonomy/${kind}`, { method: 'POST', body: JSON.stringify(payload) }),
      'Đã tạo taxonomy.'
    ),
    updateTaxonomy: (kind, item, payload) => runMutation(
      () => apiClient(`/admin/taxonomy/${kind}/${item.id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
      'Đã cập nhật taxonomy.'
    ),
    deleteTaxonomy: (kind, item) => runMutation(
      () => apiClient(`/admin/taxonomy/${kind}/${item.id}`, { method: 'DELETE' }),
      'Đã xóa taxonomy.'
    ),
    sendNotification: payload => runMutation(
      () => apiClient('/admin/notifications', { method: 'POST', body: JSON.stringify(payload) }),
      'Đã gửi thông báo hệ thống.'
    )
  };

  if (loading) {
    return <SkeletonPage />;
  }

  return (
    <div className="cms-page">
      {toast && <div className="cms-toast">{toast}</div>}
      {actionBusy && <div className="cms-busy">Đang lưu thay đổi...</div>}

      <section className="cms-hero">
        <div>
          <span>Admin CMS</span>
          <h1>Khu vực điều hành</h1>
          <p>Dữ liệu lấy trực tiếp từ backend, mọi thao tác đều persist qua API và có lịch sử MOD.</p>
        </div>
        <div className="cms-admin-card">
          <img src={user?.avatar || '/images/logo.png'} alt={user?.name || 'Admin'} />
          <div>
            <strong>{user?.name || 'Admin'}</strong>
            <small>{user?.email || 'quantri.daudotruyen@gmail.com'}</small>
          </div>
        </div>
      </section>

      <nav className="cms-tabs" aria-label="Admin CMS">
        {adminTabs.map(tab => (
          <NavLink key={tab.view} end={tab.view === 'overview'} to={tab.to}>
            <span>{tab.label}</span>
            {badges[tab.view] > 0 && <b>{badges[tab.view]}</b>}
          </NavLink>
        ))}
      </nav>

      {error && (
        <div className="cms-alert">
          <span>{error}</span>
          <button type="button" onClick={() => loadAll()}>Tải lại</button>
        </div>
      )}

      {activeView === 'overview' && <OverviewTab state={state} />}
      {activeView === 'users' && (
        <UsersTab users={state.users} currentUser={user} onOpenUser={setUserDetail} onUpdateUser={actions.updateUser} onUpdateRole={actions.updateUserRole} onAdjust={actions.adjustBalance} onConfirm={setConfirm} />
      )}
      {activeView === 'stories' && (
        <StoriesTab stories={state.stories} taxonomy={state.taxonomy} onSave={actions.saveStory} onStatus={actions.updateStoryStatus} onFlags={actions.updateStoryFlags} onDelete={actions.deleteStory} onConfirm={setConfirm} />
      )}
      {activeView === 'chapters' && (
        <ChaptersTab chapters={state.chapters} stories={state.stories} onSave={actions.saveChapter} onStatus={actions.updateChapterStatus} onDelete={actions.deleteChapter} onConfirm={setConfirm} />
      )}
      {activeView === 'reports' && <ReportsTab reports={state.reports} onResolve={actions.resolveReport} />}
      {activeView === 'comments' && <CommentsTab comments={state.comments} stories={state.stories} onUpdate={actions.updateComment} onDelete={actions.deleteComment} onConfirm={setConfirm} />}
      {activeView === 'transactions' && <TransactionsTab transactions={state.transactions} users={state.users} onOpenUser={setUserDetail} />}
      {activeView === 'taxonomy' && <TaxonomyTab taxonomy={state.taxonomy} onCreate={actions.createTaxonomy} onUpdate={actions.updateTaxonomy} onDelete={actions.deleteTaxonomy} onConfirm={setConfirm} />}
      {activeView === 'notifications' && <AdminNotificationsTab notifications={state.notifications} users={state.users} onSend={actions.sendNotification} />}
      {activeView === 'logs' && <LogsTab logs={state.logs} users={state.users} />}

      {userDetail && (
        <UserModal
          user={userDetail}
          currentUser={user}
          onClose={() => setUserDetail(null)}
          onSave={patch => actions.updateUser(userDetail.id, patch)}
          onRole={role => actions.updateUserRole(userDetail.id, role)}
          onAdjust={payload => actions.adjustBalance(userDetail.id, payload)}
        />
      )}
      <ConfirmModal value={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function OverviewTab({ state }) {
  const stats = state.stats || {};
  const pendingStories = state.stories.filter(item => item.approvalStatus === 'pending').slice(0, 5);
  const pendingChapters = state.chapters.filter(item => ['pending', 'reviewing'].includes(item.status)).slice(0, 5);
  const pendingReports = state.reports.filter(item => ['open', 'reviewing'].includes(item.status)).slice(0, 5);
  const cards = [
    ['Người dùng', stats.users ?? state.users.length],
    ['Truyện', stats.stories ?? state.stories.length],
    ['Chương', stats.chapters ?? state.chapters.length],
    ['Doanh thu Đậu', stats.revenueSeeds ?? 0],
    ['Báo cáo chờ', stats.pendingReports ?? pendingReports.length],
    ['Nội dung chờ duyệt', (stats.pendingStories ?? pendingStories.length) + (stats.pendingChapters ?? pendingChapters.length)]
  ];

  return (
    <div className="cms-stack">
      <section className="cms-stats-grid">
        {cards.map(([label, value]) => (
          <article className="cms-stat-card" key={label}>
            <span>{label}</span>
            <strong>{formatNumber(value)}</strong>
          </article>
        ))}
      </section>
      <section className="cms-grid-two">
        <Panel title="Queue cần xử lý" eyebrow="Moderation">
          <div className="cms-queue">
            {pendingReports.map(report => <QueueItem key={report.id} to="/admin/reports" label="Báo cáo" title={report.targetTitle} meta={`${statusLabel(report.status)} · ${formatDate(report.createdAt)}`} />)}
            {pendingStories.map(story => <QueueItem key={story.id} to="/admin/stories" label="Truyện chờ duyệt" title={story.title} meta={story.author} />)}
            {pendingChapters.map(chapter => <QueueItem key={chapter.id} to="/admin/chapters" label="Chương chờ duyệt" title={`${chapter.storyTitle} - Chương ${chapter.number}`} meta={chapter.author} />)}
            {!pendingReports.length && !pendingStories.length && !pendingChapters.length && <EmptyState title="Không có hàng chờ" text="Báo cáo và nội dung mới sẽ xuất hiện tại đây." />}
          </div>
        </Panel>
        <Panel title="Hoạt động MOD mới" eyebrow="Audit">
          <div className="cms-activity-list">
            {asArray(stats.latestActivities).slice(0, 8).map(item => (
              <article key={item.id}>
                <strong>{item.adminName || 'Admin'} · {item.action}</strong>
                <small>{typeLabel(item.entityType)} {item.entityId} · {formatDate(item.createdAt)}</small>
              </article>
            ))}
            {!asArray(stats.latestActivities).length && <EmptyState title="Chưa có log" text="Các thao tác admin quan trọng sẽ được ghi lại." />}
          </div>
        </Panel>
      </section>
      <section className="cms-grid-three">
        <MiniPanel title="Quick actions" items={[
          ['Duyệt truyện chờ', '/admin/stories'],
          ['Duyệt chương mới', '/admin/chapters'],
          ['Xử lý báo cáo', '/admin/reports']
        ]} />
        <MiniPanel title="Top truyện nhiều lượt đọc" items={state.stories.slice().sort((a, b) => Number(b.views || 0) - Number(a.views || 0)).slice(0, 5).map(story => [story.title, `/truyen/${story.slug}`])} />
        <MiniPanel title="Người dùng mới" items={state.users.slice(0, 5).map(item => [`${item.name} · ${roleLabel(item.role)}`, '/admin/users'])} />
      </section>
    </div>
  );
}

function QueueItem({ to, label, title, meta }) {
  return (
    <Link to={to}>
      <b>{label}</b>
      <span>{title}</span>
      <small>{meta}</small>
    </Link>
  );
}

function MiniPanel({ title, items }) {
  return (
    <Panel title={title}>
      <div className="cms-mini-list">
        {items.map(([label, to]) => <Link key={`${label}-${to}`} to={to}>{label}</Link>)}
      </div>
    </Panel>
  );
}

function UsersTab({ users, currentUser, onOpenUser, onUpdateUser, onUpdateRole, onAdjust, onConfirm }) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const filtered = useMemo(() => users.filter(item =>
    includesText([item.name, item.email, item.note], query) &&
    (role === 'all' || item.role === role) &&
    (status === 'all' || item.status === status)
  ), [users, query, role, status]);
  const { page, setPage, totalPages, pageItems } = usePaged(filtered);

  return (
    <div className="cms-stack">
      <PageHead eyebrow="Users" title="Người dùng" text="Khóa/mở khóa, đổi vai trò, ghi chú nội bộ và điều chỉnh số dư Đậu qua API." />
      <FilterBar>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm tên, email, ghi chú..." />
        <select value={role} onChange={event => setRole(event.target.value)}>
          <option value="all">Tất cả vai trò</option>
          <option value="user">Độc giả</option>
          <option value="mod">Mod</option>
          <option value="admin">Admin</option>
        </select>
        <select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="locked">Đã khóa</option>
        </select>
        <button type="button" onClick={() => { setQuery(''); setRole('all'); setStatus('all'); }}>Reset</button>
      </FilterBar>
      <AdminTable columns={['Người dùng', 'Vai trò', 'Trạng thái', 'Số dư', 'Hoạt động cuối', 'Thao tác']} empty={!pageItems.length}>
        {pageItems.map(item => (
          <tr key={item.id}>
            <td data-label="Người dùng"><UserCell user={item} /></td>
            <td data-label="Vai trò">{roleLabel(item.role)}</td>
            <td data-label="Trạng thái"><Badge tone={toneForStatus(item.status)}>{statusLabel(item.status)}</Badge></td>
            <td data-label="Số dư">{formatNumber(item.coins)} Đậu</td>
            <td data-label="Hoạt động cuối">{formatDate(item.lastActiveAt)}</td>
            <td data-label="Thao tác">
              <div className="cms-row-actions">
                <button type="button" onClick={() => onOpenUser(item)}>Chi tiết</button>
                <button
                  type="button"
                  disabled={item.id === currentUser?.id && item.status !== 'locked'}
                  onClick={() => onConfirm({
                    title: item.status === 'locked' ? 'Mở khóa user?' : 'Khóa user?',
                    text: item.status === 'locked' ? item.email : 'User bị khóa sẽ không đăng nhập hoặc gọi protected API được.',
                    action: () => onUpdateUser(item.id, { status: item.status === 'locked' ? 'active' : 'locked' })
                  })}
                >
                  {item.status === 'locked' ? 'Mở khóa' : 'Khóa'}
                </button>
                {item.role === 'user' && <button type="button" onClick={() => onUpdateRole(item.id, 'mod')}>Set Mod</button>}
                {item.role === 'mod' && <button type="button" onClick={() => onUpdateRole(item.id, 'user')}>Gỡ Mod</button>}
                <button type="button" onClick={() => onAdjust(item.id, { amount: 10, reason: 'Admin bonus nhanh' })}>+10 Đậu</button>
              </div>
            </td>
          </tr>
        ))}
      </AdminTable>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}

function UserCell({ user }) {
  return (
    <div className="cms-user-cell">
      <img src={user.avatar || '/images/logo.png'} alt={user.name || user.email} loading="lazy" />
      <span>
        <strong>{user.name || user.email}</strong>
        <small>{user.email}</small>
      </span>
    </div>
  );
}

function UserModal({ user, currentUser, onClose, onSave, onRole, onAdjust }) {
  const [status, setStatus] = useState(user.status);
  const [note, setNote] = useState(user.note || '');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  return (
    <Modal title={user.name || user.email} onClose={onClose}>
      <div className="cms-detail-grid">
        <p><span>Email</span><strong>{user.email}</strong></p>
        <p><span>Ngày tham gia</span><strong>{formatDate(user.joinedAt)}</strong></p>
        <p><span>Số dư</span><strong>{formatNumber(user.coins)} Đậu</strong></p>
        <p><span>Truyện</span><strong>{formatNumber(user.stories)}</strong></p>
        <p><span>Báo cáo liên quan</span><strong>{formatNumber(user.reports)}</strong></p>
        <p><span>Hoạt động cuối</span><strong>{formatDate(user.lastActiveAt)}</strong></p>
      </div>
      <form className="cms-form" onSubmit={event => { event.preventDefault(); onSave({ status, note }); }}>
        <label>Vai trò<input value={roleLabel(user.role)} readOnly /></label>
        <label>Trạng thái<select value={status} disabled={user.id === currentUser?.id} onChange={event => setStatus(event.target.value)}><option value="active">Hoạt động</option><option value="locked">Đã khóa</option></select></label>
        <label className="wide">Ghi chú<textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Ghi chú nội bộ..." /></label>
        <div className="cms-modal-actions">
          {user.role === 'user' && <button type="button" onClick={() => onRole('mod')}>Set Mod</button>}
          {user.role === 'mod' && <button type="button" onClick={() => onRole('user')}>Gỡ Mod</button>}
          <button type="submit">Lưu user</button>
        </div>
      </form>
      <form className="cms-form" onSubmit={event => { event.preventDefault(); onAdjust({ amount: Number(amount), reason }); setAmount(''); setReason(''); }}>
        <label>Số Đậu<input type="number" value={amount} onChange={event => setAmount(event.target.value)} placeholder="VD: 50 hoặc -10" /></label>
        <label>Lý do<input value={reason} onChange={event => setReason(event.target.value)} placeholder="Lý do điều chỉnh" /></label>
        <div className="cms-modal-actions"><button type="submit">Điều chỉnh Đậu</button></div>
      </form>
    </Modal>
  );
}

function StoriesTab({ stories, taxonomy, onSave, onStatus, onFlags, onDelete, onConfirm }) {
  const [query, setQuery] = useState('');
  const [approval, setApproval] = useState('all');
  const [hidden, setHidden] = useState('all');
  const [category, setCategory] = useState('all');
  const [editing, setEditing] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const categories = asArray(taxonomy.categories);
  const filtered = useMemo(() => stories.filter(story =>
    includesText([story.title, story.author, story.description, ...story.categories, ...story.tags], query) &&
    (approval === 'all' || story.approvalStatus === approval) &&
    (hidden === 'all' || String(story.hidden) === hidden) &&
    (category === 'all' || story.categories.includes(category))
  ), [stories, query, approval, hidden, category]);
  const { page, setPage, totalPages, pageItems } = usePaged(filtered);

  return (
    <div className="cms-stack">
      <PageHead eyebrow="Stories" title="Truyện" text="Duyệt, từ chối, ẩn/hiện, gắn featured/hot/recommended/banner và sửa metadata." action={<button type="button" onClick={() => setEditing({})}>Tạo truyện</button>} />
      <FilterBar>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm truyện, tác giả, tag..." />
        <select value={approval} onChange={event => setApproval(event.target.value)}><option value="all">Tất cả duyệt</option><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="rejected">Từ chối</option><option value="draft">Nháp</option></select>
        <select value={hidden} onChange={event => setHidden(event.target.value)}><option value="all">Ẩn/hiện</option><option value="false">Đang hiện</option><option value="true">Đã ẩn</option></select>
        <select value={category} onChange={event => setCategory(event.target.value)}><option value="all">Tất cả thể loại</option>{categories.map(item => <option key={item.id || item.name} value={item.name}>{item.name}</option>)}</select>
        <button type="button" onClick={() => { setQuery(''); setApproval('all'); setHidden('all'); setCategory('all'); }}>Reset</button>
      </FilterBar>
      <AdminTable columns={['Truyện', 'Duyệt', 'Hiển thị', 'Nhãn', 'Chỉ số', 'Thao tác']} empty={!pageItems.length}>
        {pageItems.map(story => (
          <tr key={story.id}>
            <td data-label="Truyện"><StoryCell story={story} /></td>
            <td data-label="Duyệt"><Badge tone={toneForStatus(story.approvalStatus)}>{statusLabel(story.approvalStatus)}</Badge></td>
            <td data-label="Hiển thị"><Badge tone={story.hidden ? 'dark' : 'success'}>{story.hidden ? 'Đã ẩn' : 'Public'}</Badge></td>
            <td data-label="Nhãn"><FlagBadges item={story} /></td>
            <td data-label="Chỉ số">{formatNumber(story.views)} đọc · {formatNumber(story.chapterCount)} chương</td>
            <td data-label="Thao tác">
              <div className="cms-row-actions">
                <button type="button" onClick={() => onStatus(story, { approvalStatus: 'approved', hidden: false })}>Duyệt</button>
                <button type="button" onClick={() => setRejecting(story)}>Từ chối</button>
                <button type="button" onClick={() => onConfirm({ title: story.hidden ? 'Hiện truyện?' : 'Ẩn truyện?', text: story.title, action: () => onStatus(story, { hidden: !story.hidden }) })}>{story.hidden ? 'Hiện' : 'Ẩn'}</button>
                <button type="button" onClick={() => onFlags(story, { featured: !story.featured })}>{story.featured ? 'Bỏ featured' : 'Featured'}</button>
                <button type="button" onClick={() => onFlags(story, { hot: !story.hot })}>{story.hot ? 'Bỏ hot' : 'Hot'}</button>
                <button type="button" onClick={() => onFlags(story, { recommended: !story.recommended })}>Đề cử</button>
                <button type="button" onClick={() => onFlags(story, { banner: !story.banner })}>Banner</button>
                <button type="button" onClick={() => setEditing(story)}>Sửa</button>
                {story.slug && <Link className="cms-link-button" to={`/truyen/${story.slug}`}>Preview</Link>}
                <button type="button" className="danger" onClick={() => onConfirm({ title: 'Xóa truyện?', text: 'Toàn bộ chương, bình luận, lịch sử liên quan sẽ bị xóa.', action: () => onDelete(story) })}>Xóa</button>
              </div>
            </td>
          </tr>
        ))}
      </AdminTable>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      {editing && <StoryFormModal story={editing.id ? editing : null} taxonomy={taxonomy} onClose={() => setEditing(null)} onSave={payload => { onSave(editing.id ? editing : null, payload); setEditing(null); }} />}
      {rejecting && <ReasonModal title="Từ chối truyện" target={rejecting.title} onClose={() => setRejecting(null)} onSubmit={reason => { onStatus(rejecting, { approvalStatus: 'rejected', rejectionReason: reason }); setRejecting(null); }} />}
    </div>
  );
}

function StoryCell({ story }) {
  return (
    <div className="cms-story-cell">
      <img src={story.cover || '/images/cover-1.jpg'} alt={story.title} loading="lazy" />
      <span>
        <strong>{story.title}</strong>
        <small>{story.author} · {story.categories.slice(0, 2).join(', ')}</small>
      </span>
    </div>
  );
}

function FlagBadges({ item }) {
  const flags = [
    ['featured', 'Featured'],
    ['hot', 'Hot'],
    ['recommended', 'Đề cử'],
    ['banner', 'Banner']
  ].filter(([key]) => item[key]);
  if (!flags.length) return <span className="cms-muted">Không</span>;
  return <div className="cms-chip-row">{flags.map(([key, label]) => <Badge key={key} tone={key === 'hot' ? 'danger' : 'info'}>{label}</Badge>)}</div>;
}

function StoryFormModal({ story, taxonomy, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    title: story?.title || '',
    author: story?.author || '',
    translator: story?.translator || '',
    cover: story?.cover || '/images/cover-1.jpg',
    description: story?.description || '',
    status: story?.status || 'ongoing',
    approvalStatus: story?.approvalStatus || 'pending',
    hidden: Boolean(story?.hidden),
    categories: asArray(story?.categories).join(', '),
    tags: asArray(story?.tags).join(', '),
    premium: Boolean(story?.premium),
    price: story?.price || 0,
    featured: Boolean(story?.featured),
    hot: Boolean(story?.hot),
    recommended: Boolean(story?.recommended),
    banner: Boolean(story?.banner)
  }));
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const suggestions = asArray(taxonomy.categories).map(item => item.name).join(', ');
  return (
    <Modal title={story ? 'Sửa truyện' : 'Tạo truyện'} onClose={onClose}>
      <form className="cms-form" onSubmit={event => {
        event.preventDefault();
        onSave({
          ...form,
          price: Number(form.price || 0),
          categories: form.categories.split(',').map(item => item.trim()).filter(Boolean),
          tags: form.tags.split(',').map(item => item.trim()).filter(Boolean)
        });
      }}>
        <label>Tiêu đề<input value={form.title} onChange={event => set('title', event.target.value)} required /></label>
        <label>Tác giả<input value={form.author} onChange={event => set('author', event.target.value)} required /></label>
        <label>Dịch giả<input value={form.translator} onChange={event => set('translator', event.target.value)} /></label>
        <label>Cover<input value={form.cover} onChange={event => set('cover', event.target.value)} /></label>
        <label>Trạng thái<select value={form.status} onChange={event => set('status', event.target.value)}><option value="ongoing">Đang ra</option><option value="completed">Hoàn thành</option><option value="paused">Tạm dừng</option></select></label>
        <label>Duyệt<select value={form.approvalStatus} onChange={event => set('approvalStatus', event.target.value)}><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="rejected">Từ chối</option><option value="draft">Nháp</option></select></label>
        <label>Giá Đậu<input type="number" value={form.price} onChange={event => set('price', event.target.value)} /></label>
        <label className="wide">Mô tả<textarea value={form.description} onChange={event => set('description', event.target.value)} required /></label>
        <label className="wide">Thể loại<input value={form.categories} onChange={event => set('categories', event.target.value)} placeholder={suggestions} /></label>
        <label className="wide">Tag<input value={form.tags} onChange={event => set('tags', event.target.value)} /></label>
        <label className="cms-checkbox"><input type="checkbox" checked={form.hidden} onChange={event => set('hidden', event.target.checked)} /> Ẩn truyện</label>
        <label className="cms-checkbox"><input type="checkbox" checked={form.premium} onChange={event => set('premium', event.target.checked)} /> Truyện VIP</label>
        <label className="cms-checkbox"><input type="checkbox" checked={form.featured} onChange={event => set('featured', event.target.checked)} /> Featured</label>
        <label className="cms-checkbox"><input type="checkbox" checked={form.hot} onChange={event => set('hot', event.target.checked)} /> Hot</label>
        <label className="cms-checkbox"><input type="checkbox" checked={form.recommended} onChange={event => set('recommended', event.target.checked)} /> Đề cử</label>
        <label className="cms-checkbox"><input type="checkbox" checked={form.banner} onChange={event => set('banner', event.target.checked)} /> Banner</label>
        <div className="cms-modal-actions"><button type="button" onClick={onClose}>Hủy</button><button type="submit">Lưu</button></div>
      </form>
    </Modal>
  );
}

function ChaptersTab({ chapters, stories, onSave, onStatus, onDelete, onConfirm }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [storyId, setStoryId] = useState('all');
  const [vip, setVip] = useState('all');
  const [preview, setPreview] = useState(null);
  const [editing, setEditing] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [scheduling, setScheduling] = useState(null);
  const filtered = useMemo(() => chapters.filter(chapter =>
    includesText([chapter.title, chapter.storyTitle, chapter.author, chapter.content], query) &&
    (status === 'all' || chapter.status === status) &&
    (storyId === 'all' || chapter.storyId === storyId) &&
    (vip === 'all' || String(chapter.vip) === vip)
  ), [chapters, query, status, storyId, vip]);
  const { page, setPage, totalPages, pageItems } = usePaged(filtered);

  return (
    <div className="cms-stack">
      <PageHead eyebrow="Chapters" title="Chương" text="Duyệt, từ chối, ẩn, lên lịch và sửa metadata chương trên backend." />
      <FilterBar>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm chương, truyện, tác giả..." />
        <select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tất cả trạng thái</option>{['draft','pending','reviewing','approved','published','rejected','hidden','scheduled'].map(item => <option key={item} value={item}>{statusLabel(item)}</option>)}</select>
        <select value={storyId} onChange={event => setStoryId(event.target.value)}><option value="all">Tất cả truyện</option>{stories.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        <select value={vip} onChange={event => setVip(event.target.value)}><option value="all">VIP/free</option><option value="true">VIP</option><option value="false">Miễn phí</option></select>
        <button type="button" onClick={() => { setQuery(''); setStatus('all'); setStoryId('all'); setVip('all'); }}>Reset</button>
      </FilterBar>
      <AdminTable columns={['Chương', 'Tác giả', 'Trạng thái', 'Loại', 'Thống kê', 'Thao tác']} empty={!pageItems.length}>
        {pageItems.map(chapter => (
          <tr key={chapter.id}>
            <td data-label="Chương"><strong>{chapter.storyTitle}</strong><small>Chương {chapter.number}: {chapter.title}</small></td>
            <td data-label="Tác giả">{chapter.author}</td>
            <td data-label="Trạng thái"><Badge tone={toneForStatus(chapter.status)}>{statusLabel(chapter.status)}</Badge></td>
            <td data-label="Loại">{chapter.vip ? `${chapter.price} Đậu` : 'Miễn phí'}</td>
            <td data-label="Thống kê">{formatNumber(chapter.wordCount)} từ · {formatNumber(chapter.reads)} đọc · {formatNumber(chapter.comments)} bình luận</td>
            <td data-label="Thao tác">
              <div className="cms-row-actions">
                <button type="button" onClick={() => setPreview(chapter)}>Preview</button>
                <button type="button" onClick={() => setEditing(chapter)}>Sửa</button>
                <button type="button" onClick={() => onStatus(chapter, { status: 'reviewing' })}>Reviewing</button>
                <button type="button" onClick={() => onStatus(chapter, { status: 'approved' })}>Duyệt</button>
                <button type="button" onClick={() => setRejecting(chapter)}>Từ chối</button>
                <button type="button" onClick={() => onConfirm({ title: chapter.status === 'hidden' ? 'Hiện chương?' : 'Ẩn chương?', text: chapter.title, action: () => onStatus(chapter, { status: chapter.status === 'hidden' ? 'approved' : 'hidden' }) })}>{chapter.status === 'hidden' ? 'Hiện' : 'Ẩn'}</button>
                <button type="button" onClick={() => setScheduling(chapter)}>Lên lịch</button>
                <button type="button" className="danger" onClick={() => onConfirm({ title: 'Xóa chương?', text: `${chapter.storyTitle} - Chương ${chapter.number}`, action: () => onDelete(chapter) })}>Xóa</button>
              </div>
            </td>
          </tr>
        ))}
      </AdminTable>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      {preview && <Modal title={`${preview.storyTitle} - Chương ${preview.number}`} onClose={() => setPreview(null)}><pre className="cms-preview-text">{preview.content || preview.preview || 'Chưa có nội dung.'}</pre></Modal>}
      {editing && <ChapterFormModal chapter={editing} onClose={() => setEditing(null)} onSave={payload => { onSave(editing, payload); setEditing(null); }} />}
      {rejecting && <ReasonModal title="Từ chối chương" target={`${rejecting.storyTitle} - Chương ${rejecting.number}`} onClose={() => setRejecting(null)} onSubmit={reason => { onStatus(rejecting, { status: 'rejected', rejectionReason: reason }); setRejecting(null); }} />}
      {scheduling && <ScheduleModal chapter={scheduling} onClose={() => setScheduling(null)} onSubmit={scheduledAt => { onStatus(scheduling, { status: 'scheduled', scheduledAt }); setScheduling(null); }} />}
    </div>
  );
}

function ChapterFormModal({ chapter, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    title: chapter.title || '',
    number: chapter.number || 1,
    price: chapter.price || 0,
    isPremium: Boolean(chapter.vip),
    status: chapter.status || 'approved',
    content: chapter.content || '',
    preview: chapter.preview || ''
  }));
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  return (
    <Modal title="Sửa chương" onClose={onClose}>
      <form className="cms-form" onSubmit={event => { event.preventDefault(); onSave({ ...form, number: Number(form.number), price: Number(form.price) }); }}>
        <label>Tiêu đề<input value={form.title} onChange={event => set('title', event.target.value)} /></label>
        <label>Số chương<input type="number" value={form.number} onChange={event => set('number', event.target.value)} /></label>
        <label>Giá Đậu<input type="number" value={form.price} onChange={event => set('price', event.target.value)} /></label>
        <label>Trạng thái<select value={form.status} onChange={event => set('status', event.target.value)}>{['draft','pending','reviewing','approved','rejected','hidden','scheduled'].map(item => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>
        <label className="cms-checkbox"><input type="checkbox" checked={form.isPremium} onChange={event => set('isPremium', event.target.checked)} /> Chương VIP</label>
        <label className="wide">Preview<textarea value={form.preview} onChange={event => set('preview', event.target.value)} /></label>
        <label className="wide">Nội dung<textarea value={form.content} onChange={event => set('content', event.target.value)} /></label>
        <div className="cms-modal-actions"><button type="button" onClick={onClose}>Hủy</button><button type="submit">Lưu chương</button></div>
      </form>
    </Modal>
  );
}

function ReportsTab({ reports, onResolve }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [selected, setSelected] = useState(null);
  const filtered = useMemo(() => reports.filter(report =>
    includesText([report.targetTitle, report.storyTitle, report.userName, report.reason, report.detail], query) &&
    (status === 'all' || report.status === status) &&
    (type === 'all' || report.type === type)
  ), [reports, query, status, type]);
  const { page, setPage, totalPages, pageItems } = usePaged(filtered);
  return (
    <div className="cms-stack">
      <PageHead eyebrow="Reports" title="Báo cáo" text="Xem chi tiết report và xử lý bằng action API: resolve/reject, ẩn nội dung, khóa user bị report." />
      <FilterBar>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm báo cáo..." />
        <select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tất cả trạng thái</option><option value="open">Chờ xử lý</option><option value="reviewing">Đang xử lý</option><option value="resolved">Đã xử lý</option><option value="rejected">Từ chối</option></select>
        <select value={type} onChange={event => setType(event.target.value)}><option value="all">Tất cả loại</option><option value="story">Truyện</option><option value="chapter">Chương</option><option value="comment">Bình luận</option></select>
        <button type="button" onClick={() => { setQuery(''); setStatus('all'); setType('all'); }}>Reset</button>
      </FilterBar>
      <AdminTable columns={['Báo cáo', 'Loại', 'Lý do', 'Trạng thái', 'Thời gian', 'Thao tác']} empty={!pageItems.length}>
        {pageItems.map(report => (
          <tr key={report.id}>
            <td data-label="Báo cáo"><strong>{report.targetTitle}</strong><small>{report.storyTitle} · bởi {report.userName || 'ẩn danh'}</small></td>
            <td data-label="Loại">{typeLabel(report.type)}</td>
            <td data-label="Lý do">{report.reason || report.detail}</td>
            <td data-label="Trạng thái"><Badge tone={toneForStatus(report.status)}>{statusLabel(report.status)}</Badge></td>
            <td data-label="Thời gian">{formatDate(report.createdAt)}</td>
            <td data-label="Thao tác"><button type="button" onClick={() => setSelected(report)}>Xử lý</button></td>
          </tr>
        ))}
      </AdminTable>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      {selected && <ReportActionModal report={selected} onClose={() => setSelected(null)} onSubmit={payload => { onResolve(selected, payload); setSelected(null); }} />}
    </div>
  );
}

function ReportActionModal({ report, onClose, onSubmit }) {
  const [status, setStatus] = useState(report.status === 'open' ? 'reviewing' : report.status);
  const [adminNote, setAdminNote] = useState(report.adminNote || '');
  const [hideContent, setHideContent] = useState(false);
  const [lockUser, setLockUser] = useState(false);
  return (
    <Modal title="Xử lý báo cáo" onClose={onClose}>
      <div className="cms-report-detail">
        <p><span>Reporter</span><strong>{report.reporter?.email || report.user?.email || report.userName || 'Không rõ'}</strong></p>
        <p><span>Target</span><strong>{typeLabel(report.type)} · {report.targetTitle}</strong></p>
        <p><span>Lý do</span><strong>{report.reason || report.detail}</strong></p>
        {report.comment?.body && <p className="wide"><span>Bình luận liên quan</span><strong>{report.comment.body}</strong></p>}
      </div>
      <form className="cms-form" onSubmit={event => { event.preventDefault(); onSubmit({ status, adminNote, hideContent, lockUser, targetType: report.type, targetId: report.targetId }); }}>
        <label>Trạng thái<select value={status} onChange={event => setStatus(event.target.value)}><option value="reviewing">Đang xử lý</option><option value="resolved">Đã xử lý</option><option value="rejected">Từ chối report</option></select></label>
        <label className="wide">Ghi chú MOD<textarea value={adminNote} onChange={event => setAdminNote(event.target.value)} placeholder="Kết luận xử lý..." /></label>
        <label className="cms-checkbox"><input type="checkbox" checked={hideContent} onChange={event => setHideContent(event.target.checked)} /> Ẩn nội dung bị report</label>
        <label className="cms-checkbox"><input type="checkbox" checked={lockUser} onChange={event => setLockUser(event.target.checked)} /> Khóa user bị report</label>
        <div className="cms-modal-actions"><button type="button" onClick={onClose}>Hủy</button><button type="submit">Lưu xử lý</button></div>
      </form>
    </Modal>
  );
}

function CommentsTab({ comments, stories, onUpdate, onDelete, onConfirm }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [storyId, setStoryId] = useState('all');
  const filtered = useMemo(() => comments.filter(comment =>
    includesText([comment.body, comment.userName, comment.userEmail, comment.storyTitle], query) &&
    (status === 'all' || comment.status === status) &&
    (storyId === 'all' || comment.storyId === storyId)
  ), [comments, query, status, storyId]);
  const { page, setPage, totalPages, pageItems } = usePaged(filtered);
  return (
    <div className="cms-stack">
      <PageHead eyebrow="Comments" title="Bình luận" text="Ẩn/xóa/khôi phục bình luận bằng API thật, không dùng dữ liệu giả." />
      <FilterBar>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm bình luận..." />
        <select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tất cả trạng thái</option><option value="visible">Đang hiện</option><option value="hidden">Đã ẩn</option><option value="deleted">Đã xóa</option></select>
        <select value={storyId} onChange={event => setStoryId(event.target.value)}><option value="all">Tất cả truyện</option>{stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}</select>
        <button type="button" onClick={() => { setQuery(''); setStatus('all'); setStoryId('all'); }}>Reset</button>
      </FilterBar>
      <div className="cms-comment-list">
        {pageItems.map(comment => (
          <article key={comment.id}>
            <div>
              <strong>{comment.userName || comment.userEmail || 'Người dùng'}</strong>
              <small>{comment.storyTitle} · {formatDate(comment.createdAt)} · {comment.reports} report</small>
              <p>{comment.body}</p>
            </div>
            <div className="cms-row-actions">
              <Badge tone={toneForStatus(comment.status)}>{statusLabel(comment.status)}</Badge>
              <button type="button" onClick={() => onUpdate(comment, { status: comment.status === 'hidden' ? 'visible' : 'hidden' })}>{comment.status === 'hidden' ? 'Khôi phục' : 'Ẩn'}</button>
              <button type="button" className="danger" onClick={() => onConfirm({ title: 'Xóa bình luận?', text: comment.body, action: () => onDelete(comment) })}>Xóa</button>
            </div>
          </article>
        ))}
        {!pageItems.length && <EmptyState title="Không có bình luận" text="Bình luận phù hợp bộ lọc sẽ hiển thị tại đây." />}
      </div>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}

function TransactionsTab({ transactions, users, onOpenUser }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [method, setMethod] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filtered = useMemo(() => transactions.filter(item => {
    const created = item.createdAt ? new Date(item.createdAt) : null;
    return includesText([item.id, item.userName, item.userEmail, item.note, item.method], query) &&
      (type === 'all' || item.type === type) &&
      (status === 'all' || item.status === status) &&
      (method === 'all' || item.method === method) &&
      (!from || (created && created >= new Date(`${from}T00:00:00`))) &&
      (!to || (created && created <= new Date(`${to}T23:59:59`)));
  }), [transactions, query, type, status, method, from, to]);
  const { page, setPage, totalPages, pageItems } = usePaged(filtered);
  const methods = Array.from(new Set(transactions.map(item => item.method).filter(Boolean)));

  function exportCsv() {
    const headers = ['id', 'user', 'email', 'type', 'status', 'method', 'amountDau', 'amountVnd', 'createdAt', 'note'];
    const rows = filtered.map(item => [item.id, item.userName, item.userEmail, item.type, item.status, item.method, item.amount, item.amountVnd, item.createdAt, item.note || '']);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `admin-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="cms-stack">
      <PageHead eyebrow="Transactions" title="Giao dịch" text="Theo dõi topup, purchase, bonus, admin_adjustment, refund bằng đơn vị Đậu." action={<button type="button" onClick={exportCsv}>Export CSV</button>} />
      <FilterBar>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm mã, user, phương thức..." />
        <select value={type} onChange={event => setType(event.target.value)}><option value="all">Tất cả type</option>{['topup','purchase','bonus','admin_adjustment','refund','promotion'].map(item => <option key={item} value={item}>{typeLabel(item)}</option>)}</select>
        <select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Tất cả trạng thái</option><option value="success">Thành công</option><option value="pending">Đang chờ</option><option value="failed">Thất bại</option></select>
        <select value={method} onChange={event => setMethod(event.target.value)}><option value="all">Tất cả method</option>{methods.map(item => <option key={item} value={item}>{item}</option>)}</select>
        <input type="date" value={from} onChange={event => setFrom(event.target.value)} />
        <input type="date" value={to} onChange={event => setTo(event.target.value)} />
      </FilterBar>
      <AdminTable columns={['Mã', 'User', 'Type', 'Đậu', 'VND', 'Method', 'Trạng thái', 'Thời gian']} empty={!pageItems.length}>
        {pageItems.map(item => {
          const user = users.find(row => row.id === item.userId);
          return (
            <tr key={item.id}>
              <td data-label="Mã"><strong>{item.id}</strong></td>
              <td data-label="User"><button type="button" className="cms-inline-link" onClick={() => user && onOpenUser(user)}>{item.userName}</button><small>{item.userEmail}</small></td>
              <td data-label="Type">{typeLabel(item.type)}</td>
              <td data-label="Đậu">{formatNumber(item.amount)} Đậu</td>
              <td data-label="VND">{item.amountVnd ? formatVnd(item.amountVnd) : '-'}</td>
              <td data-label="Method">{item.method}</td>
              <td data-label="Trạng thái"><Badge tone={toneForStatus(item.status)}>{statusLabel(item.status)}</Badge></td>
              <td data-label="Thời gian">{formatDate(item.createdAt)}</td>
            </tr>
          );
        })}
      </AdminTable>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}

function TaxonomyTab({ taxonomy, onCreate, onUpdate, onDelete, onConfirm }) {
  return (
    <div className="cms-stack">
      <PageHead eyebrow="Taxonomy" title="Thể loại/Tag" text="CRUD taxonomy thật. Backend chặn xóa taxonomy đang được sử dụng." />
      <section className="cms-grid-two">
        <TaxonomyBox title="Thể loại" kind="categories" items={asArray(taxonomy.categories)} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} onConfirm={onConfirm} />
        <TaxonomyBox title="Tag" kind="tags" items={asArray(taxonomy.tags)} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} onConfirm={onConfirm} />
      </section>
    </div>
  );
}

function TaxonomyBox({ title, kind, items, onCreate, onUpdate, onDelete, onConfirm }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  return (
    <Panel title={title} eyebrow={kind}>
      <form className="cms-inline-form" onSubmit={event => { event.preventDefault(); onCreate(kind, { name }); setName(''); }}>
        <input value={name} onChange={event => setName(event.target.value)} placeholder={`Thêm ${title.toLowerCase()}...`} />
        <button type="submit">Thêm</button>
      </form>
      <div className="cms-taxonomy-list">
        {items.map(item => (
          <article key={item.id || item.name}>
            <div><strong>{item.name}</strong><small>{formatNumber(item.usage || 0)} truyện đang dùng</small></div>
            <div className="cms-row-actions">
              <button type="button" onClick={() => setEditing(item)}>Sửa</button>
              <button type="button" className="danger" onClick={() => onConfirm({ title: `Xóa ${item.name}?`, text: item.usage ? 'Backend sẽ chặn nếu taxonomy đang được dùng.' : 'Taxonomy sẽ bị xóa.', action: () => onDelete(kind, item) })}>Xóa</button>
            </div>
          </article>
        ))}
        {!items.length && <EmptyState title="Chưa có dữ liệu" text="Tạo taxonomy để dùng trong form truyện." />}
      </div>
      {editing && <TaxonomyEditModal item={editing} onClose={() => setEditing(null)} onSave={payload => { onUpdate(kind, editing, payload); setEditing(null); }} />}
    </Panel>
  );
}

function TaxonomyEditModal({ item, onClose, onSave }) {
  const [name, setName] = useState(item.name || '');
  const [description, setDescription] = useState(item.description || '');
  return (
    <Modal title="Sửa taxonomy" onClose={onClose}>
      <form className="cms-form" onSubmit={event => { event.preventDefault(); onSave({ name, description }); }}>
        <label>Tên<input value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="wide">Mô tả<textarea value={description} onChange={event => setDescription(event.target.value)} /></label>
        <div className="cms-modal-actions"><button type="button" onClick={onClose}>Hủy</button><button type="submit">Lưu</button></div>
      </form>
    </Modal>
  );
}

function AdminNotificationsTab({ notifications, users, onSend }) {
  const [form, setForm] = useState({ title: '', body: '', type: 'system', targetRole: 'all', targetUserId: '' });
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const { page, setPage, totalPages, pageItems } = usePaged(notifications);
  return (
    <div className="cms-stack">
      <PageHead eyebrow="System notifications" title="Thông báo" text="Gửi thông báo hệ thống tới toàn bộ user, theo role hoặc user cụ thể." />
      <Panel title="Tạo thông báo">
        <form className="cms-form" onSubmit={event => { event.preventDefault(); onSend(form); setForm({ title: '', body: '', type: 'system', targetRole: 'all', targetUserId: '' }); }}>
          <label>Tiêu đề<input value={form.title} onChange={event => set('title', event.target.value)} required /></label>
          <label>Type<select value={form.type} onChange={event => set('type', event.target.value)}><option value="system">System</option><option value="promo">Promo</option><option value="wallet">Wallet</option></select></label>
          <label>Target<select value={form.targetRole} onChange={event => set('targetRole', event.target.value)}><option value="all">Tất cả</option><option value="user">Độc giả</option><option value="mod">Mod</option><option value="admin">Admin</option><option value="specific">User cụ thể</option></select></label>
          {form.targetRole === 'specific' && <label>User<select value={form.targetUserId} onChange={event => set('targetUserId', event.target.value)}><option value="">Chọn user</option>{users.map(item => <option key={item.id} value={item.id}>{item.name} · {item.email}</option>)}</select></label>}
          <label className="wide">Nội dung<textarea value={form.body} onChange={event => set('body', event.target.value)} required /></label>
          <div className="cms-modal-actions"><button type="submit">Gửi thông báo</button></div>
        </form>
      </Panel>
      <AdminTable columns={['Tiêu đề', 'Target', 'Người nhận', 'Trạng thái', 'Thời gian']} empty={!pageItems.length}>
        {pageItems.map(item => (
          <tr key={item.id}>
            <td data-label="Tiêu đề"><strong>{item.title}</strong><small>{item.body}</small></td>
            <td data-label="Target">{item.targetUserId || item.targetRole || 'all'}</td>
            <td data-label="Người nhận">{formatNumber(item.recipientCount || 0)}</td>
            <td data-label="Trạng thái"><Badge tone={toneForStatus(item.status)}>{statusLabel(item.status)}</Badge></td>
            <td data-label="Thời gian">{formatDate(item.createdAt)}</td>
          </tr>
        ))}
      </AdminTable>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}

function LogsTab({ logs, users }) {
  const [entityType, setEntityType] = useState('all');
  const [adminId, setAdminId] = useState('all');
  const [action, setAction] = useState('');
  const filtered = useMemo(() => logs.filter(log =>
    (entityType === 'all' || log.entityType === entityType) &&
    (adminId === 'all' || log.adminId === adminId) &&
    includesText([log.action], action)
  ), [logs, entityType, adminId, action]);
  const { page, setPage, totalPages, pageItems } = usePaged(filtered);
  const entityTypes = Array.from(new Set(logs.map(item => item.entityType).filter(Boolean)));
  const admins = users.filter(item => item.role === 'admin');
  return (
    <div className="cms-stack">
      <PageHead eyebrow="Audit log" title="Lịch sử MOD" text="Ghi lại các thao tác quan trọng: khóa user, duyệt/từ chối, ẩn nội dung, taxonomy, thông báo." />
      <FilterBar>
        <input value={action} onChange={event => setAction(event.target.value)} placeholder="Tìm action..." />
        <select value={entityType} onChange={event => setEntityType(event.target.value)}><option value="all">Tất cả entity</option>{entityTypes.map(item => <option key={item} value={item}>{typeLabel(item)}</option>)}</select>
        <select value={adminId} onChange={event => setAdminId(event.target.value)}><option value="all">Tất cả admin</option>{admins.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <button type="button" onClick={() => { setEntityType('all'); setAdminId('all'); setAction(''); }}>Reset</button>
      </FilterBar>
      <AdminTable columns={['Action', 'Entity', 'Admin', 'Ghi chú', 'Thời gian']} empty={!pageItems.length}>
        {pageItems.map(log => (
          <tr key={log.id}>
            <td data-label="Action"><strong>{log.action}</strong></td>
            <td data-label="Entity">{typeLabel(log.entityType)} · {log.entityId}</td>
            <td data-label="Admin">{log.adminName || log.adminId}</td>
            <td data-label="Ghi chú">{log.note || '-'}</td>
            <td data-label="Thời gian">{formatDate(log.createdAt)}</td>
          </tr>
        ))}
      </AdminTable>
      <Pagination page={page} totalPages={totalPages} onPage={setPage} />
    </div>
  );
}

function ReasonModal({ title, target, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <form className="cms-form" onSubmit={event => { event.preventDefault(); onSubmit(reason || 'Cần chỉnh sửa trước khi duyệt.'); }}>
        <p>{target}</p>
        <label className="wide">Lý do<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Nhập lý do để lưu vào backend..." /></label>
        <div className="cms-modal-actions"><button type="button" onClick={onClose}>Hủy</button><button type="submit">Lưu lý do</button></div>
      </form>
    </Modal>
  );
}

function ScheduleModal({ chapter, onClose, onSubmit }) {
  const [scheduledAt, setScheduledAt] = useState('');
  return (
    <Modal title="Lên lịch chương" onClose={onClose}>
      <form className="cms-form" onSubmit={event => { event.preventDefault(); onSubmit(new Date(scheduledAt).toISOString()); }}>
        <p>{chapter.storyTitle} - Chương {chapter.number}</p>
        <label>Thời gian xuất bản<input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} required /></label>
        <div className="cms-modal-actions"><button type="button" onClick={onClose}>Hủy</button><button type="submit">Lên lịch</button></div>
      </form>
    </Modal>
  );
}

function AdminTable({ columns, children, empty }) {
  return (
    <div className="cms-table-wrap">
      <table className="cms-table">
        <thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <EmptyState title="Không có dữ liệu" text="Thử đổi bộ lọc hoặc bấm tải lại." />}
    </div>
  );
}

function PageHead({ eyebrow, title, text, action }) {
  return (
    <section className="cms-page-head">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action && <div className="cms-page-action">{action}</div>}
    </section>
  );
}

function Panel({ eyebrow, title, children }) {
  return (
    <section className="cms-panel">
      <div className="cms-panel-head">
        <div>
          {eyebrow && <span>{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function FilterBar({ children }) {
  return <div className="cms-filter-bar">{children}</div>;
}

function Badge({ tone = 'neutral', children }) {
  return <span className={`cms-badge tone-${tone}`}>{children}</span>;
}

function EmptyState({ title, text }) {
  return (
    <div className="cms-empty">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <div className="cms-pagination">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Trước</button>
      <span>Trang {page}/{totalPages}</span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Sau</button>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="cms-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="cms-modal" role="dialog" aria-modal="true">
        <button type="button" className="cms-close" onClick={onClose}>Đóng</button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function ConfirmModal({ value, onClose }) {
  if (!value) return null;
  return (
    <Modal title={value.title || 'Xác nhận'} onClose={onClose}>
      <p>{value.text}</p>
      <div className="cms-modal-actions">
        <button type="button" onClick={onClose}>Hủy</button>
        <button type="button" className="danger" onClick={() => { value.action(); onClose(); }}>Xác nhận</button>
      </div>
    </Modal>
  );
}

function SkeletonPage() {
  return (
    <div className="cms-page">
      <div className="cms-state cms-loading">Đang tải dữ liệu quản trị...</div>
      <section className="cms-stats-grid">
        {Array.from({ length: 6 }).map((_, index) => <article className="cms-stat-card skeleton" key={index} />)}
      </section>
    </div>
  );
}

export function NotificationPage({ apiClient, user }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState('all');
  const [unreadCount, setUnreadCount] = useState(0);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = { limit: 50 };
      if (unreadOnly) params.unreadOnly = 'true';
      if (type !== 'all') params.type = type;
      const data = await apiClient(`/notifications${queryString(params)}`);
      setItems(asArray(data.notifications));
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (err) {
      setItems([]);
      setError(err.message || 'Không tải được thông báo.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [apiClient, unreadOnly, type]);

  async function markRead(item) {
    if (item.read) return;
    try {
      const data = await apiClient(`/notifications/${item.id}/read`, { method: 'POST' });
      setItems(current => current.map(row => row.id === item.id ? data.notification : row));
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (err) {
      setError(err.message || 'Không cập nhật được thông báo.');
    }
  }

  async function markAllRead() {
    try {
      const data = await apiClient('/notifications/read-all', { method: 'POST' });
      setItems(current => current.map(item => ({ ...item, read: true })));
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (err) {
      setError(err.message || 'Không đánh dấu được thông báo.');
    }
  }

  async function deleteItem(item) {
    try {
      const data = await apiClient(`/notifications/${item.id}`, { method: 'DELETE' });
      setItems(current => current.filter(row => row.id !== item.id));
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (err) {
      setError(err.message || 'Không xóa được thông báo.');
    }
  }

  async function openItem(item) {
    await markRead(item);
    if (item.link) navigate(item.link);
  }

  return (
    <div className="cms-page">
      <section className="cms-page-head cms-notification-head">
        <div>
          <span>Thông báo cá nhân</span>
          <h1>Trung tâm thông báo</h1>
          <p>Thông báo riêng của {user?.name || 'tài khoản hiện tại'}.</p>
        </div>
        <button type="button" onClick={markAllRead} disabled={!unreadCount}>Đánh dấu đã đọc</button>
      </section>
      {error && <div className="cms-alert"><span>{error}</span><button type="button" onClick={load}>Tải lại</button></div>}
      <div className="cms-notification-filters">
        {['all','chapter','comment','reply','follow','wallet','purchase','system','promo'].map(item => (
          <button key={item} type="button" className={type === item ? 'active' : ''} onClick={() => setType(item)}>{item === 'all' ? 'Tất cả' : typeLabel(item)}</button>
        ))}
        <button type="button" className={unreadOnly ? 'active' : ''} onClick={() => setUnreadOnly(value => !value)}>Chưa đọc ({unreadCount})</button>
      </div>
      {loading && <div className="cms-state cms-loading">Đang tải thông báo...</div>}
      {!loading && (
        <section className="cms-notification-list">
          {items.map(item => (
            <article key={item.id} className={item.read ? 'read' : 'unread'}>
              <span className="cms-notification-dot" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <small>{item.read ? 'Đã đọc' : 'Chưa đọc'} · {formatDate(item.createdAt)}</small>
              </div>
              <div className="cms-notification-actions">
                {!item.read && <button type="button" onClick={() => markRead(item)}>Đã đọc</button>}
                {item.link && <button type="button" onClick={() => openItem(item)}>Mở</button>}
                <button type="button" onClick={() => deleteItem(item)}>Xóa</button>
              </div>
            </article>
          ))}
          {!items.length && <EmptyState title="Không có thông báo" text="Thông báo phù hợp bộ lọc sẽ hiển thị tại đây." />}
        </section>
      )}
    </div>
  );
}
