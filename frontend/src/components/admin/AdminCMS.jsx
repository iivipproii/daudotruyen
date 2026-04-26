import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  mockAdminNotifications,
  mockAdminReports,
  mockAdminStatsSeries,
  mockAdminStories,
  mockAdminTransactions,
  mockAdminUsers,
  mockChapterApprovals,
  mockTaxonomy,
  mockViolationComments
} from '../../data/mockAdminData';

function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function formatCurrency(value = 0) {
  return `${formatNumber(value)} đ`;
}

function formatDate(value) {
  if (!value) return 'Chưa cập nhật';
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function roleLabel(role) {
  return {
    admin: 'Admin',
    author: 'Tác giả',
    reader: 'Độc giả',
    user: 'Độc giả'
  }[role] || role || 'Độc giả';
}

function statusLabel(status) {
  return {
    active: 'Hoạt động',
    locked: 'Đã khóa',
    approved: 'Đã duyệt',
    pending: 'Chờ duyệt',
    rejected: 'Từ chối',
    reviewing: 'Đang xử lý',
    resolved: 'Đã xử lý',
    open: 'Chờ xử lý',
    published: 'Đã xuất bản',
    paused: 'Tạm dừng',
    completed: 'Hoàn thành',
    success: 'Thành công',
    failed: 'Thất bại',
    hidden: 'Đã ẩn'
  }[status] || status || 'Chưa rõ';
}

function paymentStatusLabel(status) {
  return {
    pending: 'Chờ thanh toán',
    success: 'Thành công',
    failed: 'Thất bại'
  }[status] || statusLabel(status);
}

function getSettledValue(result) {
  return result?.status === 'fulfilled' ? result.value : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeUser(user) {
  return {
    ...user,
    role: user.role === 'user' ? 'reader' : user.role || 'reader',
    status: user.status || 'active',
    coins: user.coins ?? user.seeds ?? 0,
    stories: user.stories ?? user.storyCount ?? 0,
    joinedAt: user.createdAt || user.joinedAt || new Date().toISOString(),
    lastActiveAt: user.lastActiveAt || user.updatedAt || new Date().toISOString()
  };
}

function normalizeStory(story, index) {
  const fallback = mockAdminStories[index % mockAdminStories.length] || {};
  return {
    ...fallback,
    ...story,
    approvalStatus: story.approvalStatus || fallback.approvalStatus || 'approved',
    publishStatus: story.publishStatus || (story.status === 'completed' ? 'completed' : 'published'),
    chapterCount: story.chapterCount || story.chapterCountEstimate || story.chapters || fallback.chapterCount || 0,
    hidden: Boolean(story.hidden),
    hot: story.hot ?? fallback.hot ?? false,
    recommended: story.recommended ?? fallback.recommended ?? false,
    banner: story.banner ?? fallback.banner ?? false,
    tags: story.tags || story.categories?.slice(0, 2) || fallback.tags || []
  };
}

function normalizeTransaction(transaction, users) {
  const user = users.find(item => item.id === transaction.userId);
  const seedAmount = Math.abs(Number(transaction.coins ?? transaction.seeds ?? transaction.amount ?? 0));
  return {
    ...transaction,
    userName: transaction.userName || user?.name || transaction.userId || 'Người dùng',
    amount: transaction.vndAmount ?? transaction.money ?? (transaction.type === 'purchase' ? seedAmount * 100 : seedAmount * 1000),
    coins: transaction.coins ?? transaction.seeds ?? Math.abs(Number(transaction.amount || 0)),
    method: transaction.method || (transaction.type === 'purchase' ? 'Ví xu' : 'Thanh toán nội bộ'),
    status: transaction.status || 'success',
    createdAt: transaction.createdAt || new Date().toISOString()
  };
}

function normalizeReport(report) {
  return {
    ...report,
    type: report.type || 'story',
    targetTitle: report.targetTitle || report.story?.title || 'Nội dung được báo cáo',
    storyTitle: report.storyTitle || report.story?.title || 'Không rõ truyện',
    userName: report.userName || report.user?.name || 'Người dùng',
    status: report.status || 'open',
    severity: report.severity || 'medium',
    detail: report.detail || report.reason || 'Báo cáo từ người dùng cần admin kiểm tra.',
    createdAt: report.createdAt || new Date().toISOString()
  };
}

function countWords(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function normalizeChapter(chapter, index = 0) {
  const fallback = mockChapterApprovals[index % mockChapterApprovals.length] || {};
  const premium = chapter.isPremium ?? chapter.vip ?? fallback.vip ?? false;
  return {
    ...fallback,
    ...chapter,
    storyTitle: chapter.storyTitle || chapter.story?.title || fallback.storyTitle || 'Truyện đã xóa',
    storyId: chapter.storyId || chapter.story?.id || fallback.storyId,
    author: chapter.author || chapter.story?.author || fallback.author || 'Không rõ tác giả',
    status: chapter.status || fallback.status || 'approved',
    vip: Boolean(premium),
    price: Number(chapter.price ?? fallback.price ?? 0),
    wordCount: Number(chapter.wordCount ?? countWords(chapter.content) ?? fallback.wordCount ?? 0),
    reads: Number(chapter.reads ?? chapter.views ?? fallback.reads ?? 0),
    comments: Number(chapter.comments ?? fallback.comments ?? 0),
    createdAt: chapter.createdAt || fallback.createdAt || new Date().toISOString(),
    updatedAt: chapter.updatedAt || chapter.createdAt || fallback.updatedAt || fallback.createdAt || new Date().toISOString(),
    preview: chapter.preview || String(chapter.content || '').slice(0, 320) || fallback.preview || 'Chưa có nội dung preview.'
  };
}

function buildAdminState() {
  const users = mockAdminUsers.map(normalizeUser);
  const stories = mockAdminStories.map(normalizeStory);
  const chapters = mockChapterApprovals.map(normalizeChapter);
  const reports = mockAdminReports.map(normalizeReport);
  const transactions = mockAdminTransactions;
  return {
    users,
    stories,
    chapters,
    reports,
    transactions,
    comments: mockViolationComments,
    notifications: mockAdminNotifications,
    taxonomy: mockTaxonomy,
    stats: {
      users: users.length,
      stories: stories.length,
      chapters: stories.reduce((sum, story) => sum + Number(story.chapterCount || 0), 0),
      transactions: transactions.length,
      revenueSeeds: transactions.filter(item => item.status === 'success').reduce((sum, item) => sum + Number(item.coins || 0), 0),
      views: stories.reduce((sum, story) => sum + Number(story.views || 0), 0)
    }
  };
}

function useModalDismiss(onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, onClose]);

  return event => {
    if (event.target === event.currentTarget) onClose();
  };
}

function getAdminView(pathname) {
  if (pathname.includes('/users')) return 'users';
  if (pathname.includes('/stories')) return 'stories';
  if (pathname.includes('/chapters')) return 'chapters';
  if (pathname.includes('/reports')) return 'reports';
  if (pathname.includes('/transactions')) return 'transactions';
  return 'overview';
}

const adminTabs = [
  { to: '/admin', label: 'Tổng quan', view: 'overview' },
  { to: '/admin/users', label: 'Người dùng', view: 'users' },
  { to: '/admin/stories', label: 'Duyệt truyện', view: 'stories' },
  { to: '/admin/chapters', label: 'Duyệt chương', view: 'chapters' },
  { to: '/admin/reports', label: 'Báo cáo', view: 'reports' },
  { to: '/admin/transactions', label: 'Giao dịch', view: 'transactions' }
];

export function AdminDashboard({ apiClient, user }) {
  const location = useLocation();
  const [state, setState] = useState(buildAdminState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [reportModal, setReportModal] = useState(null);
  const activeView = getAdminView(location.pathname);

  useEffect(() => {
    let ignore = false;

    async function loadAdminData() {
      if (!apiClient) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const [statsRes, usersRes, storiesRes, chaptersRes, reportsRes, txRes] = await Promise.allSettled([
        apiClient('/admin/stats'),
        apiClient('/admin/users'),
        apiClient('/admin/stories'),
        apiClient('/admin/chapters'),
        apiClient('/admin/reports'),
        apiClient('/admin/transactions')
      ]);

      if (ignore) return;

      const fallback = buildAdminState();
      const apiUsers = asArray(getSettledValue(usersRes)?.users).map(normalizeUser);
      const users = apiUsers.length ? apiUsers : fallback.users;
      const apiStories = asArray(getSettledValue(storiesRes)?.stories).map(normalizeStory);
      const stories = apiStories.length ? apiStories : fallback.stories;
      const apiChapters = asArray(getSettledValue(chaptersRes)?.chapters).map(normalizeChapter);
      const chapters = apiChapters.length ? apiChapters : fallback.chapters;
      const apiReports = asArray(getSettledValue(reportsRes)?.reports).map(normalizeReport);
      const reports = apiReports.length ? apiReports : fallback.reports;
      const apiTransactions = asArray(getSettledValue(txRes)?.transactions).map(item => normalizeTransaction(item, users));
      const transactions = apiTransactions.length ? apiTransactions : fallback.transactions;
      const stats = getSettledValue(statsRes)?.stats || getSettledValue(statsRes) || fallback.stats;
      const failed = [statsRes, usersRes, storiesRes, chaptersRes, reportsRes, txRes].some(item => item.status === 'rejected');

      setState(current => ({
        ...current,
        users,
        stories,
        chapters,
        reports,
        transactions,
        stats: {
          ...fallback.stats,
          ...stats,
          users: stats.users ?? users.length,
          stories: stats.stories ?? stories.length,
          chapters: stats.chapters ?? chapters.length,
          transactions: stats.transactions ?? transactions.length
        }
      }));
      setError(failed ? 'Một số API admin chưa sẵn sàng, phần còn thiếu đang dùng dữ liệu dự phòng.' : '');
      setLoading(false);
    }

    loadAdminData().catch(err => {
      if (ignore) return;
      setError(`${err.message || 'Không tải được API admin.'} Đang hiển thị dữ liệu dự phòng.`);
      setState(buildAdminState());
      setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [apiClient]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const dashboardStats = useMemo(() => {
    const pendingReports = state.reports.filter(item => ['open', 'reviewing'].includes(item.status)).length;
    const pendingStories = state.stories.filter(item => item.approvalStatus === 'pending').length;
    const pendingChapters = state.chapters.filter(item => ['pending', 'reviewing'].includes(item.status)).length;
    return {
      users: state.stats.users ?? state.users.length,
      stories: state.stats.stories ?? state.stories.length,
      chapters: state.stats.chapters ?? state.stories.reduce((sum, story) => sum + Number(story.chapterCount || 0), 0),
      revenue: state.stats.revenueVnd ?? (state.stats.revenueSeeds || 0) * 100,
      pendingReports,
      pendingApprovals: pendingStories + pendingChapters,
      views: state.stats.views ?? state.stories.reduce((sum, story) => sum + Number(story.views || 0), 0)
    };
  }, [state]);

  async function updateStory(story, patch) {
    const supportedPatch = {};
    if (patch.approvalStatus) supportedPatch.approvalStatus = patch.approvalStatus;
    if (Object.prototype.hasOwnProperty.call(patch, 'hidden')) supportedPatch.hidden = patch.hidden;
    const usesApi = Object.keys(supportedPatch).length > 0;

    if (usesApi && !apiClient) {
      setError('Không có kết nối API để cập nhật trạng thái truyện.');
      return;
    }

    const previousStories = state.stories;
    setState(current => ({
      ...current,
      stories: current.stories.map(item => item.id === story.id ? { ...item, ...patch } : item)
    }));

    if (usesApi) {
      try {
        const result = await apiClient(`/admin/stories/${story.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify(supportedPatch)
        });
        if (result?.story) {
          setState(current => ({
            ...current,
            stories: current.stories.map(item => item.id === story.id ? normalizeStory(result.story, 0) : item)
          }));
        }
        setError('');
        setToast('Đã cập nhật trạng thái truyện trên backend.');
      } catch (err) {
        setState(current => ({ ...current, stories: previousStories }));
        setError(err.message || 'Không cập nhật được trạng thái truyện.');
      }
      return;
    }

    setToast('Đã cập nhật nhãn hiển thị trong phiên hiện tại.');
  }

  function updateUser(id, patch) {
    setState(current => ({
      ...current,
      users: current.users.map(item => item.id === id ? { ...item, ...patch } : item)
    }));
    setToast('Đã cập nhật trạng thái người dùng trong phiên hiện tại.');
  }

  async function updateChapter(id, patch) {
    if (patch.status && !apiClient) {
      setError('Không có kết nối API để cập nhật trạng thái chương.');
      return;
    }

    const previousChapters = state.chapters;
    setState(current => ({
      ...current,
      chapters: current.chapters.map(item => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)
    }));

    if (patch.status) {
      try {
        const result = await apiClient(`/admin/chapters/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: patch.status })
        });
        if (!result?.chapter) throw new Error('API không trả về dữ liệu chương đã cập nhật.');
        setState(current => ({
          ...current,
          chapters: current.chapters.map(item => item.id === id ? normalizeChapter(result.chapter, 0) : item)
        }));
        setError('');
        setToast(`Đã cập nhật trạng thái chương: ${statusLabel(result.chapter.status)}.`);
      } catch (err) {
        setState(current => ({ ...current, chapters: previousChapters }));
        setError(err.message || 'Không cập nhật được trạng thái chương.');
      }
      return;
    }

    setToast('Đã cập nhật chương trong phiên hiện tại.');
  }

  async function updateReport(report, patch) {
    setState(current => ({
      ...current,
      reports: current.reports.map(item => item.id === report.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item),
      stories: patch.hideContent
        ? current.stories.map(story => story.title === report.storyTitle ? { ...story, hidden: true } : story)
        : current.stories
    }));

    if (apiClient && report.id && ['open', 'reviewing', 'resolved', 'rejected'].includes(patch.status)) {
      try {
        await apiClient(`/admin/reports/${report.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: patch.status })
        });
      } catch {
        setError('API báo cáo chưa đồng bộ action này, CMS đang giữ thay đổi trong phiên hiện tại.');
      }
    }
    setToast('Đã xử lý báo cáo.');
  }

  function updateComment(id, patch) {
    setState(current => ({
      ...current,
      comments: current.comments.map(item => item.id === id ? { ...item, ...patch } : item)
    }));
    setToast('Đã cập nhật bình luận vi phạm trong phiên hiện tại.');
  }

  function updateTaxonomy(nextTaxonomy) {
    setState(current => ({ ...current, taxonomy: nextTaxonomy }));
    setToast('Đã cập nhật thể loại/tag trong phiên hiện tại.');
  }

  if (loading) {
    return <div className="cms-state cms-loading">Đang tải dữ liệu quản trị...</div>;
  }

  return (
    <div className="cms-page">
      {toast && <div className="cms-toast">{toast}</div>}
      <section className="cms-hero">
        <div>
          <span>Admin CMS</span>
          <h1>Quản trị viên</h1>
          <p>Điều hành người dùng, kiểm duyệt truyện/chương, xử lý báo cáo, giao dịch và thông báo từ một dashboard thống nhất.</p>
        </div>
        <div className="cms-admin-card">
          <img src={user?.avatar || '/images/logo.png'} alt={user?.name || 'Admin'} />
          <div>
            <strong>{user?.name || 'Quản trị viên'}</strong>
            <small>{user?.email || 'admin@example.com'}</small>
          </div>
        </div>
      </section>

      <nav className="cms-tabs">
        {adminTabs.map(tab => (
          <NavLink key={tab.view} end={tab.view === 'overview'} to={tab.to}>
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {error && <div className="cms-alert">{error}</div>}

      {activeView === 'overview' && (
        <AdminOverview stats={dashboardStats} stories={state.stories} reports={state.reports} chapters={state.chapters} users={state.users} />
      )}
      {activeView === 'users' && <UserManagementTable users={state.users} onUpdate={updateUser} />}
      {activeView === 'stories' && (
        <StoryModerationTable stories={state.stories} taxonomy={state.taxonomy} onUpdate={updateStory} onTaxonomyChange={updateTaxonomy} />
      )}
      {activeView === 'chapters' && <ChapterModerationTable chapters={state.chapters} onUpdate={updateChapter} />}
      {activeView === 'reports' && (
        <ReportManagement
          reports={state.reports}
          comments={state.comments}
          onAction={setReportModal}
          onCommentUpdate={updateComment}
        />
      )}
      {activeView === 'transactions' && <TransactionTable transactions={state.transactions} />}

      <ReportActionModal
        report={reportModal}
        onClose={() => setReportModal(null)}
        onSubmit={patch => {
          updateReport(reportModal, patch);
          setReportModal(null);
        }}
      />
    </div>
  );
}

function AdminOverview({ stats, stories, reports, chapters, users }) {
  const pendingStories = stories.filter(item => item.approvalStatus === 'pending').slice(0, 4);
  const pendingChapters = chapters.filter(item => ['pending', 'reviewing'].includes(item.status)).slice(0, 4);
  const pendingReports = reports.filter(item => ['open', 'reviewing'].includes(item.status)).slice(0, 4);

  return (
    <div className="cms-stack">
      <AdminStatsCards stats={stats} />
      <section className="cms-grid-two">
        <BasicStatsChart rows={mockAdminStatsSeries} />
        <section className="cms-panel">
          <div className="cms-panel-head">
            <div>
              <span>Hoạt động mới</span>
              <h2>Hàng chờ cần xử lý</h2>
            </div>
            <Link to="/notifications" className="cms-link-button">Thông báo</Link>
          </div>
          <div className="cms-queue">
            {pendingReports.map(report => (
              <Link key={report.id} to="/admin/reports">
                <b>Báo cáo</b>
                <span>{report.targetTitle}</span>
                <small>{statusLabel(report.status)} · {formatDate(report.createdAt)}</small>
              </Link>
            ))}
            {pendingStories.map(story => (
              <Link key={story.id} to="/admin/stories">
                <b>Truyện chờ duyệt</b>
                <span>{story.title}</span>
                <small>{story.author} · {formatNumber(story.chapterCount)} chương</small>
              </Link>
            ))}
            {pendingChapters.map(chapter => (
              <Link key={chapter.id} to="/admin/chapters">
                <b>Chương chờ duyệt</b>
                <span>{chapter.storyTitle} - Chương {chapter.number}</span>
                <small>{chapter.author} · {formatNumber(chapter.wordCount)} từ</small>
              </Link>
            ))}
          </div>
          {!pendingReports.length && !pendingStories.length && !pendingChapters.length && <EmptyState title="Không có hàng chờ" text="Các báo cáo và nội dung duyệt mới sẽ xuất hiện tại đây." />}
        </section>
      </section>

      <section className="cms-grid-three">
        <MiniPanel title="Top truyện cần chú ý" items={stories.slice().sort((a, b) => Number(b.views || 0) - Number(a.views || 0)).slice(0, 5).map(story => `${story.title} · ${formatNumber(story.views)} lượt đọc`)} />
        <MiniPanel title="Người dùng mới" items={users.slice(0, 5).map(item => `${item.name} · ${roleLabel(item.role)} · ${statusLabel(item.status)}`)} />
        <MiniPanel title="Tác vụ CMS" items={['Khóa/mở khóa người dùng trong phiên hiện tại', 'Duyệt/từ chối truyện qua API backend', 'Duyệt/từ chối/ẩn chương qua API backend', 'Quản lý hot/đề cử/banner trang chủ']} />
      </section>
    </div>
  );
}

export function AdminStatsCards({ stats }) {
  const cards = [
    { label: 'Tổng người dùng', value: stats.users, tone: 'pink' },
    { label: 'Tổng truyện', value: stats.stories, tone: 'orange' },
    { label: 'Tổng chương', value: stats.chapters, tone: 'red' },
    { label: 'Doanh thu', value: formatCurrency(stats.revenue), tone: 'green' },
    { label: 'Báo cáo chờ xử lý', value: stats.pendingReports, tone: 'purple' },
    { label: 'Truyện/chương chờ duyệt', value: stats.pendingApprovals, tone: 'blue' }
  ];

  return (
    <section className="cms-stats-grid">
      {cards.map(card => (
        <article className={`cms-stat-card tone-${card.tone}`} key={card.label}>
          <span>{card.label}</span>
          <strong>{typeof card.value === 'number' ? formatNumber(card.value) : card.value}</strong>
        </article>
      ))}
    </section>
  );
}

function BasicStatsChart({ rows }) {
  const max = Math.max(...rows.map(item => item.revenue), 1);
  return (
    <section className="cms-panel">
      <div className="cms-panel-head">
        <div>
          <span>Biểu đồ cơ bản</span>
          <h2>Doanh thu và nội dung 7 ngày</h2>
        </div>
      </div>
      <div className="cms-chart">
        {rows.map(row => (
          <div className="cms-chart-col" key={row.label}>
            <div className="cms-chart-bars">
              <i style={{ height: `${Math.max(12, row.revenue / max * 100)}%` }} />
              <em style={{ height: `${Math.max(10, row.chapters / 130 * 100)}%` }} />
            </div>
            <strong>{row.label}</strong>
            <small>{formatNumber(row.revenue)}</small>
          </div>
        ))}
      </div>
      <div className="cms-chart-legend"><span>Doanh thu</span><span>Chương mới</span></div>
    </section>
  );
}

function MiniPanel({ title, items }) {
  return (
    <section className="cms-panel cms-mini-panel">
      <h2>{title}</h2>
      <div>
        {items.map(item => <p key={item}>{item}</p>)}
      </div>
    </section>
  );
}

export function AdminTable({ columns, children, empty }) {
  return (
    <div className="cms-table-wrap">
      <table className="cms-table">
        <thead>
          <tr>{columns.map(column => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <EmptyState title="Không có dữ liệu" text="Thử đổi bộ lọc hoặc reset tìm kiếm để xem thêm kết quả." />}
    </div>
  );
}

export function UserManagementTable({ users, onUpdate }) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return users.filter(user => {
      const matchesText = !text || `${user.name} ${user.email}`.toLowerCase().includes(text);
      const matchesRole = role === 'all' || user.role === role;
      const matchesStatus = status === 'all' || user.status === status;
      return matchesText && matchesRole && matchesStatus;
    });
  }, [users, query, role, status]);

  return (
    <div className="cms-stack">
      <PageHead eyebrow="Quản lý người dùng" title="Người dùng" text="Tìm kiếm, lọc vai trò/trạng thái, xem chi tiết và khóa/mở khóa tài khoản trong phiên hiện tại nếu backend chưa hỗ trợ." />
      <FilterBar>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm tên hoặc email..." />
        <select value={role} onChange={event => setRole(event.target.value)}>
          <option value="all">Tất cả vai trò</option>
          <option value="reader">Độc giả</option>
          <option value="author">Tác giả</option>
          <option value="admin">Admin</option>
        </select>
        <select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Hoạt động</option>
          <option value="locked">Đã khóa</option>
        </select>
        <button type="button" onClick={() => { setQuery(''); setRole('all'); setStatus('all'); }}>Reset</button>
      </FilterBar>

      <AdminTable columns={['Người dùng', 'Vai trò', 'Trạng thái', 'Số xu', 'Hoạt động cuối', 'Thao tác']} empty={!filtered.length}>
        {filtered.map(item => (
          <tr key={item.id}>
            <td>
              <div className="cms-user-cell">
                <img src={item.avatar || '/images/logo.png'} alt={item.name} loading="lazy" />
                <span><strong>{item.name}</strong><small>{item.email}</small></span>
              </div>
            </td>
            <td>{roleLabel(item.role)}</td>
            <td><Badge tone={item.status === 'locked' ? 'danger' : 'success'}>{statusLabel(item.status)}</Badge></td>
            <td>{formatNumber(item.coins)}</td>
            <td>{formatDate(item.lastActiveAt)}</td>
            <td>
              <div className="cms-row-actions">
                <button type="button" onClick={() => setSelected(item)}>Chi tiết</button>
                <button type="button" onClick={() => onUpdate(item.id, { status: item.status === 'locked' ? 'active' : 'locked' })}>
                  {item.status === 'locked' ? 'Mở khóa' : 'Khóa'}
                </button>
              </div>
            </td>
          </tr>
        ))}
      </AdminTable>

      {selected && (
        <section className="cms-panel cms-detail-panel">
          <button type="button" className="cms-close" onClick={() => setSelected(null)}>Đóng</button>
          <h2>{selected.name}</h2>
          <div className="cms-detail-grid">
            <p><span>Email</span><strong>{selected.email}</strong></p>
            <p><span>Vai trò</span><strong>{roleLabel(selected.role)}</strong></p>
            <p><span>Trạng thái</span><strong>{statusLabel(selected.status)}</strong></p>
            <p><span>Ngày tham gia</span><strong>{formatDate(selected.joinedAt)}</strong></p>
            <p><span>Truyện đã đăng</span><strong>{formatNumber(selected.stories)}</strong></p>
            <p><span>Báo cáo liên quan</span><strong>{formatNumber(selected.reports)}</strong></p>
          </div>
        </section>
      )}
    </div>
  );
}

export function StoryModerationTable({ stories, taxonomy, onUpdate, onTaxonomyChange }) {
  const [query, setQuery] = useState('');
  const [approval, setApproval] = useState('all');
  const [publish, setPublish] = useState('all');
  const [genre, setGenre] = useState('all');
  const [newGenre, setNewGenre] = useState('');
  const [newTag, setNewTag] = useState('');

  const genres = taxonomy.genres || [];
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return stories.filter(story => {
      const matchesText = !text || `${story.title} ${story.author}`.toLowerCase().includes(text);
      const matchesApproval = approval === 'all' || story.approvalStatus === approval;
      const matchesPublish = publish === 'all' || story.publishStatus === publish || story.status === publish;
      const matchesGenre = genre === 'all' || story.categories?.includes(genre);
      return matchesText && matchesApproval && matchesPublish && matchesGenre;
    });
  }, [stories, query, approval, publish, genre]);

  function addTaxonomy(kind, value) {
    const text = value.trim();
    if (!text) return;
    const key = kind === 'genre' ? 'genres' : 'tags';
    onTaxonomyChange({ ...taxonomy, [key]: Array.from(new Set([...(taxonomy[key] || []), text])) });
    if (kind === 'genre') setNewGenre('');
    else setNewTag('');
  }

  return (
    <div className="cms-stack">
      <PageHead eyebrow="Duyệt truyện / Quản lý truyện" title="Duyệt truyện và quản lý truyện" text="Duyệt/từ chối truyện mới, ẩn nội dung, gắn hot/đề cử/banner trang chủ và quản lý taxonomy." />
      <FilterBar>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm truyện hoặc tác giả..." />
        <select value={approval} onChange={event => setApproval(event.target.value)}>
          <option value="all">Tất cả trạng thái duyệt</option>
          <option value="pending">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
        </select>
        <select value={publish} onChange={event => setPublish(event.target.value)}>
          <option value="all">Tất cả xuất bản</option>
          <option value="published">Đã xuất bản</option>
          <option value="completed">Hoàn thành</option>
          <option value="paused">Tạm dừng</option>
        </select>
        <select value={genre} onChange={event => setGenre(event.target.value)}>
          <option value="all">Tất cả thể loại</option>
          {genres.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={() => { setQuery(''); setApproval('all'); setPublish('all'); setGenre('all'); }}>Reset</button>
      </FilterBar>

      <AdminTable columns={['Truyện', 'Duyệt', 'Xuất bản', 'Gắn nhãn', 'Chỉ số', 'Thao tác']} empty={!filtered.length}>
        {filtered.map(story => (
          <tr key={story.id}>
            <td>
              <div className="cms-story-cell">
                <img src={story.cover || '/images/cover-1.jpg'} alt={story.title} loading="lazy" />
                <span><strong>{story.title}</strong><small>{story.author} · {story.categories?.slice(0, 2).join(', ')}</small></span>
              </div>
            </td>
            <td><Badge tone={story.approvalStatus === 'approved' ? 'success' : story.approvalStatus === 'rejected' ? 'danger' : 'warning'}>{statusLabel(story.approvalStatus)}</Badge></td>
            <td>{statusLabel(story.publishStatus || story.status)}</td>
            <td>
              <div className="cms-chip-row">
                {story.hot && <Badge tone="danger">HOT</Badge>}
                {story.recommended && <Badge tone="info">Đề cử</Badge>}
                {story.banner && <Badge tone="warning">Banner</Badge>}
                {story.hidden && <Badge tone="dark">Ẩn</Badge>}
              </div>
            </td>
            <td>{formatNumber(story.views)} đọc · {formatNumber(story.chapterCount)} chương</td>
            <td>
              <div className="cms-row-actions">
                <button type="button" onClick={() => onUpdate(story, { approvalStatus: 'approved' })}>Duyệt</button>
                <button type="button" onClick={() => onUpdate(story, { approvalStatus: 'rejected' })}>Từ chối</button>
                <button type="button" onClick={() => onUpdate(story, { hidden: !story.hidden })}>{story.hidden ? 'Hiện' : 'Ẩn'}</button>
                <button type="button" onClick={() => onUpdate(story, { hot: !story.hot })}>{story.hot ? 'Bỏ hot' : 'Hot'}</button>
                <button type="button" onClick={() => onUpdate(story, { recommended: !story.recommended })}>Đề cử</button>
                <button type="button" onClick={() => onUpdate(story, { banner: !story.banner })}>Banner</button>
              </div>
            </td>
          </tr>
        ))}
      </AdminTable>

      <section className="cms-grid-two">
        <TaxonomyBox title="Thể loại" items={taxonomy.genres || []} value={newGenre} onChange={setNewGenre} onAdd={() => addTaxonomy('genre', newGenre)} />
        <TaxonomyBox title="Tag" items={taxonomy.tags || []} value={newTag} onChange={setNewTag} onAdd={() => addTaxonomy('tag', newTag)} />
      </section>
    </div>
  );
}

function TaxonomyBox({ title, items, value, onChange, onAdd }) {
  return (
    <section className="cms-panel">
      <div className="cms-panel-head">
        <div>
          <span>Taxonomy</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="cms-chip-cloud">
        {items.map(item => <span key={item}>{item}</span>)}
      </div>
      <div className="cms-inline-form">
        <input value={value} onChange={event => onChange(event.target.value)} placeholder={`Thêm ${title.toLowerCase()}...`} />
        <button type="button" onClick={onAdd}>Thêm</button>
      </div>
    </section>
  );
}

export function ChapterModerationTable({ chapters, onUpdate }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [story, setStory] = useState('all');
  const [preview, setPreview] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const storyNames = Array.from(new Set(chapters.map(item => item.storyTitle)));

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return chapters.filter(chapter => {
      const matchesText = !text || `${chapter.title} ${chapter.storyTitle} ${chapter.author}`.toLowerCase().includes(text);
      const matchesStatus = status === 'all' || chapter.status === status;
      const matchesStory = story === 'all' || chapter.storyTitle === story;
      return matchesText && matchesStatus && matchesStory;
    });
  }, [chapters, query, status, story]);

  function submitReject() {
    if (!rejecting) return;
    onUpdate(rejecting.id, { status: 'rejected', rejectionReason: reason || 'Cần chỉnh sửa trước khi duyệt.' });
    setRejecting(null);
    setReason('');
  }

  useEffect(() => {
    if (!rejecting) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setRejecting(null);
        setReason('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [rejecting]);

  return (
    <div className="cms-stack">
      <PageHead eyebrow="Duyệt chương" title="Duyệt chương" text="Xem preview, chuyển trạng thái duyệt/từ chối/ẩn chương và lưu trạng thái trực tiếp vào backend." />
      <FilterBar>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm chương, truyện, tác giả..." />
        <select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chờ duyệt</option>
          <option value="reviewing">Đang xử lý</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
          <option value="hidden">Đã ẩn</option>
        </select>
        <select value={story} onChange={event => setStory(event.target.value)}>
          <option value="all">Tất cả truyện</option>
          {storyNames.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" onClick={() => { setQuery(''); setStatus('all'); setStory('all'); }}>Reset</button>
      </FilterBar>

      <AdminTable columns={['Chương', 'Tác giả', 'Trạng thái', 'Loại', 'Thống kê', 'Thao tác']} empty={!filtered.length}>
        {filtered.map(chapter => (
          <tr key={chapter.id}>
            <td>
              <strong>{chapter.storyTitle}</strong>
              <small>Chương {chapter.number}: {chapter.title}</small>
            </td>
            <td>{chapter.author}</td>
            <td><Badge tone={chapter.status === 'approved' ? 'success' : chapter.status === 'rejected' ? 'danger' : chapter.status === 'hidden' ? 'dark' : 'warning'}>{statusLabel(chapter.status)}</Badge></td>
            <td>{chapter.vip ? `VIP · ${chapter.price} xu` : 'Miễn phí'}</td>
            <td>{formatNumber(chapter.wordCount)} từ · {formatNumber(chapter.reads)} đọc · {formatNumber(chapter.comments)} bình luận</td>
            <td>
              <div className="cms-row-actions">
                <button type="button" onClick={() => setPreview(chapter)}>Preview</button>
                <button type="button" onClick={() => onUpdate(chapter.id, { status: 'reviewing' })}>Đang xử lý</button>
                <button type="button" onClick={() => onUpdate(chapter.id, { status: 'approved' })}>Duyệt</button>
                <button type="button" onClick={() => setRejecting(chapter)}>Từ chối</button>
                <button type="button" onClick={() => onUpdate(chapter.id, { status: 'hidden' })}>Ẩn</button>
              </div>
            </td>
          </tr>
        ))}
      </AdminTable>

      {preview && (
        <section className="cms-panel cms-preview-panel">
          <button type="button" className="cms-close" onClick={() => setPreview(null)}>Đóng</button>
          <span>Preview chương</span>
          <h2>{preview.storyTitle} - Chương {preview.number}: {preview.title}</h2>
          <p>{preview.preview}</p>
        </section>
      )}

      {rejecting && (
        <div className="cms-modal-backdrop" onMouseDown={event => {
          if (event.target === event.currentTarget) {
            setRejecting(null);
            setReason('');
          }
        }}>
          <form className="cms-modal" onSubmit={event => { event.preventDefault(); submitReject(); }}>
            <h2>Ghi lý do từ chối</h2>
            <p>{rejecting.storyTitle} - Chương {rejecting.number}: {rejecting.title}</p>
            <textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Lý do từ chối để tác giả chỉnh sửa..." />
            <div className="cms-modal-actions">
              <button type="button" onClick={() => setRejecting(null)}>Hủy</button>
              <button type="submit">Từ chối chương</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function TransactionTable({ transactions }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return transactions.filter(item => {
      const matchesText = !text || `${item.id} ${item.userName} ${item.method}`.toLowerCase().includes(text);
      const matchesStatus = status === 'all' || item.status === status;
      return matchesText && matchesStatus;
    });
  }, [transactions, query, status]);

  return (
    <div className="cms-stack">
      <PageHead eyebrow="Nạp xu" title="Quản lý giao dịch" text="Theo dõi giao dịch nạp xu, trạng thái thanh toán, phương thức và chi tiết xử lý." />
      <FilterBar>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm mã giao dịch, người dùng..." />
        <select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chờ thanh toán</option>
          <option value="success">Thành công</option>
          <option value="failed">Thất bại</option>
        </select>
        <button type="button" onClick={() => { setQuery(''); setStatus('all'); }}>Reset</button>
      </FilterBar>

      <AdminTable columns={['Mã', 'Người dùng', 'Số tiền', 'Số xu', 'Phương thức', 'Trạng thái', 'Thời gian', '']} empty={!filtered.length}>
        {filtered.map(item => (
          <tr key={item.id}>
            <td><strong>{item.id}</strong></td>
            <td>{item.userName}</td>
            <td>{formatCurrency(item.amount)}</td>
            <td>{formatNumber(item.coins)}</td>
            <td>{item.method}</td>
            <td><Badge tone={item.status === 'success' ? 'success' : item.status === 'failed' ? 'danger' : 'warning'}>{paymentStatusLabel(item.status)}</Badge></td>
            <td>{formatDate(item.createdAt)}</td>
            <td><button type="button" className="cms-link-button" onClick={() => setSelected(item)}>Chi tiết</button></td>
          </tr>
        ))}
      </AdminTable>

      {selected && (
        <section className="cms-panel cms-detail-panel">
          <button type="button" className="cms-close" onClick={() => setSelected(null)}>Đóng</button>
          <h2>Chi tiết giao dịch {selected.id}</h2>
          <div className="cms-detail-grid">
            <p><span>Người dùng</span><strong>{selected.userName}</strong></p>
            <p><span>Số tiền</span><strong>{formatCurrency(selected.amount)}</strong></p>
            <p><span>Số xu</span><strong>{formatNumber(selected.coins)}</strong></p>
            <p><span>Phương thức</span><strong>{selected.method}</strong></p>
            <p><span>Trạng thái</span><strong>{paymentStatusLabel(selected.status)}</strong></p>
            <p><span>Thời gian</span><strong>{formatDate(selected.createdAt)}</strong></p>
          </div>
        </section>
      )}
    </div>
  );
}

export function ReportManagement({ reports, comments, onAction, onCommentUpdate }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return reports.filter(report => {
      const matchesText = !text || `${report.targetTitle} ${report.storyTitle} ${report.userName} ${report.reason}`.toLowerCase().includes(text);
      const matchesStatus = status === 'all' || report.status === status;
      const matchesType = type === 'all' || report.type === type;
      return matchesText && matchesStatus && matchesType;
    });
  }, [reports, query, status, type]);

  return (
    <div className="cms-stack">
      <PageHead eyebrow="Kiểm duyệt & báo cáo" title="Báo cáo vi phạm" text="Xử lý báo cáo truyện/chương/bình luận, ẩn nội dung vi phạm và quản lý bình luận bị report." />
      <FilterBar>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm nội dung báo cáo..." />
        <select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="open">Chờ xử lý</option>
          <option value="reviewing">Đang xử lý</option>
          <option value="resolved">Đã xử lý</option>
          <option value="rejected">Từ chối</option>
        </select>
        <select value={type} onChange={event => setType(event.target.value)}>
          <option value="all">Tất cả loại</option>
          <option value="story">Truyện</option>
          <option value="chapter">Chương</option>
          <option value="comment">Bình luận</option>
        </select>
        <button type="button" onClick={() => { setQuery(''); setStatus('all'); setType('all'); }}>Reset</button>
      </FilterBar>

      <AdminTable columns={['Báo cáo', 'Loại', 'Lý do', 'Trạng thái', 'Thời gian', 'Thao tác']} empty={!filtered.length}>
        {filtered.map(report => (
          <tr key={report.id}>
            <td>
              <strong>{report.targetTitle}</strong>
              <small>{report.storyTitle} · bởi {report.userName}</small>
            </td>
            <td>{report.type}</td>
            <td>{report.reason}</td>
            <td><Badge tone={report.status === 'resolved' ? 'success' : report.status === 'rejected' ? 'danger' : 'warning'}>{statusLabel(report.status)}</Badge></td>
            <td>{formatDate(report.createdAt)}</td>
            <td><button type="button" onClick={() => onAction(report)}>Xử lý</button></td>
          </tr>
        ))}
      </AdminTable>

      <section className="cms-panel">
        <div className="cms-panel-head">
          <div>
            <span>Bình luận vi phạm</span>
            <h2>Quản lý bình luận bị báo cáo</h2>
          </div>
        </div>
        <div className="cms-comment-list">
          {comments.map(comment => (
            <article key={comment.id}>
              <div>
                <strong>{comment.userName}</strong>
                <small>{comment.storyTitle} · {formatDate(comment.createdAt)}</small>
                <p>{comment.body}</p>
              </div>
              <div className="cms-row-actions">
                <Badge tone={comment.status === 'hidden' ? 'dark' : 'success'}>{comment.status === 'hidden' ? 'Đã ẩn' : 'Đang hiện'}</Badge>
                <button type="button" onClick={() => onCommentUpdate(comment.id, { status: comment.status === 'hidden' ? 'visible' : 'hidden' })}>
                  {comment.status === 'hidden' ? 'Hiện lại' : 'Ẩn'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ReportActionModal({ report, onClose, onSubmit }) {
  const [status, setStatus] = useState('reviewing');
  const [note, setNote] = useState('');
  const [hideContent, setHideContent] = useState(false);
  const closeByBackdrop = useModalDismiss(onClose, Boolean(report));

  useEffect(() => {
    if (!report) return;
    setStatus(report.status === 'open' ? 'reviewing' : report.status);
    setNote('');
    setHideContent(false);
  }, [report]);

  if (!report) return null;

  return (
    <div className="cms-modal-backdrop" onMouseDown={closeByBackdrop}>
      <form className="cms-modal" onSubmit={event => {
        event.preventDefault();
        onSubmit({ status, note, hideContent });
      }}>
        <h2>Xử lý báo cáo</h2>
        <p><strong>{report.targetTitle}</strong></p>
        <p>{report.detail}</p>
        <label>
          Trạng thái
          <select value={status} onChange={event => setStatus(event.target.value)}>
            <option value="reviewing">Đang xử lý</option>
            <option value="resolved">Đã xử lý</option>
            <option value="rejected">Từ chối</option>
          </select>
        </label>
        <label>
          Ghi chú xử lý
          <textarea value={note} onChange={event => setNote(event.target.value)} placeholder="Lý do xử lý, hướng khắc phục hoặc phản hồi cho đội nội dung..." />
        </label>
        <label className="cms-checkbox">
          <input type="checkbox" checked={hideContent} onChange={event => setHideContent(event.target.checked)} />
          Ẩn nội dung liên quan trong phiên hiện tại
        </label>
        <div className="cms-modal-actions">
          <button type="button" onClick={onClose}>Hủy</button>
          <button type="submit">Lưu xử lý</button>
        </div>
      </form>
    </div>
  );
}

export function NotificationPage({ apiClient, user }) {
  const [items, setItems] = useState(mockAdminNotifications);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let ignore = false;

    async function load() {
      if (!apiClient) {
        setLoading(false);
        return;
      }
      try {
        const data = await apiClient('/notifications');
        if (ignore) return;
        const notifications = asArray(data.notifications);
        setItems(notifications.length ? notifications : mockAdminNotifications);
        setError(notifications.length ? '' : 'Chưa có thông báo từ backend, đang hiển thị dữ liệu dự phòng.');
      } catch {
        if (ignore) return;
        setItems(mockAdminNotifications);
        setError('Không tải được API thông báo, đang hiển thị dữ liệu dự phòng.');
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [apiClient]);

  const filtered = useMemo(() => {
    if (filter === 'unread') return items.filter(item => !item.read);
    if (filter === 'read') return items.filter(item => item.read);
    return items.filter(item => filter === 'all' || item.type === filter);
  }, [items, filter]);

  async function markAllRead() {
    setItems(current => current.map(item => ({ ...item, read: true })));
    if (apiClient) {
      try {
        await apiClient('/notifications/read-all', { method: 'POST' });
      } catch {
        setError('Đã đánh dấu đã đọc trên giao diện; API read-all chưa sẵn sàng.');
      }
    }
  }

  if (loading) {
    return <div className="cms-state cms-loading">Đang tải thông báo...</div>;
  }

  return (
    <div className="cms-page">
      <section className="cms-page-head cms-notification-head">
        <div>
          <span>Thông báo</span>
          <h1>Trung tâm thông báo</h1>
          <p>Chương mới, bình luận trả lời, giao dịch, duyệt/từ chối truyện/chương và thông báo hệ thống cho {user?.role === 'admin' ? 'admin' : 'người dùng'}.</p>
        </div>
        <button type="button" onClick={markAllRead}>Đánh dấu tất cả là đã đọc</button>
      </section>

      {error && <div className="cms-alert">{error}</div>}

      <div className="cms-notification-filters">
        {[
          ['all', 'Tất cả'],
          ['unread', 'Chưa đọc'],
          ['read', 'Đã đọc'],
          ['chapter', 'Chương mới'],
          ['reply', 'Trả lời'],
          ['transaction', 'Giao dịch'],
          ['moderation', 'Duyệt truyện']
        ].map(([value, label]) => (
          <button key={value} type="button" className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>

      <section className="cms-notification-list">
        {filtered.map(item => (
          <article key={item.id} className={item.read ? 'read' : 'unread'}>
            <span className="cms-notification-dot" />
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
              <small>{item.read ? 'Đã đọc' : 'Chưa đọc'} · {formatDate(item.createdAt)}</small>
            </div>
            {item.actionTo && <Link to={item.actionTo}>{item.actionText || 'Xem'}</Link>}
          </article>
        ))}
      </section>
      {!filtered.length && <EmptyState title="Không có thông báo" text="Thông báo phù hợp với bộ lọc sẽ xuất hiện tại đây." />}
    </div>
  );
}

function PageHead({ eyebrow, title, text }) {
  return (
    <section className="cms-page-head">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
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
