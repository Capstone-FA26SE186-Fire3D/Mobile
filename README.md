# Fire3D Mobile

Ứng dụng React Native / Expo cho người tập huấn, phong cách low-poly với nền kem,
điểm nhấn cam và font Be Vietnam Pro. Đăng nhập Trainee dùng API .NET;
gameplay POV 2.5D, tòa nhà và QR mẫu vẫn dùng dữ liệu cục bộ, chưa nối Unity.

## Chạy và trải nghiệm

```sh
pnpm install --frozen-lockfile
pnpm start
# Android / bản xem thử trên trình duyệt
pnpm android
pnpm web
```

Web preview chạy ở `http://localhost:8085`. Expo Go/dev build phải tương thích SDK 57;
không thể suy ra chạy trên thiết bị chỉ từ bản xem web hoặc bundle export.

- Sao chép `.env.example` thành `.env`, cấu hình `EXPO_PUBLIC_API_BASE_URL`, rồi chạy lại Expo.
  Android emulator dùng `http://10.0.2.2:5173`; điện thoại thật cần IP LAN của máy chạy BE.
- Chọn **Chưa có tài khoản? Đăng ký** để tạo tài khoản Trainee. Nhập form gồm username,
  email, mật khẩu và thông tin hồ sơ; Mobile gọi `request-otp`, xác minh mã 6 chữ số,
  rồi gửi proof một lần tới `register/trainee`. Mã có hạn 10 phút; gửi lại tuân cooldown
  và giới hạn của BE. Đăng ký thành công chưa tạo phiên; quay về màn đăng nhập.
  Ảnh đại diện được chọn/tải lên sau khi đăng nhập, không nhập URL ngoài vào form.
- Đăng nhập bằng tài khoản Fire3D. Phiên được lưu bằng SecureStore trên thiết bị,
  khôi phục qua `/api/auth/me` và `/api/auth/refresh`, thu hồi khi gọi `/api/auth/logout`.
- Nếu quên mật khẩu, dùng **Quên mật khẩu?** để gửi yêu cầu. Mobile có màn
  `/reset-password?token=...` và `/verify-email?token=...` cho liên kết mở trong app.
  BE hiện tạo liên kết theo `AuthEmail:FrontendUrl` (FE web); để email mở Mobile trực tiếp,
  cấu hình URL chuyển tiếp/deep link cho hai đường dẫn này. FE hiện có trang đặt lại mật khẩu
  nhưng chưa có trang xác minh email.
- Bấm **Khám phá bản trải nghiệm**, hoặc dùng `demo@fire3d.vn` / `Fire3D123!` để vào demo cục bộ.
- Tài khoản mới có sảnh trống. Bấm **Xem sảnh với 3 tòa nhà mẫu**, hoặc nhập mã
  `F3D-ANBINH`, `F3D-HOASEN`, `F3D-MINHKHAI` ở màn quét QR.
- Camera đọc QR chứa chính xác một mã mẫu hoặc deep link `fire3d://demo/an-binh`
  (tương tự `hoa-sen`, `minh-khai`). Không mở URL tùy ý từ QR.
- Quét lại cập nhật tòa nhà đã lưu, không nhân đôi. Minh Khai minh họa bài đã đóng.
- Chạm tòa nhà → chọn bài → chọn Learn, Guided Drill hoặc Assessment → chạy cảnh
  POV 2.5D → xem debrief. Màn chuẩn bị ghi rõ chỉ dùng dữ liệu local, không giả tải
  package, kiểm tra entitlement hoặc mở Unity.
- Có thể tạm dừng, lưu checkpoint, tiếp tục sau khi reload và xem lịch sử kết quả.
  Session/result mang trạng thái `local-only`, không được trình bày như đã sync backend.
- Tài khoản Fire3D hiển thị hồ sơ từ `/api/auth/me`; dữ liệu mẫu tòa nhà, phiên demo
  và kết quả vẫn lưu cục bộ. Mật khẩu không được lưu.
- **Cài đặt tài khoản** cho Trainee dùng ETag từ `GET /api/auth/me` khi sửa họ tên,
  username, ngày sinh, giới tính, số điện thoại hoặc hoàn tất/xóa avatar.
  `/api/auth/change-password` thu hồi phiên; `/api/auth/logout-all` đăng xuất mọi thiết bị.
  Ảnh JPEG/PNG/WebP tối đa 5 MB được tải qua URL ký sẵn. `resend-verification`
  chỉ dùng để gửi lại OTP trong lúc đăng ký; `/verify-email` chỉ còn cho link cũ.
- **Phản hồi và hỗ trợ** gọi `GET/POST /api/feedback` và `GET/POST /api/support/tickets`,
  cùng route xem ticket và gửi tin nhắn. Chỉ hiện cho tài khoản Trainee thật.
- Lỗi đăng ký hiển thị mã HTTP và `traceId` của BE nếu có. API trả
  `application/problem+json` được đọc như JSON; mã này giúp tra log BE khi có lỗi 5xx.
- BE hiện chưa có API Trainee để resolve QR/tìm tòa nhà, liệt kê bài tập, tạo session,
  lưu kết quả hoặc hỏi AI. `GET /api/buildings/{id}/trainings` hiện đi qua `IfcAccess`
  và từ chối Trainee; không dùng endpoint quản trị này để mở nội dung người học.
