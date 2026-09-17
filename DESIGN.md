# Mobile low-poly UI

## Phạm vi và trải nghiệm

Prototype dành cho Trainee, tiếng Việt, dọc. Login → sảnh → quét/chọn nhà → thông tin
bài → chuẩn bị mẫu. Không có guest training, auth production, QR production hay Unity
trong implementation này. Nút trải nghiệm dùng một hồ sơ mẫu được nhận diện rõ.

Sảnh là bộ sưu tập tòa nhà trên cảnh minh họa isometric, **không phải bản đồ địa lý**.
Chỉ nhà đã lưu mới xuất hiện; có danh sách tìm theo tên không dấu. Quét lại cập nhật
thời gian trên một mục. Các hình tòa nhà là PNG trong suốt, không phải mesh 3D hoặc
nội dung BIM thực. Bản đồ dùng các sprite này trên nền native, tránh tải runtime 3D
cho màn chọn nhà. Gameplay tương lai vẫn thuộc Unity theo kiến trúc dự án.

## Tokens

| Vai trò | Giá trị |
| --- | --- |
| Nền | `#F7F3EA` |
| Bề mặt | `#FFFCF7` |
| Chữ chính / phụ | `#252B2D` / `#626B6B` |
| CTA, chữ than | `#EE8654` |
| Thành công | `#28745C` |
| Lỗi | `#B64035` |
| Font | Be Vietnam Pro, local bundled TTF, 400/500/600/700 |

Nút chính min-height 54; icon button 48; form 56. Tiêu đề 29/39, mục 20/29,
nội dung 15/23, nhãn 14/21. Nhãn phụ 12/19, không dùng cho đoạn đọc chính.
Safe area qua react-native-safe-area-context. Camera tối để nhìn QR; phần UI còn lại sáng.

## Motion storyboard

1. Login ổn định: mô hình minh họa nằm trên form.
2. Sau xác thực **demo** hợp lệ: đóng bàn phím; form fade + dịch 18 px, mô hình thu
   tối đa 18% và nâng 24 px trong 450 ms, easing out cubic.
3. Route đổi với fade 280 ms; tiêu đề sảnh vào nhẹ 350 ms. Không có shared-element
   camera 3D liên tục giữa các screen; tài khoản mới nhận sảnh trống.
4. Người có phiên demo đã lưu vào sảnh trực tiếp. Sheet dùng slide native; bật giảm
   chuyển động thì bỏ slide/fade entrance. Tôn trọng cài đặt hệ thống và tùy chọn app.

Remotion chỉ được dùng làm hướng dẫn storyboard; không thêm runtime/video Remotion
vì user chọn bộ mockup và sau đó yêu cầu dựng giao diện Expo. Thời gian chuẩn bị
1.2 giây là **minh họa UI**, ghi rõ không tải dữ liệu và kết thúc ở thông báo chưa có Unity.

## Ranh giới tích hợp

- `buildings.model.ts` chứa danh mục demo, kiểm tra code, search và upsert id.
- `DemoProvider` lưu đúng dữ liệu mẫu với version và kiểm tra hình dạng khi khôi phục.
  Không chứa token hay mật khẩu; không được tái sử dụng như auth provider production.
- QR dùng exact allowlist và khóa một lần nhận để tránh scanner callback lặp.
  Camera chỉ hoạt động khi screen focus và app foreground.
- Trước launch thật, backend phải kiểm tra QR/training/release còn active, pin session,
  cấp grant và xác minh package. Không suy ra eligibility từ AsyncStorage hoặc card.
- Trợ lý giữ contract POST /chat; có timeout, abort, validation response và UI lỗi.

## Bộ ảnh bàn giao

`pnpm test:e2e` tạo 8 screenshot ở `.codex/local/design/mobile-lowpoly-v1/`:
login, sảnh trống, bản đồ, danh sách, sheet, QR, chuẩn bị và bài không khả dụng.
Đây là ảnh của UI chạy thật trên trình duyệt ở 390 × 844; không chứng minh native
Android đã được nghiệm thu. Gallery local có palette và storyboard, không được track.

## Kiểm tra thiết bị còn cần

- Camera permission lần đầu/bị từ chối/vĩnh viễn; đọc QR thật và background/foreground.
- Keyboard che form, safe area navigation Android, Back đóng sheet, cỡ chữ lớn/TalkBack.
- Haptic và chuyển cảnh trên điện thoại; auth backend, gói Unity và đồng bộ kết quả
  chỉ kiểm tra sau khi tích hợp thật.
