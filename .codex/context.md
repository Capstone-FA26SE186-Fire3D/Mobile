# Context — Mobile

## Contract sản phẩm hiện hành — Docs v7

Nguồn chuẩn: [v7 contract](../../Docs/schema_v7_contract.md) và [requirements](../../Docs/fire_evacuation_requirements.md). Các đoạn contract cũ bên dưới đã được hiệu chỉnh theo v7; đây là thiết kế đích, không phải bằng chứng implementation hoặc deployment đã đạt.

- Learn public Published mở cho khách; bookmark/AI cần đăng nhập. Organization Library là kho template/rubric/metadata do PlatformAdmin maintain, không phải Learn public. Organization tự soạn hoặc dùng template tùy chọn; mọi scenario/rubric version phải được Admin duyệt trước publish, tách khỏi IFC QA/ConfirmForTraining.
- Building Private mặc định; code tạo grant gắn account và `access_revision`. Rotate/revoke code hoặc đổi visibility vô hiệu grant cũ; Public yêu cầu Trainee đăng nhập. QR chỉ resolve Building, không cấp quyền. List/package/prepare kiểm access, online start recheck approved/published, entitlement, runtime và learner seat.
- Gói Building 6/12 tháng gồm game, learner limit, AI quota. Một Trainee chỉ chiếm một suất tại Building/kỳ khi start lần đầu; replay/bài khác không tính thêm, login/list/prepare/playtest không tính. Upgrade giữ kỳ/suất, renewal kỳ mới; Mobile không tự tính quyền/quota/giá.
- Organization AI quota trả trước pooled từ gói/top-up đã thanh toán, Trainee quota ngày riêng. Hết quota chặn request tính phí mới; không overage, consent overage hoặc AI billing period trả sau. Giá/lượng/đơn vị/expiry/rollover chưa chốt, lấy cấu hình/snapshot backend.
- Trainee chọn Learn, Guided Drill hoặc Assessment tự do, không prerequisite/sprint, retry không giới hạn, không certificate. Unity Learn khác Learn blog. Backend trả rubric hash, criterion results, score, outcome `Passed|NotPassed|Incomplete|NotAssessed` và lý do; completion không tự Passed.
- Session đã start pin entitlement/review/rubric, tiếp tục và sync idempotent sau expiry/revoke/mất mạng; không start mới offline. AI bị chặn trong Assessment. Learner RAG chỉ dùng scenario `name`, `objectives`, `instructions` approved/published/còn quyền; không rubric/đáp án/draft/IFC private.
- Learn AI scope cần cả `learn_post_id` và published `learn_version_id`. Hidden có thể RAG theo backend nhưng không public; Deleted/Unpublished loại khỏi retrieval. Mất quyền chỉ giữ Common và giải thích kết quả cá nhân đã lưu, không retrieval Building mới.
- Auth theo [BE authentication](../../BE/docs/authentication.md): form → request OTP → verify OTP nhận registrationToken → register account → login riêng nhận JWT. Google đã link được login; Google mới OnboardingRequired, completion/link API còn thiếu. FCM token chỉ là push installation, không phải proof OTP hoặc token đăng nhập.

## Hiện trạng đã kiểm tra

- Expo + React Native + TypeScript, Expo Router theo [package.json](../package.json).
- UI prototype FET3D có login demo, sảnh tòa nhà low-poly, danh sách/search, camera/nhập QR mẫu, chi tiết/chuẩn bị tập huấn, kết quả trống và tài khoản demo. Route ở `app/`, nghiệp vụ ở `src/features/`, UI chung ở `src/components/ui/`, tokens ở `src/theme/`.
- Chat cũ được giữ tại `src/features/chat/`, gọi `POST /chat` qua `EXPO_PUBLIC_RAG_API_URL`; không có xác thực backend mới.
- Scripts có `start`, `android`, `web`, `typecheck`, `test`, `test:e2e`, `format:check`. Tests browser không thay kiểm chứng thiết bị Android.
- Stack đã chốt trong Docs là React Native/Expo với native Android Unity bridge. Prototype hiện **chưa** có bridge, runtime hoặc auth/QR backend; hình low-poly chỉ là PNG sprite minh họa.
- Đã có [repo Unity](../../Unity/.codex/context.md) trong workspace; scaffold không chứng minh native bridge/gameplay đã tích hợp. BIM 3D với camera cố định cho trải nghiệm 2.5D là hướng thiết kế.

