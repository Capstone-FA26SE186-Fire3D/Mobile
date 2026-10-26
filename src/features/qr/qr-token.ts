const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function parseQrToken(value: string): string | null {
  const input = value.trim();
  if (TOKEN.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    const match = /^\/qr\/([A-Za-z0-9_-]{43})\/?$/.exec(url.pathname);
    return match && !url.search && !url.hash ? match[1] : null;
  } catch {
    return null;
  }
}

const HANDOFF_LINK =
  /^(?:(?:fet3d|fire3d):\/\/playtest\/handoff|https:\/\/fet3d\.io\.vn\/playtest\/handoff)\/?\?code=([A-Za-z0-9_-]{43})$/;

/** Playtest handoff QR from the Web (`fet3d://playtest/handoff?code=…`, the HTTPS form) or the bare 43-character code. */
export function parseHandoffCode(value: string): string | null {
  const input = value.trim();
  if (TOKEN.test(input)) return input;
  return HANDOFF_LINK.exec(input)?.[1] ?? null;
}

export type ScanMismatch = 'handoff' | 'building' | 'site' | 'unknown';

/**
 * Why a scanned value cannot be used on this screen, in the reader's terms. A Trainee often points the camera at the
 * playtest QR an organization shows on the Web (or at another FET3D page); an OrganizationUser at a Building QR.
 */
export function scanMismatch(value: string, expecting: 'building' | 'handoff'): ScanMismatch {
  const input = value.trim();
  if (expecting === 'building' && /playtest\/handoff/i.test(input)) return 'handoff';
  if (expecting === 'handoff' && !TOKEN.test(input) && parseQrToken(input)) return 'building';
  try {
    const url = new URL(input);
    if (/(^|\.)fet3d\.io\.vn$/i.test(url.hostname)) return 'site';
  } catch {
    // not a URL
  }
  return 'unknown';
}

/** Plain Vietnamese for each mismatch (no codes, no token lengths). */
export function scanMismatchText(kind: ScanMismatch, expecting: 'building' | 'handoff'): string {
  if (kind === 'handoff')
    return 'Đây là mã chạy thử dành cho tài khoản tổ chức, không phải mã công trình. Học viên hãy quét mã QR công trình do tổ chức in hoặc gửi.';
  if (kind === 'building')
    return 'Đây là mã QR công trình dành cho học viên. Để chạy thử, mở tab Chạy thử của phiên bản trên web rồi quét mã hiện ra ở đó (mã có hạn 5 phút).';
  if (kind === 'site')
    return expecting === 'building'
      ? 'Đây là đường dẫn một trang của FET3D, không phải mã QR công trình. Mã đúng có dạng https://fet3d.io.vn/qr/…'
      : 'Đây là đường dẫn một trang của FET3D, không phải mã chạy thử. Quét mã trong tab Chạy thử trên web.';
  return expecting === 'building'
    ? 'Không đọc được mã QR công trình. Hãy quét mã QR do tổ chức in hoặc gửi, hoặc dán đường dẫn dạng https://fet3d.io.vn/qr/…'
    : 'Đây không phải mã chạy thử. Trên web, mở tab Chạy thử của phiên bản và quét mã hiện ra (mã có hạn 5 phút).';
}