- Đã thêm Firebase Android config; Google Sign-In vẫn chưa nối vào app và file
  `google-services.json` chưa có Android SHA-1. FCM cần cấu hình push trước khi đăng ký
  `PUT /api/auth/devices`; không gửi token giả hoặc tạo installation key yếu.
- Tài khoản có giảm chuyển động, nạp/xóa dữ liệu mẫu (có xác nhận) và đăng xuất.
- Trợ lý tài liệu giữ API `POST /chat` hiện có. Copy `.env.example` sang `.env` rồi
  cấu hình `EXPO_PUBLIC_RAG_API_URL` để dùng. Android emulator dùng `10.0.2.2` để
  kết nối host; điện thoại thật cần địa chỉ mạng phù hợp. Không có key bí mật trong app.

## Cấu trúc file

```text
app/                       # Chỉ route, guard và layout Expo Router
  (tabs)/                  # Tòa nhà / Kết quả / Tài khoản
  training/[id].tsx         # Route động; feature xác minh id và nhà đã lưu
assets/images/             # Ba asset low-poly, nguồn/prompt trong README
src/
  components/ui/           # Text, Button, Screen, Notice dùng chung
  features/
    auth/screens/          # Login và chuyển cảnh
    buildings/             # Model, bản đồ, bảng thông tin, sảnh, danh sách
    qr/screens/            # Camera, quyền, nhập/kiểm tra mã
    training/screens/      # Chọn bài, mode và trạng thái chuẩn bị mẫu
    game/                  # Scene engine thuần và màn gameplay POV 2.5D
    results/screens/       # Lịch sử local và debrief cá nhân
    profile/screens/       # Tài khoản demo và tùy chọn
    chat/                  # Màn RAG cũ, API tách riêng trong services/
  store/                   # Context và validation dữ liệu demo cục bộ
  theme/                   # Design tokens: màu, font, bóng
tests/                     # Model tests + browser flow tests
```

Route import screen từ feature; feature có thể import UI, theme, store dùng chung.
UI dùng chung không import nghiệp vụ. Type/service thuộc tính năng nào ở tính năng đó.
Chưa tạo `navigation/`, `utils/`, `hooks/` hoặc tầng repository rỗng. Khi nối backend,
thay nguồn dữ liệu demo bằng service theo feature; demo flag không phải xác thực hoặc
phân quyền thật. Package ThreeUI đã có trong worktree được giữ nguyên nhưng không import:
component React DOM/CSS của package không dùng trực tiếp cho native.

## Kiểm tra

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm format:check
pnpm exec expo install --check
pnpm exec expo export --platform android --output-dir .expo/export-check
```

Model tests dùng Node 24 (chạy TypeScript trực tiếp). Browser tests dùng Chrome cài sẵn,
tự chạy/reuse server 8085 và lưu screenshot/trace trong `.codex/local/` được ignore.
Chúng kiểm tra UX web của code React Native; camera trên thiết bị, Android Back,
TalkBack, bàn phím thật và Unity cần kiểm chứng riêng trên Android. Gameplay Expo là
mock giao diện có tương tác, không phải bằng chứng cho hiệu năng hoặc bridge Unity.

Chi tiết thiết kế và trạng thái bàn giao: [DESIGN.md](DESIGN.md).

## Package manager

Use pnpm 10.28.2 (pinned in `package.json`). With Corepack installed, run `corepack enable` and `corepack prepare pnpm@10.28.2 --activate` once; verify `pnpm --version`.

- Install: `pnpm install --frozen-lockfile`.
- Expo/native packages: `pnpm exec expo install <package> --pnpm`.
- Other packages: `pnpm add <package>` or `pnpm add -D <package>`.
- Start: `pnpm start`; Android: `pnpm android`; typecheck: `pnpm typecheck`.
- Commit `pnpm-lock.yaml` with dependency changes. Use pnpm in this repository; do not generate npm/yarn lockfiles.

Keep React Native and native packages compatible with the installed Expo SDK; do not replace their version ranges with `latest`. After changing dependencies, run `pnpm exec expo install --check`, `pnpm typecheck`, and `pnpm exec expo export --platform android --output-dir .expo/export-check` before merging.

## Codex cho thành viên team

Sau khi checkout nhánh có bộ hướng dẫn, mở repo bằng Codex và yêu cầu:

> Đọc AGENTS.md và .codex/bootstrap.md, khởi tạo các file Codex còn thiếu; giữ nguyên file đã có, gồm bộ ở workspace cha nếu đúng cấu trúc Fire3D.

- Git pull chỉ tải hướng dẫn, không tự chạy Codex. [Quy trình bootstrap](.codex/bootstrap.md) tạo local notes bị ignore; chỉ dựng bộ workspace cha khi nhận diện đủ AI/BE/Docs/FE/Mobile và được phép ghi.
- Nếu chỉ clone repo này, Codex tạo phần local của repo, không ghi vào thư mục cha. Không ghi trong Plan Mode.
- File cá nhân không được push; quy tắc và kiến thức team nằm trong bộ hướng dẫn được track.
