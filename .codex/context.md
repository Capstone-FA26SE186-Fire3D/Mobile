# Context — Mobile

## Hiện trạng đã kiểm tra

- Expo + React Native + TypeScript, Expo Router theo [package.json](../package.json).
- UI prototype Fire3D có login demo, sảnh tòa nhà low-poly, danh sách/search, camera/nhập QR mẫu, chi tiết/chuẩn bị tập huấn, kết quả trống và tài khoản demo. Route ở `app/`, nghiệp vụ ở `src/features/`, UI chung ở `src/components/ui/`, tokens ở `src/theme/`.
- Chat cũ được giữ tại `src/features/chat/`, gọi `POST /chat` qua `EXPO_PUBLIC_RAG_API_URL`; không có xác thực backend mới.
- Scripts có `start`, `android`, `web`, `typecheck`, `test`, `test:e2e`, `format:check`. Tests browser không thay kiểm chứng thiết bị Android.
- Stack đã chốt trong Docs là React Native/Expo với native Android Unity bridge. Prototype hiện **chưa** có bridge, runtime hoặc auth/QR backend; hình low-poly chỉ là PNG sprite minh họa.
- Chưa thấy Unity project trong workspace. BIM 3D với camera cố định cho trải nghiệm 2.5D là hướng người dùng mong muốn, không phải tính năng đã triển khai.

## Kiến trúc tích hợp đích — 2026-09-17

- Mobile giữ React Native + Expo. Unity là runtime gameplay được mở qua native Android bridge; Expo không thay Unity bằng scene 3D tự dựng.
- Đăng nhập production dùng Firebase Authentication với Google Sign-In. Mobile gửi Firebase ID token tới C#/.NET backend; không tự suy ra role/tenant và không dùng Supabase Auth.
- Push notification dùng Firebase Cloud Messaging. FCM registration token được quản lý theo installation, có rotate/revoke và không được dùng như credential đăng nhập.
- Mobile không truy cập trực tiếp Supabase PostgreSQL/`pgvector` hoặc AWS S3 bằng service credential. Backend trả signed S3 URL TTL ngắn cho đúng release/session; app tải và verify hash/schema/runtime trước khi mở Unity.
- RAG production thuộc Python/FastAPI và `pgvector`; provider LLM là OpenAI hoặc Gemini sau khi chốt. Mobile chỉ dựa vào API contract chung, không khóa UI vào SDK/provider cụ thể.
- AI/RAG FastAPI chạy riêng trên Azure; Container Apps là phương án triển khai đề xuất. Mobile production gọi `.NET API` để backend kiểm tra identity, tenant, quota/consent và request idempotency. Mobile chỉ nhận response/citations/usage kỹ thuật, không tự tính overage hoặc gọi AI trực tiếp như prototype cũ; timeout phải tra cứu request status trước khi retry.
- Mobile production gọi API qua endpoint Nginx đã chốt; Nginx chuyển request tới .NET API. Domain, TLS và endpoint theo môi trường là cấu hình triển khai, không hard-code vào app.
- Luồng runtime mục tiêu tách rõ: Building QR → danh sách bài đã publish → người học chọn bài → tạo preparation/idempotency record → tải/verify phần package còn thiếu → `POST /api/training/sessions/{sessionId}/start` online kiểm tra entitlement/QR/release/scenario/package/runtime → cấp launch grant pin `training/release/scenario` → mở Unity. Hết hạn chặn session mới; phiên đã start vẫn được tiếp tục và sync kết quả sau khi có mạng.
- OrganizationUser playtest là luồng riêng: nhận package draft/version đã verify từ web/backend, start với Trial còn quota thử hoặc Building entitlement Active, không dùng QR Trainee, không ghi learner analytics; entitlement hết hạn sau start không cắt playtest.
- Unity/native Android bridge là một phần kiến trúc đích, không phải skill bị loại trừ. Cần development/native build (không dùng Expo Go để chứng minh tích hợp), truyền event/session/package tối thiểu qua bridge và không gửi credential dài hạn vào Unity.
- AI Trainee dùng web/mobile ngoài gameplay với daily quota; không truy cập tài liệu organization. Mobile hiển thị nguồn, trạng thái quota/lỗi và debrief cá nhân theo API contract.
- AI response phải phân biệt `KnowledgeAnswer` với `ScenarioDraft/NeedsUserEdit`; `InsufficientEvidence`/`RejectedBySafetyGate` là status riêng và `NeedsUserEdit` chỉ dành cho ScenarioDraft. Mobile hiển thị citation/request/usage/error/safety gate theo contract, không tự trừ quota hoặc quyết định overage.
- Runtime compatibility dùng server-owned catalog và semver `major.minor.patch`; Mobile gửi runtime version, không tự khai capability. Start online là actor-bound và package/schema phải được catalog xác nhận trước khi mở Unity.

## Contract hardening — 2026-09-18

- Mobile không sửa package/artifact đã pin và không tự quyết định runtime capability; manifest capability sai kiểu/null/rỗng hoặc hash/provenance thiếu phải chặn trước Unity.
- Worker/AI status chỉ hiển thị mã backend ổn định; timeout AI tra request status trước retry. Session đã start vẫn sync sau hết hạn/mất mạng, còn preparation/start mới bị gate online.
- Playtest OrganizationUser là luồng riêng; không QR Trainee, không learner analytics. Các acceptance về concurrency/permission/recovery vẫn chưa được chạy trên database/thiết bị.
- Mobile verify package hash, manifest hash, build target, protocol/schema và runtime catalog trước khi mở Unity; package cache không thay thế online start.

## Contract cập nhật — 2026-09-18

- Mobile gửi runtime version và start idempotency key; không tự khai capability và không được bắt đầu offline. Cùng key chỉ replay khi runtime payload giống request cũ; package thiếu metadata hoặc không tương thích thì không mở Unity.
- Khi AI timeout, Mobile tra request status qua `.NET API` trước retry; Mobile chỉ hiển thị citations/usage kỹ thuật, không tự trừ quota hoặc tính overage.
- Duplicate heartbeat/event không được làm mới activity hoặc tạo analytics trùng; backend dùng sequence/event ID server-received để deduplicate. Playtest là luồng OrganizationUser riêng, không dùng QR Trainee và không vào learner analytics.

## Chạy và kiểm tra

Từ gốc Mobile, sau khi dependencies đã sẵn sàng theo [README](../README.md):
- `pnpm typecheck`: kiểm tra kiểu, không chứng minh app chạy trên thiết bị.
- `pnpm start` hoặc `pnpm android`: chỉ khi task cần runtime/emulator và môi trường đã sẵn sàng.
- Theo README, Android emulator dùng `10.0.2.2` để truy cập host; thiết bị thật cần địa chỉ mạng phù hợp. Không lưu IP cá nhân trong tài liệu dùng chung.
- Với thay đổi chat, kiểm tra loading/error/result/sources và kết nối API trên môi trường test; không mặc định Unity, QR, entitlement hoặc offline session start đã có.
- `pnpm test` chạy model tests với Node 24; `pnpm test:e2e` dùng Chrome cài sẵn và Expo web 8085. Kết quả thực tế từng task ở local handoff/PR; không suy ra test đạt từ context.

## Thiết kế liên quan

Khi có Docs cạnh repo, đọc technology/workflows cho phần dự kiến. Nếu task cần chọn giữa implementation và thiết kế đang khác nhau, trình bày bằng chứng và xin quyết định, không tự migration. Clone độc lập không cần có workspace cha để đọc bộ hướng dẫn này.
