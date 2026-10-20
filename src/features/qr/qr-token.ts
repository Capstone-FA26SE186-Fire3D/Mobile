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
