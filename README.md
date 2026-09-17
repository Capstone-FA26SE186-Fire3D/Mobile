# Fire3D Mobile

Ứng dụng React Native / Expo cho người tập huấn, phong cách low-poly với nền kem,
điểm nhấn cam và font Be Vietnam Pro. Hiện là **prototype tương tác**, chưa kết nối
đăng nhập backend, hệ thống QR thật hoặc Unity. Không dùng tài khoản/mật khẩu thật.

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

- Bấm **Khám phá bản trải nghiệm**, hoặc dùng `demo@fire3d.vn` / `Fire3D123!`.
- Tài khoản mới có sảnh trống. Bấm **Xem sảnh với 3 tòa nhà mẫu**, hoặc nhập mã
  `F3D-ANBINH`, `F3D-HOASEN`, `F3D-MINHKHAI` ở màn quét QR.
- Camera đọc QR chứa chính xác một mã mẫu hoặc deep link `fire3d://demo/an-binh`
  (tương tự `hoa-sen`, `minh-khai`). Không mở URL tùy ý từ QR.
- Quét lại cập nhật tòa nhà đã lưu, không nhân đôi. Minh Khai minh họa bài đã đóng.
- Chạm tòa nhà → xem bài → vào tập huấn. Màn chuẩn bị ghi rõ chỉ là demo, không giả
  tải package, tạo session, kết quả hay mở Unity.
- Tài khoản có giảm chuyển động, nạp/xóa dữ liệu mẫu (có xác nhận) và đăng xuất.
  Phiên demo cùng danh sách nhà được lưu cục bộ; không lưu mật khẩu.
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
    training/screens/      # Chi tiết và trạng thái chuẩn bị mẫu
    results/screens/       # Trạng thái chưa có kết quả
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
TalkBack, bàn phím thật và Unity cần kiểm chứng riêng trên Android.

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
