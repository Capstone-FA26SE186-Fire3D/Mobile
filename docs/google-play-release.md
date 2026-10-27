# CI/CD Fet3D lên Google Play bằng Expo

Luồng phát hành: merge PR phát hành vào `main` → GitHub chạy kiểm tra và chọn version → Expo EAS Build tạo AAB trên Linux → GitHub kiểm package/version/chứng chỉ → EAS Submit gửi đúng AAB đó sang CH Play. Google xét duyệt riêng. Workflow không tự merge PR.

## Unity portable

Ứng dụng nhúng runtime Unity Android ARM64 `2.0.2`. Gói portable chứa Java, manifest, resources, assets và sáu thư viện native lấy từ cùng AAB đã build thành công. Không chứa Unity Editor hoặc trình biên dịch IL2CPP Windows. Máy Expo ghép các thư viện Android đã biên dịch vào app; không chạy gameplay hay worker tạo dữ liệu tòa nhà.

`unity-artifact.lock.json` pin version, SHA-256 và nguồn GitHub Release của ZIP. `sourceExport` giữ định danh bản xuất gốc. `portable-runtime.json` ghi hash từng tệp và hash AAB nguồn. Script chuẩn bị và config plugin kiểm integrity trước khi prebuild. Thay code Unity cần build/xác minh runtime mới và xuất lại ZIP; thay code Mobile không cần biên dịch lại Unity.

Công cụ đóng gói: `python scripts/release/export-portable-unity.py --source-zip <export-goc.zip>`. Cần ZIP export gốc đúng SHA-256 trong sourceExport và AAB nguồn tương ứng; script đối chiếu assets với AAB và kiểm thư viện ELF ARM64, không lấy binary rời từ cache. Output trong `.codex/local/unity-portable/`; không commit ZIP vào Git. Công cụ từ chối ghi đè output có sẵn.

## Chuẩn bị một lần

1. Tạo ứng dụng Play `com.fet3d.app`; hoàn thành thông tin/chính sách và điều kiện thử nghiệm/phát hành theo Console. Có thể tạo bản đầu trên kênh nội bộ bằng EAS Submit hoặc tải thủ công theo Console; kiểm tra khả năng của phiên bản CLI đang pin trước khi gửi.
2. EAS project: owner `lazzymoney`, slug `fet3d`, ID `98768196-bf44-40f1-b245-0839c97e5056`. Trong Credentials Android, lưu keystore chính thức và Google service account key for EAS Submit; service account cần quyền đọc và phát hành riêng cho Fet3D trong Play Console. Không dùng khóa Firebase Admin để thay thế tùy tiện.
3. Lưu GitHub secret `EXPO_TOKEN_FET3D` cho tài khoản có quyền build/submit dự án này. Workflow ánh xạ sang `EXPO_TOKEN`.
4. Lưu các secret `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD`, khớp với keystore đã lưu trên EAS. GitHub dùng chúng để kiểm chứng signer của AAB Expo trả về. Không gửi mật khẩu vào chat hoặc commit khóa.
5. Variables: `EXPO_PUBLIC_API_BASE_URL` là HTTPS API gốc; `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` là Web OAuth client ID. `EXPO_OWNER` và `EXPO_PROJECT_SLUG` chỉ cần khi đổi owner/slug. `ANDROID_VERSION_CODE_BASE` mặc định `1000000`.
6. Đưa ZIP portable lên release/tag/asset ghi trong lock để GitHub CI tải được. Repo Mobile hiện công khai: phải được người dùng đồng ý trước khi công khai runtime. Đánh dấu prerelease, không latest, không dùng tag `v*`. Không cần S3/AWS. Với lần build từ máy local, có thể chuẩn bị bằng `pnpm unity:prepare --zip <portable.zip>` rồi EAS tải trực tiếp vendor lên qua `.easignore`, không cần công khai ZIP.

## Build và thử

`eas.json` dùng EAS Build profile `production`, remote credentials và appVersionSource local. `scripts/release/configure-eas.mjs` ghi version, versionCode và hai giá trị public vào profile trước khi upload; không chuyển token/mật khẩu sang profile. `.easignore` cho phép gửi runtime đã verify, loại Android generated, khóa ký, local notes và node_modules.

GitHub workflow manual destination `build` chỉ tạo/kiểm AAB; `internal` gửi kênh thử nghiệm nội bộ; merge main gửi production khi có thay đổi ứng dụng. Expo cần tài khoản đã đăng nhập/quota build; cấu hình local không chứng minh build cloud đã thành công. Build JSON được kiểm FINISHED/Android/version trước khi tải AAB. Bundletool/jarsigner kiểm bundle và so signer với upload key kỳ vọng trước khi submit.

Bản đầu: gửi AAB có chữ ký chính thức lên kênh nội bộ bằng EAS Submit hoặc tải lên Play Console, cấu hình Play App Signing và cài thử trên điện thoại. Đăng ký SHA của **Play App Signing**, có thể khác upload key, vào Firebase/Google Android OAuth và website App Links. Test đăng nhập, QR, tải gói, mở/thoát Unity, pause/resume và sync offline. Browser/model tests không thay được nghiệm thu thiết bị.

## Phiên bản và khôi phục

Version đầu `1.0.0`; các batch sau dùng commit kể từ tag production `v*`: feat → minor, fix/perf/thay đổi app khác → patch, dấu ! hoặc BREAKING CHANGE → major. Docs/tests-only không tự gửi production. Runtime Unity độc lập với version cửa hàng.

VersionCode = base + run_number × 100 + run_attempt. Không đổi workflow/counter mà chưa kiểm versionCode lớn nhất trên Play. Nếu cần sửa bản lỗi, phát hành bản có code cao hơn. Tag/GitHub release production chỉ tạo sau khi EAS Submit thành công; không đồng nghĩa Google đã duyệt. Nếu Play nhận bản nhưng CI lỗi trước tạo tag, kiểm Console trước khi chạy lại.

AAB và release-plan giữ 30 ngày trên GitHub Actions. Cloud build tải AAB vào `submission/app-release.aab`; build local vẫn dùng `android/app/build/outputs/bundle/release/app-release.aab`. Không phát hành bản ký debug/test.

Nguồn: [EAS Build Android](https://docs.expo.dev/build-reference/android-builds/), [EAS ignore](https://docs.expo.dev/build-reference/easignore/), [EAS Submit Android](https://docs.expo.dev/submit/android/).
