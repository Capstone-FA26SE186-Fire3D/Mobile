# Expo mobile
Copy `.env.example` to `.env`, run `pnpm install --frozen-lockfile`, then `pnpm android`. Use `10.0.2.2` for Android emulator; replace with your PC LAN IP on a physical phone.

## Package manager

Use pnpm 10.28.2 (pinned in `package.json`). With Corepack installed, run `corepack enable` and `corepack prepare pnpm@10.28.2 --activate` once; verify `pnpm --version`.

- Install: `pnpm install --frozen-lockfile`.
- Expo/native packages: `pnpm exec expo install <package> --pnpm`.
- Other packages: `pnpm add <package>` or `pnpm add -D <package>`.
- Start: `pnpm start`; Android: `pnpm android`; typecheck: `pnpm typecheck`.
- Commit `pnpm-lock.yaml` with dependency changes. Use pnpm in this repository; do not generate npm/yarn lockfiles.

Keep React Native and native packages compatible with the installed Expo SDK; do not replace their version ranges with `latest`. After changing dependencies, run `pnpm exec expo install --check`, `pnpm typecheck`, and `pnpm exec expo export --platform android --output-dir .expo/export-check` before merging.

## Codex cho thành viên team

Sau khi checkout nhánh có bộ hướng dẫn, mở repo bằng Codex và yêu cầu:

> Đọc AGENTS.md và .codex/bootstrap.md, khởi tạo các file Codex còn thiếu; giữ nguyên file đã có, gồm bộ ở workspace cha nếu đúng cấu trúc Fire3D.

- Git pull chỉ tải hướng dẫn, không tự chạy Codex. [Quy trình bootstrap](.codex/bootstrap.md) tạo local notes bị ignore; chỉ dựng bộ workspace cha khi nhận diện đủ AI/BE/Docs/FE/Mobile và được phép ghi.
- Nếu chỉ clone repo này, Codex tạo phần local của repo, không ghi vào thư mục cha. Không ghi trong Plan Mode.
- File cá nhân không được push; quy tắc và kiến thức team nằm trong bộ hướng dẫn được track.
