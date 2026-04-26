import { mockCategories, mockStories } from './mockStories';

const now = new Date('2026-04-26T08:00:00.000Z');

function daysAgo(days, hour = 9) {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  date.setHours(hour, 15, 0, 0);
  return date.toISOString();
}

export const mockAdminStatsSeries = [
  { label: 'T2', users: 42, stories: 12, chapters: 68, revenue: 420000 },
  { label: 'T3', users: 58, stories: 15, chapters: 74, revenue: 510000 },
  { label: 'T4', users: 51, stories: 11, chapters: 63, revenue: 475000 },
  { label: 'T5', users: 73, stories: 18, chapters: 91, revenue: 690000 },
  { label: 'T6', users: 86, stories: 22, chapters: 108, revenue: 820000 },
  { label: 'T7', users: 64, stories: 16, chapters: 83, revenue: 610000 },
  { label: 'CN', users: 92, stories: 24, chapters: 126, revenue: 940000 }
];

export const mockAdminUsers = [
  {
    id: 'u-admin',
    name: 'Minh An',
    email: 'admin@example.com',
    role: 'admin',
    status: 'active',
    avatar: '/images/logo.png',
    coins: 3200,
    stories: 0,
    reports: 0,
    joinedAt: daysAgo(180),
    lastActiveAt: daysAgo(0, 7)
  },
  {
    id: 'u-author-1',
    name: 'Bạch Tô',
    email: 'author@example.com',
    role: 'author',
    status: 'active',
    avatar: '/images/avatar-1.jpg',
    coins: 12800,
    stories: 5,
    reports: 1,
    joinedAt: daysAgo(96),
    lastActiveAt: daysAgo(0, 11)
  },
  {
    id: 'u-reader-1',
    name: 'Độc giả Hoa Mộc',
    email: 'user@example.com',
    role: 'reader',
    status: 'active',
    avatar: '/images/avatar-2.jpg',
    coins: 780,
    stories: 0,
    reports: 3,
    joinedAt: daysAgo(72),
    lastActiveAt: daysAgo(1, 20)
  },
  {
    id: 'u-reader-2',
    name: 'Lam Hồ',
    email: 'lamho@example.com',
    role: 'reader',
    status: 'locked',
    avatar: '/images/avatar-3.jpg',
    coins: 120,
    stories: 0,
    reports: 5,
    joinedAt: daysAgo(31),
    lastActiveAt: daysAgo(7, 22)
  },
  {
    id: 'u-author-2',
    name: 'Tịch Chiếu',
    email: 'tichchieu@example.com',
    role: 'author',
    status: 'active',
    avatar: '/images/avatar-4.jpg',
    coins: 5400,
    stories: 3,
    reports: 0,
    joinedAt: daysAgo(54),
    lastActiveAt: daysAgo(0, 14)
  }
];

export const mockAdminStories = mockStories.slice(0, 10).map((story, index) => ({
  ...story,
  approvalStatus: index % 5 === 0 ? 'pending' : index % 7 === 0 ? 'rejected' : 'approved',
  publishStatus: story.status === 'completed' ? 'completed' : index % 6 === 0 ? 'paused' : 'published',
  hidden: index === 7,
  hot: index < 3,
  recommended: [1, 4, 6].includes(index),
  banner: index === 0 || index === 2,
  authorId: index % 2 ? 'u-author-1' : 'u-author-2',
  tags: story.categories?.slice(0, 2) || [],
  createdAt: story.createdAt || daysAgo(index + 4),
  updatedAt: story.updatedAt || daysAgo(index)
}));

