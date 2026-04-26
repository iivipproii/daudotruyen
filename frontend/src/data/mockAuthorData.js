export const authorGenres = [
  'Tiên hiệp',
  'Huyền huyễn',
  'Đô thị',
  'Ngôn tình',
  'Trinh thám',
  'Xuyên không',
  'Trọng sinh',
  'Khoa huyễn',
  'Kiếm hiệp',
  'Chữa lành',
  'Hài hước',
  'Truyện Việt'
];

export const authorTags = [
  'tu tiên',
  'hệ thống',
  'nữ cường',
  'ngọt',
  'ngược',
  'showbiz',
  'dị năng',
  'cổ đại',
  'học đường',
  'mạt thế',
  'hài hước',
  'slow burn'
];

export const mockAuthorStories = [
  {
    id: 'author-story-1',
    slug: 'thanh-pho-khong-ngu',
    title: 'Thành Phố Không Ngủ',
    cover: '/images/cover-8.jpg',
    shortDescription: 'Điều tra viên theo dấu chuỗi án mạng trong thành phố nơi mọi camera đều nói dối.',
    description: 'Một điều tra viên trẻ bị cuốn vào chuỗi vụ án kỳ lạ, nơi dữ liệu, ký ức và lời khai đều có thể bị chỉnh sửa. Càng đi sâu, cô càng phát hiện thành phố này chưa từng ngủ vì nó luôn cần che giấu một sự thật.',
    genres: ['Trinh thám', 'Đô thị', 'Tâm lý'],
    tags: ['bí ẩn', 'điều tra', 'đô thị'],
    status: 'ongoing',
    publishStatus: 'published',
    approvalStatus: 'approved',
    type: 'mixed',
    vipFromChapter: 12,
    chapterPrice: 3,
    comboPrice: 199,
    chapters: 72,
    views: 342018,
    follows: 9340,
    revenue: 18420,
    comments: 326,
    updatedAt: '2026-04-26T02:30:00.000Z'
  },
  {
    id: 'author-story-2',
    slug: 'sau-khi-trong-sinh-ta-mo-tiem-sach',
    title: 'Sau Khi Trọng Sinh Ta Mở Tiệm Sách',
    cover: '/images/cover-5.jpg',
    shortDescription: 'Trở lại tuổi mười tám, cô mở một tiệm sách nhỏ nơi mọi vị khách đều mang bí mật.',
    description: 'Một câu chuyện chữa lành về lựa chọn thứ hai trong đời. Nhân vật chính trở lại tuổi mười tám và chọn sống chậm, nhưng tiệm sách của cô lại trở thành điểm giao của những số phận chưa kịp nói lời tạm biệt.',
    genres: ['Trọng sinh', 'Chữa lành', 'Đô thị'],
    tags: ['chữa lành', 'trọng sinh', 'đời thường'],
    status: 'ongoing',
    publishStatus: 'published',
    approvalStatus: 'approved',
    type: 'free',
    vipFromChapter: 0,
    chapterPrice: 0,
    comboPrice: 0,
    chapters: 144,
    views: 281760,
    follows: 6120,
    revenue: 6420,
    comments: 184,
    updatedAt: '2026-04-25T17:45:00.000Z'
  },
  {
    id: 'author-story-3',
    slug: 'ban-nhap-quan-tra-di-gioi',
    title: 'Bản Nháp Quán Trà Dị Giới',
    cover: '/images/cover-10.jpg',
    shortDescription: 'Một quán trà xuyên qua nhiều thế giới, nơi mỗi chén trà đổi lấy một câu chuyện.',
    description: 'Bản thảo đang hoàn thiện về một quán trà ở rìa các thế giới. Mỗi khách ghé quán phải kể lại ký ức quan trọng nhất để đổi lấy một chén trà có thể thay đổi số phận.',
    genres: ['Xuyên không', 'Chữa lành', 'Dị giới'],
    tags: ['dị giới', 'ấm áp', 'quán trà'],
    status: 'paused',
    publishStatus: 'draft',
    approvalStatus: 'draft',
    type: 'vip',
    vipFromChapter: 1,
    chapterPrice: 5,
    comboPrice: 149,
    chapters: 18,
    views: 40210,
    follows: 920,
    revenue: 1210,
    comments: 42,
    updatedAt: '2026-04-18T09:00:00.000Z'
  }
];

