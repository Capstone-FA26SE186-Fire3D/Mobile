# Mobile — bài học dùng chung

Chỉ lưu kiến thức đã xác minh và cần cho team. Nhật ký lỗi, thử nghiệm và bàn giao từng phiên nằm trong .codex/local/ và không được track.

Chưa nâng bài học phiên nào vào file này. Khi cần bổ sung trong PR liên quan, ghi ngắn: tình huống → nguyên nhân/bằng chứng → cách khắc phục → cách kiểm tra và phạm vi áp dụng. Gộp trùng, không viết lại toàn bộ file.

## 2026-09-13 — cài project skills

- `npm run typecheck` đạt sau khi cài dependencies. `npm install` báo peer warning và 21 vulnerabilities (13 moderate, 8 high); không chạy `npm audit fix --force` vì có thể phá lockfile.
- `codex plugin add expo@openai-curated` không cài được vì marketplace không có plugin `expo`; không tự thay bằng plugin không tương thích.
