# Context — Mobile

## Hiện trạng đã kiểm tra

- Expo + React Native + TypeScript, Expo Router theo [package.json](../package.json).
- [Màn hình chính](../app/index.tsx) gọi `POST /chat` trực tiếp qua `EXPO_PUBLIC_RAG_API_URL`; [layout](../app/_layout.tsx).
- Scripts hiện có: `start`, `android`, `typecheck`; chưa có script unit/e2e test.
- Khác biệt cần giải quyết: Docs mô tả Android shell Flutter + Unity, nhưng code Mobile hiện tại là Expo/React Native. Không tự chuyển stack hoặc sửa Docs để che khác biệt.
- Chưa thấy Unity project trong workspace. BIM 3D với camera cố định cho trải nghiệm 2.5D là hướng người dùng mong muốn, không phải tính năng đã triển khai.

## Chạy và kiểm tra

Từ gốc Mobile, sau khi dependencies đã sẵn sàng theo [README](../README.md):
- `pnpm typecheck`: kiểm tra kiểu, không chứng minh app chạy trên thiết bị.
- `pnpm start` hoặc `pnpm android`: chỉ khi task cần runtime/emulator và môi trường đã sẵn sàng.
- Theo README, Android emulator dùng `10.0.2.2` để truy cập host; thiết bị thật cần địa chỉ mạng phù hợp. Không lưu IP cá nhân trong tài liệu dùng chung.
- Với thay đổi chat, kiểm tra loading/error/result/sources và kết nối API trên môi trường test; không mặc định Unity, QR hoặc offline đã có.
- Chưa có test script; không dùng `pnpm test` như một kiểm tra hiện có. Kết quả chạy app/typecheck từng task nằm trong handoff local hoặc PR, không suy ra từ context này.

## Thiết kế liên quan

Khi có Docs cạnh repo, đọc technology/workflows cho phần dự kiến. Nếu task cần chọn giữa implementation và thiết kế đang khác nhau, trình bày bằng chứng và xin quyết định, không tự migration. Clone độc lập không cần có workspace cha để đọc bộ hướng dẫn này.