export const mockAuthorChapters = [
  { id: 'ch-1', storyId: 'author-story-1', number: 70, title: 'Camera thứ năm', status: 'published', access: 'vip', words: 3280, views: 18220, comments: 42, revenue: 1240, scheduledAt: '', updatedAt: '2026-04-24T08:20:00.000Z' },
  { id: 'ch-2', storyId: 'author-story-1', number: 71, title: 'Ngã tư không đèn', status: 'published', access: 'vip', words: 3560, views: 16420, comments: 38, revenue: 1110, scheduledAt: '', updatedAt: '2026-04-25T10:20:00.000Z' },
  { id: 'ch-3', storyId: 'author-story-1', number: 72, title: 'Camera thứ bảy', status: 'pending', access: 'vip', words: 2980, views: 9240, comments: 21, revenue: 760, scheduledAt: '', updatedAt: '2026-04-26T02:30:00.000Z' },
  { id: 'ch-4', storyId: 'author-story-2', number: 143, title: 'Vị khách sau cơn mưa', status: 'published', access: 'free', words: 2410, views: 12330, comments: 17, revenue: 0, scheduledAt: '', updatedAt: '2026-04-24T16:00:00.000Z' },
  { id: 'ch-5', storyId: 'author-story-2', number: 144, title: 'Lá thư trong ngăn kéo', status: 'draft', access: 'free', words: 1820, views: 0, comments: 0, revenue: 0, scheduledAt: '', updatedAt: '2026-04-25T17:45:00.000Z' }
];

export const mockRevenueRows = [
  { label: 'T2', revenue: 780, reads: 4200 },
  { label: 'T3', revenue: 920, reads: 5100 },
  { label: 'T4', revenue: 1160, reads: 6400 },
  { label: 'T5', revenue: 980, reads: 5900 },
  { label: 'T6', revenue: 1420, reads: 7200 },
  { label: 'T7', revenue: 1880, reads: 8600 },
  { label: 'CN', revenue: 1610, reads: 7900 }
];

export const mockAuthorTransactions = [
  { id: 'rev-1008', storyTitle: 'Thành Phố Không Ngủ', chapterTitle: 'Camera thứ bảy', amount: 420, status: 'success', createdAt: '2026-04-26T08:00:00.000Z' },
  { id: 'rev-1007', storyTitle: 'Thành Phố Không Ngủ', chapterTitle: 'Ngã tư không đèn', amount: 360, status: 'success', createdAt: '2026-04-25T13:00:00.000Z' },
  { id: 'rev-1006', storyTitle: 'Bản Nháp Quán Trà Dị Giới', chapterTitle: 'Khách qua đường', amount: 180, status: 'pending', createdAt: '2026-04-24T09:00:00.000Z' }
];

export const mockPromotionPackages = [
  { id: 'promo-1', title: 'Đẩy top trang chủ', days: 3, price: 120, reach: '25.000 lượt hiển thị', features: ['Gắn nhãn đề xuất', 'Ưu tiên trong mục hot'] },
  { id: 'promo-2', title: 'Gói tăng trưởng', days: 7, price: 260, reach: '80.000 lượt hiển thị', features: ['Banner thể loại', 'Đẩy top tìm kiếm', 'Báo cáo hiệu quả'], featured: true },
  { id: 'promo-3', title: 'Ra mắt truyện mới', days: 5, price: 180, reach: '45.000 lượt hiển thị', features: ['Thông báo độc giả phù hợp', 'Chip new launch'] }
];

export const mockPromotionHistory = [
  { id: 'ph-1', packageName: 'Gói tăng trưởng', storyTitle: 'Thành Phố Không Ngủ', cost: 260, status: 'active', createdAt: '2026-04-24T10:00:00.000Z' },
  { id: 'ph-2', packageName: 'Ra mắt truyện mới', storyTitle: 'Sau Khi Trọng Sinh Ta Mở Tiệm Sách', cost: 180, status: 'completed', createdAt: '2026-04-14T10:00:00.000Z' }
];
