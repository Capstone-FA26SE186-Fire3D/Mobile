# Fire3D Mobile

Ứng dụng Expo cho **Trainee**, kết nối với Fire3D API. Các màn đang mở gồm đăng ký OTP, đăng nhập mật khẩu hoặc Google, hồ sơ, avatar, phản hồi và hỗ trợ. Phiên Fire3D do backend cấp là nguồn xác thực; token lưu trong SecureStore trên Android.

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

QR, game, Learn, AI và kết quả được ẩn. BE đã có xác minh mã tham gia và danh sách bài ở một số route, nhưng chưa có QR resolve, session/package/gameplay/result thật cho luồng Trainee. Không dùng các route quản trị Building để suy ra quyền tập huấn. Bản Mobile này chưa nghiệm thu được luồng QR → Unity → kết quả của capstone.

## Kiểm tra

```sh
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm format:check
pnpm exec expo install --check
pnpm exec expo export --platform android --output-dir .expo/export-check
```

Playwright mock API để kiểm tra form, OTP, profile ETag, support, đổi tài khoản và route đã gỡ. Model/API tests kiểm tra Google exchange, onboarding username và định dạng installation key. Các test này không thay cho thử trên Android và BE Azure. Khi có Firebase config hoàn chỉnh và tài khoản thử nghiệm, cần thử Google, OTP, avatar upload, support, FCM delivery, reset link và đăng xuất trên emulator `Pixel_4` có Google Play.

Ma trận API: [docs/be-api-status.md](docs/be-api-status.md). Trạng thái UI: [DESIGN.md](DESIGN.md).