## Kiến trúc tích hợp đích — 2026-09-17

- Mobile giữ React Native + Expo. Unity là runtime gameplay được mở qua native Android bridge; Expo không thay Unity bằng scene 3D tự dựng.
- Đăng nhập production dùng email/password qua .NET hoặc Google Sign-In qua Firebase. Mobile gửi credential/token tới C#/.NET backend; không tự suy ra role/tenant và không dùng Supabase Auth.
- Push notification dùng Firebase Cloud Messaging. FCM registration token được quản lý theo installation, có rotate/revoke và không được dùng như credential đăng nhập.
- Mobile không truy cập trực tiếp Supabase PostgreSQL/`pgvector` hoặc AWS S3 bằng service credential. Backend trả signed S3 URL TTL ngắn cho đúng release/session; app tải và verify hash/schema/runtime trước khi mở Unity.
- RAG production thuộc Python/FastAPI và `pgvector`; provider LLM là OpenAI hoặc Gemini sau khi chốt. Mobile chỉ dựa vào API contract chung, không khóa UI vào SDK/provider cụ thể.
- AI/RAG FastAPI chạy riêng trên Azure; Container Apps là phương án triển khai đề xuất. Mobile production gọi `.NET API` để backend kiểm tra identity, tenant, quota, source scope và request idempotency. Mobile chỉ nhận response/citations/usage kỹ thuật, không tự tính giá hoặc gọi AI trực tiếp như prototype cũ; timeout phải tra cứu request status trước khi retry.
- Mobile production gọi API qua endpoint OneShield/OnePortal (iNET) → Nginx đã chốt; Nginx chuyển request tới .NET API. Domain, TLS, edge policy và endpoint theo môi trường là cấu hình triển khai, không hard-code vào app.
- Luồng runtime mục tiêu tách rõ: Building QR → danh sách bài đã publish → người học chọn bài → tạo preparation/idempotency record → tải/verify phần package còn thiếu → `POST /api/training/sessions/{sessionId}/start` online recheck access, approved/published scenario, entitlement, learner seat, package/runtime → cấp launch grant pin `training/release/scenario` → mở Unity. Hết hạn chặn session mới; phiên đã start vẫn được tiếp tục và sync kết quả sau khi có mạng.
- OrganizationUser playtest là luồng riêng: nhận package draft/version đã verify từ web/backend, start với Trial còn quota thử hoặc Building entitlement Active, không dùng QR Trainee, không ghi learner analytics; entitlement hết hạn sau start không cắt playtest.
- Unity/native Android bridge là một phần kiến trúc đích, không phải skill bị loại trừ. Cần development/native build (không dùng Expo Go để chứng minh tích hợp), truyền event/session/package tối thiểu qua bridge và không gửi credential dài hạn vào Unity.
- AI Trainee dùng web/mobile ngoài Assessment với daily quota; chỉ đọc Learn/Common, kết quả cá nhân và snapshot scenario learner-safe được cấp quyền, không đọc kho nội bộ organization. Mobile hiển thị nguồn, trạng thái quota/lỗi và debrief cá nhân theo API contract.
- AI response phải phân biệt `KnowledgeAnswer` với `ScenarioDraft/NeedsUserEdit`; `InsufficientEvidence`/`RejectedBySafetyGate` là status riêng và `NeedsUserEdit` chỉ dành cho ScenarioDraft. Mobile hiển thị citation/request/usage/error/safety gate theo contract, không tự trừ quota hoặc quyết định giá.
- Runtime compatibility dùng server-owned catalog và semver `major.minor.patch`; Mobile gửi runtime version, không tự khai capability. Start online là actor-bound và package/schema phải được catalog xác nhận trước khi mở Unity.

## Contract hardening — 2026-09-18

