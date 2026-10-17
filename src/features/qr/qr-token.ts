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