export const mockChapterApprovals = [
  {
    id: 'chap-mod-1',
    storyId: 'mock-1',
    storyTitle: mockStories[0]?.title || 'Truyện nổi bật',
    author: mockStories[0]?.author || 'Tác giả',
    number: 1249,
    title: 'Hỏa liên mới nở',
    status: 'pending',
    vip: true,
    price: 18,
    wordCount: 3260,
    reads: 0,
    comments: 0,
    revenue: 0,
    createdAt: daysAgo(0, 6),
    preview: 'Tiếng chuông trong tháp cổ vang lên ba hồi. Hắn mở mắt, nhìn luồng hỏa diễm đang tụ lại thành một đóa sen đỏ rực giữa lòng bàn tay.'
  },
  {
    id: 'chap-mod-2',
    storyId: 'mock-3',
    storyTitle: mockStories[2]?.title || 'Truyện cổ đại',
    author: mockStories[2]?.author || 'Tác giả',
    number: 97,
    title: 'Đèn cuối bến sông',
    status: 'reviewing',
    vip: false,
    price: 0,
    wordCount: 2480,
    reads: 1204,
    comments: 18,
    revenue: 0,
    createdAt: daysAgo(1, 10),
    preview: 'Mưa bụi rơi mỏng như khói. Chiếc thuyền không người lái lặng lẽ cập bến, mang theo một hộp gỗ phủ kín tàn tro.'
  },
  {
    id: 'chap-mod-3',
    storyId: 'mock-7',
    storyTitle: mockStories[6]?.title || 'Truyện đô thị',
    author: mockStories[6]?.author || 'Tác giả',
    number: 287,
    title: 'Tờ hợp đồng bị xé',
    status: 'pending',
    vip: true,
    price: 22,
    wordCount: 2890,
    reads: 0,
    comments: 0,
    revenue: 0,
    createdAt: daysAgo(2, 13),
    preview: 'Cô đặt bút xuống, mỉm cười nhìn người đàn ông phía đối diện. Lần này, điều khoản cuối cùng sẽ do chính cô viết.'
  },
  {
    id: 'chap-mod-4',
    storyId: 'mock-8',
    storyTitle: mockStories[7]?.title || 'Trinh thám',
    author: mockStories[7]?.author || 'Tác giả',
    number: 73,
    title: 'Vùng tối camera',
    status: 'approved',
    vip: false,
    price: 0,
    wordCount: 3540,
    reads: 4528,
    comments: 42,
    revenue: 0,
    createdAt: daysAgo(4, 16),
    preview: 'Bản ghi hình dừng ở giây thứ mười bảy. Trong khoảng đen ngắn ngủi đó, cả căn phòng đã thay đổi vị trí.'
  }
];

export const mockAdminTransactions = [
  {
    id: 'txn-10028',
    userId: 'u-reader-1',
    userName: 'Độc giả Hoa Mộc',
    amount: 199000,
    coins: 2600,
    method: 'Ví điện tử',
    status: 'success',
    type: 'topup',
    createdAt: daysAgo(0, 8)
  },
  {
    id: 'txn-10027',
    userId: 'u-author-1',
    userName: 'Bạch Tô',
    amount: 32000,
    coins: 0,
    method: 'Xu tác giả',
    status: 'success',
    type: 'promotion',
    createdAt: daysAgo(1, 12)
  },
  {
    id: 'txn-10026',
    userId: 'u-reader-2',
    userName: 'Lam Hồ',
    amount: 99000,
    coins: 1200,
    method: 'Thẻ ngân hàng',
    status: 'pending',
    type: 'topup',
    createdAt: daysAgo(1, 18)
  },
  {
    id: 'txn-10025',
    userId: 'u-reader-1',
    userName: 'Độc giả Hoa Mộc',
    amount: 49000,
    coins: 520,
    method: 'QR chuyển khoản',
    status: 'failed',
    type: 'topup',
    createdAt: daysAgo(3, 9)
  }
];