- Mobile không sửa package/artifact đã pin và không tự quyết định runtime capability; manifest capability sai kiểu/null/rỗng hoặc hash/provenance thiếu phải chặn trước Unity.
- Worker/AI status chỉ hiển thị mã backend ổn định; timeout AI tra request status trước retry. Session đã start vẫn sync sau hết hạn/mất mạng, còn preparation/start mới bị gate online.
- Playtest OrganizationUser là luồng riêng; không QR Trainee, không learner analytics. Các acceptance về concurrency/permission/recovery vẫn chưa được chạy trên database/thiết bị.
- Mobile verify package hash, manifest hash, build target, protocol/schema và runtime catalog trước khi mở Unity; package cache không thay thế online start.

## Contract cập nhật — 2026-09-18

- Mobile gửi runtime version và start idempotency key; không tự khai capability và không được bắt đầu offline. Cùng key chỉ replay khi runtime payload giống request cũ; package thiếu metadata hoặc không tương thích thì không mở Unity.
- Khi AI timeout, Mobile tra request status qua `.NET API` trước retry; Mobile chỉ hiển thị citations/usage kỹ thuật, không tự trừ quota hoặc tính giá.
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

## Redis boundary — 2026-09-19

- Mobile không kết nối Redis, Redis Streams hoặc PostgreSQL trực tiếp. App chỉ gọi API qua OneShield/OnePortal → Nginx/.NET; mọi quyền start, entitlement, quota, package và analytics do backend kiểm tra.
- Backend có thể cache-aside danh sách bài/package metadata/dashboard và giao event/job qua Redis Streams, nhưng Mobile chỉ nhận API status. Cache không thay thế online start.
- Event/result gameplay giữ local queue sau khi session đã bắt đầu; backend xác nhận ghi bền vững rồi mới coi sync thành công. Retry event dùng event ID/sequence ổn định; Redis lỗi không được làm mất kết quả đã backend xác nhận.
- Mobile không biết dispatcher lease hoặc worker attempt lease; app chỉ retry API/event với event ID/sequence ổn định và chờ backend xác nhận receipt. Cache hoặc Redis không mở session mới offline.

## Learn blog boundary — 2026-09-19

- Mobile đọc Learn blog public qua `.NET API`, lọc theo situation/kind và gửi bookmark của Trainee; không kết nối PostgreSQL/Redis trực tiếp. Hidden/Unpublished/Deleted không trả nội dung.
- Bài có thể chứa video YouTube/Facebook/TikTok. Phiên bản thiết kế hiện tại mở provider bằng trình duyệt hoặc fallback link/summary; chưa coi embed native trong Expo là đã triển khai.
- Mobile không nhận Draft/Hidden/Deleted, không quản trị Learn và không tự tải video/transcript. Khi hỏi AI về bài, gửi `postId`/`versionId` theo contract; backend tự kiểm tra Published/Hidden hợp lệ và trả citation/scope. Trainee nhập username trong local registration hoặc Google onboarding; không còn màn hình username khi start. Profile/password/avatar flows vẫn đi qua API.

## FET3D onboarding and Building billing UI — 2026-09-19

- Target khi completion API được triển khai: Google mới sau khi Firebase xác minh chọn Trainee hoặc OrganizationUser; Trainee nhập username, OrganizationUser nhập tên/địa chỉ/điện thoại tổ chức. Account đã link không chọn lại role/tenant.
- OrganizationUser xem nhiều Building, chọn Building và thời hạn khi checkout/gia hạn, thấy discount/tổng tiền từ backend và nhận notification hết hạn. Mobile không tự tính giá/quyền hoặc kết nối Redis.

## Final review corrections — 2026-09-19

- QR accepts an existing FET3D local email/password session or a Google exchange; Mobile must not force Google Sign-In. Trainee username is collected during registration/onboarding, so game start has no `ProfileIncomplete` username gate.
- Profile/password/avatar and Learn bookmark/video flows remain API-owned. Hidden/Deleted Learn content is never returned to Mobile; local gameplay sync after an already-authorized start remains allowed when service later expires.

## Recovery gate correction — 2026-09-19

- After online start, Mobile retries events with stable event ID/sequence and sends one result idempotency key/hash to the backend completion gate. It never calls database functions directly or rechecks entitlement locally; a started playtest/session may finish and sync after expiry or account disablement.
