# CI/CD Fet3D lên Google Play bằng Expo

Luồng phát hành: merge PR phát hành vào `main` → GitHub chạy kiểm tra và chọn version → Expo EAS Build tạo AAB trên Linux → GitHub kiểm package/version/chứng chỉ → EAS Submit gửi đúng AAB đó sang CH Play. Google xét duyệt riêng. Workflow không tự merge PR.

## Unity portable

Ứng dụng nhúng runtime Unity Android ARM64; phiên bản và bản xuất đang dùng ghi trong `unity-artifact.lock.json` (ngày 16/11/2026: runtime `2.5.0`, bản xuất `202611161554`). Gói portable phải được xuất từ Unity và ghim vào file đó trước khi build. Gói portable chứa Java, manifest, resources, assets và sáu thư viện native lấy từ cùng AAB đã build thành công. Không chứa Unity Editor hoặc trình biên dịch IL2CPP Windows. Máy Expo ghép các thư viện Android đã biên dịch vào app; không chạy gameplay hay worker tạo dữ liệu tòa nhà.

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

## Phát cho người thử, cài đặt và lùi bản

Trạng thái ngày 15/11/2026: kênh thử nghiệm nội bộ đang chạy, kênh thử nghiệm kín đang chờ Google duyệt, kênh chính thức bị Google từ chối cho tới khi đủ 12 người thử trong 14 ngày. Workflow vẫn nộp kênh chính thức mỗi lần `main` có thay đổi ứng dụng; bước nộp báo lỗi "Precondition check failed" là đúng dự kiến trong giai đoạn này. Bản cho kênh thử nghiệm do trưởng nhóm tải lên bằng tay.

**Lấy đúng bản để tải lên.** Mỗi lần workflow `Google Play release` chạy xong bước build, trang của lần chạy đó có hai tệp đính kèm giữ 30 ngày: `fet3d-<version>-<versionCode>` (chứa `app-release.aab` đã ký bằng khóa tải lên và đã được kiểm chữ ký) và `release-plan` (version, versionCode, commit). Tải về bằng `gh run download <run-id>`. Chỉ tải lên Play Console tệp AAB lấy từ đây, không dùng AAB dựng trên máy cá nhân (ký bằng khóa thử, Play sẽ từ chối).

**Ghi lại cho mỗi bản phát cho người thử:** versionCode, commit trong `release-plan.json`, phiên bản runtime Unity trong `unity-artifact.lock.json`, và SHA-256 của tệp AAB (`sha256sum app-release.aab`). Bản ngày 15/11/2026: version `1.0.0`, versionCode `1001901`, commit `3ada34b`, runtime Unity `2.5.0`.

**Người thử cài như thế nào.**
1. Trưởng nhóm thêm email Google của người thử vào danh sách người thử của kênh (Play Console → Kiểm thử → kênh tương ứng → Người kiểm thử), rồi gửi cho họ đường liên kết tham gia lấy ở cùng trang đó.
2. Người thử mở liên kết bằng đúng tài khoản Google đã được thêm, bấm tham gia, rồi cài Fet3D từ CH Play như ứng dụng thường. Cần Android 10 trở lên, máy 64-bit, còn trống khoảng 1 GB (ứng dụng khoảng 250 MB, mỗi bài tải thêm vài chục tới hơn 100 MB).
3. Lần đầu mở: đăng nhập, quét QR của tòa nhà hoặc chọn bài, tải gói bài rồi bắt đầu. Nếu máy thiếu bộ nhớ, ứng dụng báo cần bao nhiêu MB và giữ phần đã tải.

**Cài trực tiếp bằng APK** chỉ dùng cho máy của nhóm phát triển (bản dựng local ký khóa thử, cài bằng `adb install -r`). Không gửi APK này cho người thử: nó không cập nhật được lên bản từ CH Play vì khác chữ ký.

**Lùi bản.** CH Play không cho cài đè bản có versionCode thấp hơn. Khi một bản lỗi đã tới tay người thử: sửa hoặc `git revert` trên `develop`, đưa lên `main` để workflow dựng bản mới có versionCode cao hơn, rồi tải bản đó lên kênh. Trong lúc chờ, có thể tạm dừng phát hành bản lỗi trong Play Console (kênh → Quản lý bản phát hành → Tạm dừng). Runtime trên máy chủ không cần lùi nếu số phiên bản runtime không đổi.

## Phiên bản và khôi phục

Version đầu `1.0.0`; các batch sau dùng commit kể từ tag production `v*`: feat → minor, fix/perf/thay đổi app khác → patch, dấu ! hoặc BREAKING CHANGE → major. Docs/tests-only không tự gửi production. Runtime Unity độc lập với version cửa hàng.

VersionCode = base + run_number × 100 + run_attempt. Không đổi workflow/counter mà chưa kiểm versionCode lớn nhất trên Play. Nếu cần sửa bản lỗi, phát hành bản có code cao hơn. Tag/GitHub release production chỉ tạo sau khi EAS Submit thành công; không đồng nghĩa Google đã duyệt. Nếu Play nhận bản nhưng CI lỗi trước tạo tag, kiểm Console trước khi chạy lại.

AAB và release-plan giữ 30 ngày trên GitHub Actions. Cloud build tải AAB vào `submission/app-release.aab`; build local vẫn dùng `android/app/build/outputs/bundle/release/app-release.aab`. Không phát hành bản ký debug/test.

Nguồn: [EAS Build Android](https://docs.expo.dev/build-reference/android-builds/), [EAS ignore](https://docs.expo.dev/build-reference/easignore/), [EAS Submit Android](https://docs.expo.dev/submit/android/).
