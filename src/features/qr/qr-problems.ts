import { ApiError } from '@/api/types/common';

/**
 * Why a Building QR (or a training opened from it) can no longer be used, in learner words. Shared by the QR screen and
 * the training screen, which also opens "Bài đã tải" again: access is always re-checked by BE, never by the cache.
 */
export type QrProblem = 'revoked' | 'missing' | 'needs-code' | null;

export function qrProblemOf(error: unknown): QrProblem {
  if (!(error instanceof ApiError)) return null;
  const code = error.payload?.code;
  if (error.status === 410 || code === 'QR_REVOKED') return 'revoked';
  if (error.status === 404 || code === 'QR_NOT_FOUND') return 'missing';
  if (code === 'BUILDING_ACCESS_REQUIRED') return 'needs-code';
  return null;
}

export function describeQrProblem(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.payload?.code === 'BUILDING_ACCESS_REQUIRED')
      return 'Hãy nhập mã tham gia của tòa nhà riêng tư.';
    if (error.payload?.code === 'PARTICIPATION_CODE_INVALID')
      return 'Mã tham gia không đúng hoặc đã bị đổi/thu hồi.';
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : 'Không kết nối được máy chủ FET3D. Kiểm tra mạng rồi thử lại.';
}

/** Screens for a training that can no longer be opened from its saved QR. */
export const QR_PROBLEM_TEXT: Record<
  Exclude<QrProblem, null>,
  { ribbon: string; title: string; body: string }
> = {
  revoked: {
    ribbon: 'Mã QR đã đổi',
    title: 'Mã QR này đã bị thu hồi',
    body: 'Tổ chức đã thay mã QR của tòa nhà. Hãy quét mã QR mới dán tại tòa nhà để mở lại bài.',
  },
  missing: {
    ribbon: 'Không tìm thấy',
    title: 'Không tìm thấy tòa nhà',
    body: 'Mã QR không còn dùng được. Hãy quét mã QR dán tại tòa nhà.',
  },
  'needs-code': {
    ribbon: 'Cần mã tham gia',
    title: 'Quyền vào tòa nhà đã thay đổi',
    body: 'Tòa nhà yêu cầu mã tham gia mới. Hãy nhập mã do tổ chức cung cấp rồi mở lại bài.',
  },
};
