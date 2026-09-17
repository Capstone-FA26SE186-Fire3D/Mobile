# Context — Mobile

## Hiện trạng đã kiểm tra

- Expo + React Native + TypeScript, Expo Router theo [package.json](../package.json).
- UI prototype Fire3D có login demo, sảnh tòa nhà low-poly, danh sách/search, camera/nhập QR mẫu, chi tiết/chuẩn bị tập huấn, kết quả trống và tài khoản demo. Route ở `app/`, nghiệp vụ ở `src/features/`, UI chung ở `src/components/ui/`, tokens ở `src/theme/`.
- Chat cũ được giữ tại `src/features/chat/`, gọi `POST /chat` qua `EXPO_PUBLIC_RAG_API_URL`; không có xác thực backend mới.
- Scripts có `start`, `android`, `web`, `typecheck`, `test`, `test:e2e`, `format:check`. Tests browser không thay kiểm chứng thiết bị Android.
- Stack đã chốt trong Docs là React Native/Expo với native Android Unity bridge. Prototype hiện **chưa** có bridge, runtime hoặc auth/QR backend; hình low-poly chỉ là PNG sprite minh họa.
- Chưa thấy Unity project trong workspace. BIM 3D với camera cố định cho trải nghiệm 2.5D là hướng người dùng mong muốn, không phải tính năng đã triển khai.

## Chạy và kiểm tra

Từ gốc Mobile, sau khi dependencies đã sẵn sàng theo [README](../README.md):
- `pnpm typecheck`: kiểm tra kiểu, không chứng minh app chạy trên thiết bị.
- `pnpm start` hoặc `pnpm android`: chỉ khi task cần runtime/emulator và môi trường đã sẵn sàng.
- Theo README, Android emulator dùng `10.0.2.2` để truy cập host; thiết bị thật cần địa chỉ mạng phù hợp. Không lưu IP cá nhân trong tài liệu dùng chung.
- Với thay đổi chat, kiểm tra loading/error/result/sources và kết nối API trên môi trường test; không mặc định Unity, QR hoặc offline đã có.
- `pnpm test` chạy model tests với Node 24; `pnpm test:e2e` dùng Chrome cài sẵn và Expo web 8085. Kết quả thực tế từng task ở local handoff/PR; không suy ra test đạt từ context.

## Thiết kế liên quan

Khi có Docs cạnh repo, đọc technology/workflows cho phần dự kiến. Nếu task cần chọn giữa implementation và thiết kế đang khác nhau, trình bày bằng chứng và xin quyết định, không tự migration. Clone độc lập không cần có workspace cha để đọc bộ hướng dẫn này.
