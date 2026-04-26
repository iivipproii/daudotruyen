export const STORY_CATEGORY_GROUPS = [
  { icon: '⚔️', title: 'Võ Hiệp & Kiếm Hiệp', items: ['Tiên Hiệp', 'Kiếm Hiệp', 'Huyền Huyễn', 'Kỳ Ảo', 'Tu Tiên', 'Tu Chân', 'Phong Thần'] },
  { icon: '🏙️', title: 'Hiện Đại & Đô Thị', items: ['Đô Thị', 'Hiện Đại', 'Khoa Huyễn', 'Hệ Thống', 'Đời Sống', 'Doanh Trường', 'Giải Trí', 'Thể Thao', 'Truyện Teen'] },
  { icon: '💗', title: 'Tình Cảm & Romance', items: ['Ngôn Tình', 'Đam Mỹ', 'Bách Hợp', 'Tình Cảm', 'Romance', 'Học Đường', 'Văn Phòng', 'Tổng Tài', 'Ngược', 'Sủng', 'Nữ Cường', 'Nữ Phụ'] },
  { icon: '✨', title: 'Đặc Biệt & Fantasy', items: ['Xuyên Không', 'Xuyên Nhanh', 'Trọng Sinh', 'Dị Giới', 'Võng Du', 'Mạt Thế', 'Dị Năng', 'Siêu Anh Hùng', 'Ma Pháp'] },
  { icon: '🧭', title: 'Hành Động & Phiêu Lưu', items: ['Hành Động', 'Phiêu Lưu', 'Thám Hiểm', 'Sinh Tồn', 'Zombie', 'Quái Vật', 'Siêu Nhiên'] },
  { icon: '🔎', title: 'Kinh Dị & Bí Ẩn', items: ['Kinh Dị', 'Ma Quỷ', 'Linh Dị', 'Trinh Thám', 'Bí Ẩn', 'Tâm Lý', 'Tội Phạm'] },
  { icon: '🏯', title: 'Lịch Sử & Cổ Đại', items: ['Lịch Sử', 'Cổ Đại', 'Cung Đình', 'Cung Đấu', 'Hoàng Gia', 'Chiến Tranh', 'Quân Sự', 'Quan Trường', 'Võ Tướng', 'Đông Phương'] },
  { icon: '🌿', title: 'Hài Hước & Nhẹ Nhàng', items: ['Hài Hước', 'Hài Kịch', 'Parody', 'Slice of Life', 'Ấm Áp', 'Gia Đình', 'Hàng Ngày', 'Điền Văn', 'Gia Đấu'] },
  { icon: '🎮', title: 'Game & Technology', items: ['Game', 'VRMMO', 'LitRPG', 'Công Nghệ', 'AI', 'Cyberpunk', 'Tương Lai'] },
  {
    icon: '🧩',
    title: 'Mở rộng',
    items: [
      'HE', 'SE', 'BE', 'OE', 'Ngọt', 'Chữa Lành', 'Ngược Nam', 'Ngược Nữ', 'Ngược Luyến Tàn Tâm',
      'Truy Thê', 'Trả Thù', 'Vả Mặt', 'Sảng Văn', 'Cưới Trước Yêu Sau', 'Cường Thủ Hào Đoạt',
      'Dưỡng Thê', 'Hào Môn Thế Gia', 'Gương Vỡ Lại Lành', 'Gương Vỡ Không Lành', 'Thế Thân',
      'Nam Phụ Thượng Vị', 'Không CP', 'Ngôn Tình Thực Tế', 'Thanh Xuân Vườn Trường', 'Học Bá',
      'Showbiz', 'Bác Sĩ', 'Cảnh Sát', 'Quân Nhân', 'Dân Quốc', 'Thập Niên', 'Phương Đông',
      'Hoán Đổi Thân Xác', 'Đọc Tâm', 'Nhân Thú', 'Hư Cấu Kỳ Ảo', 'Phép Thuật', 'Xuyên Sách',
      'Có Sử Dụng AI'
    ]
  },
  { icon: '📌', title: 'Quy tắc', items: ['Đề Cử', 'Review truyện', 'Tiểu Thuyết', 'Truyện Sáng Tác', 'Truyện Việt', 'Vô Tri'] },
  { icon: '18+', title: 'Nội dung người lớn', items: ['Sắc', 'H', 'H+', 'Cao H+ (*)'] },
  { icon: '⋯', title: 'Khác', items: ['Phương Tây', 'Light Novel', 'Việt Nam', 'Zhihu', 'Đoản Văn', 'Review Sách', 'Khác'] }
];

export const AUTHOR_CATEGORY_GROUPS = STORY_CATEGORY_GROUPS;

export const AUTHOR_CATEGORIES = STORY_CATEGORY_GROUPS.flatMap(group => group.items);

export const ADULT_CATEGORY_ITEMS = ['Nội dung người lớn', 'Sắc', 'H', 'H+', 'Cao H+ (*)'];
