# Mobile — bài học dùng chung

Chỉ lưu kiến thức đã xác minh và cần cho team. Nhật ký lỗi, thử nghiệm và bàn giao từng phiên nằm trong .codex/local/ và không được track.

Khi bổ sung trong PR liên quan, ghi ngắn: tình huống → nguyên nhân/bằng chứng → cách khắc phục → cách kiểm tra và phạm vi áp dụng. Gộp trùng, không viết lại toàn bộ file.

## 2026-09-13 — cài project skills

- `npm run typecheck` đạt sau khi cài dependencies. `npm install` báo peer warning và 21 vulnerabilities (13 moderate, 8 high); không chạy `npm audit fix --force` vì có thể phá lockfile.
- `codex plugin add expo@openai-curated` không cài được vì marketplace không có plugin `expo`; không tự thay bằng plugin không tương thích.

## 2026-09-17 — Expo low-poly lobby prototype

- Route QR → training dùng `router.replace('/(tabs)')` tạo thêm một lobby trong stack khi người dùng quay lại; E2E bắt gặp nhãn trùng. Đổi sang `router.dismissTo('/(tabs)')` để đóng flow quét và trở về tab root; giữ assertion không có duplicate label.
- Với SDK57/RN 0.86 và TypeScript 6, kiểu public hỗ trợ `StyleSheet.absoluteFill`; `absoluteFillObject` gây lỗi type. `tsconfig` cũng không nên dùng `baseUrl` đã deprecated; alias `@/*` chỉ cần `paths`. Typecheck và Android export đều đạt sau khi sửa.
- Import barrel của toàn bộ font/icon family làm bundle Android tăng từ 27 lên 67 asset. Import trực tiếp và chỉ nạp bốn weight font cần dùng giảm còn 35 asset, HBC khoảng 3.7 MB trong export prototype; đây là chỉ dấu cần theo dõi, không phải benchmark production.
- Modal bottom-sheet có thể bị chụp giữa transition trong Playwright. Chờ animation kết thúc và chỉ tắt animation trong screenshot test; hành vi runtime vẫn dùng transition bình thường.
- Camera scanner có thể gọi callback nhiều lần cho cùng một QR. Khóa xử lý sau lần match đầu, pause preview khi đã nhận và reset khi unmount/scan lại; test bằng mã hợp lệ, mã không hợp lệ và mã lặp.
- Expo dependency checker phát hiện `expo` lệch patch so với SDK lock. Dùng `expo install --check`, cập nhật patch tương thích (`57.0.23`) rồi chạy lại frozen install, typecheck và export; không tự nâng major.
- Node test worker trên môi trường Windows/sandbox có thể lỗi `spawn EPERM` dù test không sai. Script `pnpm test` dùng `--test-isolation=none` để chạy cùng process; năm model tests đạt. Phạm vi chỉ là test thuần, không thay thế kiểm tra native.
