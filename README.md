# Fire3D Mobile

Ứng dụng Expo cho **Trainee**, kết nối với Fire3D API. Các màn đang mở gồm đăng ký OTP, đăng nhập mật khẩu hoặc Google, hồ sơ, avatar, Learn, trợ lý AI, QR Building, chọn bài/chế độ, tải gói và mở phiên Unity, kết quả/lịch sử, phản hồi và hỗ trợ. Phiên Fire3D do backend cấp là nguồn xác thực; token lưu trong SecureStore trên Android.

## Thiết lập

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm exec expo run:android --device Pixel_4
```

Máy build Android cần JDK 17 (`JAVA_HOME` trỏ tới JDK 17) và Android SDK. Google Sign-In, Firebase Auth và FCM cần **Android development build**; Expo Go và web preview không kiểm chứng được các tính năng native này. Web preview dùng `pnpm web` để kiểm tra form và điều hướng.

`.env.example` chứa URL API Azure và **public web OAuth client ID** của Firebase. Trước khi thử Google trên Android:

1. Lấy SHA-1 của chứng chỉ ký development build, thêm vào Android app `com.fet3d.app` trong Firebase project `fire3d-e6b00`.
2. Bật Google provider trong Firebase Authentication, tải lại `google-services.json` vào thư mục Mobile và xác nhận file có Android OAuth client.
3. Build lại development app. Thay đổi `google-services.json` không có hiệu lực qua Metro reload.

Sau đăng nhập, app xin quyền thông báo và lấy **FCM device token** bằng `expo-notifications`. UUID và installation key 32 byte được tạo ngẫu nhiên, lưu trong SecureStore; app gọi `PUT /api/auth/devices` và cập nhật khi token đổi. Đăng xuất thu hồi binding bằng `DELETE /api/auth/devices/{deviceUuid}` trước khi xóa phiên. Nếu thu hồi không thành công do mạng, phiên vẫn còn để người dùng thử lại. Trong Cài đặt tài khoản có nút đăng ký lại thông báo.

## Luồng tài khoản

- Đăng ký Trainee: email → OTP → username và hồ sơ → tạo tài khoản. Sau đó đăng nhập.
- Google: Google Sign-In → Firebase Auth → Firebase ID token gửi `/api/auth/login-firebase`. `OnboardingRequired` mở form username Trainee. Nếu BE trả `ACCOUNT_LINK_REQUIRED`, đăng nhập bằng mật khẩu Fire3D rồi liên kết Google trong Cài đặt tài khoản; liên kết lần đầu có thể yêu cầu đăng nhập lại.
- Phiên: `/api/auth/login`, `/api/auth/refresh`, `/api/auth/me`, `/api/auth/logout`, `/api/auth/logout-all`. Hồ sơ và avatar dùng ETag từ `GET /api/auth/me`.
- Quên mật khẩu, reset và xác minh email cũ có màn deep link `fire3d://reset-password?token=...` và `fire3d://verify-email?token=...`. BE hiện gửi link theo `AuthEmail:FrontendUrl`; cần cấu hình URL chuyển tiếp tới app để email mở trực tiếp Mobile.
- Hỗ trợ: phản hồi, ticket và tin nhắn qua API Fire3D.

## Luồng tập huấn (QR → Unity → kết quả)

- Quét QR/deep link `https://fet3d.io.vn/qr/<token>` → đăng nhập (QR chờ được giữ qua đăng nhập) → nhập mã tham gia nếu Building Private → danh sách bài được phép (`app/qr/[token].tsx`).
- Chọn bài → `app/training/[trainingId].tsx`: chọn Learn / Guided Drill / Assessment theo `allowedModes`, chuẩn bị phiên (`POST /api/training/sessions`, Idempotency-Key lưu theo account/bài/chế độ), tải và kiểm SHA-256 package (`GET /api/training/sessions/{id}/package`; URL ký 10 phút được lấy lại khi hết hạn; có tiến độ, hủy, thử lại và tải tiếp phần đã kiểm), rồi bấm **Bắt đầu phiên** (online start, key lưu theo session) để mở Unity.
- Sau `Completed`, app gửi event và completion rồi mở `app/training/session/[sessionId].tsx`: kết quả do BE chấm, hoặc **Đang chờ đồng bộ** khi BE trả `AwaitingSync` hoặc còn event chưa gửi. Mất mạng sau khi start vẫn chơi tiếp; event nằm trong queue SQLite bền và tự đồng bộ khi app hoạt động lại. Không bắt đầu phiên mới khi offline.
- Lịch sử (`app/history`) mở kết quả, hoặc trạng thái đồng bộ của phiên chưa có kết quả.
- Web, Expo Go hoặc bản build chưa có Unity: xem được bài và chuẩn bị phiên; phần tải gói/vào phiên hiển thị thông báo cần ứng dụng Android có Unity.

Bridge, package và giới hạn Unity: [docs/unity-integration.md](docs/unity-integration.md).

## Build APK Android có Unity

1. Trong Unity: **Fire3D → Build → Export Unity Library for Mobile**. Kết quả nằm cạnh thư mục export: `fet3d-unityLibrary-<version>.zip` và `<zip>.json` (version, SHA-256).
2. Trong Mobile:

```sh
pnpm unity:prepare --zip <đường dẫn>/fet3d-unityLibrary-<version>.zip
cp .env.example .env
pnpm android:prebuild
cd android && ./gradlew assembleRelease
```

APK: `android/app/build/outputs/apk/release/app-release.apk` (arm64-v8a, ký bằng debug keystore để cài thử). `--zip` kiểm SHA-256 theo file `.json`, không cần S3 và không sửa `unity-artifact.lock.json`. Bản phát hành chính thức thì upload zip lên S3, pin `version`/`s3Uri`/`sha256` trong lock rồi chạy `pnpm unity:prepare` không tham số.

Windows: bật _long paths_ (`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 1`, khởi động lại máy) nếu checkout nằm sâu; nếu không, đường dẫn C++ của `react-native-gesture-handler` vượt 260 ký tự và bước `buildCMake` lỗi.

## Kiểm tra

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm format:check
pnpm exec expo install --check
pnpm exec expo export --platform android --output-dir .expo/export-check
```

Playwright mock API để kiểm tra form, OTP, profile ETag, support, đổi tài khoản, route đã gỡ và luồng QR → bài → chế độ → chuẩn bị phiên/kết quả (web không có Unity). Model/API tests kiểm tra Google exchange, onboarding username, định dạng installation key và adapter package/session (`tests/training.test.mjs`). Các test này không thay cho thử trên Android và BE Azure. Khi có Firebase config hoàn chỉnh và tài khoản thử nghiệm, cần thử Google, OTP, avatar upload, support, FCM delivery, reset link và đăng xuất trên emulator `Pixel_4` có Google Play.

Ma trận API: [docs/be-api-status.md](docs/be-api-status.md). Trạng thái UI: [DESIGN.md](DESIGN.md).
