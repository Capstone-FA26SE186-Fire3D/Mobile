import { ApiError, NETWORK_MESSAGE, isNetworkError } from '@/api/types/common';

/** The person closed the Google account picker: nothing went wrong, so no message is shown. */
export class GoogleSignInCancelled extends Error {
  constructor() {
    super('Đã hủy đăng nhập Google.');
    this.name = 'GoogleSignInCancelled';
  }
}

/** The Google account belongs to an organization or admin account, which signs in on the website only. */
export class NotTraineeAccount extends Error {
  constructor() {
    super(
      'Ứng dụng chỉ dành cho học viên. Tài khoản Google này thuộc tài khoản tổ chức hoặc quản trị, hãy đăng nhập trên trang web fet3d.io.vn.',
    );
    this.name = 'NotTraineeAccount';
  }
}

const MESSAGES: Record<string, string> = {
  INVALID_FIREBASE_TOKEN: 'Google chưa xác nhận được tài khoản này. Hãy đăng nhập Google lại.',
  GOOGLE_PROVIDER_UNAVAILABLE: 'Dịch vụ đăng nhập Google đang bận. Hãy thử lại sau ít phút.',
  ONBOARDING_RETRY_REQUIRED: 'Máy chủ đang bận. Hãy thử lại.',
  ACCOUNT_DISABLED:
    'Tài khoản hoặc tổ chức của bạn đang bị khóa. Hãy liên hệ người phụ trách tập huấn.',
  EMAIL_NOT_VERIFIED:
    'Email này chưa được xác nhận. Hãy mở thư xác nhận FET3D đã gửi, rồi đăng nhập lại.',
  REGISTRATION_EXPIRED: 'Lần đăng ký trước đã hết hạn. Hãy đăng ký lại.',
  ACCOUNT_CHANGED: 'Tài khoản vừa thay đổi. Hãy đăng nhập Google lại.',
  ACCOUNT_LINK_REQUIRED:
    'Email này đã có tài khoản FET3D. Hãy đăng nhập bằng mật khẩu, rồi liên kết Google trong Cài đặt tài khoản.',
  GOOGLE_ONBOARDING_RATE_LIMITED: 'Bạn đã thử quá nhiều lần. Hãy đợi một lúc rồi thử lại.',
  ONBOARDING_ALREADY_COMPLETED: 'Tài khoản đã được tạo. Hãy đăng nhập Google lại.',
  IDEMPOTENCY_KEY_CONFLICT: 'Tài khoản đã được tạo với thông tin khác. Hãy đăng nhập Google lại.',
  USERNAME_EXISTS: 'Tên đăng nhập này đã có người dùng. Hãy chọn tên khác.',
};

/**
 * A plain message for anything that can go wrong while signing in, creating an account or linking with Google, or null
 * when nothing should be shown (the person cancelled the picker). Server codes come from BE
 * `ExchangeFirebaseTokenCommand` and `GoogleOnboardingService`.
 */
export function describeGoogleProblem(error: unknown): string | null {
  if (error instanceof GoogleSignInCancelled) return null;
  if (error instanceof NotTraineeAccount) return error.message;
  if (error instanceof ApiError) {
    const code = typeof error.payload?.code === 'string' ? error.payload.code : '';
    if (MESSAGES[code]) return MESSAGES[code];
    const trace =
      typeof error.payload?.traceId === 'string' ? ` Mã tra cứu: ${error.payload.traceId}.` : '';
    if (error.status >= 500) return `Máy chủ FET3D đang gặp sự cố. Hãy thử lại sau.${trace}`;
    return `Không đăng nhập Google được.${trace}`;
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'PLAY_SERVICES_NOT_AVAILABLE')
    return 'Điện thoại chưa có hoặc cần cập nhật Dịch vụ Google Play để đăng nhập Google.';
  if (code === 'IN_PROGRESS') return 'Đang mở đăng nhập Google, hãy đợi một chút.';
  if (isNetworkError(error)) return NETWORK_MESSAGE;
  // Our own plain messages (expired onboarding, missing token) pass through.
  return error instanceof Error && error.message
    ? error.message
    : 'Không đăng nhập Google được. Hãy thử lại.';
}
