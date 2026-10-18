# BE ↔ Mobile API status (2026-10-19)

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
| QR / Building | `GET /api/qr/{token}`, `GET /api/qr/{token}/trainings`, `POST /api/buildings/{id}/participation/verify` | Đã nối; QR chờ giữ qua đăng nhập. |
| Chuẩn bị / tải gói | `POST /api/training/sessions` (Idempotency-Key), `GET /api/training/sessions/{id}`, `GET /api/training/sessions/{id}/package`, `POST /api/training/reconcile` | Đã nối. Key lưu bền theo account/bài/chế độ; pin so sánh manifest SHA-256, release, Building, runtime và build target giữa prepare, package và start. `TrainingSessionView.package` không có `revisionId`/`materialLibraryVersion` nên hai giá trị này lấy từ manifest đã kiểm hash. |
| Start / Unity | `POST /api/training/sessions/{id}/start` (Idempotency-Key theo session; grant hết hạn trước launch thì dùng key mới), `/launched`, `/heartbeat`, `/continuation` | Đã nối; cần BE bật live launch và thử trên Android với Unity export. |
| Sync / kết quả | `/events:batch`, `/complete` (200 Completed, 202 AwaitingSync), `GET /result`, `GET /api/training/sessions` | Đã nối; sync khi Completed, khi mở app và khi app hoạt động lại; dùng continuation token khi mất phiên đăng nhập. |
| Playtest | `GET /api/playtests/{id}/package` và các route playtest | Adapter package dùng chung; event playtest không gửi `elapsedMs` vì `PlaytestEvent` của BE không có trường này. Màn playtest chưa có nút tải/mở Unity. |
| Learn/AI | Learn public, bookmark, AI request | Xem `app/learn`, `app/ai`. |

Thiết kế package/metadata cho Training (đề xuất Docs 15/10/2026, chưa có contract BE): package có thể chia theo tầng kèm `building_metadata.json` có `interactables`; Mobile tải và kiểm hash từng phần, không xử lý IFC; event tương tác mới đi qua queue sync hiện có. Xem [IFC ingestion, hiển thị và tương tác](../../Docs/ifc_ingestion_visual_interaction.md) mục 5.7 và 6.

`google-services.json` hiện chưa có Android OAuth client. Cấu hình Firebase bên ngoài repo và thử trên emulator là điều kiện còn lại để xác nhận Google/FCM. Kết quả Playwright dùng API mock không được xem là nghiệm thu BE Azure.
