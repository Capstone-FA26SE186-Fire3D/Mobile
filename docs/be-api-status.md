# BE ↔ Mobile API status (2026-10-10)

Mobile hiện chỉ phục vụ `Trainee`. Ma trận đối chiếu với OpenAPI Azure và source BE; một route xuất hiện trong OpenAPI không chứng minh tích hợp provider hoặc thiết bị đã hoạt động.

| Luồng | BE endpoint | Mobile |
| --- | --- | --- |
| Đăng ký OTP | `POST /api/auth/registration/request-otp`, `POST /api/auth/registration/verify-otp`, `POST /api/auth/register/trainee` | Đã nối form và proof một lần. |
| Phiên local | `POST /api/auth/login`, `/refresh`, `/logout`, `/logout-all`; `GET /api/auth/me` | Đã nối; Android lưu token trong SecureStore. |
| Google | `POST /api/auth/login-firebase`, `POST /api/auth/google/onboarding/complete`, `POST /api/me/link-google` | Đã nối Android development build và xử lý `Authenticated`, `OnboardingRequired`, `ACCOUNT_LINK_REQUIRED`. Cần SHA-1, Android OAuth client và smoke test Firebase/BE. |
| Push | `PUT /api/auth/devices`, `DELETE /api/auth/devices/{deviceUuid}` | Đã nối FCM device token, UUID, installation key; cần smoke test binding và delivery trên Android. |
| Hồ sơ | `PATCH /api/auth/me`, `POST /api/auth/change-password`, forgot/reset | Đã nối; mutation hồ sơ dùng ETag. |
| Avatar | `GET /api/me/avatar`, upload intent/complete, `DELETE /api/me/avatar` | Đã nối; cần thử upload thật với signed URL. |
| Hỗ trợ | `GET/POST /api/feedback`, `GET/POST /api/support/tickets`, ticket/messages | Đã nối. |
| Link email cũ | `POST /api/auth/verify-email` | Giữ cho link cũ; đăng ký mới dùng OTP. |
| Building | `POST /api/buildings/{id}/participation/verify`, `GET /api/buildings/{id}/trainings` | BE có một phần quyền Trainee; Mobile chưa mở vì thiếu QR resolve và session thật. |
| Training/game/result/Learn/AI | Chưa có contract Trainee đầy đủ cho QR resolve, session/package/result và các luồng này | Ẩn route và nút; không dùng dữ liệu mẫu. |

`google-services.json` hiện chưa có Android OAuth client. Cấu hình Firebase bên ngoài repo và thử trên emulator là điều kiện còn lại để xác nhận Google/FCM. Kết quả Playwright dùng API mock không được xem là nghiệm thu BE Azure.