export const mockAdminReports = [
  {
    id: 'rep-2001',
    type: 'chapter',
    targetTitle: 'Chương 1248: Đế viêm thức tỉnh',
    storyTitle: mockStories[0]?.title || 'Truyện nổi bật',
    userName: 'Độc giả Hoa Mộc',
    reason: 'sai chính tả',
    status: 'open',
    severity: 'medium',
    detail: 'Nhiều lỗi dấu câu ở đoạn chiến đấu cuối chương.',
    createdAt: daysAgo(0, 5)
  },
  {
    id: 'rep-2002',
    type: 'comment',
    targetTitle: 'Bình luận trong Minh Hôn Hoa Đăng',
    storyTitle: mockStories[2]?.title || 'Truyện cổ đại',
    userName: 'Lam Hồ',
    reason: 'nội dung vi phạm',
    status: 'reviewing',
    severity: 'high',
    detail: 'Bình luận có ngôn từ công kích cá nhân, cần ẩn khỏi thảo luận.',
    createdAt: daysAgo(1, 14)
  },
  {
    id: 'rep-2003',
    type: 'story',
    targetTitle: mockStories[6]?.title || 'Truyện đô thị',
    storyTitle: mockStories[6]?.title || 'Truyện đô thị',
    userName: 'Bạn đọc ẩn danh',
    reason: 'lỗi thanh toán',
    status: 'open',
    severity: 'high',
    detail: 'Đã trừ xu khi mua combo nhưng chương VIP vẫn khóa.',
    createdAt: daysAgo(2, 7)
  },
  {
    id: 'rep-2004',
    type: 'chapter',
    targetTitle: 'Chương 73: Vùng tối camera',
    storyTitle: mockStories[7]?.title || 'Trinh thám',
    userName: 'Tịch Chiếu',
    reason: 'thiếu chương',
    status: 'resolved',
    severity: 'low',
    detail: 'Chương đã được tác giả bổ sung lại nội dung.',
    createdAt: daysAgo(5, 15)
  }
];

export const mockViolationComments = [
  {
    id: 'cm-vio-1',
    storyTitle: mockStories[2]?.title || 'Truyện cổ đại',
    userName: 'Lam Hồ',
    body: 'Bình luận bị báo cáo vì công kích người đọc khác.',
    status: 'visible',
    likes: 2,
    createdAt: daysAgo(1, 13)
  },
  {
    id: 'cm-vio-2',
    storyTitle: mockStories[7]?.title || 'Trinh thám',
    userName: 'Bạn đọc đêm',
    body: 'Bình luận chứa spoiler nặng chưa được che.',
    status: 'hidden',
    likes: 9,
    createdAt: daysAgo(4, 11)
  }
];

export const mockAdminNotifications = [
  {
    id: 'noti-admin-1',
    type: 'moderation',
    title: 'Truyện mới đang chờ duyệt',
    body: 'Bạch Tô vừa gửi một truyện mới cần kiểm duyệt trước khi xuất bản.',
    read: false,
    createdAt: daysAgo(0, 6),
    actionText: 'Duyệt truyện',
    actionTo: '/admin/stories'
  },
  {
    id: 'noti-admin-2',
    type: 'chapter',
    title: 'Chương VIP cần xem trước',
    body: 'Có 3 chương VIP mới được tác giả gửi duyệt trong 24 giờ qua.',
    read: false,
    createdAt: daysAgo(0, 9),
    actionText: 'Duyệt chương',
    actionTo: '/admin/chapters'
  },
  {
    id: 'noti-admin-3',
    type: 'transaction',
    title: 'Giao dịch đang chờ thanh toán',
    body: 'Một giao dịch nạp xu qua ngân hàng đang ở trạng thái chờ.',
    read: true,
    createdAt: daysAgo(1, 18),
    actionText: 'Xem giao dịch',
    actionTo: '/admin/transactions'
  },
  {
    id: 'noti-admin-4',
    type: 'reply',
    title: 'Có trả lời bình luận mới',
    body: 'Một bình luận của bạn trong tủ truyện vừa có phản hồi.',
    read: false,
    createdAt: daysAgo(2, 20),
    actionText: 'Xem thông báo',
    actionTo: '/notifications'
  },
  {
    id: 'noti-admin-5',
    type: 'system',
    title: 'Mock realtime đã bật',
    body: 'Khi chưa có realtime backend, hệ thống sẽ tự thêm một thông báo mẫu trên navbar.',
    read: true,
    createdAt: daysAgo(3, 10),
    actionText: 'Cài đặt',
    actionTo: '/settings'
  }
];

export const mockTaxonomy = {
  genres: mockCategories.slice(0, 18),
  tags: ['HOT', 'FULL', 'VIP', 'Editor đề xuất', 'Truyện Việt', 'Chữa lành', 'Cao trào', 'Không CP']
};
