# Fire3D Mobile UI

Mobile hiển thị các chức năng Trainee có API production: đăng nhập, đăng ký OTP, hồ sơ, avatar, cài đặt tài khoản, Learn, AI, QR Building, chọn bài/chế độ, tải gói, mở phiên Unity, kết quả, phản hồi và hỗ trợ; OrganizationUser chỉ có màn Playtest theo bước. Kết quả chỉ hiện giá trị BE chấm; khi chưa đủ dữ liệu, màn kết quả ghi "Đang chờ đồng bộ". Không hiện mã kỹ thuật (hash, grant, enum) cho học viên.

Giao diện theo Figma "FET3D — Workspace Redesign", trang "08 Mobile App v2" (phong cách game "Bảng nhiệm vụ thoát hiểm"). Token nằm ở `src/theme/tokens.ts`: Dark mặc định (nền `#141719`, bề mặt `#202629`, ember `#EE8654`), Light chỉ đổi token (nền `#ECEFF0`, ember `#AC4410`) và được chọn theo cài đặt hệ thống khi mở app. Bóng cứng, huy hiệu lục giác, ruy băng và diorama giữ nguyên màu ở cả hai chế độ. Font Be Vietnam Pro (Black/ExtraBold cho tiêu đề và nút), icon Lucide.

Thành phần dùng chung ở `src/components/ui`: nút "chunky" bóng đáy 5 px (`Button`), thẻ viền 2 px bóng 4 px (`Card`), `HexBadge`, `Ribbon`, `Field`, `Callout`, `Banner`, `Pill`, `FilterChips`, `ProgressRing`, `Segments`, `StateScreen` cho màn trạng thái/lỗi, `GameTabBar` (Nhà · Learn · nút Quét nổi · Kết quả · Tôi) và `AiFab`. Logo FET3D ở `assets/images/logo-mark.png`; diorama xuất từ Figma ở `assets/images/diorama*.png`.

Nút chính cao tối thiểu 58 px. Chuyển cảnh và hoạt ảnh tôn trọng cài đặt giảm chuyển động của hệ thống. Kiểm tra Android cần bao gồm bàn phím, safe area, TalkBack, chế độ sáng/tối, picker avatar, Google Sign-In, thông báo FCM và link reset.
